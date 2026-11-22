using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Raphael.Core;

public sealed record UpdateAsset(string Name, string DownloadUrl, long Size);

public sealed record UpdateCheckResult(
    bool HasUpdate,
    string CurrentVersion,
    string LatestVersion,
    string ReleaseName,
    string ReleaseNotes,
    string ReleaseUrl,
    DateTimeOffset? PublishedAt,
    UpdateAsset? InstallerAsset,
    string? ChecksumsUrl)
{
    public bool CanAutoInstall => HasUpdate && InstallerAsset is not null;
}

public sealed record UpdateDownloadProgress(
    long DownloadedBytes,
    long? TotalBytes,
    double? Percentage,
    string Stage);

public sealed class AppUpdater
{
    public const string DefaultRepository = "DrivingGodJ/raphael-publish-desktop";
    public const string DefaultLatestReleaseApiUrl = "https://api.github.com/repos/" + DefaultRepository + "/releases/latest";
    public const string DefaultReleasesPageUrl = "https://github.com/" + DefaultRepository + "/releases/latest";

    static readonly Regex WinUiExactAssetPattern = new(@"^Raphael-Publish-WinUI-.*-windows-x64-Setup\.exe$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Sha256LinePattern = new(@"^([a-fA-F0-9]{64})\s+\*?(.+)$", RegexOptions.Compiled);

    readonly HttpClient _http;
    readonly string _latestReleaseApiUrl;
    readonly bool _allowCustomHosts;

    public AppUpdater(HttpClient? http = null, string latestReleaseApiUrl = DefaultLatestReleaseApiUrl, bool allowCustomHosts = false)
    {
        _http = http ?? new HttpClient(new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All }) { Timeout = TimeSpan.FromMinutes(15) };
        _latestReleaseApiUrl = latestReleaseApiUrl;
        _allowCustomHosts = allowCustomHosts;
    }

    public static string NormalizeVersion(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "0.0.0";
        var trimmed = raw.Trim();
        if (trimmed.StartsWith("v", StringComparison.OrdinalIgnoreCase)) trimmed = trimmed[1..];
        var plus = trimmed.IndexOf('+');
        if (plus >= 0) trimmed = trimmed[..plus];
        return trimmed.Trim();
    }

    public static bool TryParseSemVer(string? raw, out int[] Core, out string[] PreRelease)
    {
        Core = [0, 0, 0];
        PreRelease = [];
        var normalized = NormalizeVersion(raw);
        if (string.IsNullOrWhiteSpace(normalized)) return false;

        var dash = normalized.IndexOf('-');
        var corePart = dash >= 0 ? normalized[..dash] : normalized;
        var prePart = dash >= 0 ? normalized[(dash + 1)..] : "";

        var segments = corePart.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length < 2 || segments.Length > 4) return false;
        var parsed = new int[3];
        for (var index = 0; index < 3; index++)
        {
            if (index < segments.Length)
            {
                if (!int.TryParse(segments[index], NumberStyles.None, CultureInfo.InvariantCulture, out var value)) return false;
                parsed[index] = value;
            }
        }
        Core = parsed;
        PreRelease = string.IsNullOrWhiteSpace(prePart)
            ? []
            : prePart.Split('.', StringSplitOptions.RemoveEmptyEntries);
        return true;
    }

    public static int CompareVersions(string left, string right)
    {
        if (!TryParseSemVer(left, out var leftCore, out var leftPre))
            throw new ArgumentException("Invalid version: " + left, nameof(left));
        if (!TryParseSemVer(right, out var rightCore, out var rightPre))
            throw new ArgumentException("Invalid version: " + right, nameof(right));

        for (var index = 0; index < 3; index++)
        {
            if (leftCore[index] != rightCore[index]) return leftCore[index].CompareTo(rightCore[index]);
        }

        if (leftPre.Length == 0 && rightPre.Length == 0) return 0;
        if (leftPre.Length == 0) return 1;
        if (rightPre.Length == 0) return -1;

        var count = Math.Min(leftPre.Length, rightPre.Length);
        for (var index = 0; index < count; index++)
        {
            var leftIsNum = int.TryParse(leftPre[index], NumberStyles.None, CultureInfo.InvariantCulture, out var leftNum);
            var rightIsNum = int.TryParse(rightPre[index], NumberStyles.None, CultureInfo.InvariantCulture, out var rightNum);
            if (leftIsNum && rightIsNum)
            {
                if (leftNum != rightNum) return leftNum.CompareTo(rightNum);
            }
            else if (leftIsNum != rightIsNum)
            {
                return leftIsNum ? -1 : 1;
            }
            else
            {
                var comparison = StringComparer.OrdinalIgnoreCase.Compare(leftPre[index], rightPre[index]);
                if (comparison != 0) return comparison;
            }
        }
        return leftPre.Length.CompareTo(rightPre.Length);
    }

    public static bool IsNewerVersion(string currentVersion, string latestVersion)
    {
        if (!TryParseSemVer(currentVersion, out _, out _) || !TryParseSemVer(latestVersion, out _, out _)) return false;
        return CompareVersions(latestVersion, currentVersion) > 0;
    }

    public static bool IsAllowedGitHubUrl(string? rawUrl, bool allowCustomHosts = false)
    {
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri)) return false;
        if (allowCustomHosts && uri.Scheme is "http" or "https") return true;
        if (!string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)) return false;
        var host = uri.Host;
        return host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
            || host.Equals("api.github.com", StringComparison.OrdinalIgnoreCase)
            || host.EndsWith(".githubusercontent.com", StringComparison.OrdinalIgnoreCase);
    }

    public static UpdateAsset? SelectWinUiInstallerAsset(IReadOnlyList<UpdateAsset> assets)
    {
        return assets.FirstOrDefault(asset => WinUiExactAssetPattern.IsMatch(asset.Name))
            ?? assets.FirstOrDefault(asset => asset.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                && asset.Name.Contains("WinUI", StringComparison.OrdinalIgnoreCase)
                && asset.Name.Contains("Setup", StringComparison.OrdinalIgnoreCase))
            ?? assets.FirstOrDefault(asset => asset.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                && asset.Name.Contains("windows", StringComparison.OrdinalIgnoreCase)
                && asset.Name.Contains("Setup", StringComparison.OrdinalIgnoreCase));
    }

    public static string? ParseSha256Sums(string content, string fileName)
    {
        foreach (var rawLine in content.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var match = Sha256LinePattern.Match(rawLine.Trim());
            if (!match.Success) continue;
            var candidate = Path.GetFileName(match.Groups[2].Value.Trim());
            if (candidate.Equals(fileName, StringComparison.OrdinalIgnoreCase))
                return match.Groups[1].Value.ToLowerInvariant();
        }
        return null;
    }

    public async Task<UpdateCheckResult> CheckForUpdatesAsync(string currentVersion, CancellationToken cancellationToken = default)
    {
        var normalizedCurrent = NormalizeVersion(currentVersion);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));

        using var request = new HttpRequestMessage(HttpMethod.Get, _latestReleaseApiUrl);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.ParseAdd($"Raphael-Publish-WinUI/{normalizedCurrent}");
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException("连接 GitHub 超时，请检查网络后重试。");
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("无法连接到 GitHub，请检查网络后重试。");
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.TooManyRequests)
                throw new InvalidOperationException("GitHub API 请求频率受限，请稍后再试或前往发布页查看。");
            if (response.StatusCode == HttpStatusCode.NotFound)
                throw new InvalidOperationException("未在 GitHub 仓库中找到正式发布的版本。");
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"检查更新失败（HTTP {(int)response.StatusCode}）。");

            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            JsonObject? json;
            try { json = JsonNode.Parse(body) as JsonObject; }
            catch (JsonException) { throw new InvalidOperationException("GitHub 返回了无法识别的版本信息。"); }
            if (json is null) throw new InvalidOperationException("GitHub 返回了空的版本信息。");

            var isDraft = json["draft"]?.GetValue<bool>() ?? false;
            var isPrerelease = json["prerelease"]?.GetValue<bool>() ?? false;
            var tagName = json["tag_name"]?.GetValue<string>() ?? "";
            var latestVersion = NormalizeVersion(tagName);
            var releaseName = json["name"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(releaseName)) releaseName = tagName;
            var releaseNotes = json["body"]?.GetValue<string>() ?? "";
            var releaseUrl = json["html_url"]?.GetValue<string>();
            if (!IsAllowedGitHubUrl(releaseUrl, _allowCustomHosts)) releaseUrl = DefaultReleasesPageUrl;
            DateTimeOffset? publishedAt = DateTimeOffset.TryParse(json["published_at"]?.GetValue<string>(), out var parsedDate) ? parsedDate : null;

            var assets = new List<UpdateAsset>();
            string? checksumsUrl = null;
            if (json["assets"] is JsonArray array)
            {
                foreach (var item in array)
                {
                    if (item is not JsonObject assetObject) continue;
                    var name = assetObject["name"]?.GetValue<string>() ?? "";
                    var downloadUrl = assetObject["browser_download_url"]?.GetValue<string>() ?? "";
                    var size = assetObject["size"]?.GetValue<long>() ?? 0;
                    if (string.IsNullOrWhiteSpace(name) || !IsAllowedGitHubUrl(downloadUrl, _allowCustomHosts)) continue;
                    if (name.Equals("SHA256SUMS.txt", StringComparison.OrdinalIgnoreCase)) checksumsUrl = downloadUrl;
                    assets.Add(new UpdateAsset(name, downloadUrl, size));
                }
            }

            if (isDraft || isPrerelease || !TryParseSemVer(latestVersion, out _, out _))
            {
                return new UpdateCheckResult(false, normalizedCurrent, normalizedCurrent, releaseName ?? "", releaseNotes, releaseUrl!, publishedAt, null, null);
            }

            var installerAsset = SelectWinUiInstallerAsset(assets);
            var hasUpdate = IsNewerVersion(normalizedCurrent, latestVersion);
            return new UpdateCheckResult(hasUpdate, normalizedCurrent, latestVersion, releaseName ?? ("v" + latestVersion), releaseNotes, releaseUrl!, publishedAt, installerAsset, checksumsUrl);
        }
    }

    public async Task<string> DownloadInstallerAsync(
        UpdateCheckResult update,
        string updatesDirectory,
        IProgress<UpdateDownloadProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (update.InstallerAsset is null)
            throw new InvalidOperationException("该版本未提供 Windows 安装包，请前往 GitHub 发布页手动下载。");
        if (!IsAllowedGitHubUrl(update.InstallerAsset.DownloadUrl, _allowCustomHosts))
            throw new InvalidOperationException("安装包下载地址不受信任，已拒绝下载。");

        Directory.CreateDirectory(updatesDirectory);
        var safeFileName = Path.GetFileName(update.InstallerAsset.Name);
        if (string.IsNullOrWhiteSpace(safeFileName) || !safeFileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("安装包文件名无效。");

        CleanupOldFiles(updatesDirectory, safeFileName);
        var destinationPath = ProjectStore.SafePath(updatesDirectory, safeFileName);
        var partPath = destinationPath + ".part";

        using var request = new HttpRequestMessage(HttpMethod.Get, update.InstallerAsset.DownloadUrl);
        request.Headers.UserAgent.ParseAdd($"Raphael-Publish-WinUI/{update.CurrentVersion}");

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("下载安装包失败，请检查网络连接后重试。");
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"下载安装包失败（HTTP {(int)response.StatusCode}）。");

            var totalBytes = response.Content.Headers.ContentLength ?? (update.InstallerAsset.Size > 0 ? update.InstallerAsset.Size : null);
            long downloaded = 0;
            var lastReported = DateTime.UtcNow;

            try
            {
                await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
                await using (var target = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true))
                {
                    var buffer = new byte[65536];
                    int read;
                    while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
                    {
                        await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                        downloaded += read;
                        var now = DateTime.UtcNow;
                        if (now - lastReported >= TimeSpan.FromMilliseconds(100) || (totalBytes is > 0 && downloaded >= totalBytes.Value))
                        {
                            lastReported = now;
                            double? percent = totalBytes is > 0 ? Math.Min(100.0, downloaded * 100.0 / totalBytes.Value) : null;
                            progress?.Report(new UpdateDownloadProgress(downloaded, totalBytes, percent, "downloading"));
                        }
                    }
                }

                if (downloaded <= 0 || (update.InstallerAsset.Size > 0 && downloaded != update.InstallerAsset.Size))
                    throw new InvalidOperationException("安装包下载不完整，请重试。");

                if (!string.IsNullOrWhiteSpace(update.ChecksumsUrl) && IsAllowedGitHubUrl(update.ChecksumsUrl, _allowCustomHosts))
                {
                    progress?.Report(new UpdateDownloadProgress(downloaded, totalBytes ?? downloaded, 100, "verifying"));
                    var expectedHash = await FetchExpectedSha256Async(update.ChecksumsUrl, safeFileName, update.CurrentVersion, cancellationToken);
                    if (!string.IsNullOrWhiteSpace(expectedHash))
                    {
                        var actualHash = await ComputeSha256Async(partPath, cancellationToken);
                        if (!actualHash.Equals(expectedHash, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidOperationException("安装包完整性校验失败（SHA-256 不匹配），已取消安装。");
                    }
                }

                File.Move(partPath, destinationPath, overwrite: true);
                progress?.Report(new UpdateDownloadProgress(downloaded, totalBytes ?? downloaded, 100, "ready"));
                return destinationPath;
            }
            catch
            {
                try { if (File.Exists(partPath)) File.Delete(partPath); } catch { }
                throw;
            }
        }
    }

    async Task<string?> FetchExpectedSha256Async(string checksumsUrl, string fileName, string currentVersion, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, checksumsUrl);
            request.Headers.UserAgent.ParseAdd($"Raphael-Publish-WinUI/{currentVersion}");
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            return ParseSha256Sums(text, fileName);
        }
        catch (OperationCanceledException) { throw; }
        catch
        {
            return null;
        }
    }

    static async Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, useAsync: true);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    static void CleanupOldFiles(string updatesDirectory, string keepFileName)
    {
        try
        {
            foreach (var file in Directory.EnumerateFiles(updatesDirectory))
            {
                var name = Path.GetFileName(file);
                if (name.Equals(keepFileName, StringComparison.OrdinalIgnoreCase)) continue;
                try { File.Delete(file); } catch { }
            }
        }
        catch { }
    }

    static string EscapePowerShellSingleQuoted(string value) => value.Replace("'", "''");

    public static string BuildWindowsInstallScript(string installerPath, int currentPid, string? preferredExePath = null)
    {
        var escapedInstaller = EscapePowerShellSingleQuoted(installerPath);
        var escapedPreferred = EscapePowerShellSingleQuoted(preferredExePath ?? "");
        return $$"""
            $ErrorActionPreference = 'SilentlyContinue'
            $targetPid = {{currentPid}}
            $installer = '{{escapedInstaller}}'
            $preferredExe = '{{escapedPreferred}}'
            $deadline = (Get-Date).AddSeconds(30)
            while ((Get-Date) -lt $deadline) {
                if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
                Start-Sleep -Milliseconds 250
            }
            Start-Sleep -Milliseconds 400
            if (-not (Test-Path -LiteralPath $installer)) { exit 1 }
            $proc = Start-Process -FilePath $installer -ArgumentList @('/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/SP-') -Wait -PassThru
            if ($proc -and $proc.ExitCode -eq 0) {
                $exe = $null
                $uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{75F379E8-BE84-483E-9220-E7E28D836AA1}_is1'
                $installDir = (Get-ItemProperty -LiteralPath $uninstallKey -ErrorAction SilentlyContinue).InstallLocation
                if ($installDir) {
                    $candidate = Join-Path $installDir 'Raphael Publish WinUI.exe'
                    if (Test-Path -LiteralPath $candidate) { $exe = $candidate }
                }
                if (-not $exe -and $preferredExe -and (Test-Path -LiteralPath $preferredExe)) {
                    $exe = $preferredExe
                }
                if (-not $exe) {
                    $defaultCandidate = Join-Path $env:LOCALAPPDATA 'Programs\Raphael Publish WinUI\Raphael Publish WinUI.exe'
                    if (Test-Path -LiteralPath $defaultCandidate) { $exe = $defaultCandidate }
                }
                if ($exe) {
                    Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe)
                }
                Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
            }
            Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
            """;
    }

    public static void LaunchWindowsInstaller(string installerPath, int currentPid, string? preferredExePath = null)
    {
        if (!File.Exists(installerPath))
            throw new InvalidOperationException("找不到已下载的安装包，请重新下载。");

        var scriptPath = Path.Combine(Path.GetTempPath(), $"raphael-update-{Guid.NewGuid():N}.ps1");
        File.WriteAllText(scriptPath, BuildWindowsInstallScript(installerPath, currentPid, preferredExePath), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-NonInteractive");
        startInfo.ArgumentList.Add("-WindowStyle");
        startInfo.ArgumentList.Add("Hidden");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(scriptPath);

        if (Process.Start(startInfo) is null)
            throw new InvalidOperationException("无法启动更新安装程序，请前往下载目录手动运行安装包。");
    }

    public static string FormatBytes(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        return $"{bytes / (1024.0 * 1024.0):F1} MB";
    }
}

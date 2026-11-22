using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Raphael.Core;

var root = Path.Combine(Path.GetTempPath(), "raphael-native-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var trash = Path.Combine(root, "test-trash"); Directory.CreateDirectory(trash);
var checks = new List<string>();
void Check(bool condition, string name) { if (!condition) throw new InvalidOperationException("FAIL: " + name); checks.Add(name); }
var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI3kAAAAASUVORK5CYII=");
var handler = new ImagesHandler(png);
var store = new ProjectStore(Path.Combine(root, "projects"), (path, directory) => { var target = Path.Combine(trash, Guid.NewGuid().ToString("N")); if (directory) Directory.Move(path, target); else File.Move(path, target); }, new HttpClient(handler));
var project = await store.CreateAsync("测试:项目", "# 标题\n\n原文");
Check((await store.ReadAsync(project.Id)).Markdown.Contains("原文"), "create-read-existing-schema");
var originalDirectory = store.DirectoryFor(project);
await store.RenameAsync(project.Id, "新标题");
Check((await store.FindAsync(project.Id)).Title == "新标题" && Directory.Exists(originalDirectory), "rename-without-moving-project");
var metadataFile = Path.Combine(originalDirectory, "project.json");
var metadata = JsonNode.Parse(await File.ReadAllTextAsync(metadataFile))!; metadata["futureProperty"] = "保留"; await File.WriteAllTextAsync(metadataFile, metadata.ToJsonString());
await store.SaveAsync(project.Id, "# 已保存\n\n正文", "apple");
Check(JsonNode.Parse(await File.ReadAllTextAsync(metadataFile))!["futureProperty"]!.GetValue<string>() == "保留", "preserve-old-metadata-fields");
var update = await store.UpdateImagesAsync(project.Id, "# 标题\n\nhttps://example.com/one.png\n\n![第二张](data:image/png;base64," + Convert.ToBase64String(png) + ")", "apple");
Check(update.DownloadedImageCount == 2 && update.Project.Markdown.Contains("![](图片/"), "download-bare-url-and-clipboard-image");
Check((await File.ReadAllBytesAsync(Path.Combine(originalDirectory, update.Project.ImageMappings[0].LocalFile))).SequenceEqual(png), "preserve-original-image-bytes");
var ghost = Path.Combine(originalDirectory, "图片", "unused.png"); await File.WriteAllBytesAsync(ghost, png);
var currentContent = update.Project.Markdown + "\n\n![复用](https://example.com/one.png)";
var next = await store.UpdateImagesAsync(project.Id, currentContent, "apple");
Check(next.ReusedImageCount == 1 && handler.Downloads == 1, "reuse-downloaded-image");
Check(next.RemovedImageCount == 1 && !File.Exists(ghost) && Directory.GetFiles(trash).Length == 1, "recycle-unused-images-only");
var failed = await store.UpdateImagesAsync(project.Id, next.Project.Markdown + "\n\n![失败](https://example.com/error.png)", "apple");
Check(failed.FailedImageCount == 1 && failed.Project.Markdown.Contains("https://example.com/error.png"), "failed-image-link-preserved");
Check(Directory.GetFiles(Path.Combine(originalDirectory, "图片")).Length == 2, "keep-active-images-on-failure");
try { ProjectStore.SafePath(originalDirectory, "../outside"); Check(false, "reject-path-traversal"); } catch (InvalidOperationException) { checks.Add("reject-path-traversal"); }
try { await store.DownloadAsync("http://127.0.0.1/image.png"); Check(false, "reject-private-image-url"); } catch (InvalidOperationException) { checks.Add("reject-private-image-url"); }
var customData = "{\"blocks\":[{\"type\":13}]}";
var htmlFragment = "<p>中文文章</p><img src=\"data:image/png;base64," + Convert.ToBase64String(png) + "\">";
Check(HtmlClipboard.ExtractFragment("Version:1.0\r\n<html><body><!--StartFragment-->" + htmlFragment + "<!--EndFragment--></body></html>") == htmlFragment, "preserve-cf-html-fragment-with-embedded-image");
using (var bytes = new MemoryStream())
{
    using var writer = new BinaryWriter(bytes, Encoding.Unicode, true); writer.Write(0); writer.Write(1);
    foreach (var value in new[] { "text/next-space-blocks", customData }) { writer.Write(value.Length); writer.Write(Encoding.Unicode.GetBytes(value)); while (bytes.Position % 4 != 0) writer.Write((byte)0); }
    writer.Flush(); var payload = bytes.ToArray(); BitConverter.GetBytes(payload.Length - 4).CopyTo(payload, 0);
    Check(ChromiumClipboard.FindFormat(payload, "text/next-space-blocks") == customData, "read-chromium-flowus-clipboard-format");
    Check(ChromiumClipboard.FindFormat(new byte[] { 0, 0, 0, 0 }, "text/next-space-blocks") == "", "reject-truncated-clipboard-data");
}
var wechat = new WeChatHandler(png);
var publish = new WeChatPublisher(store, new HttpClient(wechat));
var source = "https://images.raphael.local/" + project.Id + "/" + update.Project.ImageMappings[0].LocalFile;
var draft = await publish.PublishAsync(new(project.Id, "草稿标题", "作者", "摘要", "<section><p>正文</p><img src=\"" + source + "\"></section>", "test-app-id", "test-app-secret"));
Check(draft.MediaId == "mock-draft" && draft.UploadedImageCount == 1 && wechat.OriginalBytesPreserved, "mock-draft-publish-with-original-image");
Check(wechat.PublishedContent.Contains("https://mmbiz.qpic.cn/mock.png") && !wechat.PublishedContent.Contains("images.raphael.local"), "rewrite-draft-image-source");
await store.DeleteAsync(project.Id);
Check((await store.ListAsync()).Count == 0 && Directory.GetDirectories(trash).Length == 1, "recycle-entire-deleted-project");

// AppUpdater tests
Check(AppUpdater.IsNewerVersion("2.1.0", "v2.2.0"), "updater-detects-newer-minor-version");
Check(AppUpdater.IsNewerVersion("2.2.0", "v2.10.0"), "updater-compares-numeric-semver-segments");
Check(!AppUpdater.IsNewerVersion("2.1.0+build123", "v2.1.0"), "updater-treats-same-version-as-up-to-date");
Check(!AppUpdater.IsNewerVersion("2.2.0", "v2.1.9"), "updater-ignores-older-version");
Check(AppUpdater.IsNewerVersion("2.2.0-beta.1", "v2.2.0"), "updater-prefers-stable-over-prerelease");
Check(AppUpdater.IsAllowedGitHubUrl("https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe"), "updater-allows-github-https");
Check(AppUpdater.IsAllowedGitHubUrl("https://objects.githubusercontent.com/github-production-release-asset/foo.exe"), "updater-allows-githubusercontent-https");
Check(!AppUpdater.IsAllowedGitHubUrl("http://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest"), "updater-rejects-http-url");
Check(!AppUpdater.IsAllowedGitHubUrl("https://evil.example.com/Setup.exe"), "updater-rejects-untrusted-host");

var installerBytes = Encoding.UTF8.GetBytes("MZ-fake-raphael-winui-installer-payload-2.2.0");
var installerSha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(installerBytes)).ToLowerInvariant();
var updaterHandler = new UpdateHandler(installerBytes, installerSha);
var updater = new AppUpdater(new HttpClient(updaterHandler), "https://api.github.com/repos/DrivingGodJ/raphael-publish-desktop/releases/latest");
var updateCheck = await updater.CheckForUpdatesAsync("2.1.0");
Check(updateCheck.HasUpdate && updateCheck.CanAutoInstall && updateCheck.LatestVersion == "2.2.0", "updater-checks-latest-github-release");
Check(updateCheck.InstallerAsset?.Name == "Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe", "updater-selects-winui-installer-asset");
Check(!string.IsNullOrWhiteSpace(updateCheck.ChecksumsUrl), "updater-detects-sha256sums-asset");
var alreadyLatest = await updater.CheckForUpdatesAsync("2.2.0");
Check(!alreadyLatest.HasUpdate, "updater-reports-no-update-when-current");

var updatesDir = Path.Combine(root, "updates");
var progressStages = new List<string>();
var downloadedInstaller = await updater.DownloadInstallerAsync(updateCheck, updatesDir, new Progress<UpdateDownloadProgress>(p => progressStages.Add(p.Stage)));
Check(File.Exists(downloadedInstaller) && (await File.ReadAllBytesAsync(downloadedInstaller)).SequenceEqual(installerBytes), "updater-downloads-and-verifies-sha256");
Check(!File.Exists(downloadedInstaller + ".part"), "updater-cleans-part-file-after-download");

var badUpdater = new AppUpdater(new HttpClient(new UpdateHandler(installerBytes, new string('0', 64))), "https://api.github.com/repos/DrivingGodJ/raphael-publish-desktop/releases/latest");
var badCheck = await badUpdater.CheckForUpdatesAsync("2.1.0");
try
{
    await badUpdater.DownloadInstallerAsync(badCheck, Path.Combine(root, "updates-bad"));
    Check(false, "updater-rejects-corrupted-sha256");
}
catch (InvalidOperationException error) when (error.Message.Contains("SHA-256"))
{
    checks.Add("updater-rejects-corrupted-sha256");
}

var failingUpdater = new AppUpdater(new HttpClient(new UpdateHandler(installerBytes, installerSha, failNetwork: true)), "https://api.github.com/repos/DrivingGodJ/raphael-publish-desktop/releases/latest");
try
{
    await failingUpdater.CheckForUpdatesAsync("2.1.0");
    Check(false, "updater-throws-friendly-error-on-network-failure");
}
catch (InvalidOperationException error) when (error.Message.Contains("GitHub"))
{
    checks.Add("updater-throws-friendly-error-on-network-failure");
}

var installScript = AppUpdater.BuildWindowsInstallScript(@"C:\Users\O'Brien\Updates\Setup.exe", 4321, @"C:\App\Raphael Publish WinUI.exe");
Check(installScript.Contains("$targetPid = 4321") && installScript.Contains("O''Brien") && installScript.Contains("'/SILENT'"), "updater-builds-safe-windows-install-script");

Console.WriteLine(JsonSerializer.Serialize(new { success = true, checks = checks.Count, names = checks }, new JsonSerializerOptions { WriteIndented = true }));

sealed class ImagesHandler(byte[] png) : HttpMessageHandler
{
    public int Downloads { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri!.AbsolutePath.Contains("error")) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        Downloads++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(png) });
    }
}
sealed class WeChatHandler(byte[] png) : HttpMessageHandler
{
    public bool OriginalBytesPreserved { get; private set; }
    public string PublishedContent { get; private set; } = "";
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath; string json;
        if (path.EndsWith("stable_token")) json = "{\"access_token\":\"test-token\"}";
        else if (path.EndsWith("uploadimg") || path.EndsWith("add_material"))
        {
            var multipart = request.Content as MultipartFormDataContent ?? throw new InvalidOperationException("Missing multipart image");
            OriginalBytesPreserved = (await multipart.First().ReadAsByteArrayAsync(cancellationToken)).SequenceEqual(png);
            json = path.EndsWith("uploadimg") ? "{\"url\":\"https://mmbiz.qpic.cn/mock.png\"}" : "{\"media_id\":\"mock-cover\"}";
        }
        else if (path.EndsWith("draft/add"))
        { var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!; PublishedContent = body["articles"]![0]!["content"]!.GetValue<string>(); json = "{\"media_id\":\"mock-draft\"}"; }
        else throw new InvalidOperationException("Unexpected API endpoint");
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}

sealed class UpdateHandler(byte[] installerBytes, string sha256Hex, bool failNetwork = false) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (failNetwork) throw new HttpRequestException("Simulated offline network");
        var uri = request.RequestUri!.AbsoluteUri;
        if (uri.EndsWith("/releases/latest", StringComparison.Ordinal))
        {
            var payload = JsonSerializer.Serialize(new
            {
                tag_name = "v2.2.0",
                name = "v2.2.0 · 自动检查更新",
                body = "- 新增检查更新与自动下载安装功能",
                html_url = "https://github.com/DrivingGodJ/raphael-publish-desktop/releases/tag/v2.2.0",
                published_at = "2026-11-22T12:00:00Z",
                draft = false,
                prerelease = false,
                assets = new object[]
                {
                    new { name = "Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg", browser_download_url = "https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg", size = 123456789L },
                    new { name = "Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe", browser_download_url = "https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe", size = (long)installerBytes.Length },
                    new { name = "SHA256SUMS.txt", browser_download_url = "https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/SHA256SUMS.txt", size = 128L },
                },
            });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload, Encoding.UTF8, "application/json") });
        }
        if (uri.EndsWith("SHA256SUMS.txt", StringComparison.Ordinal))
        {
            var text = $"{sha256Hex}  Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe\n";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(text, Encoding.UTF8, "text/plain") });
        }
        if (uri.EndsWith("Setup.exe", StringComparison.Ordinal))
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(installerBytes) });
        }
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
    }
}

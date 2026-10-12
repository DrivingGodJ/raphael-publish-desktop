using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Raphael.Core;

public sealed class Project
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string FolderName { get; set; } = "";
    public string ArticleFile { get; set; } = "正文.md";
    public string ImageDirectory { get; set; } = "图片";
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string ThemeId { get; set; } = "apple";
    public int ImageCount { get; set; }
    public int FailedImageCount { get; set; }
    public int SourceImageCount { get; set; }
    public List<ImageMapping> ImageMappings { get; set; } = [];
    public List<ImageFailure> ImageFailures { get; set; } = [];
    [JsonIgnore] public string Markdown { get; set; } = "";
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }
}
public sealed record ImageMapping(string OriginalUrl, string LocalFile, string FileName, long Bytes);
public sealed record ImageFailure(string OriginalUrl, string Message);
public sealed record ImageUpdate(Project Project, int ScannedImageCount, int DownloadedImageCount, int ReusedImageCount, int FailedImageCount, int RemovedImageCount);
public sealed record ImageReference(string Source, bool Bare);

public sealed class ProjectStore
{
    public static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, WriteIndented = true };
    public const string ArticleFileName = "正文.md", ImageDirectoryName = "图片";
    public const int MaxImageBytes = 30 * 1024 * 1024;
    static readonly Regex IdPattern = new(@"^\d{14}-[a-f0-9]{6}$", RegexOptions.Compiled);
    static readonly Regex MarkdownImages = new("!\\[[^\\]]*\\]\\(\\s*(?:<([^>]+)>|([^\\s)]+))(?:\\s+[\"'][^\"']*[\"'])?\\s*\\)", RegexOptions.Compiled);
    static readonly Regex HtmlImages = new("<img\\b[^>]*\\bsrc=[\"']([^\"']+)[\"'][^>]*>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    readonly SemaphoreSlim _writeLock = new(1, 1);
    readonly HttpClient _http;
    readonly Action<string, bool> _recycle;
    public string Root { get; }

    public ProjectStore(string root, Action<string, bool> recycle, HttpClient? http = null)
    {
        Root = Path.GetFullPath(root);
        _recycle = recycle;
        _http = http ?? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };
        Directory.CreateDirectory(Root);
    }

    public static string SafePath(string root, string relative)
    {
        var basePath = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, relative));
        if (!path.StartsWith(basePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("项目路径越界。");
        var current = path;
        while (current.Length >= basePath.Length)
        {
            if ((File.Exists(current) || Directory.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidOperationException("项目路径不能经过符号链接。");
            current = Path.GetDirectoryName(current) ?? "";
        }
        return path;
    }

    public static string SanitizeName(string? name)
    {
        var value = Regex.Replace(name ?? "", "[<>:\"/\\\\|?*\\x00-\\x1f]", " ");
        value = Regex.Replace(value, @"\s+", " ").Trim().TrimEnd('.', ' ');
        if (value.Length > 80) value = value[..80];
        return value.Length == 0 ? "未命名项目" : value;
    }

    static string Now() => DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    static async Task WriteAtomic(string path, string content)
    {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { await File.WriteAllTextAsync(temporary, content, new UTF8Encoding(false)); File.Move(temporary, path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    Task WriteMetadata(Project project) => WriteAtomic(SafePath(DirectoryFor(project), "project.json"), JsonSerializer.Serialize(project, JsonOptions));
    public string DirectoryFor(Project project) => SafePath(Root, project.FolderName);

    public async Task<List<Project>> ListAsync()
    {
        var result = new List<Project>();
        foreach (var directory in Directory.EnumerateDirectories(Root))
        {
            try
            {
                var safe = SafePath(Root, Path.GetFileName(directory));
                var project = JsonSerializer.Deserialize<Project>(await File.ReadAllTextAsync(Path.Combine(safe, "project.json")), JsonOptions);
                if (project is null || !IdPattern.IsMatch(project.Id)) continue;
                project.FolderName = Path.GetFileName(directory);
                result.Add(project);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException) { }
        }
        return result.OrderByDescending(project => project.UpdatedAt, StringComparer.Ordinal).ToList();
    }

    public async Task<Project> FindAsync(string id)
    {
        if (!IdPattern.IsMatch(id)) throw new InvalidOperationException("项目编号无效。");
        return (await ListAsync()).FirstOrDefault(project => project.Id == id) ?? throw new InvalidOperationException("项目不存在，可能已经被删除。");
    }
    public async Task<Project> ReadAsync(string id)
    {
        var project = await FindAsync(id);
        project.Markdown = await File.ReadAllTextAsync(SafePath(DirectoryFor(project), ArticleFileName));
        return project;
    }

    public async Task<Project> CreateAsync(string name, string? markdown = null)
    {
        await _writeLock.WaitAsync();
        try
        {
            var title = SanitizeName(name);
            var id = DateTime.Now.ToString("yyyyMMddHHmmss") + "-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(3)).ToLowerInvariant();
            var project = new Project { Id = id, Title = title, FolderName = title + "__" + id, CreatedAt = Now(), UpdatedAt = Now(), Markdown = string.IsNullOrWhiteSpace(markdown) ? $"# {title}\n\n" : markdown };
            var directory = DirectoryFor(project);
            if (Directory.Exists(directory)) throw new IOException("项目文件夹已存在，请重试。");
            Directory.CreateDirectory(SafePath(directory, ImageDirectoryName));
            await WriteAtomic(SafePath(directory, ArticleFileName), project.Markdown);
            await WriteMetadata(project);
            return project;
        }
        finally { _writeLock.Release(); }
    }
    public async Task<Project> SaveAsync(string id, string markdown, string themeId)
    {
        await _writeLock.WaitAsync();
        try
        {
            var project = await FindAsync(id);
            project.ThemeId = themeId; project.UpdatedAt = Now(); project.Markdown = markdown;
            await WriteAtomic(SafePath(DirectoryFor(project), ArticleFileName), markdown);
            await WriteMetadata(project);
            return project;
        }
        finally { _writeLock.Release(); }
    }
    public async Task<Project> RenameAsync(string id, string name)
    {
        await _writeLock.WaitAsync();
        try { var project = await FindAsync(id); project.Title = SanitizeName(name); project.UpdatedAt = Now(); await WriteMetadata(project); return project; }
        finally { _writeLock.Release(); }
    }
    public async Task DeleteAsync(string id)
    {
        await _writeLock.WaitAsync();
        try { _recycle(DirectoryFor(await FindAsync(id)), true); }
        finally { _writeLock.Release(); }
    }

    public static List<ImageReference> ExtractReferences(string markdown)
    {
        var result = new List<ImageReference>(); var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var pattern in new[] { MarkdownImages, HtmlImages })
        {
            foreach (Match match in pattern.Matches(markdown))
            {
                var source = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
                if ((!source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) && !Regex.IsMatch(source, @"^https?://", RegexOptions.IgnoreCase)) || !seen.Add(source)) continue;
                result.Add(new(source, false)); if (result.Count >= 200) return result;
            }
        }
        foreach (Match match in Regex.Matches(markdown, @"^[ \t]*(https?://\S+)[ \t]*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
        {
            var source = match.Groups[1].Value.Trim();
            if (seen.Add(source)) result.Add(new(source, true));
            if (result.Count >= 200) break;
        }
        return result;
    }
    public static HashSet<string> ExtractLocalFiles(string markdown)
    {
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pattern in new[] { MarkdownImages, HtmlImages })
            foreach (Match match in pattern.Matches(markdown))
            {
                var source = (match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value).Replace('\\', '/');
                if (source.StartsWith("./")) source = source[2..];
                if (!source.StartsWith("图片/")) continue;
                var name = source[3..];
                if (name.Length > 0 && !name.Contains('/') && name is not "." and not "..") files.Add(name);
            }
        foreach (Match match in Regex.Matches(markdown, "图片/[^\\n)>\"']+"))
        {
            var name = match.Value[3..].Trim().TrimEnd('，', '。', '；', ';', ',');
            if (name.Length > 0 && !name.Contains('/') && name is not "." and not "..") files.Add(name);
        }
        return files;
    }
    static bool PrivateHost(string host) => host is "localhost" or "::1" || host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) || Regex.IsMatch(host, @"^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)");
    public async Task<(byte[] Bytes, string Mime)> DownloadAsync(string source)
    {
        if (source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(source, @"^data:([^;,]+)(;base64)?,(.*)$", RegexOptions.Singleline);
            if (!match.Success) throw new InvalidOperationException("无法解析粘贴图片。");
            var bytes = match.Groups[2].Success ? Convert.FromBase64String(match.Groups[3].Value) : Encoding.UTF8.GetBytes(Uri.UnescapeDataString(match.Groups[3].Value));
            if (bytes.Length is 0 or > MaxImageBytes) throw new InvalidOperationException("图片为空或超过 30 MB。");
            return (bytes, match.Groups[1].Value);
        }
        var url = new Uri(source);
        for (var redirects = 0; redirects < 6; redirects++)
        {
            if (url.Scheme is not "http" and not "https" || PrivateHost(url.Host)) throw new InvalidOperationException("不支持该图片地址。");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Referrer = new Uri("https://flowus.cn/");
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36");
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is not null) { url = new Uri(url, response.Headers.Location); continue; }
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > MaxImageBytes) throw new InvalidOperationException("图片超过 30 MB。");
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var memory = new MemoryStream(); var buffer = new byte[81920]; int count;
            while ((count = await stream.ReadAsync(buffer, timeout.Token)) > 0)
            { if (memory.Length + count > MaxImageBytes) throw new InvalidOperationException("图片超过 30 MB。"); await memory.WriteAsync(buffer.AsMemory(0, count), timeout.Token); }
            if (memory.Length == 0) throw new InvalidOperationException("图片文件为空。");
            return (memory.ToArray(), response.Content.Headers.ContentType?.MediaType ?? "");
        }
        throw new InvalidOperationException("图片链接跳转次数过多。");
    }
    public static string ImageExtension(byte[] bytes, string mime = "")
    {
        if (bytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return ".png";
        if (bytes.AsSpan().StartsWith(new byte[] { 255, 216, 255 })) return ".jpg";
        if (bytes.Length >= 6 && Encoding.ASCII.GetString(bytes, 0, 6) is "GIF87a" or "GIF89a") return ".gif";
        if (bytes.Length >= 12 && Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP") return ".webp";
        if (bytes.Length >= 12 && Encoding.ASCII.GetString(bytes, 4, 8).Contains("ftypavif")) return ".avif";
        if (mime == "image/svg+xml" && Encoding.UTF8.GetString(bytes).Contains("<svg")) return ".svg";
        throw new InvalidOperationException("链接返回的内容不是受支持的图片。");
    }
    static string ImageName(string source, int index, string extension)
    {
        var name = source.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? Uri.UnescapeDataString(Path.GetFileName(new Uri(source).AbsolutePath)) : "图片";
        var stem = SanitizeName(Path.GetFileNameWithoutExtension(name)); if (stem.Length > 48) stem = stem[..48];
        return $"{index + 1:D3}_{stem}_{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source)))[..8].ToLowerInvariant()}{extension}";
    }
    static string ReplaceReference(string markdown, ImageReference reference, string local)
    {
        if (!reference.Bare) return markdown.Replace(reference.Source, local, StringComparison.Ordinal);
        return string.Join('\n', markdown.Replace("\r\n", "\n").Split('\n').Select(line => line.Trim() == reference.Source ? Regex.Match(line, @"^[ \t]*").Value + "![](" + local + ")" : line));
    }

    public async Task<ImageUpdate> UpdateImagesAsync(string id, string markdown, string themeId, IProgress<string>? progress = null)
    {
        await _writeLock.WaitAsync();
        try
        {
            var project = await FindAsync(id); var directory = DirectoryFor(project);
            var images = SafePath(directory, ImageDirectoryName); Directory.CreateDirectory(images);
            var mappings = project.ImageMappings.ToList(); var failures = new List<ImageFailure>();
            var references = ExtractReferences(markdown); var downloaded = 0; var reused = 0;
            foreach (var reference in references)
            {
                progress?.Report($"正在处理图片 {downloaded + reused + failures.Count + 1}/{references.Count}…");
                var existing = mappings.FirstOrDefault(mapping => mapping.OriginalUrl == reference.Source);
                if (existing is not null && Path.GetFileName(existing.FileName) == existing.FileName && File.Exists(SafePath(images, existing.FileName)))
                { markdown = ReplaceReference(markdown, reference, existing.LocalFile); reused++; continue; }
                try
                {
                    var (bytes, mime) = await DownloadAsync(reference.Source);
                    var name = ImageName(reference.Source, mappings.Count, ImageExtension(bytes, mime));
                    await File.WriteAllBytesAsync(SafePath(images, name), bytes);
                    var local = "图片/" + name;
                    markdown = ReplaceReference(markdown, reference, local);
                    mappings.RemoveAll(mapping => mapping.OriginalUrl == reference.Source);
                    mappings.Add(new(reference.Source, local, name, bytes.Length)); downloaded++;
                }
                catch (Exception error) when (error is HttpRequestException or IOException or InvalidOperationException or FormatException or TaskCanceledException)
                { failures.Add(new(reference.Source[..Math.Min(500, reference.Source.Length)], error.Message)); }
            }
            // Persist the new references before any unused file is recycled.
            await WriteAtomic(SafePath(directory, ArticleFileName), markdown);
            var active = ExtractLocalFiles(markdown); var removed = 0;
            foreach (var file in Directory.EnumerateFiles(images))
            {
                if (active.Contains(Path.GetFileName(file))) continue;
                _recycle(SafePath(images, Path.GetFileName(file)), false); removed++;
            }
            var remaining = Directory.EnumerateFiles(images).Select(Path.GetFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            project.ImageMappings = mappings.Where(mapping => remaining.Contains(mapping.FileName)).ToList();
            project.ImageFailures = failures; project.ImageCount = remaining.Count; project.FailedImageCount = failures.Count;
            project.SourceImageCount = remaining.Count + failures.Count; project.ThemeId = themeId; project.UpdatedAt = Now(); project.Markdown = markdown;
            await WriteMetadata(project);
            return new(project, references.Count, downloaded, reused, failures.Count, removed);
        }
        finally { _writeLock.Release(); }
    }
}

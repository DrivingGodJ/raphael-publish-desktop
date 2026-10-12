using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Raphael.Core;

public sealed record DraftRequest(string ProjectId, string Title, string Author, string Digest, string Content, string AppId, string AppSecret, string? CoverPath = null);
public sealed record DraftResult(string MediaId, int UploadedImageCount, bool UsedSelectedCover);
public sealed record PreparedImage(byte[] Bytes, string Mime, string FileName);

public sealed class WeChatPublisher
{
    readonly ProjectStore _store;
    readonly HttpClient _http;
    readonly string _apiRoot;
    static readonly Regex ImageSources = new("<img\\b[^>]*?\\b(?:src|data-src)=[\"']([^\"']+)[\"'][^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Dictionary<int, string> ErrorHints = new()
    {
        [40013] = "AppID 无效，请检查公众号开发设置。", [40125] = "AppSecret 无效或已经重置。",
        [40164] = "当前公网 IP 不在公众号白名单中，请在微信开发者平台加入下方显示的 IP。",
        [45001] = "图片超过微信接口允许的大小，请手动压缩后再试。", [45004] = "摘要过长，请控制在 120 个字符以内。",
        [45009] = "公众号接口今日调用次数已用完。", [48001] = "当前公众号没有草稿或素材接口权限。"
    };
    public WeChatPublisher(ProjectStore store, HttpClient? http = null, string apiRoot = "https://api.weixin.qq.com")
    { _store = store; _http = http ?? new HttpClient { Timeout = TimeSpan.FromSeconds(60) }; _apiRoot = apiRoot.TrimEnd('/'); }

    async Task<JsonObject> FetchJsonAsync(HttpRequestMessage request, string fallback)
    {
        using (request)
        using (var response = await _http.SendAsync(request))
        {
            JsonObject? json;
            try { json = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject; }
            catch (System.Text.Json.JsonException) { throw new InvalidOperationException($"{fallback}：微信返回了无法识别的响应（HTTP {(int)response.StatusCode}）。"); }
            if (json is null) throw new InvalidOperationException(fallback);
            var code = json["errcode"]?.GetValue<int>() ?? 0;
            if (!response.IsSuccessStatusCode || code != 0)
            {
                var message = json["errmsg"]?.GetValue<string>() ?? "微信接口错误";
                throw new InvalidOperationException($"{(ErrorHints.GetValueOrDefault(code) ?? fallback)} 微信返回：{message}（{code}）");
            }
            return json;
        }
    }
    Task<JsonObject> PostJsonAsync(string endpoint, object payload, string fallback)
        => FetchJsonAsync(new HttpRequestMessage(HttpMethod.Post, _apiRoot + endpoint) { Content = JsonContent.Create(payload) }, fallback);

    public static PreparedImage PrepareImage(byte[] bytes, string name)
    {
        if (bytes.Length == 0) throw new InvalidOperationException("图片文件为空。");
        var extension = ProjectStore.ImageExtension(bytes);
        if (extension is not ".jpg" and not ".png") throw new InvalidOperationException($"微信正文图片接口只接受 JPG 或 PNG，请手动转换后再试：{name}");
        return new(bytes, extension == ".png" ? "image/png" : "image/jpeg", Path.GetFileNameWithoutExtension(name) + extension);
    }
    public static List<string> FindSources(string html) => ImageSources.Matches(html).Select(match => WebUtility.HtmlDecode(match.Groups[1].Value)).Distinct(StringComparer.Ordinal).ToList();

    async Task<PreparedImage?> ReadImageAsync(string source, Project project)
    {
        if (source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
        { var (bytes, _) = await _store.DownloadAsync(source); return PrepareImage(bytes, "clipboard-image"); }
        if (!Uri.TryCreate(source, UriKind.Absolute, out var url)) throw new InvalidOperationException("正文存在无效的图片地址。");
        if (url.Host == "mmbiz.qpic.cn" || url.Host.EndsWith(".mmbiz.qpic.cn", StringComparison.OrdinalIgnoreCase)) return null;
        if (url.Host == "images.raphael.local" || (url.Scheme == "raphael-asset" && url.Host == "project"))
        {
            var parts = url.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.UnescapeDataString).ToArray();
            if (parts.Length != 3 || parts[0] != project.Id || parts[1] != ProjectStore.ImageDirectoryName) throw new InvalidOperationException("正文中存在不属于当前项目的图片。");
            var root = ProjectStore.SafePath(_store.DirectoryFor(project), ProjectStore.ImageDirectoryName);
            return PrepareImage(await File.ReadAllBytesAsync(ProjectStore.SafePath(root, parts[2])), parts[2]);
        }
        throw new InvalidOperationException("正文仍有未本地化的图片，请先点击“更新图片”后再发布。");
    }

    async Task<JsonObject> UploadAsync(string endpoint, string token, PreparedImage image, string fallback, string query = "")
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(image.Bytes); content.Headers.ContentType = new MediaTypeHeaderValue(image.Mime);
        form.Add(content, "media", image.FileName);
        return await FetchJsonAsync(new HttpRequestMessage(HttpMethod.Post, _apiRoot + endpoint + "?access_token=" + Uri.EscapeDataString(token) + query) { Content = form }, fallback);
    }
    static string ReplaceSource(string html, string original, string replacement)
        => Regex.Replace(html, "\\b(src|data-src)=([\"'])(.*?)\\2", match => WebUtility.HtmlDecode(match.Groups[3].Value) == original ? match.Groups[1].Value + "=" + match.Groups[2].Value + WebUtility.HtmlEncode(replacement) + match.Groups[2].Value : match.Value, RegexOptions.IgnoreCase);

    public async Task<DraftResult> PublishAsync(DraftRequest request, IProgress<string>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(request.AppId) || string.IsNullOrWhiteSpace(request.AppSecret)) throw new InvalidOperationException("请先填写公众号 AppID 和 AppSecret。");
        if (string.IsNullOrWhiteSpace(request.Title)) throw new InvalidOperationException("请填写文章标题。");
        if (string.IsNullOrWhiteSpace(request.Content)) throw new InvalidOperationException("正文为空，无法创建草稿。");
        var project = await _store.FindAsync(request.ProjectId);
        progress?.Report("正在连接微信公众号…");
        var tokenJson = await PostJsonAsync("/cgi-bin/stable_token", new { grant_type = "client_credential", appid = request.AppId.Trim(), secret = request.AppSecret.Trim(), force_refresh = false }, "获取公众号接口凭据失败");
        var token = tokenJson["access_token"]?.GetValue<string>() ?? throw new InvalidOperationException("微信没有返回 access_token。");
        var content = request.Content; var count = 0; PreparedImage? first = null;
        foreach (var source in FindSources(content))
        {
            var image = await ReadImageAsync(source, project); if (image is null) continue;
            first ??= image; progress?.Report($"正在上传正文图片 {count + 1}…");
            var json = await UploadAsync("/cgi-bin/media/uploadimg", token, image, "上传正文图片失败");
            content = ReplaceSource(content, source, json["url"]?.GetValue<string>() ?? throw new InvalidOperationException("微信没有返回正文图片地址。")); count++;
        }
        var cover = string.IsNullOrWhiteSpace(request.CoverPath) ? first : PrepareImage(await File.ReadAllBytesAsync(request.CoverPath), Path.GetFileName(request.CoverPath));
        if (cover is null) throw new InvalidOperationException("请选择封面图，或先在正文中加入一张本地图片。");
        progress?.Report("正在上传封面图…");
        var coverJson = await UploadAsync("/cgi-bin/material/add_material", token, cover, "上传封面图失败", "&type=image");
        var mediaId = coverJson["media_id"]?.GetValue<string>() ?? throw new InvalidOperationException("微信没有返回封面素材编号。");
        progress?.Report("正在创建草稿…");
        var digest = request.Digest.Trim(); if (digest.Length > 120) digest = digest[..120];
        var draft = await PostJsonAsync("/cgi-bin/draft/add?access_token=" + Uri.EscapeDataString(token), new
        {
            articles = new[] { new { article_type = "news", title = request.Title.Trim(), author = request.Author.Trim(), digest, content, content_source_url = "", thumb_media_id = mediaId, need_open_comment = 1, only_fans_can_comment = 0 } }
        }, "创建公众号草稿失败");
        return new(draft["media_id"]?.GetValue<string>() ?? throw new InvalidOperationException("微信没有返回草稿编号。"), count, !string.IsNullOrWhiteSpace(request.CoverPath));
    }
}

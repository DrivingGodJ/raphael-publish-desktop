using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Raphael.Core;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace Raphael.WinUI;

internal static class NativeServices
{
    [DllImport("user32.dll")] static extern bool OpenClipboard(nint owner);
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
    [DllImport("user32.dll")] static extern nint GetClipboardData(uint format);
    [DllImport("kernel32.dll")] static extern nint GlobalLock(nint handle);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(nint handle);
    [DllImport("kernel32.dll")] static extern nuint GlobalSize(nint handle);

    public static void OpenPath(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    public static void Recycle(string path, bool directory)
    {
        if (directory) Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
        else Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
    }
    public static void Copy(string text, string? html = null)
    {
        var data = new DataPackage { RequestedOperation = DataPackageOperation.Copy };
        data.SetText(text);
        if (html is not null) data.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat(html));
        Clipboard.SetContent(data); Clipboard.Flush();
    }

    static string ReadChromiumFormat(string format)
    {
        if (!OpenClipboard(0)) return "";
        try
        {
            var handle = GetClipboardData(RegisterClipboardFormat("Chromium Web Custom MIME Data Format"));
            if (handle == 0) return "";
            var size = GlobalSize(handle); if (size == 0 || size > 50 * 1024 * 1024) return "";
            var pointer = GlobalLock(handle); if (pointer == 0) return "";
            try { var bytes = new byte[(int)size]; Marshal.Copy(pointer, bytes, 0, bytes.Length); return ChromiumClipboard.FindFormat(bytes, format); }
            finally { GlobalUnlock(handle); }
        }
        finally { CloseClipboard(); }
    }
    public static async Task<(string Html, string Text, string FlowUs, string Image)> ReadClipboardAsync()
    {
        var data = Clipboard.GetContent();
        var text = data.Contains(StandardDataFormats.Text) ? await data.GetTextAsync() : "";
        var html = data.Contains(StandardDataFormats.Html) ? HtmlClipboard.ExtractFragment(await data.GetHtmlFormatAsync()) : "";
        var flowUs = "";
        try
        {
            if (data.Contains("text/next-space-blocks"))
            {
                var raw = await data.GetDataAsync("text/next-space-blocks");
                if (raw is string value) flowUs = value;
                else if (raw is IRandomAccessStream stream) { using var reader = new DataReader(stream); await reader.LoadAsync((uint)stream.Size); flowUs = reader.ReadString((uint)stream.Size); }
            }
        }
        catch (Exception) { }
        if (flowUs.Length == 0) flowUs = ReadChromiumFormat("text/next-space-blocks");
        var image = "";
        if (data.Contains(StandardDataFormats.Bitmap) && html.Length == 0)
        {
            var bitmap = await data.GetBitmapAsync(); using var input = await bitmap.OpenReadAsync();
            var decoder = await BitmapDecoder.CreateAsync(input); using var software = await decoder.GetSoftwareBitmapAsync();
            using var output = new InMemoryRandomAccessStream(); var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, output);
            encoder.SetSoftwareBitmap(software); await encoder.FlushAsync(); output.Seek(0);
            using var reader = new DataReader(output); await reader.LoadAsync((uint)output.Size); var bytes = new byte[(int)output.Size]; reader.ReadBytes(bytes);
            image = "data:image/png;base64," + Convert.ToBase64String(bytes);
        }
        return (html, text, flowUs, image);
    }
}

internal sealed class CredentialStore
{
    readonly string _path;
    public CredentialStore(string directory) { Directory.CreateDirectory(directory); _path = Path.Combine(directory, "wechat-publisher-settings.json"); }
    public (string AppId, string AppSecret) Read()
    {
        try
        {
            var settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(_path));
            if (settings is null) return ("", "");
            var secret = Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(settings.EncryptedSecret), null, DataProtectionScope.CurrentUser));
            return (settings.AppId, secret);
        }
        catch (Exception error) when (error is IOException or CryptographicException or FormatException or JsonException) { return ("", ""); }
    }
    public void Save(string appId, string secret)
    {
        var encrypted = Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(secret), null, DataProtectionScope.CurrentUser));
        File.WriteAllText(_path, JsonSerializer.Serialize(new Settings(appId, encrypted)));
    }
    sealed record Settings(string AppId, string EncryptedSecret);
}

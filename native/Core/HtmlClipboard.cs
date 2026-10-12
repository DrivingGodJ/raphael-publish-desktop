using System.Text;
using System.Text.RegularExpressions;

namespace Raphael.Core;

public static class HtmlClipboard
{
    public static string ExtractFragment(string value)
    {
        const string startMarker = "<!--StartFragment-->", endMarker = "<!--EndFragment-->";
        var start = value.IndexOf(startMarker, StringComparison.OrdinalIgnoreCase);
        var end = value.LastIndexOf(endMarker, StringComparison.OrdinalIgnoreCase);
        if (start >= 0 && end >= start + startMarker.Length) return value[(start + startMarker.Length)..end];
        var startOffset = Regex.Match(value, @"^StartFragment:\s*(\d+)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
        var endOffset = Regex.Match(value, @"^EndFragment:\s*(\d+)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
        if (startOffset.Success && endOffset.Success && int.TryParse(startOffset.Groups[1].Value, out var first) && int.TryParse(endOffset.Groups[1].Value, out var last))
        {
            var bytes = Encoding.UTF8.GetBytes(value);
            if (first >= 0 && last >= first && last <= bytes.Length) return Encoding.UTF8.GetString(bytes, first, last - first);
        }
        return value;
    }
}

using System.Buffers.Binary;
using System.Text;

namespace Raphael.Core;

public static class ChromiumClipboard
{
    // Chromium stores web custom clipboard formats as a length-prefixed Pickle.
    public static string FindFormat(byte[] bytes, string format)
    {
        if (bytes.Length < 8) return "";
        var payload = BinaryPrimitives.ReadUInt32LittleEndian(bytes);
        if (payload > bytes.Length - 4) return "";
        var position = 4;
        try
        {
            int ReadInt()
            {
                if (position + 4 > bytes.Length) throw new FormatException();
                var value = BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(position, 4)); position += 4; return value;
            }
            string ReadString()
            {
                var length = ReadInt();
                if (length < 0 || length > (bytes.Length - position) / 2) throw new FormatException();
                var result = Encoding.Unicode.GetString(bytes, position, length * 2);
                position += length * 2; position = (position + 3) & ~3; return result;
            }
            var count = ReadInt(); if (count is < 0 or > 1000) return "";
            for (var index = 0; index < count; index++)
            { var key = ReadString(); var value = ReadString(); if (key == format) return value; }
        }
        catch (FormatException) { }
        return "";
    }
}

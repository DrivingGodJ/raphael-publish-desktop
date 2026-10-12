using Microsoft.UI.Xaml;
using Microsoft.UI.Dispatching;
using System.Runtime.InteropServices;

namespace Raphael.WinUI;

internal static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern nint FindWindow(string? className, string title);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] static extern bool ShowWindow(nint window, int command);
    [STAThread]
    static void Main(string[] args)
    {
        using var single = new Mutex(true, "Local\\Raphael.Publish.WinUI", out var created);
        if (!created && !args.Contains("--self-test"))
        {
            var previous = FindWindow(null, "Raphael Publish · WinUI 3");
            if (previous != 0) { ShowWindow(previous, 9); SetForegroundWindow(previous); }
            return;
        }
        WinRT.ComWrappersSupport.InitializeComWrappers();
        Application.Start(init =>
        {
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            _ = new RaphaelApp(args);
        });
    }
}

public sealed partial class RaphaelApp : Application
{
    readonly string[] _args;
    Window? _window;
    public RaphaelApp(string[] args)
    {
        _args = args;
        InitializeComponent();
        UnhandledException += (_, eventArgs) =>
        {
            try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "raphael-winui-error.log"), eventArgs.Exception.ToString() + Environment.NewLine); } catch { }
        };
    }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow(_args);
        _window.Activate();
        if (_args.Contains("--self-test")) _window.AppWindow.Hide();
    }
}

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Raphael.Core;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.UI.ViewManagement;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using System.Runtime.InteropServices;

namespace Raphael.WinUI;

public sealed class MainWindow : Window
{
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(nint window);
    readonly Grid _root = new();
    readonly TextBox _editor = new() { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, IsSpellCheckEnabled = false, IsTextPredictionEnabled = false, FontFamily = new FontFamily("Cascadia Mono"), FontSize = 15, Padding = new Thickness(20), BorderThickness = new Thickness(0), PlaceholderText = "先新建项目，再把 FlowUs 文章粘贴到这里。\n\n也可以直接输入 Markdown，右侧会实时预览。" };
    readonly WebView2 _preview = new();
    readonly TextBlock _projectTitle = new() { Text = "公众号排版", FontSize = 14, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold };
    readonly TextBlock _saveState = new() { Text = "新建项目后，文章会自动保存", FontSize = 12, Opacity = .65 };
    readonly TextBlock _words = new() { Text = "0 字", FontSize = 12, Opacity = .65 };
    readonly InfoBar _notice = new() { IsOpen = false, IsClosable = true, Margin = new Thickness(20, 0, 20, 12) };
    readonly ComboBox _themes = new() { Width = 204, PlaceholderText = "选择排版主题" };
    readonly ComboBox _devices = new() { Width = 118 };
    readonly ToggleSwitch _sync = new() { Header = null, OnContent = "滚动同步", OffContent = "滚动同步", IsOn = true };
    readonly ProgressRing _progress = new() { Width = 20, Height = 20, IsActive = false, Visibility = Visibility.Collapsed };
    readonly Button _projectsButton = new() { Content = "项目管理" };
    readonly Button _updateButton = new() { Content = "更新图片", IsEnabled = false };
    readonly Button _draftButton = new() { Content = "发布草稿", IsEnabled = false };
    readonly Button _copyButton = new() { Content = "复制到公众号" };
    readonly DispatcherQueueTimer _saveTimer, _renderTimer;
    readonly ProjectStore _store;
    readonly CredentialStore _credentials;
    readonly Dictionary<long, TaskCompletionSource<JsonNode?>> _pending = [];
    readonly TaskCompletionSource _webReady = new();
    readonly UISettings _uiSettings = new();
    readonly string[] _args;
    readonly List<Border> _cards = [];
    readonly List<ThemeOption> _themeOptions = [];
    Project? _current;
    ScrollViewer? _editorScroll;
    bool _loading, _busy, _closing, _dark, _initialized;
    long _requestId, _revision;
    double _lastSyncedRatio = -1;
    double _lastPreviewScroll = -1;
    string _themeId = "apple", _device = "pc";
    string CurrentTheme => (_themes.SelectedItem as ThemeOption)?.Id ?? _themeId;
    string CurrentMarkdown => _editor.Text.Replace("\r\n", "\n").Replace('\r', '\n');
    bool SelfTest => _args.Contains("--self-test");

    public MainWindow(string[] args)
    {
        _args = args;
        var root = Environment.GetEnvironmentVariable("RAPHAEL_PROJECTS_ROOT");
        if (SelfTest && string.IsNullOrWhiteSpace(root)) root = Path.Combine(Path.GetTempPath(), "raphael-winui-selftest-" + Guid.NewGuid().ToString("N"));
        _store = new ProjectStore(root ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Raphael公众号项目"), SelfTest ? ((path, directory) => { if (directory) Directory.Delete(path, true); else File.Delete(path); }) : NativeServices.Recycle);
        _credentials = new CredentialStore(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RaphaelPublishWinUI"));
        Title = "Raphael Publish · WinUI 3";
        SystemBackdrop = new MicaBackdrop();
        var scale = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(this)) / 96.0;
        var workArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        var width = Math.Min((int)(1500 * scale), workArea.Width - (int)(48 * scale));
        var height = Math.Min((int)(960 * scale), workArea.Height - (int)(48 * scale));
        AppWindow.MoveAndResize(new RectInt32(workArea.X + (workArea.Width - width) / 2, workArea.Y + (workArea.Height - height) / 2, width, height));
        var icon = Path.Combine(AppContext.BaseDirectory, "icon.ico"); if (File.Exists(icon)) AppWindow.SetIcon(icon);
        _saveTimer = DispatcherQueue.CreateTimer(); _saveTimer.Interval = TimeSpan.FromMilliseconds(650); _saveTimer.IsRepeating = false;
        _saveTimer.Tick += async (_, _) => { try { await SaveCurrentAsync(); } catch (Exception error) { ShowNotice("保存失败：" + error.Message, true); } };
        _renderTimer = DispatcherQueue.CreateTimer(); _renderTimer.Interval = TimeSpan.FromMilliseconds(140); _renderTimer.IsRepeating = false;
        _renderTimer.Tick += async (_, _) => { try { await RenderAsync(); } catch (Exception error) { ShowNotice("预览失败：" + error.Message, true); } };
        BuildLayout(); Content = _root;
        _root.Loaded += async (_, _) => { if (!_initialized) { _initialized = true; await InitializeAsync(); } };
        _editor.TextChanged += (_, _) =>
        {
            if (_loading) return;
            _revision++; _renderTimer.Stop(); _renderTimer.Start();
            if (_current is not null) { _saveState.Text = "正在保存…"; _saveTimer.Stop(); _saveTimer.Start(); }
        };
        _editor.Paste += OnPaste;
        _themes.SelectionChanged += (_, _) =>
        {
            if (_loading) return;
            _themeId = CurrentTheme; _renderTimer.Stop(); _renderTimer.Start();
            if (_current is not null) { _saveTimer.Stop(); _saveTimer.Start(); }
        };
        _devices.SelectionChanged += async (_, _) =>
        { _device = _devices.SelectedIndex switch { 1 => "tablet", 2 => "mobile", _ => "pc" }; if (_webReady.Task.IsCompletedSuccessfully) await ApplyViewAsync(); };
        _uiSettings.ColorValuesChanged += OnSystemThemeChanged;
        ApplySystemTheme();
        AppWindow.Closing += OnClosing;
        Closed += (_, _) => { _uiSettings.ColorValuesChanged -= OnSystemThemeChanged; _preview.Close(); Application.Current.Exit(); };
    }

    void BuildLayout()
    {
        _root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        _root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        _root.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        _root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var header = new Grid { Padding = new Thickness(24, 18, 24, 16), ColumnSpacing = 20 };
        header.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) }); header.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        var brand = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 14, VerticalAlignment = VerticalAlignment.Center };
        var logo = Path.Combine(AppContext.BaseDirectory, "icon.png");
        if (File.Exists(logo)) brand.Children.Add(new Image { Source = new BitmapImage(new Uri(logo)), Width = 40, Height = 40 });
        var brandText = new StackPanel { Spacing = 3 }; brandText.Children.Add(new TextBlock { Text = "Raphael Publish", FontSize = 22, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold }); brandText.Children.Add(_projectTitle); brand.Children.Add(brandText);
        header.Children.Add(brand);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        actions.Children.Add(_progress); actions.Children.Add(_projectsButton); actions.Children.Add(_updateButton); actions.Children.Add(_draftButton);
        Grid.SetColumn(actions, 1); header.Children.Add(actions); _root.Children.Add(header);
        _projectsButton.Click += async (_, _) => await GuardAsync(ShowProjectsAsync);
        _updateButton.Click += async (_, _) => await GuardAsync(UpdateImagesAsync);
        _draftButton.Click += async (_, _) => await GuardAsync(ShowPublishAsync);
        var toolbar = new Grid { Padding = new Thickness(24, 4, 24, 14), ColumnSpacing = 18 };
        toolbar.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) }); toolbar.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        toolbar.RowDefinitions.Add(new() { Height = GridLength.Auto }); toolbar.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var styleControls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, VerticalAlignment = VerticalAlignment.Center };
        styleControls.Children.Add(new TextBlock { Text = "排版主题", VerticalAlignment = VerticalAlignment.Center, Opacity = .7 }); styleControls.Children.Add(_themes);
        styleControls.Children.Add(_devices); _devices.Items.Add("电脑预览"); _devices.Items.Add("平板预览"); _devices.Items.Add("手机预览"); _devices.SelectedIndex = 0;
        styleControls.Children.Add(_sync); toolbar.Children.Add(styleControls);
        var exportControls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10 };
        var exportButton = new Button { Content = "导出" }; var exports = new MenuFlyout();
        var html = new MenuFlyoutItem { Text = "导出 HTML", Icon = new SymbolIcon(Symbol.Document) }; html.Click += async (_, _) => await GuardAsync(ExportHtmlAsync);
        var pdf = new MenuFlyoutItem { Text = "导出 PDF", Icon = new SymbolIcon(Symbol.Print) }; pdf.Click += async (_, _) => await GuardAsync(ExportPdfAsync);
        exports.Items.Add(html); exports.Items.Add(pdf); exportButton.Flyout = exports;
        var plain = new Button { Content = "复制纯文本" }; plain.Click += async (_, _) => await GuardAsync(async () => { NativeServices.Copy((await RequestAsync("plain"))?.GetValue<string>() ?? ""); ShowNotice("纯文本已复制"); });
        _copyButton.Style = Application.Current.Resources["AccentButtonStyle"] as Style;
        _copyButton.Click += async (_, _) => await GuardAsync(CopyRichAsync);
        exportControls.Children.Add(exportButton); exportControls.Children.Add(plain); exportControls.Children.Add(_copyButton); Grid.SetColumn(exportControls, 1); toolbar.Children.Add(exportControls);
        Grid.SetRow(toolbar, 1); _root.Children.Add(toolbar);
        var panes = new Grid { Margin = new Thickness(20, 0, 20, 12), ColumnSpacing = 12 };
        panes.ColumnDefinitions.Add(new() { Width = new GridLength(5, GridUnitType.Star) }); panes.ColumnDefinitions.Add(new() { Width = new GridLength(6, GridUnitType.Star) });
        var editorPane = Pane("文章编辑", _editor); panes.Children.Add(editorPane);
        var previewPane = Pane("排版预览 · 点击段落可定位原文", _preview); Grid.SetColumn(previewPane, 1); panes.Children.Add(previewPane);
        panes.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) }); panes.RowDefinitions.Add(new() { Height = new GridLength(0) });
        _root.SizeChanged += (_, _) =>
        {
            var narrowToolbar = _root.ActualWidth < 1150;
            Grid.SetColumn(exportControls, narrowToolbar ? 0 : 1); Grid.SetRow(exportControls, narrowToolbar ? 1 : 0);
            exportControls.Margin = new Thickness(0, narrowToolbar ? 12 : 0, 0, 0);
            var stacked = _root.ActualWidth < 950;
            Grid.SetColumn(previewPane, stacked ? 0 : 1); Grid.SetRow(previewPane, stacked ? 1 : 0);
            Grid.SetColumnSpan(editorPane, stacked ? 2 : 1); Grid.SetColumnSpan(previewPane, stacked ? 2 : 1);
            panes.RowDefinitions[1].Height = stacked ? new GridLength(1, GridUnitType.Star) : new GridLength(0);
            panes.RowSpacing = stacked ? 12 : 0;
        };
        Grid.SetRow(panes, 2); _root.Children.Add(panes);
        var bottom = new StackPanel();
        var status = new Grid { Margin = new Thickness(24, 0, 24, 12) }; status.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) }); status.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        status.Children.Add(_saveState); Grid.SetColumn(_words, 1); status.Children.Add(_words); bottom.Children.Add(status); bottom.Children.Add(_notice); Grid.SetRow(bottom, 3); _root.Children.Add(bottom);
        ScrollViewer.SetVerticalScrollBarVisibility(_editor, ScrollBarVisibility.Auto);
        ScrollViewer.SetHorizontalScrollBarVisibility(_editor, ScrollBarVisibility.Disabled);
        var save = new KeyboardAccelerator { Key = Windows.System.VirtualKey.S, Modifiers = Windows.System.VirtualKeyModifiers.Control };
        save.Invoked += async (_, eventArgs) => { eventArgs.Handled = true; await GuardAsync(SaveCurrentAsync); }; _root.KeyboardAccelerators.Add(save);
        var create = new KeyboardAccelerator { Key = Windows.System.VirtualKey.N, Modifiers = Windows.System.VirtualKeyModifiers.Control };
        create.Invoked += async (_, eventArgs) => { eventArgs.Handled = true; await GuardAsync(CreateProjectAsync); }; _root.KeyboardAccelerators.Add(create);
    }
    Border Pane(string title, FrameworkElement body)
    {
        var grid = new Grid(); grid.RowDefinitions.Add(new() { Height = GridLength.Auto }); grid.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        grid.Children.Add(new TextBlock { Text = title, Margin = new Thickness(18, 14, 18, 12), FontSize = 13, Opacity = .65 }); Grid.SetRow(body, 1); grid.Children.Add(body);
        var border = new Border { Child = grid, CornerRadius = new CornerRadius(8), BorderThickness = new Thickness(1) }; _cards.Add(border); return border;
    }

    void ApplySystemTheme()
    {
        _dark = _uiSettings.GetColorValue(UIColorType.Background).R < 128;
        _root.RequestedTheme = _dark ? ElementTheme.Dark : ElementTheme.Light;
        _root.Background = new SolidColorBrush(_dark ? Windows.UI.Color.FromArgb(255, 32, 32, 32) : Windows.UI.Color.FromArgb(255, 247, 247, 247));
        foreach (var card in _cards)
        {
            card.Background = new SolidColorBrush(_dark ? Windows.UI.Color.FromArgb(255, 43, 43, 43) : Colors.White);
            card.BorderBrush = new SolidColorBrush(_dark ? Windows.UI.Color.FromArgb(255, 62, 62, 62) : Windows.UI.Color.FromArgb(255, 226, 226, 226));
        }
        if (_preview.CoreWebView2 is not null) _preview.CoreWebView2.Profile.PreferredColorScheme = _dark ? CoreWebView2PreferredColorScheme.Dark : CoreWebView2PreferredColorScheme.Light;
    }
    void OnSystemThemeChanged(UISettings sender, object args) => DispatcherQueue.TryEnqueue(async () => { ApplySystemTheme(); if (_webReady.Task.IsCompletedSuccessfully) await ApplyViewAsync(); });
    async Task ApplyViewAsync() => await RequestAsync("view", new { device = _device, dark = _dark });

    async Task InitializeAsync()
    {
        try
        {
            var webData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RaphaelPublishWinUI", SelfTest ? "WebViewTest" : "WebView");
            var options = new CoreWebView2EnvironmentOptions();
            if (SelfTest) options.AdditionalBrowserArguments = "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";
            var environment = await CoreWebView2Environment.CreateWithOptionsAsync(null, webData, options);
            await _preview.EnsureCoreWebView2Async(environment);
            var web = _preview.CoreWebView2;
            web.Settings.AreDefaultContextMenusEnabled = false;
            web.Settings.IsStatusBarEnabled = false;
            web.Settings.AreDevToolsEnabled = SelfTest;
            web.SetVirtualHostNameToFolderMapping("app.raphael.local", Path.Combine(AppContext.BaseDirectory, "Web"), CoreWebView2HostResourceAccessKind.DenyCors);
            web.AddWebResourceRequestedFilter("https://images.raphael.local/*", CoreWebView2WebResourceContext.All);
            web.WebResourceRequested += OnImageRequest;
            web.WebMessageReceived += OnWebMessage;
            web.NewWindowRequested += (_, eventArgs) => { eventArgs.Handled = true; if (Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out var url) && url.Scheme is "https" or "http") NativeServices.OpenPath(eventArgs.Uri); };
            web.NavigationStarting += (_, eventArgs) => { if (!eventArgs.Uri.StartsWith("https://app.raphael.local/", StringComparison.Ordinal)) eventArgs.Cancel = true; };
            ApplySystemTheme();
            web.Navigate("https://app.raphael.local/index.html");
            await _webReady.Task.WaitAsync(TimeSpan.FromSeconds(40));
            var themes = await RequestAsync("themes");
            _loading = true;
            foreach (var item in themes?.AsArray() ?? []) { var option = new ThemeOption(item!["id"]!.GetValue<string>(), item["name"]!.GetValue<string>()); _themeOptions.Add(option); _themes.Items.Add(option); }
            _themes.SelectedItem = _themeOptions.FirstOrDefault(option => option.Id == "apple") ?? _themeOptions.FirstOrDefault(); _loading = false;
            await ApplyViewAsync();
            _editorScroll = FindDescendant<ScrollViewer>(_editor);
            if (_editorScroll is not null) _editorScroll.ViewChanged += OnEditorScroll;
            if (SelfTest) { await RunSelfTestAsync(); return; }
            var projects = await _store.ListAsync();
            if (projects.Count > 0) await OpenProjectAsync(projects[0].Id); else await RenderAsync();
        }
        catch (Exception error)
        {
            ShowNotice("初始化失败：" + error.Message, true);
            if (SelfTest) { await WriteSelfTestAsync(new { success = false, error = error.ToString() }); Close(); }
        }
    }
    async void OnImageRequest(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            var parts = new Uri(args.Request.Uri).AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.UnescapeDataString).ToArray();
            if (_current is null || parts.Length != 3 || parts[0] != _current.Id || parts[1] != "图片") throw new IOException();
            var path = ProjectStore.SafePath(ProjectStore.SafePath(_store.DirectoryFor(_current), "图片"), parts[2]);
            var bytes = await File.ReadAllBytesAsync(path);
            var extension = Path.GetExtension(path).ToLowerInvariant(); var mime = extension switch { ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".webp" => "image/webp", ".avif" => "image/avif", ".svg" => "image/svg+xml", _ => "image/png" };
            args.Response = sender.Environment.CreateWebResourceResponse(new MemoryStream(bytes).AsRandomAccessStream(), 200, "OK", "Content-Type: " + mime + "\r\nAccess-Control-Allow-Origin: https://app.raphael.local\r\nCache-Control: no-cache");
        }
        catch { args.Response = sender.Environment.CreateWebResourceResponse(new MemoryStream().AsRandomAccessStream(), 404, "Not Found", "Content-Type: text/plain"); }
        finally { deferral.Complete(); }
    }
    void OnWebMessage(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!args.Source.StartsWith("https://app.raphael.local/", StringComparison.Ordinal)) return;
        try
        {
            var message = JsonNode.Parse(args.WebMessageAsJson)!;
            switch (message["type"]?.GetValue<string>())
            {
                case "ready": _webReady.TrySetResult(); break;
                case "response":
                    var id = message["id"]!.GetValue<long>();
                    if (_pending.Remove(id, out var pending))
                    { if (message["error"] is not null) pending.TrySetException(new InvalidOperationException(message["error"]!.GetValue<string>())); else pending.TrySetResult(message["result"]?.DeepClone()); }
                    break;
                case "select":
                    var start = message["start"]!.GetValue<int>(); var length = message["length"]!.GetValue<int>();
                    if (start >= 0 && start + length <= CurrentMarkdown.Length)
                    { var first = EditorOffset(start); var last = EditorOffset(start + length); _editor.Focus(FocusState.Programmatic); _editor.Select(first, last - first); }
                    break;
                case "scroll":
                    var ratio = message["ratio"]!.GetValue<double>();
                    _lastPreviewScroll = ratio;
                    if (_sync.IsOn && _editorScroll is not null && Math.Abs(ratio - _lastSyncedRatio) > .015)
                    { _lastSyncedRatio = ratio; _editorScroll.ChangeView(null, ratio * _editorScroll.ScrollableHeight, null, true); }
                    break;
            }
        }
        catch (Exception error) { ShowNotice("预览通信失败：" + error.Message, true); }
    }
    async Task<JsonNode?> RequestAsync(string method, object? payload = null)
    {
        await _webReady.Task.WaitAsync(TimeSpan.FromSeconds(40));
        var id = ++_requestId; var completion = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously); _pending[id] = completion;
        try { _preview.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, method, payload })); return await completion.Task.WaitAsync(TimeSpan.FromSeconds(60)); }
        finally { _pending.Remove(id); }
    }
    async Task RenderAsync()
    {
        var revision = _revision;
        var result = await RequestAsync("render", new { markdown = CurrentMarkdown, themeId = CurrentTheme, projectId = _current?.Id });
        if (revision == _revision) _words.Text = (result?["words"]?.GetValue<int>() ?? 0) + " 字";
    }
    async Task OpenProjectAsync(string id)
    {
        await SaveCurrentAsync(); _saveTimer.Stop(); _renderTimer.Stop();
        _current = await _store.ReadAsync(id); _loading = true; _editor.Text = _current.Markdown;
        _themes.SelectedItem = _themeOptions.FirstOrDefault(option => option.Id == _current.ThemeId) ?? _themeOptions.FirstOrDefault(); _loading = false;
        _projectTitle.Text = _current.Title; _saveState.Text = "已保存到本地"; SetBusy(false); await RenderAsync();
    }
    async Task SaveCurrentAsync()
    {
        _saveTimer.Stop(); if (_current is null || _loading || _busy) return;
        var id = _current.Id; var markdown = CurrentMarkdown; var revision = _revision;
        await _store.SaveAsync(id, markdown, CurrentTheme);
        if (_current?.Id == id && revision == _revision) _saveState.Text = "已保存到本地";
    }
    async void OnPaste(object sender, TextControlPasteEventArgs args)
    {
        args.Handled = true;
        await GuardAsync(async () =>
        {
            var start = _editor.SelectionStart; var length = _editor.SelectionLength; var previous = _editor.Text; var projectId = _current?.Id;
            var data = await NativeServices.ReadClipboardAsync();
            var content = data.Image.Length > 0 ? "![图片](" + data.Image + ")" : (await RequestAsync("paste", new { html = data.Html, text = data.Text, flowUsBlocks = data.FlowUs }))?.GetValue<string>() ?? data.Text;
            if (projectId != _current?.Id) return;
            if (_editor.Text != previous) { start = _editor.SelectionStart; length = _editor.SelectionLength; }
            _editor.Text = _editor.Text.Remove(start, length).Insert(start, content); _editor.Select(Math.Min(start + content.Replace("\r\n", "\n").Length, _editor.Text.Length), 0);
        });
    }
    async void OnEditorScroll(object? sender, ScrollViewerViewChangedEventArgs args)
    {
        if (!_sync.IsOn || _editorScroll is null || !_webReady.Task.IsCompletedSuccessfully) return;
        var ratio = _editorScroll.VerticalOffset / Math.Max(1, _editorScroll.ScrollableHeight);
        if (Math.Abs(ratio - _lastSyncedRatio) <= .015) return;
        _lastSyncedRatio = ratio;
        await GuardAsync(async () => await RequestAsync("scroll", new { ratio }));
    }
    static T? FindDescendant<T>(DependencyObject parent) where T : DependencyObject
    {
        for (var index = 0; index < VisualTreeHelper.GetChildrenCount(parent); index++)
        { var child = VisualTreeHelper.GetChild(parent, index); if (child is T match) return match; if (FindDescendant<T>(child) is { } found) return found; }
        return null;
    }
    int EditorOffset(int markdownOffset)
    {
        var raw = _editor.Text; var index = 0;
        for (var normalized = 0; index < raw.Length && normalized < markdownOffset; normalized++, index++)
            if (raw[index] == '\r' && index + 1 < raw.Length && raw[index + 1] == '\n') index++;
        return index;
    }
    void ShowNotice(string text, bool error = false) { _notice.Message = text; _notice.Severity = error ? InfoBarSeverity.Error : InfoBarSeverity.Informational; _notice.IsOpen = true; }
    async Task GuardAsync(Func<Task> action) { try { await action(); } catch (Exception error) { ShowNotice(error.Message, true); } }
    void SetBusy(bool busy)
    {
        _busy = busy; _editor.IsReadOnly = busy; _projectsButton.IsEnabled = !busy;
        _themes.IsEnabled = !busy;
        _updateButton.IsEnabled = !busy && _current is not null; _draftButton.IsEnabled = !busy && _current is not null;
        _copyButton.IsEnabled = !busy; _progress.IsActive = busy; _progress.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
    }
    ContentDialog Dialog(string title, object content, string primary, string secondary = "", string close = "取消") => new()
    { XamlRoot = _root.XamlRoot, Title = title, Content = content, PrimaryButtonText = primary, SecondaryButtonText = secondary, CloseButtonText = close, DefaultButton = ContentDialogButton.Primary, RequestedTheme = _root.RequestedTheme };

    async Task CreateProjectAsync()
    {
        var name = new TextBox { Header = "项目标题", PlaceholderText = "输入这篇文章的标题", Width = 420, MaxLength = 80 };
        var dialog = Dialog("新建项目", name, "创建");
        dialog.PrimaryButtonClick += (_, args) => { if (string.IsNullOrWhiteSpace(name.Text)) { args.Cancel = true; name.PlaceholderText = "请填写项目标题"; } };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
        await SaveCurrentAsync(); var project = await _store.CreateAsync(name.Text); await OpenProjectAsync(project.Id);
    }
    async Task ShowProjectsAsync()
    {
        await SaveCurrentAsync();
        while (true)
        {
            var projects = await _store.ListAsync();
            var list = new ListView { Width = 580, Height = 330, SelectionMode = ListViewSelectionMode.Single };
            foreach (var project in projects)
            {
                var row = new StackPanel { Spacing = 4, Margin = new Thickness(8, 9, 8, 9) };
                row.Children.Add(new TextBlock { Text = project.Title, FontSize = 15, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
                row.Children.Add(new TextBlock { Text = $"{project.ImageCount} 张图片 · {DateTime.TryParse(project.UpdatedAt, out var date) switch { true => date.ToLocalTime().ToString("yyyy/MM/dd HH:mm"), false => "" }}", FontSize = 12, Opacity = .6 });
                list.Items.Add(new ListViewItem { Content = row, Tag = project });
            }
            list.SelectedIndex = projects.FindIndex(project => project.Id == _current?.Id);
            var content = new StackPanel { Spacing = 12 }; content.Children.Add(list);
            if (projects.Count == 0) content.Children.Add(new TextBlock { Text = "还没有项目，点击“新建项目”开始。", Opacity = .65 });
            var tools = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            var folder = new Button { Content = "打开文件夹" }; var rename = new Button { Content = "重命名" }; var delete = new Button { Content = "删除" }; var root = new Button { Content = "全部项目文件夹" };
            tools.Children.Add(folder); tools.Children.Add(rename); tools.Children.Add(delete); tools.Children.Add(root); content.Children.Add(tools);
            var dialog = Dialog("项目管理", content, "打开项目", "新建项目", "关闭");
            string action = "";
            void SetEnabled() { var selected = list.SelectedItem is not null; dialog.IsPrimaryButtonEnabled = selected; folder.IsEnabled = selected; rename.IsEnabled = selected; delete.IsEnabled = selected; }
            list.SelectionChanged += (_, _) => SetEnabled(); SetEnabled();
            list.DoubleTapped += (_, _) => { if (list.SelectedItem is not null) { action = "open"; dialog.Hide(); } };
            folder.Click += (_, _) => { action = "folder"; dialog.Hide(); }; rename.Click += (_, _) => { action = "rename"; dialog.Hide(); }; delete.Click += (_, _) => { action = "delete"; dialog.Hide(); }; root.Click += (_, _) => NativeServices.OpenPath(_store.Root);
            var result = await dialog.ShowAsync(); var selected = (list.SelectedItem as ListViewItem)?.Tag as Project;
            if (result == ContentDialogResult.Primary) action = "open";
            if (result == ContentDialogResult.Secondary) { await CreateProjectAsync(); return; }
            if (action == "open" && selected is not null) { await OpenProjectAsync(selected.Id); return; }
            if (action == "folder" && selected is not null) NativeServices.OpenPath(_store.DirectoryFor(selected));
            else if (action == "rename" && selected is not null)
            {
                var name = new TextBox { Header = "项目标题", Text = selected.Title, Width = 420, MaxLength = 80 };
                if (await Dialog("重命名项目", name, "保存").ShowAsync() == ContentDialogResult.Primary)
                { var updated = await _store.RenameAsync(selected.Id, name.Text); if (_current?.Id == selected.Id) { _current.Title = updated.Title; _projectTitle.Text = updated.Title; } }
            }
            else if (action == "delete" && selected is not null)
            {
                if (await Dialog("删除项目", new TextBlock { Text = $"“{selected.Title}”及其正文和图片会移入回收站。", TextWrapping = TextWrapping.Wrap, Width = 420 }, "删除").ShowAsync() == ContentDialogResult.Primary)
                {
                    await _store.DeleteAsync(selected.Id);
                    if (_current?.Id == selected.Id) { _current = null; _loading = true; _editor.Text = ""; _loading = false; _projectTitle.Text = "公众号排版"; _saveState.Text = "新建项目后，文章会自动保存"; SetBusy(false); await RenderAsync(); }
                }
            }
            else return;
        }
    }
    async Task UpdateImagesAsync()
    {
        if (_current is null || _busy) return;
        await SaveCurrentAsync(); _renderTimer.Stop(); SetBusy(true);
        try
        {
            var update = await _store.UpdateImagesAsync(_current.Id, CurrentMarkdown, CurrentTheme, new Progress<string>(text => _saveState.Text = text));
            _current = update.Project; _loading = true; _editor.Text = update.Project.Markdown; _loading = false; await RenderAsync(); _saveState.Text = "已保存到本地";
            ShowNotice($"图片更新完成：下载 {update.DownloadedImageCount} 张，复用 {update.ReusedImageCount} 张，清理 {update.RemovedImageCount} 张未使用图片。" + (update.FailedImageCount > 0 ? $"{update.FailedImageCount} 张下载失败，原链接已保留。" : ""));
        }
        finally { SetBusy(false); }
    }
    async Task CopyRichAsync()
    {
        await RenderAsync(); var result = await RequestAsync("copy");
        NativeServices.Copy(result?["text"]?.GetValue<string>() ?? "", result?["html"]?.GetValue<string>() ?? ""); ShowNotice("排版内容已复制，可以粘贴到公众号编辑器。");
    }
    async Task<StorageFile?> ChooseSaveAsync(string extension, string description)
    {
        var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.Desktop, SuggestedFileName = ProjectStore.SanitizeName(_current?.Title ?? "Raphael 文章") };
        picker.FileTypeChoices.Add(description, [extension]); WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this)); return await picker.PickSaveFileAsync();
    }
    async Task ExportHtmlAsync()
    {
        var file = await ChooseSaveAsync(".html", "HTML 文档"); if (file is null) return;
        await RenderAsync(); var result = await RequestAsync("html");
        var html = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + System.Net.WebUtility.HtmlEncode(_current?.Title ?? "Raphael 文章") + "</title></head><body>" + result?["html"]?.GetValue<string>() + "</body></html>";
        await File.WriteAllTextAsync(file.Path, html, new UTF8Encoding(false)); ShowNotice("HTML 已导出。");
    }
    async Task ExportPdfAsync()
    {
        var file = await ChooseSaveAsync(".pdf", "PDF 文档"); if (file is null) return;
        await RenderAsync(); await RequestAsync("print", new { enabled = true });
        try
        {
            var settings = _preview.CoreWebView2.Environment.CreatePrintSettings(); settings.ShouldPrintBackgrounds = true; settings.ShouldPrintHeaderAndFooter = false;
            if (!await _preview.CoreWebView2.PrintToPdfAsync(file.Path, settings)) throw new InvalidOperationException("PDF 导出失败，请重试。");
            ShowNotice("PDF 已导出。");
        }
        finally { await RequestAsync("print", new { enabled = false }); }
    }
    async Task ShowPublishAsync()
    {
        if (_current is null) return;
        await SaveCurrentAsync(); var stored = _credentials.Read(); string? cover = null;
        var form = new StackPanel { Width = 540, Spacing = 12 };
        var title = new TextBox { Header = "文章标题", Text = _current.Title, MaxLength = 64 };
        var author = new TextBox { Header = "作者（可选）" };
        var digest = new TextBox { Header = "摘要（可选，最多 120 字）", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 80, MaxLength = 120 };
        var appId = new TextBox { Header = "AppID", Text = stored.AppId, PlaceholderText = "微信公众号的 AppID" };
        var secret = new PasswordBox { Header = "AppSecret", PlaceholderText = stored.AppSecret.Length > 0 ? "留空使用已保存的凭据" : "微信公众号的 AppSecret" };
        var selectCover = new Button { Content = "选择封面图（留空使用正文第一张本地图片）" };
        var progress = new TextBlock { TextWrapping = TextWrapping.Wrap, MaxWidth = 540 };
        form.Children.Add(new TextBlock { Text = "正文和图片直接上传到微信草稿箱，完成后仍需到公众号后台检查并发布。", TextWrapping = TextWrapping.Wrap, Opacity = .7 });
        foreach (var control in new UIElement[] { title, author, selectCover, digest, appId, secret, new TextBlock { Text = "凭据由 Windows 当前账户加密保存。首次使用需配置公众号 IP 白名单。", FontSize = 12, Opacity = .6, TextWrapping = TextWrapping.Wrap }, progress }) form.Children.Add(control);
        var dialog = Dialog("发送到公众号草稿箱", new ScrollViewer { Content = form, MaxHeight = 640, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }, "创建草稿");
        selectCover.Click += async (_, _) =>
        {
            var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.PicturesLibrary };
            foreach (var extension in new[] { ".jpg", ".jpeg", ".png" }) picker.FileTypeFilter.Add(extension);
            WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
            var file = await picker.PickSingleFileAsync(); if (file is not null) { cover = file.Path; selectCover.Content = "封面：" + file.Name; }
        };
        dialog.PrimaryButtonClick += async (_, eventArgs) =>
        {
            var deferral = eventArgs.GetDeferral(); eventArgs.Cancel = true; dialog.IsPrimaryButtonEnabled = false; dialog.IsSecondaryButtonEnabled = false; SetBusy(true);
            try
            {
                var key = string.IsNullOrWhiteSpace(secret.Password) ? stored.AppSecret : secret.Password.Trim();
                if (string.IsNullOrWhiteSpace(appId.Text) || key.Length == 0) throw new InvalidOperationException("请填写 AppID 和 AppSecret。");
                _credentials.Save(appId.Text.Trim(), key); await RenderAsync(); var rendered = await RequestAsync("publish");
                var result = await new WeChatPublisher(_store).PublishAsync(new(_current!.Id, title.Text, author.Text, digest.Text, rendered?["html"]?.GetValue<string>() ?? "", appId.Text, key, cover), new Progress<string>(text => progress.Text = text));
                ShowNotice($"草稿已创建，已上传 {result.UploadedImageCount} 张正文图片。请到公众号草稿箱检查。" ); eventArgs.Cancel = false;
            }
            catch (Exception error) { progress.Text = error.Message; }
            finally { dialog.IsPrimaryButtonEnabled = true; SetBusy(false); deferral.Complete(); }
        };
        await dialog.ShowAsync();
    }
    async void OnClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_closing) return;
        args.Cancel = true;
        if (_busy) { ShowNotice("请等待当前操作完成后再关闭。" ); return; }
        try { await SaveCurrentAsync(); _closing = true; Close(); }
        catch (Exception error) { ShowNotice("文章尚未保存：" + error.Message, true); }
    }
    sealed record ThemeOption(string Id, string Name) { public override string ToString() => Name; }

    string SelfTestDirectory => _args.SkipWhile(arg => arg != "--self-test-output").Skip(1).FirstOrDefault() ?? Path.Combine(Path.GetTempPath(), "raphael-winui-check");
    Task WriteSelfTestAsync(object result)
    { Directory.CreateDirectory(SelfTestDirectory); return File.WriteAllTextAsync(Path.Combine(SelfTestDirectory, "result.json"), JsonSerializer.Serialize(result, ProjectStore.JsonOptions)); }
    async Task RunSelfTestAsync()
    {
        AppWindow.Hide();
        var project = await _store.CreateAsync("WinUI 自动验证", "# WinUI 3 文章\n\n正文支持**加粗**。\n\n> 从容而稳定\n\n- 项目管理\n- 更新图片\n");
        await OpenProjectAsync(project.Id);
        var renamed = await _store.RenameAsync(project.Id, "WinUI 重命名验证");
        var blocks = JsonSerializer.Serialize(new { blocks = new[] { new { id = "quote", subTree = new Dictionary<string, object> { ["quote"] = new { type = 13, title = "FlowUs 强调段落" } } } } });
        var pasted = (await RequestAsync("paste", new { html = "<p>FlowUs 强调段落</p>", text = "FlowUs 强调段落", flowUsBlocks = blocks }))!.GetValue<string>();
        if (!pasted.StartsWith("> ") || pasted.StartsWith(">>")) throw new InvalidOperationException("FlowUs 强调段落转换失败。");
        var clipboardImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI3kAAAAASUVORK5CYII=";
        _editor.Text += "\n\n![测试图片](" + clipboardImage + ")\n\n" + pasted;
        await UpdateImagesAsync(); await SaveCurrentAsync(); await RenderAsync();
        var html = (await RequestAsync("copy"))!["html"]!.GetValue<string>();
        if (!html.Contains("data:image/png;base64,")) throw new InvalidOperationException("富文本复制未包含本地图片。");
        if (!HtmlClipboard.ExtractFragment(HtmlFormatHelper.CreateHtmlFormat(html)).Contains("data:image/png;base64,")) throw new InvalidOperationException("Windows 富文本剪贴板封装失败。");
        var inspected = await RequestAsync("inspect");
        if (!inspected!["text"]!.GetValue<string>().Contains("WinUI 3 文章")) throw new InvalidOperationException("预览正文不完整。");
        Directory.CreateDirectory(SelfTestDirectory);
        using (var stream = File.Create(Path.Combine(SelfTestDirectory, "preview.png"))) await _preview.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream.AsRandomAccessStream());
        var bitmap = new RenderTargetBitmap(); await bitmap.RenderAsync(_root); var pixelBuffer = await bitmap.GetPixelsAsync(); var pixels = new byte[(int)pixelBuffer.Length]; DataReader.FromBuffer(pixelBuffer).ReadBytes(pixels);
        using (var stream = File.Create(Path.Combine(SelfTestDirectory, "native-layout.png")))
        {
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream.AsRandomAccessStream());
            encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, (uint)bitmap.PixelWidth, (uint)bitmap.PixelHeight, 96, 96, pixels); await encoder.FlushAsync();
        }
        _devices.SelectedIndex = 2; await ApplyViewAsync(); var mobile = await RequestAsync("inspect");
        if (mobile?["device"]?.GetValue<string>() != "mobile") throw new InvalidOperationException("手机预览切换失败。");
        var testCredentials = new CredentialStore(Path.Combine(_store.Root, "test-credentials")); testCredentials.Save("test-app-id", "test-secret");
        if (testCredentials.Read().AppSecret != "test-secret") throw new InvalidOperationException("凭据加密保存失败。");
        _devices.SelectedIndex = 0; await ApplyViewAsync();
        await RequestAsync("testClick");
        if (_editor.SelectionLength == 0) throw new InvalidOperationException("点击预览定位原文失败。");
        await RequestAsync("print", new { enabled = true });
        var pdf = Path.Combine(SelfTestDirectory, "export-test.pdf");
        if (!await _preview.CoreWebView2.PrintToPdfAsync(pdf, _preview.CoreWebView2.Environment.CreatePrintSettings())) throw new InvalidOperationException("原生 PDF 导出失败。");
        await RequestAsync("print", new { enabled = false });
        if (!(await File.ReadAllBytesAsync(pdf)).AsSpan().StartsWith(Encoding.ASCII.GetBytes("%PDF-"))) throw new InvalidOperationException("PDF 文件无效。");
        _editor.Text = "# 长文章验证\n\n" + string.Concat(Enumerable.Repeat("这是原生编辑器的长文章段落，包含**加粗文字**，用来验证实时渲染和双向滚动同步。\n\n", 200));
        await RenderAsync(); await Task.Delay(250);
        _editorScroll ??= FindDescendant<ScrollViewer>(_editor);
        if (_editorScroll is null || _editorScroll.ScrollableHeight <= 0) throw new InvalidOperationException("原生编辑器未创建滚动区域。");
        _lastSyncedRatio = -1;
        _editorScroll.ChangeView(null, _editorScroll.ScrollableHeight * .5, null, true); await Task.Delay(250);
        var scroll = (await RequestAsync("inspect"))!["scrollRatio"]!.GetValue<double>();
        if (Math.Abs(scroll - .5) > .15) throw new InvalidOperationException("编辑器到预览的滚动同步失败：" + scroll);
        // Hidden WebView2 does not reliably emit compositor-driven scroll events.
        await _preview.CoreWebView2.ExecuteScriptAsync("window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*0.8);window.dispatchEvent(new Event('scroll'))"); await Task.Delay(250);
        if (Math.Abs(_editorScroll.VerticalOffset / _editorScroll.ScrollableHeight - .8) > .15)
        {
            var webRatio = (await RequestAsync("inspect"))!["scrollRatio"]!.GetValue<double>();
            throw new InvalidOperationException($"预览到编辑器的滚动同步失败：editor={_editorScroll.VerticalOffset / _editorScroll.ScrollableHeight}, web={webRatio}, received={_lastPreviewScroll}");
        }
        await WriteSelfTestAsync(new { success = true, nativeWindow = GetType().Name, nativeEditor = _editor.GetType().FullName, themeCount = _themeOptions.Count, flowUsSingleQuote = true, nativeProjectRename = renamed.Title == "WinUI 重命名验证", localImageCopy = true, savedArticle = File.Exists(Path.Combine(_store.DirectoryFor(_current!), "正文.md")), mobilePreview = true, encryptedCredentials = true, pdfExport = true, previewClickToLocate = true, bidirectionalScroll = true, rootSize = new { _root.ActualWidth, _root.ActualHeight, _root.XamlRoot.RasterizationScale }, webViewProcessId = _preview.CoreWebView2.BrowserProcessId, projectsRoot = _store.Root });
        _closing = true; Close();
    }
}

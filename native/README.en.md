[简体中文](README.md) | **English**

# Raphael Publish · WinUI 3

A native Windows interface for windows, menus, project dialogs, editing, clipboard, file selection and credential storage. WebView2 previews reuse the shared typesetting engine and 30 themes.

[Main README](../README.en.md) · [Installation and upgrades](../docs/INSTALL.md)

## Quick start

Requires Windows 10 19041+ x64. Install WinUI Setup and launch its branded desktop/Start menu shortcut. The release bundles .NET and Windows App SDK; Setup downloads WebView2 if absent. Portable builds require WebView2 separately and the entire directory; run `Raphael Publish WinUI.exe`.

## Usage

- Create a project and paste a FlowUs article. Content and theme autosave; the most recently updated project opens automatically.
- Update images to download new links, reuse existing files and recycle unreferenced images. Project Management supports opening, renaming, deleting and showing the folder. Deleting recycles the article and images together.
- Copy to WeChat preserves theme styles and embeds local images. More provides plain text, standalone HTML and PDF. Preview supports device widths, two-way scroll synchronization and paragraph-to-source navigation.
- Appearance follows the system while article previews retain theme colors. `Ctrl+N` creates and `Ctrl+S` saves. Closing saves before exiting.

Projects live in the current user's `Documents/Raphael公众号项目`, sharing the Electron edition's directory and JSON format. Do not edit the same article in both editions simultaneously.

Optional drafts require AppID, AppSecret and WeChat's IP allowlist. Credentials are encrypted for the current Windows account in `%LOCALAPPDATA%/RaphaelPublishWinUI`; the renderer cannot read plaintext. Reenter credentials when first switching editions. Review and publish manually in WeChat after draft creation.

## Build and checks

Install .NET 10 SDK, Node.js 24 and pnpm 11. From the repository root:

```powershell
pnpm install --frozen-lockfile
pwsh -File scripts/build-winui.ps1
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

The build script determines the versioned output directory; override it with `-OutputDirectory`. Native integration checks use an isolated temporary project without changing real articles. From the repository root:

```powershell
$winuiVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
$winuiOutput = "release/winui-v$winuiVersion/Raphael Publish WinUI.exe"
& $winuiOutput --self-test --self-test-output 'release/winui-self-test'
```

Self-tests cover the editor, 30 themes, FlowUs single-level quotes, image rich text, encrypted credentials, PDF, paragraph navigation and two-way scrolling. Installation and live WeChat APIs still require separate acceptance.

## License and credits

The original engine comes from [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish), preserving the [MIT license](../LICENSE) and [NOTICE](../NOTICE.md). The native interface and C# services were added here. Windows App SDK, WebView2 and .NET licenses/notices remain in release packages.

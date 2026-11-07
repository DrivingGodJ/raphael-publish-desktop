[简体中文](GUIDE.zh-CN.md) | **English**

# Usage, Configuration and Development

[Back to the project](../README.en.md)

## Quick start

Choose the platform and interface from the same Release:

| Platform | Edition | Package |
| --- | --- | --- |
| Windows 10 2004+/11, x64 | WinUI, recommended | `Raphael-Publish-WinUI-版本-windows-x64-Setup.exe` |
| Windows 10/11, x64 | Web UI, alternative | `Raphael-Publish-WebUI-版本-windows-x64-Setup.exe` |
| Apple Silicon Mac | Web UI | `Raphael-Publish-WebUI-版本-macos-arm64.dmg` |
| Intel Mac | Web UI | `Raphael-Publish-WebUI-版本-macos-x64.dmg` |

`版本` represents the release version in the package name. On Windows, run Setup for a per-user installation without administrator privileges. WinUI bundles .NET and Windows App SDK; the installer downloads WebView2 if missing. On Mac, open the matching DMG and drag the app to Applications.

Close the app before upgrading with the same edition's installer; replace the app on Mac. Uninstalling preserves articles and images. Both editions can coexist, but do not edit the same project simultaneously. Projects default to `Documents/Raphael公众号项目`. See the installation guide for details.

## Usage

1. Create an article in Project Management and paste FlowUs content and images.
2. Update images to organize the project's local files.
3. Select a theme and preview width, then check the layout.
4. Copy to WeChat, export a file or create an Official Account draft.

The optional draft API requires your AppID, AppSecret and IP allowlist. Credentials stay encrypted locally: Windows DPAPI/macOS Keychain for Web UI, DPAPI for WinUI. They do not pass through a third-party publishing service. Editions store credentials separately, so switching requires reentry. Draft creation still requires review and manual publication in WeChat's dashboard. Closing the main window exits the app; no persistent local server is required.

## Development and checks

Requires **Node.js 24 and pnpm 11**. WinUI additionally needs Windows and .NET 10 SDK; installers need Inno Setup 6.7+. Build Mac DMGs on the matching macOS architecture.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm desktop:dev
```

```bash
pnpm webui:installer:win
pnpm winui:installer
pnpm webui:installer:mac --arm64
pnpm webui:installer:mac --x64
```

Choose commands for your platform. Packages go to `release/`. Portable directories use `pnpm winui:pack` or `pnpm desktop:pack`; distribute the entire directory.

```bash
pnpm test
pnpm test:desktop-backend
pnpm test:wechat-publisher
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

`Build release installers` is manually dispatched. Inspect artifacts and SHA256 checksums before creating a Release, using the version in `package.json`. These documented commands do not imply completed platform-installation or live WeChat publishing acceptance.

## Documentation and support

- [Installation, upgrades and removal (Chinese)](../docs/INSTALL.md)
- [Web UI](../LOCAL-README.en.md) · [WinUI](../native/README.en.md)
- [Report an issue](https://github.com/DrivingGodJ/raphael-publish-desktop/issues)

## License and credits

[MIT License](../LICENSE). Original copyrights, Git history and [NOTICE.md](../NOTICE.md) are preserved. Dependencies retain their own terms. Distributions include licenses and third-party notices, excluding local articles, secrets and test data.

# Raphael Publish Desktop

基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) 改造的本地公众号排版编辑器。这是社区二次开发项目，并非原项目官方桌面版。原项目的 MIT 许可证、版权声明与 Git 历史继续保留，详见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。

## 下载与版本选择

[下载最新安装包](https://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest)。从 2.0.0 开始，同一 Release 分发两个界面版本：

| 平台 | 首选版本 | 安装包 |
| --- | --- | --- |
| Windows 10 2004 / Windows 11，x64 | **WinUI 版（推荐）** | `Raphael-Publish-WinUI-版本-windows-x64-Setup.exe` |
| Windows 10 / Windows 11，x64 | Web UI 版（备选） | `Raphael-Publish-WebUI-版本-windows-x64-Setup.exe` |
| Mac，Apple Silicon（M 系列） | Web UI 版 | `Raphael-Publish-WebUI-版本-macos-arm64.dmg` |
| Mac，Intel | Web UI 版 | `Raphael-Publish-WebUI-版本-macos-x64.dmg` |

WinUI 版使用 Windows 原生窗口、菜单、编辑器与对话框；Web UI 版使用 Electron 保留原网页交互。两版使用同一套排版引擎、30 个主题和项目格式。两版都无需常驻本地服务器，关闭主窗口即退出。

### 安装、升级与卸载

Windows：运行对应 `Setup.exe`，按向导安装到当前用户目录，不要求管理员权限。安装器创建带 Logo 的桌面/开始菜单快捷方式；WinUI 版已包含 .NET 与 Windows App SDK，需要的 WebView2 Runtime 会在缺失时联网安装。

Mac：打开与芯片类型对应的 DMG，将 `Raphael Publish Web UI.app` 拖入 Applications（应用程序），然后启动应用。

升级：先关闭应用，再运行同版本类型的新安装包；Mac 覆盖 Applications 内的旧应用。卸载仅移除程序，不删除文章或图片。详细说明及安全提示见 [安装与升级](docs/INSTALL.md)。

两版可并存，项目默认保存在当前账户“文档/Documents/Raphael公众号项目”。不要同时用两个版本编辑同一项目。旧版项目无需导入；公众号凭据按界面版本分开加密保存，首次切换到 WinUI 需重新填写。

## 功能与使用流程

1. 项目管理 → 新建项目，输入文章标题。
2. 在 FlowUs 复制正文与图片，直接粘贴到编辑区；标题、强调段落等转换为 Markdown。
3. 点击“更新图片”，下载新图、复用已有图片，并将不再使用的图片移入回收站/废纸篓。
4. 选择排版主题，检查电脑、平板或手机预览。正文自动保存。
5. 复制到公众号，或通过微信官方接口创建草稿；还可复制纯文本、导出 HTML/PDF。

草稿接口可选，需要自行提供公众号 AppID、AppSecret 并配置 IP 白名单。凭据仅经本机系统加密保存，不经过第三方发布服务。创建草稿不会自动发表文章。Web UI 使用系统加密（Windows DPAPI / macOS Keychain），WinUI 使用 Windows DPAPI。

详细使用说明：[Web UI](LOCAL-README.md) · [WinUI](native/README.md)。

## 开发与构建

需要 Node.js 24、pnpm 11。构建 WinUI 另外需要 Windows、.NET 10 SDK；生成 WinUI 安装器需要 Inno Setup 6.7+。Mac DMG 在 macOS 上构建。

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm desktop:dev
```

```bash
# Windows：两种安装包
pnpm webui:installer:win
pnpm winui:installer

# macOS：在对应架构的 Mac 上构建
pnpm webui:installer:mac --arm64
pnpm webui:installer:mac --x64
```

安装包输出至 `release/`。WinUI 免安装目录可通过 `pnpm winui:pack` 构建；Web UI 免安装目录通过 `pnpm desktop:pack` 构建。分发免安装版时必须保留整个目录，不可只发送 EXE。

```bash
pnpm test
pnpm test:desktop-backend
pnpm test:wechat-publisher
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

GitHub Actions 的 `Build release installers` 手动工作流会分别在 Windows、Apple Silicon Mac、Intel Mac 上构建安装包，并验证 Mac 打包应用的启动、项目存储与预览。工作流不自动发布；检查产物和 SHA256 后再建立 Release，统一使用 `package.json` 中的版本号。

## 授权与来源

本仓库遵循 MIT 许可，所用依赖各自遵循其许可证。发行包保留原项目 LICENSE、NOTICE 和相关第三方声明，不包含本地文章、公众号密钥或测试数据。详情见 [NOTICE.md](NOTICE.md)。

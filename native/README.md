**简体中文** | [English](README.en.md)

# Raphael Publish · WinUI 3

Windows 原生桌面界面：窗口、菜单、项目弹窗、编辑器、剪贴板、文件选择和凭据保存均使用原生组件，WebView2 预览复用同一排版引擎与 30 个主题。

[项目首页](../README.md) · [安装与升级](../docs/INSTALL.md)

## 快速开始

需要 Windows 10 19041+ 的 x64 系统。下载 WinUI Setup 安装，从带 Logo 的桌面/开始菜单快捷方式启动。发布包包含 .NET 与 Windows App SDK；Setup 会在缺少 WebView2 时联网安装。免安装版需自行准备 WebView2 并保留完整目录，运行 `Raphael Publish WinUI.exe`。

## 使用说明

- 在“项目管理 → 新建项目”填写标题，粘贴 FlowUs 文章；正文与主题自动保存，新版自动打开最近更新项目。
- “更新图片”下载新链接、复用旧图，将不再引用的图片移入回收站。项目管理可打开、重命名、删除和打开本地文件夹；删除时整篇正文与图片一起进入回收站。
- “复制到公众号”保留主题样式并嵌入本地图片；“更多”中提供纯文本、独立 HTML 和 PDF。预览支持设备宽度、双向滚动同步和点击段落定位。
- 外观跟随系统，文章预览仍保留所选主题色；`Ctrl+N` 新建、`Ctrl+S` 保存。关闭窗口先保存再退出。

项目保存在当前用户“文档/Raphael公众号项目”，目录与 JSON 和 Electron 版兼容。两版共用数据，不要同时编辑同一文章。

可选草稿接口需 AppID、AppSecret 和公众号 IP 白名单。凭据用当前 Windows 账户加密，保存在 `%LOCALAPPDATA%/RaphaelPublishWinUI`，渲染页面无法读取明文。首次切换至本版需重新填写；创建后到公众号后台检查并手动发表。

## 构建与验证

安装 .NET 10 SDK、Node.js 24 和 pnpm 11，在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pwsh -File scripts/build-winui.ps1
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

输出目录由构建脚本按版本确定，可用 `-OutputDirectory` 指定。原生集成检查使用独立临时项目，不改真实文章。在仓库根目录运行：

```powershell
$winuiVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
$winuiOutput = "release/winui-v$winuiVersion/Raphael Publish WinUI.exe"
& $winuiOutput --self-test --self-test-output 'release/winui-self-test'
```

自检覆盖编辑器、30 个主题、FlowUs 单层引用、图片富文本、凭据加密、PDF、点击定位和双向滚动同步；实际安装及公众号接口仍需单独验收。

## 许可与致谢

原排版引擎源自 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish)，保留 [MIT 许可证](../LICENSE) 与 [NOTICE](../NOTICE.md)。原生界面和 C# 服务为本仓库新增；Windows App SDK、WebView2、.NET 的许可及第三方声明随发行包保留。

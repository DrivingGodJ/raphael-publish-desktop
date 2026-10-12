# Raphael Publish · WinUI 3

Windows 原生重构版。窗口、菜单、项目弹窗、Markdown 编辑器、系统剪贴板、文件选择和凭据保存均使用 Windows 原生组件。文章预览通过 WebView2 使用与旧版相同的排版引擎和 30 个主题。

## 使用

运行完整程序目录中的 `Raphael Publish WinUI.exe`。点击“项目管理 → 新建项目”，填写标题，然后将 FlowUs 文章粘贴到左侧编辑器。正文和主题会自动保存。

“更新图片”会下载新的图片链接、复用已下载的图片，并将正文不再使用的图片移入回收站。项目管理支持打开、重命名、删除以及打开本地文件夹。删除项目时，其正文和图片一起移入回收站。

现有项目继续保存在当前用户的“文档/Raphael公众号项目”，目录和 JSON 格式与 Electron 版兼容。新版会自动打开最近更新的项目。两个版本共用数据，请一次使用一个版本编辑同一篇文章。

“复制到公众号”保留主题样式并嵌入本地图片。“复制纯文本”仅复制预览中的文字。“导出”支持独立 HTML 文档和 PDF。预览可切换电脑、平板和手机宽度，支持双向滚动同步和点击段落定位原文。

界面跟随系统浅色/深色模式；文章预览保留所选排版主题的颜色。`Ctrl+N` 新建项目，`Ctrl+S` 立即保存。关闭窗口会保存当前项目并退出程序，无需常驻本地网页服务。

可选的“发布草稿”使用微信公众号官方接口。首次使用新版时需填写 AppID 和 AppSecret，并配置公众号 IP 白名单。凭据由 Windows 当前账户加密保存于 `%LOCALAPPDATA%/RaphaelPublishWinUI`；渲染页面无法读取明文。草稿创建后需在公众号后台检查并手动发布。

运行环境为 Windows 10 19041 及以上的 x64 系统，需安装 Microsoft Edge WebView2 Runtime。发布目录已包含 .NET 和 Windows App SDK 运行组件，请保留整个目录。

## 构建与验证

安装 .NET 10 SDK 和 Node.js/pnpm，然后在仓库根目录执行：

```powershell
pnpm install
pwsh -File scripts/build-winui.ps1
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

输出位于 `release/winui-v2.0.0`。也可将 `-OutputDirectory` 传给构建脚本。

原生集成验证使用独立临时项目，不会改动实际文章：

```powershell
& 'release/winui-v2.0.0/Raphael Publish WinUI.exe' --self-test --self-test-output '<验证结果目录>'
```

验证结果包含原生编辑器、30 个主题、FlowUs 单层引用、本地图片富文本封装、凭据加密、PDF 导出、点击定位和双向滚动同步。

## 来源与许可

原排版引擎基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish)，继续保留 MIT 许可证与版权声明，详见仓库 `LICENSE` 和 `NOTICE.md`。原生界面和 C# 服务是此仓库新增的实现。Windows App SDK、WebView2 和 .NET 的许可与第三方声明随发布目录保留。

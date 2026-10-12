# 安装、升级与卸载

## 选择下载

在 [Releases](https://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest) 下载：

- Windows x64：优先 WinUI Setup；Web UI Setup 是备选，不需要两版都装。
- Mac M 系列：Web UI `macos-arm64.dmg`。
- Mac Intel：Web UI `macos-x64.dmg`。

WinUI 需要 Windows 10 2004（19041）或更新版本；当前仅提供 x64 包。Web UI 使用 Electron 44，Mac 需要 macOS 13 Ventura 或更新版本，Windows 需要 Windows 10 或更新版本。

## Windows 安装

关闭已运行的同版应用，双击 Setup。安装位置默认在当前用户的 `%LOCALAPPDATA%/Programs`，向导可更改路径。快捷方式带应用 Logo。两版的应用名分别为 `Raphael Publish WinUI` 与 `Raphael Publish Web UI`，不会相互覆盖。

WinUI 安装包已包含 .NET 和 Windows App SDK。安装器检查 WebView2 Runtime；缺失时运行随包携带、已验证微软签名的 Evergreen 引导程序，下载运行组件。此时需要网络；若网络受限，请先从[微软官方页面](https://developer.microsoft.com/en-us/microsoft-edge/webview2)安装 WebView2 Runtime 再重试。不要单独拷走程序目录中的 EXE。

安装完成后，从桌面或开始菜单打开应用。新建项目 → 粘贴 FlowUs 正文 → 更新图片 → 选择主题 → 复制/创建草稿。

## Mac 安装

打开 DMG，把应用拖到 Applications。首次打开时系统可能询问允许访问 Documents 或 Keychain，项目保存需要 Documents 权限，公众号密钥加密保存使用 Keychain。

当前发行包未使用 Apple Developer ID 签名、公证。系统可能提示无法验证开发者；先核对仓库来源与 `SHA256SUMS.txt`。如果确认信任该程序，可按 Apple 的官方流程在“系统设置 → 隐私与安全性”处理[允许打开的提示](https://support.apple.com/zh-cn/102445)。不要关闭 Gatekeeper、删除隔离标记或停用系统安全防护。

## 升级和卸载

升级前关闭正在运行的程序；建议备份 `Documents/文档/Raphael公众号项目`。Windows 运行同版的新 Setup 即可覆盖升级；Mac 用新应用替换 Applications 内的旧应用。

Windows 在“设置 → 应用 → 已安装的应用”中卸载对应版本。Mac 将应用移到废纸篓。卸载不删除 Documents 中的文章、图片，也不清除独立保存的用户设置/凭据。需要完全清理时由用户自行备份后处理数据目录。

项目文件包括 `正文.md`、`project.json`、`图片/`。两版使用同一目录和格式；同一项目只应由一个版本编辑，避免相互覆盖自动保存。删除项目或清理未使用图片，会移到回收站/废纸篓。

Web UI 设置保存在系统 Application Data 下的 `raphael-publish`；WinUI 设置保存在 `%LOCALAPPDATA%/RaphaelPublishWinUI`。凭据不共享，首次切换版本时重新填写公众号开发凭据。

## 安全与校验

目前没有 Windows 代码签名证书，Windows 可能显示未知发布者；开启 Smart App Control 的设备也可能直接拦截。这不应通过停用防护来解决，也不能凭开源或哈希断言程序绝对安全。可以检查源码、发行版本及文件哈希，或等待未来签名版本。macOS 包也未公证。

Windows 核对示例：`Get-FileHash -Algorithm SHA256 '<安装包路径>'`。Mac：`shasum -a 256 '<dmg路径>'`。将结果与 Release 的 `SHA256SUMS.txt` 比较；哈希只证明文件与发行产物一致，不证明没有缺陷。

文章项目保存在本地。预览与更新图片会请求正文引用的图片来源；点击创建草稿时，正文和图片通过微信官方 API 上传。应用不会自动发表公众号文章。

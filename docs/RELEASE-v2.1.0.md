# Raphael Publish v2.1.0 · Windows 原生轻量版

- Windows 只提供 WinUI 3，不再发行 Windows Electron/Web UI 安装包；Mac 继续提供 Apple Silicon 和 Intel 两版 Web UI。
- 按需引用 WinUI 组件，移除编辑器不用的 AI、机器学习、搜索和小组件依赖。本机安装目录实测约 238 → 178 MiB，减少约 25%；实际大小会随构建环境和运行库版本变化，不代表内存或启动速度提升同样比例。
- 内容、主题与项目未变时，不重复重建文章预览。
- 保留 Mica、30 个主题、FlowUs 转换、项目管理、图片更新与回收、富文本复制、HTML/PDF 和微信草稿接口。
- 安装器升级时仅清理程序目录中明确列出的旧 SDK 组件；文章、图片和凭据不在清理范围。

## 下载

- Windows x64：`Raphael-Publish-WinUI-2.1.0-windows-x64-Setup.exe`
- Mac Apple Silicon：`Raphael-Publish-WebUI-2.1.0-macos-arm64.dmg`
- Mac Intel：`Raphael-Publish-WebUI-2.1.0-macos-x64.dmg`
- `SHA256SUMS.txt`：上述三个安装包的 SHA256 校验值。

关闭应用后运行安装包升级。旧 Windows Web UI 用户可先验证 WinUI 能打开原项目，再自行卸载旧应用。不要删除文档目录中的文章项目。

Windows 程序仍包含 .NET 与必要 WinUI 运行库，并使用系统 WebView2 进行 HTML/CSS 排版；不是纯 C++ 或完全没有网页引擎的应用。保留上游 MIT、版权和第三方许可。安装包仍未作 Windows 代码签名或 Apple 公证，不建议关闭系统安全保护。

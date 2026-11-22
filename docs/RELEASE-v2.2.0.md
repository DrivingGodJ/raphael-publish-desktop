# Raphael Publish v2.2.0 · 自动检查与安装更新

- 新增 **检查更新** 功能，自动检测 GitHub Releases（`DrivingGodJ/raphael-publish-desktop`）是否有新版本，并在下载前校验 `SHA256SUMS.txt` 完整性。
- **启动静默检查**：每次启动后在后台静默检查一次；若已是最新版本或无法连接网络，保持完全静默、不做任何打扰；发现新版本时展示顶部提示条，点击即可自动下载并安装更新。
- **Windows WinUI 3 版**：工具栏右侧与「更多」菜单新增「检查更新」入口；点击更新后自动下载新版安装包、保存当前文章、静默覆盖升级并自动重启应用。
- **macOS Web UI 版**：顶部导航栏新增「检查更新」入口；自动匹配 Apple Silicon / Intel 对应 `.dmg` 镜像，下载校验后自动替换应用并重启（权限受限时自动打开 `.dmg` 供手动安装）。

## 下载

- Windows x64：`Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe`
- Mac Apple Silicon：`Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg`
- Mac Intel：`Raphael-Publish-WebUI-2.2.0-macos-x64.dmg`
- `SHA256SUMS.txt`：上述三个安装包的 SHA256 校验值。

升级与卸载均不会删除文档目录中的文章项目与图片。从 v2.2.0 起，后续版本可直接在软件内一键检查、下载并完成更新。

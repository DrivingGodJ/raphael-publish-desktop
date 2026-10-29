# Raphael Publish v2.0.1

## Windows 原生版：恢复 Mica 背景

- 修复不透明根背景遮住系统 Mica 材质的问题。
- 标题栏和窗口按钮的普通背景保持透明，与窗口材质融合。
- 保留编辑区与文章预览的清晰底色，编辑、图片更新、复制和草稿发布逻辑不变。
- Mica 效果由 Windows 管理；系统关闭透明效果或不支持此材质时，会使用系统回退背景。它不是整窗透明玻璃。

## 下载选择

- Windows 优先使用 `Raphael-Publish-WinUI-2.0.1-windows-x64-Setup.exe`。
- Web UI 提供 Windows x64、macOS Apple Silicon（arm64）和 Intel（x64）安装包；本次 Web UI 无功能改动，仅同步版本号。
- 退出程序后运行安装包可升级。升级不删除公众号文章和图片。
- `SHA256SUMS.txt` 提供四个安装包的校验值。

## 说明

保留上游 Raphael Publish 的 MIT 许可及第三方许可说明。安装包仍未进行 Windows 代码签名或 Apple 公证；请勿为了安装而关闭系统安全保护。

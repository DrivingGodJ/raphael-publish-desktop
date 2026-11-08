**简体中文** | [English](GUIDE.en.md)

# 使用、配置与开发指南

[返回作品展示](../README.md)

## 快速开始

从同一 Release 中选择对应平台和界面：

| 平台 | 版本 | 安装包 |
| --- | --- | --- |
| Windows 10 2004+/11，x64 | WinUI，唯一 Windows 发行版 | `Raphael-Publish-WinUI-版本-windows-x64-Setup.exe` |
| Apple Silicon Mac | Web UI | `Raphael-Publish-WebUI-版本-macos-arm64.dmg` |
| Intel Mac | Web UI | `Raphael-Publish-WebUI-版本-macos-x64.dmg` |

Windows 运行 Setup，为当前用户安装，无需管理员权限。WinUI 包含 .NET 和 Windows App SDK，缺少 WebView2 时安装器会联网安装。Mac 打开匹配芯片的 DMG，将应用拖入 Applications。

升级前关闭应用，再运行同类型新安装包；Mac 覆盖旧应用。卸载不删除文章和图片。两版可并存，但不要同时编辑同一项目；默认项目位于“文档/Documents/Raphael公众号项目”。详细提示见安装文档。

## 使用说明

1. 在“项目管理”中新建文章，粘贴 FlowUs 正文和图片。
2. 点击“更新图片”，整理项目内图片。
3. 选择主题和预览宽度，检查排版。
4. 复制到公众号、导出文件，或创建公众号草稿。

草稿接口需自己的 AppID、AppSecret 和 IP 白名单。凭据只经本机系统加密保存，不经过第三方发布服务；Web UI 使用 Windows DPAPI/macOS Keychain，WinUI 使用 DPAPI。两版凭据独立，首次切换需重新填写。创建草稿后仍须去公众号后台检查并手动发表。关闭主窗口即退出，无需常驻本地服务器。

## 开发与验证

需要 **Node.js 24、pnpm 11**。WinUI 构建还需 Windows、.NET 10 SDK；生成安装器需 Inno Setup 6.7+。Mac DMG 在对应架构的 macOS 上构建。

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm desktop:dev
```

```bash
pnpm winui:installer
pnpm webui:installer:mac --arm64
pnpm webui:installer:mac --x64
```

按平台选择命令，安装包输出至 `release/`。免安装目录可用 `pnpm winui:pack` 或 `pnpm desktop:pack` 构建，分发须保留完整目录。

```bash
pnpm test
pnpm test:desktop-backend
pnpm test:wechat-publisher
dotnet run --project native/Tests/Raphael.Core.Tests.csproj -c Release
```

`Build release installers` 为手动构建工作流；检查产物与 SHA256 后再建立 Release，版本以 `package.json` 为准。文档中的开发命令不表示已完成各平台安装与真实公众号发布验收。

## 文档与支持

- [安装、升级与卸载](../docs/INSTALL.md)
- [Web UI](../LOCAL-README.md) · [WinUI](../native/README.md)
- [问题反馈](https://github.com/DrivingGodJ/raphael-publish-desktop/issues)

## 许可与致谢

[MIT License](../LICENSE)。保留原项目版权、Git 历史及 [NOTICE.md](../NOTICE.md)，依赖各遵循其条款。发行包包含许可证与第三方声明，不包含本地文章、密钥或测试数据。

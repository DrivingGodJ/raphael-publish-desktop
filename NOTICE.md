# 来源与许可说明

本项目是 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) 的二次开发版本，基于原仓库提交 `1243dff`。原项目采用 MIT License，原有版权声明与许可全文保留在本仓库根目录的 [LICENSE](LICENSE) 中。保留上游 Git 历史，以便追溯原作者和后续改动。

桌面版新增了 Electron 封装、本地项目及图片管理、FlowUs 富文本粘贴适配、富文本复制和可选的微信公众号草稿接口。这些改动不代表原项目作者的认可或维护。

`native/` 下的 WinUI 3 重构版新增 C# 原生界面与服务，复用原项目的 JavaScript 排版引擎。它使用 Microsoft Windows App SDK、WebView2 和 .NET；构建脚本会将相应依赖包的许可证与第三方声明复制至发布目录的 `ThirdPartyLicenses`。原排版引擎的 MIT 版权声明继续保留。

两种发行包还会附带生产 npm 依赖的许可文件、版权声明与版本清单，保存在 `ThirdPartyLicenses/npm`。WinUI 安装器使用 Inno Setup，随包的 WebView2 引导程序来自微软且在打包前验证其数字签名；简体中文安装提示为本仓库新增翻译，采用 MIT 许可。

依赖库由各自作者持有版权，并遵循各自许可证；包名称与版本列于 `package.json` 和 `pnpm-lock.yaml`。本仓库没有提交使用者的公众号密钥、本地文章项目或打包后的 Electron/Chromium 二进制文件。

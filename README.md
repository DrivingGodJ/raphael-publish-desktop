# Raphael Publish Desktop

基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) 改造的 Windows 桌面版公众号排版编辑器。这是社区二次开发项目，并非原项目官方桌面版。原项目作者和许可证见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。

## 功能

- 将从 FlowUs 等编辑器复制的富文本转换为 Markdown，支持文章预览和主题排版。
- 按项目保存正文与图片；“更新图片”会下载新图片，并将正文不再引用的旧图片移入回收站。
- 将富文本复制到公众号编辑器，也可导出 HTML、PDF 或复制纯文本。
- 可选：使用微信公众号官方接口创建草稿。AppID 和 AppSecret 由使用者自己提供；AppSecret 在 Windows 当前用户账户下加密保存，不随仓库分发。

## Windows 本地开发

需要 Node.js 24、pnpm 11 和 Microsoft Edge。克隆仓库后运行：

```bash
pnpm install
pnpm desktop:dev
```

构建免安装版：

```bash
pnpm desktop:pack
```

构建结果位于 `release/win-unpacked/`。请保留整个目录，不要单独分发其中的 `.exe`。项目数据默认保存在当前用户的“文档/Raphael公众号项目”，不属于源码仓库或程序安装目录。

运行测试：

```bash
pnpm test
pnpm test:desktop-backend
pnpm test:wechat-publisher
```

桌面版详细使用说明见 [LOCAL-README.md](LOCAL-README.md)。

## 授权与来源

本仓库保留了原项目的 MIT 许可证和 Git 历史。基于原项目的代码与素材继续遵循 MIT 许可；所用开源依赖各自遵循其许可证。详见 [NOTICE.md](NOTICE.md)。

**简体中文** | [English](LOCAL-README.en.md)

# Raphael Publish · Web UI

基于 Electron 的 Windows/macOS 桌面界面。Windows 首选原生 WinUI，Mac 使用本版本；完整版本选择见[项目首页](README.md)。关闭主窗口即退出，不需要常驻本地网页服务。

## 快速开始

Windows 运行 Web UI Setup，从桌面或开始菜单启动；Mac 将匹配芯片的 DMG 中应用拖入 Applications。安装、升级和卸载详见[安装指南](docs/INSTALL.md)。

## 使用说明

1. 打开“项目管理 → 新建项目”，填写标题。
2. 从 FlowUs 复制整篇文章，粘贴到左侧编辑区；标题、正文与强调段落自动转换为 Markdown。
3. 点击“更新图片”，将网络图片保存到当前项目的“图片”文件夹，链接转换为本地路径。
4. 更换图片后再次更新：相同链接复用本地文件，不再引用的图片移入回收站/废纸篓。
5. 选择主题并预览，使用“复制到公众号”保留富文本样式，或“复制纯文本”仅复制文字。

FlowUs“着重块”按原始剪贴板块类型转换为单层 Markdown 引用，不重复叠加 `>`。应用外观跟随系统深浅色模式。

## 草稿与凭据

“发布草稿”直接调用微信官方接口，JPG/PNG 按原样上传，不自动压缩或转换；超限或不支持时需手动处理后重试。首次使用需 AppID、AppSecret，以及当前公网 IP 的公众号白名单。

AppSecret 使用 Windows DPAPI/macOS Keychain 加密保存于当前账户应用数据目录，渲染页面读不到明文，不经过第三方发布服务。创建草稿后仍需到公众号后台预览并手动发表。

## 项目文件

项目位于“文档/Documents/Raphael公众号项目”，每篇文章一个文件夹：`正文.md`、`图片/` 和记录名称、主题及导入信息的 `project.json`。删除项目会将完整目录移入回收站/废纸篓。

## 开发与许可

开发、构建与测试见[项目首页](README.md#开发与验证)。本桌面版基于 [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish)，保留 [MIT 许可证](LICENSE) 和 [NOTICE](NOTICE.md)。

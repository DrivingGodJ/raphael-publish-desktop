# Windows 原生轻量架构

Windows 仅交付 WinUI 3；Mac 保留原 Web UI，不删除其代码或上游版权。Windows 默认打包命令与发布工作流不再生成 Electron 安装包。

## 分工

- `native/WinUI`：真正的 WinUI 窗口、编辑器、菜单、弹窗、文件选择器、系统主题和剪贴板。没有本地 HTTP 服务或 Node.js 后端。
- `native/Core`：文件项目、图片更新与回收、Windows 凭据加密和微信草稿 API。
- `native/web-source`：仅文章 HTML/CSS 预览与排版转换；复用系统 Evergreen WebView2，不打包 Chromium。Windows 生产包不包含 React、Electron 或 Node.js 运行时。
- `src/lib`：与 Mac 共用、编译进预览资源的排版和 FlowUs 转换逻辑；Node/pnpm 只用于构建，不是 Windows 运行依赖。

## 精简与边界

不再引用整个 `Microsoft.WindowsAppSDK` 聚合包，只引用 WinUI 及其所需的 InteractiveExperiences；移除无关的 AI、ML、搜索、小组件与独立 DWrite 组件依赖。不是手工删除未知 DLL，而是由依赖图决定发布内容。

同一篇文章、主题、项目未变时，复制或导出不再重复重建预览 DOM。自动保存与渲染仍采用一次性防抖计时器，没有后台轮询；关闭窗口退出应用与所属 WebView。

为保留现有的无管理员安装和离线运行能力，当前仍随包携带 .NET 与必要 WinUI 运行库；没有将它们转移到另一目录后宣称“零体积”。WebView2 会使用系统进程，不能承诺单进程、零内存或完全无网页引擎。全面替换 HTML 引擎会影响现有主题、富文本复制与 PDF 一致性，不属于这次精简。

`node scripts/test-native-distribution.mjs <发布目录>` 检查无 Electron/AI/ML 等无关载荷及必要资源，限制发布目录低于 200 MiB。`--self-test` 继续覆盖原有功能，并检查未改变文章不重复渲染。

现有项目仍使用 `正文.md`、`project.json` 和 `图片/`，不迁移数据格式。未发布新 Release 时，开发副本不改变历史版本下载内容。

[简体中文](README.md) | **English**

# Raphael Publish Desktop

Take an article from collected content to WeChat typesetting locally. Paste the text, organize images, try themes, then copy, export or create a draft when the result is ready.

![Markdown content beside its typeset preview](media/screenshot.png)

*The image shows the original web editor. Desktop editions reuse its typesetting engine with different window chrome and a native WinUI interface.*

## Start with the content you've written

Paste an entire FlowUs article and convert headings, paragraphs and emphasized blocks to Markdown. Each article has its own project with autosave, ready to revisit later.

## Keep images with the article

Update images to download new links, reuse saved files and move unreferenced images to the Recycle Bin or Trash. Text and images stay in one project folder instead of accumulating loose files across revisions.

## See the same article in different layouts

Choose among 30 themes and preview desktop, tablet and phone widths. WinUI also links preview paragraphs to their source and synchronizes scrolling in both directions to make long articles easier to refine.

## Deliver it the way you need

Copy styled content to WeChat or export HTML, PDF and plain text. With your own Official Account configured, create a draft through the official API, then review and publish manually in the dashboard.

## Try it

[Download for Windows / macOS](https://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest)

Starting with v2.1.0, Windows ships only the native WinUI edition; Mac uses Web UI. The Windows build references only the required WinUI components, removing unused AI/ML dependencies without changing the article project format. See the [installation guide (Chinese)](docs/INSTALL.md) and [Windows lightweight architecture (Chinese)](docs/WINDOWS-ARCHITECTURE.md).

## Explore further

| Topic | Documentation |
| --- | --- |
| Installation, upgrades and removal | [Installation guide (Chinese)](docs/INSTALL.md) |
| Articles and projects | [Web UI](LOCAL-README.en.md) · [WinUI](native/README.en.md) |
| Draft API, data and credentials | [User guide](docs/GUIDE.en.md) |
| Source builds, tests and releases | [Development and checks](docs/GUIDE.en.md#development-and-checks) |
| Feedback | [Issues](https://github.com/DrivingGodJ/raphael-publish-desktop/issues) |

A community desktop adaptation of [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish). [MIT License](LICENSE) · [Origins and credits](NOTICE.md)

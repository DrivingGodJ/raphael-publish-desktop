[简体中文](LOCAL-README.md) | **English**

# Raphael Publish · Web UI

The Electron desktop interface for Windows/macOS. WinUI is preferred on Windows; Mac uses this edition. See the [main README](README.en.md) for edition selection. Closing the main window exits the app without a persistent local web server.

## Quick start

On Windows, run Web UI Setup and launch from the desktop or Start menu. On Mac, drag the app from the matching architecture's DMG to Applications. See the [installation guide (Chinese)](docs/INSTALL.md) for installation, upgrades and removal.

## Usage

1. Open Project Management → New Project and enter a title.
2. Copy an entire FlowUs article into the left editor. Headings, paragraphs and emphasized blocks become Markdown.
3. Update images to download linked images into the project's `图片` folder and replace their URLs with local paths.
4. Update again after image changes: identical links reuse files, and unreferenced images move to the Recycle Bin/Trash.
5. Choose a theme, preview and copy rich text to WeChat, or copy plain text without formatting.

FlowUs callout blocks become a single Markdown blockquote based on clipboard block types, without repeated `>` prefixes. App appearance follows system light/dark mode.

## Drafts and credentials

Create Draft uses WeChat's official API. JPG/PNG files upload unchanged without automatic conversion or compression; handle unsupported formats or sizes manually before retrying. First use requires AppID, AppSecret and the current public IP in the Official Account allowlist.

AppSecret is encrypted in the current account's application-data directory through Windows DPAPI/macOS Keychain. The renderer cannot read plaintext, and credentials do not pass through third-party publishing services. After draft creation, preview and publish manually in WeChat's dashboard.

## Project files

Projects live under `Documents/Raphael公众号项目`, with one folder per article: `正文.md`, `图片/` and `project.json` for name, theme and import metadata. Deleting a project moves the entire folder to the Recycle Bin/Trash.

## Development and license

See the [main development guide](docs/GUIDE.en.md#development-and-checks) for builds and tests. This edition is based on [Raphael Publish](https://github.com/liuxiaopai-ai/raphael-publish) and preserves the [MIT license](LICENSE) and [NOTICE](NOTICE.md).

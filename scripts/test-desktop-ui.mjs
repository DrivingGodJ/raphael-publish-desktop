import { chromium } from '@playwright/test'

const appUrl = process.env.RAPHAEL_TEST_URL || `http://127.0.0.1:4173/`
const edgePath = `C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1500, height: 960 }, colorScheme: `dark` })

await context.addInitScript(() => {
  const projects = []
  window.__nativeCopyEvents = 0
  document.addEventListener(`copy`, () => { window.__nativeCopyEvents += 1 })
  const makeProject = (name, markdown, imageCount = 0) => {
    const now = new Date().toISOString()
    const project = {
      id: `20260910210000-${String(projects.length + 1).padStart(6, `0`)}`,
      title: name,
      folderName: `${name}__test`,
      articleFile: `正文.md`,
      imageDirectory: `图片`,
      createdAt: now,
      updatedAt: now,
      imageCount,
      failedImageCount: 0,
      themeId: `apple`,
      markdown,
    }
    projects.unshift(project)
    return project
  }

  window.raphaelDesktop = {
    getInfo: async () => ({ appName: `Raphael Publish`, projectsRoot: `C:\\Mock\\Raphael公众号项目`, version: `1.0.0` }),
    listProjects: async () => projects.map(({ markdown: _markdown, ...project }) => project),
    createProject: async ({ name, markdown = `` }) => makeProject(name, markdown || `# ${name}\n\n`),
    importProject: async ({ name, markdown }) => makeProject(name, markdown, 1),
    readProject: async id => projects.find(project => project.id === id),
    saveProject: async payload => {
      const project = projects.find(project => project.id === payload.id)
      project.markdown = payload.markdown
      project.themeId = payload.themeId
      project.updatedAt = new Date().toISOString()
      return project
    },
    updateProjectImages: async ({ id, markdown }) => {
      const project = projects.find(project => project.id === id)
      project.markdown = markdown.replace('https://example.com/new.png', '图片/001_new.png')
      project.imageCount = 1
      return {
        project,
        scannedImageCount: 1,
        downloadedImageCount: 1,
        reusedImageCount: 0,
        failedImageCount: 0,
        removedImageCount: 0,
      }
    },
    renameProject: async ({ id, name }) => {
      const project = projects.find(item => item.id === id)
      project.title = name
      project.updatedAt = new Date().toISOString()
      return project
    },
    deleteProject: async id => {
      const index = projects.findIndex(project => project.id === id)
      if (index >= 0) projects.splice(index, 1)
      return { deleted: true }
    },
    openProjectFolder: async () => ({ opened: true }),
    openProjectsRoot: async () => ({ opened: true }),
    getPublisherSettings: async () => ({ appId: ``, hasAppSecret: false }),
    selectPublisherCover: async () => `C:\\Mock\\cover.jpg`,
    publishWechatDraft: async payload => ({ mediaId: `draft-test-media-id`, uploadedImageCount: payload.content.includes(`<img`) ? 1 : 0, usedSelectedCover: Boolean(payload.coverPath) }),
  }
})

const page = await context.newPage()
try {
  await page.goto(appUrl, { waitUntil: `networkidle`, timeout: 60_000 })

  if (!await page.locator(`html`).evaluate(element => element.classList.contains(`dark`)))
    throw new Error(`The app did not follow the system dark color scheme.`)
  await page.emulateMedia({ colorScheme: `light` })
  await page.waitForFunction(() => !document.documentElement.classList.contains(`dark`))

  if (await page.getByTestId(`flowus-import-button`).count())
    throw new Error(`The separate FlowUs import button is still visible.`)
  if (await page.locator(`a[href*="github.com/liuxiaopai-ai/raphael-publish"]`).count())
    throw new Error(`The GitHub header button is still visible.`)

  await page.getByTestId(`project-manager-button`).click()
  const manager = page.getByRole(`dialog`, { name: `项目管理` })
  await manager.waitFor({ state: `visible` })
  await manager.getByTestId(`new-project-button`).click()

  const createDialog = page.getByRole(`dialog`, { name: `新建项目` })
  await createDialog.getByLabel(`项目标题`).fill(`FlowUs 直接粘贴测试`)
  await createDialog.getByRole(`button`, { name: `创建` }).click()
  await manager.waitFor({ state: `hidden` })

  const editor = page.getByTestId(`editor-input`)
  await editor.fill(``)
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData(`text/plain`, `桌面直接粘贴测试\n着重段落`)
    clipboardData.setData(`text/html`, `<h2>桌面直接粘贴测试</h2><blockquote><p>着重段落</p></blockquote><img src="https://example.com/new.png">`)
    clipboardData.setData(`text/next-space-blocks`, JSON.stringify({
      blocks: [
        { id: `heading`, subTree: { heading: { type: 3, title: `桌面直接粘贴测试` } } },
        { id: `callout`, subTree: { callout: { type: 13, title: `着重段落`, backgroundColor: `grey` } } },
        { id: `image`, subTree: { image: { type: 16, title: `` } } },
      ],
    }))
    element.dispatchEvent(new ClipboardEvent(`paste`, { bubbles: true, cancelable: true, clipboardData }))
  })

  const pastedMarkdown = await editor.inputValue()
  if (!pastedMarkdown.includes(`> 着重段落`) || pastedMarkdown.includes(`> >`))
    throw new Error(`FlowUs emphasis block was not converted to exactly one Markdown quote marker.`)

  await page.getByTestId(`image-update-button`).click()
  await page.getByText(`图片更新完成：新下载 1 张。`).waitFor({ state: `visible` })

  await page.getByTestId(`project-manager-button`).click()
  await manager.waitFor({ state: `visible` })
  let managerText = await manager.textContent()
  if (!managerText.includes(`FlowUs 直接粘贴测试`) || !managerText.includes(`1 张本地图片`))
    throw new Error(`The new project was not shown correctly in project management.`)

  await manager.getByTestId(`rename-project-20260910210000-000001`).click()
  const renameDialog = page.getByRole(`dialog`, { name: `重命名项目` })
  await renameDialog.getByLabel(`项目标题`).fill(`已重命名的公众号项目`)
  await renameDialog.getByRole(`button`, { name: `保存` }).click()
  await renameDialog.waitFor({ state: `hidden` })
  managerText = await manager.textContent()
  if (!managerText.includes(`已重命名的公众号项目`))
    throw new Error(`The project rename dialog did not update the project title.`)

  await manager.getByRole(`button`, { name: `关闭` }).click()
  await page.getByText(`已重命名的公众号项目`, { exact: true }).waitFor({ state: `visible` })

  if (await page.getByTestId(`wechat-check-button`).count())
    throw new Error(`The removed WeChat compatibility button is still visible.`)

  await page.getByTestId(`publish-draft-button`).click()
  const publishDialog = page.getByRole(`dialog`, { name: `发送到公众号草稿箱` })
  await publishDialog.getByLabel(`公众号 AppID`).fill(`wx-test-app-id`)
  await publishDialog.getByLabel(`公众号 AppSecret`).fill(`test-secret`)
  await publishDialog.getByRole(`button`, { name: `选择封面` }).click()
  await publishDialog.getByTestId(`publish-draft-confirm`).click()
  await publishDialog.getByText(`草稿创建成功`).waitFor({ state: `visible` })
  await publishDialog.getByText(`关闭`, { exact: true }).click()

  await page.getByRole(`button`, { name: `复制到公众号`, exact: true }).click()
  await page.getByRole(`button`, { name: `已复制！请贴往公众号`, exact: true }).waitFor({ state: `visible` })
  await page.getByRole(`button`, { name: `复制纯文本`, exact: true }).click()
  await page.getByRole(`button`, { name: `纯文本已复制`, exact: true }).waitFor({ state: `visible` })
  const nativeCopyEvents = await page.evaluate(() => window.__nativeCopyEvents)
  if (nativeCopyEvents !== 2)
    throw new Error(`Rich text and plain text did not both use native copy events.`)

  await page.screenshot({ path: `build/desktop-ui-qa.png`, fullPage: true })
  process.stdout.write(`${JSON.stringify({
    followsSystemTheme: true,
    projectManagementLabel: true,
    createProjectDialog: true,
    renameProjectDialog: true,
    directFlowUsPaste: true,
    singleFlowUsQuoteMarker: true,
    incrementalImageUpdateButton: true,
    removedImportGithubAndThemeButtons: true,
    nativeRichTextCopy: true,
    nativePlainTextCopy: true,
    removedWechatCompatibilityCheck: true,
    directDraftPublishDialog: true,
  }, null, 2)}\n`)
}
finally {
  await browser.close()
}

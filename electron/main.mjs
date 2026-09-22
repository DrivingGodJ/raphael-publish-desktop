import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, shell } from 'electron'
import { createProjectStore, ensurePathInside, imageDirectoryName } from './project-store.mjs'
import { publishWechatDraft } from './wechat-publisher.mjs'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(currentDirectory, `..`)

protocol.registerSchemesAsPrivileged([{
  scheme: `raphael-asset`,
  privileges: {
    corsEnabled: true,
    secure: true,
    standard: true,
    stream: true,
    supportFetchAPI: true,
  },
}])

function getProjectsRoot() {
  return process.env.RAPHAEL_PROJECTS_ROOT
    ? resolve(process.env.RAPHAEL_PROJECTS_ROOT)
    : join(app.getPath(`documents`), `Raphael公众号项目`)
}

let activeProjectStore
function getProjectStore() {
  const projectsRoot = getProjectsRoot()
  if (!activeProjectStore || activeProjectStore.projectsRoot !== projectsRoot)
    activeProjectStore = createProjectStore(projectsRoot, { discardFile: filePath => shell.trashItem(filePath) })
  return activeProjectStore
}

function getPublisherSettingsPath() {
  return join(app.getPath(`userData`), `wechat-publisher-settings.json`)
}

async function readPublisherSettings() {
  try {
    const stored = JSON.parse(await readFile(getPublisherSettingsPath(), `utf8`))
    let appSecret = ``
    if (stored.encryptedAppSecret && safeStorage.isEncryptionAvailable()) {
      appSecret = safeStorage.decryptString(Buffer.from(stored.encryptedAppSecret, `base64`))
    }
    return { appId: String(stored.appId || ``), appSecret }
  }
  catch {
    return { appId: ``, appSecret: `` }
  }
}

async function savePublisherSettings(payload) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(`Windows 本机加密不可用，不能安全保存 AppSecret。`)
  const current = await readPublisherSettings()
  const appId = String(payload.appId || current.appId || ``).trim()
  const appSecret = String(payload.appSecret || current.appSecret || ``).trim()
  if (!appId || !appSecret) throw new Error(`请填写完整的 AppID 和 AppSecret。`)
  await writeFile(getPublisherSettingsPath(), `${JSON.stringify({
    appId,
    encryptedAppSecret: safeStorage.encryptString(appSecret).toString(`base64`),
  }, null, 2)}\n`, `utf8`)
  return { appId, appSecret }
}

function registerIpcHandlers() {
  ipcMain.handle(`desktop:get-info`, async () => ({
    appName: app.getName(),
    projectsRoot: getProjectsRoot(),
    version: app.getVersion(),
  }))
  ipcMain.handle(`project:list`, () => getProjectStore().listProjects())
  ipcMain.handle(`project:create`, (_event, payload) => getProjectStore().createProject(payload || {}))
  ipcMain.handle(`project:import`, (_event, payload) => getProjectStore().importProject(payload || {}))
  ipcMain.handle(`project:read`, (_event, projectId) => getProjectStore().readProject(projectId))
  ipcMain.handle(`project:save`, (_event, payload) => getProjectStore().saveProject(payload || {}))
  ipcMain.handle(`project:update-images`, (_event, payload) => getProjectStore().updateProjectImages(payload || {}))
  ipcMain.handle(`project:rename`, (_event, payload) => getProjectStore().renameProject(payload || {}))
  ipcMain.handle(`project:delete`, async (_event, projectId) => {
    const { projectDirectory } = await getProjectStore().findProject(projectId)
    await shell.trashItem(projectDirectory)
    return { deleted: true }
  })
  ipcMain.handle(`project:open-folder`, async (_event, projectId) => {
    const { projectDirectory } = await getProjectStore().findProject(projectId)
    const error = await shell.openPath(projectDirectory)
    if (error) throw new Error(error)
    return { opened: true }
  })
  ipcMain.handle(`project:open-root`, async () => {
    await mkdir(getProjectsRoot(), { recursive: true })
    const error = await shell.openPath(getProjectsRoot())
    if (error) throw new Error(error)
    return { opened: true }
  })
  ipcMain.handle(`publisher:get-settings`, async () => {
    const settings = await readPublisherSettings()
    return { appId: settings.appId, hasAppSecret: Boolean(settings.appSecret) }
  })
  ipcMain.handle(`publisher:select-cover`, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: `选择公众号封面图`,
      properties: [`openFile`],
      filters: [{ name: `图片`, extensions: [`jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`] }],
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle(`publisher:publish-draft`, async (_event, payload) => {
    const settings = await savePublisherSettings(payload || {})
    return publishWechatDraft({ ...payload, ...settings }, getProjectStore())
  })
}

async function registerProjectProtocol() {
  protocol.handle(`raphael-asset`, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== `project`) return new Response(`Not found`, { status: 404 })
      const parts = decodeURIComponent(url.pathname).split(`/`).filter(Boolean)
      const projectId = parts.shift()
      if (!projectId || parts.length < 2 || parts[0] !== imageDirectoryName)
        return new Response(`Not found`, { status: 404 })

      const { projectDirectory } = await getProjectStore().findProject(projectId)
      const imageRoot = ensurePathInside(projectDirectory, join(projectDirectory, imageDirectoryName))
      const filePath = ensurePathInside(imageRoot, join(imageRoot, ...parts.slice(1)))
      if (!(await stat(filePath)).isFile()) return new Response(`Not found`, { status: 404 })
      return net.fetch(pathToFileURL(filePath).href)
    }
    catch {
      return new Response(`Not found`, { status: 404 })
    }
  })
}

function createWindow() {
  const iconPath = join(appRoot, `build`, `icon.png`)
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: `#fbfbfd`,
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, `preload.cjs`),
      sandbox: true,
    },
  })

  window.once(`ready-to-show`, () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: `deny` }
  })
  window.on(`closed`, () => app.quit())

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(join(appRoot, `dist`, `index.html`))
  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}
else {
  let mainWindow
  app.on(`second-instance`, () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    await mkdir(getProjectsRoot(), { recursive: true })
    registerIpcHandlers()
    await registerProjectProtocol()
    mainWindow = createWindow()
  })

  app.on(`window-all-closed`, () => app.quit())
}

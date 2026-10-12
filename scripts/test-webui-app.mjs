import { _electron as electron } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const executablePath = resolve(process.argv[2] || 'release/win-unpacked/Raphael Publish Web UI.exe')
const root = await mkdtemp(join(tmpdir(), 'raphael-packaged-check-'))
let app
try {
  app = await electron.launch({
    executablePath,
    env: { ...process.env, RAPHAEL_TEST_MODE: '1', RAPHAEL_USER_DATA_ROOT: join(root, 'settings'), RAPHAEL_PROJECTS_ROOT: join(root, 'projects') },
    timeout: 90_000,
  })
  const page = await app.firstWindow()
  await page.waitForFunction(() => Boolean(window.raphaelDesktop), { timeout: 30_000 })
  const result = await page.evaluate(async () => {
    const api = window.raphaelDesktop
    const project = await api.createProject({ name: '打包版本验证', markdown: '# 桌面文章\n\n正文**加粗**。\n\n> 单层强调\n' })
    await api.saveProject({ id: project.id, markdown: '# 已保存\n\n正文。', themeId: 'apple' })
    const renamed = await api.renameProject({ id: project.id, name: '重命名验证' })
    const loaded = await api.readProject(project.id)
    const info = await api.getInfo()
    return { info, renamed: renamed.title, markdown: loaded.markdown, folderName: loaded.folderName, hasPublisher: typeof api.publishWechatDraft === 'function' }
  })
  assert.equal(result.info.version, JSON.parse(await readFile('package.json', 'utf8')).version)
  assert.equal(result.renamed, '重命名验证')
  assert.match(result.markdown, /已保存/)
  await page.reload()
  await page.getByRole('button', { name: '项目管理', exact: true }).waitFor()
  await page.getByTestId('editor-input').waitFor()
  await page.waitForFunction(() => document.body.innerText.includes('已保存'))
  assert.match(await readFile(join(root, 'projects', result.folderName, '正文.md'), 'utf8'), /已保存/)
  if (process.platform === 'darwin') {
    await app.evaluate(({ clipboard, ClipboardItem }) => clipboard.write([new ClipboardItem({ 'text/plain': 'Mac 粘贴验证\n强调段落', 'text/html': '<h2>Mac 粘贴验证</h2><blockquote><p>强调段落</p></blockquote>' })]))
    const editor = page.getByTestId('editor-input')
    await editor.fill('')
    await editor.press('Meta+V')
    await page.waitForFunction(() => document.querySelector('[data-testid="editor-input"]').value.includes('Mac 粘贴验证'))
    const pasted = await editor.inputValue()
    assert.match(pasted, /## Mac 粘贴验证/)
    assert.match(pasted, /> 强调段落/)
    assert.doesNotMatch(pasted, />>|> >/)
  }
  await app.close(); app = null
  process.stdout.write(JSON.stringify({ success: true, platform: process.platform, arch: process.arch, version: result.info.version, packagedWindow: true, nativeBridge: true, createRenameSave: true, previewRendered: true, closeExits: true }) + '\n')
}
finally {
  if (app) await app.close()
  // Only this test's explicitly created temporary directory is removed.
  await rm(root, { recursive: true, force: true })
}

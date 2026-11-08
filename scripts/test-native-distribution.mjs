import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const version = JSON.parse(await readFile('package.json', 'utf8')).version
const root = resolve(process.argv[2] || `release/winui-v${version}`)
const files = []
async function visit(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) await visit(path)
    else files.push({ path, name: item.name, size: (await stat(path)).size })
  }
}
await visit(root)
for (const file of files) {
  assert(!/^(electron\.exe|app\.asar|onnxruntime.*|directml\.dll|Microsoft\.Windows\.(AI|Search|Widgets).*|Microsoft\.ASG\..*)$/i.test(file.name), `Unused runtime: ${file.path}`)
}
for (const required of ['Raphael Publish WinUI.exe', 'App.xbf', 'LICENSE', 'NOTICE.md']) {
  assert(files.some(file => file.name === required), `Missing ${required}`)
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
assert(!pkg.scripts['webui:installer:win'])
assert.equal(pkg.scripts['desktop:pack'], 'pnpm winui:pack')
assert(!pkg.build.win)
const bytes = files.reduce((sum, file) => sum + file.size, 0)
const installer = await readFile('installer/winui.iss', 'utf8')
const deletes = installer.split('[InstallDelete]')[1].split('[')[0]
for (const match of deletes.matchAll(/Name: "\{app\}\\([^"\\]+)"/g)) {
  const pattern = new RegExp('^' + match[1].split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
  assert(!files.some(file => file.path === join(root, file.name) && pattern.test(file.name)), `Upgrade cleanup would delete a current dependency: ${match[1]}`)
}
assert(bytes < 200 * 1024 * 1024, `Native payload grew beyond 200 MiB: ${bytes}`)
console.log(JSON.stringify({ success: true, files: files.length, bytes, windowsNativeOnly: true }, null, 2))

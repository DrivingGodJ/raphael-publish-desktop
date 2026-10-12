import { createRequire } from 'node:module'
import { readFile, readdir, realpath, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv[2] || 'build/ThirdPartyLicenses/npm')
const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const seen = new Set()
const manifest = []
async function collect(name, from) {
  const require = createRequire(from)
  const paths = require.resolve.paths(name) || []
  const candidate = paths.map(base => join(base, name, 'package.json')).find(path => existsSync(path))
  if (!candidate) return // Optional platform-specific dependencies may be absent.
  const file = await realpath(candidate)
  if (seen.has(file)) return
  seen.add(file)
  const data = JSON.parse(await readFile(file, 'utf8'))
  const directory = resolve(file, '..')
  const notices = (await readdir(directory, { withFileTypes: true })).filter(item => item.isFile() && /^(licen[cs]e|notice|copying)/i.test(item.name))
  const target = join(output, data.name.replaceAll('/', '__') + '-' + data.version)
  await mkdir(target, { recursive: true })
  for (const notice of notices) await copyFile(join(directory, notice.name), join(target, notice.name))
  manifest.push({ name: data.name, version: data.version, license: data.license, author: data.author, repository: data.repository, noticeFiles: notices.map(item => item.name) })
  for (const child of Object.keys({ ...data.dependencies, ...data.optionalDependencies })) await collect(child, file)
}
for (const name of Object.keys(project.dependencies)) await collect(name, join(root, 'package.json'))
await writeFile(join(output, 'DEPENDENCIES.json'), JSON.stringify(manifest.sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n')
process.stdout.write(`Preserved license metadata and notices for ${manifest.length} production npm dependencies.\n`)

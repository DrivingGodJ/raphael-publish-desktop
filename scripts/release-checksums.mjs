import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const directory = resolve(process.argv[2] || 'release/v2.0.0-final')
const version = process.argv[3] || JSON.parse(await readFile('package.json', 'utf8')).version
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version')
const names = [
  `Raphael-Publish-WinUI-${version}-windows-x64-Setup.exe`,
  `Raphael-Publish-WebUI-${version}-windows-x64-Setup.exe`,
  `Raphael-Publish-WebUI-${version}-macos-arm64.dmg`,
  `Raphael-Publish-WebUI-${version}-macos-x64.dmg`,
]
const files = await readdir(directory)
if (files.some(name => !names.includes(name) && name !== 'SHA256SUMS.txt')) throw new Error('Unexpected file in release artifacts')
const hashes = []
for (const name of names) {
  const data = await readFile(join(directory, name))
  if (data.length < 10_000_000) throw new Error('Installer too small: ' + name)
  hashes.push(createHash('sha256').update(data).digest('hex') + '  ' + name)
}
await writeFile(join(directory, 'SHA256SUMS.txt'), hashes.join('\n') + '\n')
process.stdout.write(hashes.join('\n') + '\n')

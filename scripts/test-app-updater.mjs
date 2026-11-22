import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildMacDmgInstallScript,
  buildWindowsInstallScript,
  checkLatestRelease,
  downloadReleaseAsset,
  isAllowedGitHubUrl,
  isNewerVersion,
  parseSha256Sums,
  resolveMacAppBundlePath,
  selectReleaseAsset,
} from '../electron/app-updater.mjs'

assert.equal(isNewerVersion('2.1.0', 'v2.2.0'), true)
assert.equal(isNewerVersion('2.2.0', 'v2.10.0'), true)
assert.equal(isNewerVersion('2.1.0', 'v2.1.0'), false)
assert.equal(isNewerVersion('2.2.0', 'v2.1.9'), false)
assert.equal(isNewerVersion('2.2.0-beta.1', 'v2.2.0'), true)
assert.equal(isNewerVersion('2.2.0', 'v2.2.0-beta.1'), false)

assert.equal(isAllowedGitHubUrl('https://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest'), true)
assert.equal(isAllowedGitHubUrl('https://objects.githubusercontent.com/release-asset/test.dmg'), true)
assert.equal(isAllowedGitHubUrl('http://github.com/DrivingGodJ/raphael-publish-desktop/releases/latest'), false)
assert.equal(isAllowedGitHubUrl('https://evil.example.com/fake.dmg'), false)

const mockAssets = [
  { name: 'Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg', downloadUrl: 'https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg', size: 1234 },
  { name: 'Raphael-Publish-WebUI-2.2.0-macos-x64.dmg', downloadUrl: 'https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WebUI-2.2.0-macos-x64.dmg', size: 1234 },
  { name: 'Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe', downloadUrl: 'https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe', size: 1234 },
]

assert.equal(selectReleaseAsset(mockAssets, { platform: 'darwin', arch: 'arm64' })?.name, 'Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg')
assert.equal(selectReleaseAsset(mockAssets, { platform: 'darwin', arch: 'x64' })?.name, 'Raphael-Publish-WebUI-2.2.0-macos-x64.dmg')
assert.equal(selectReleaseAsset(mockAssets, { platform: 'win32', arch: 'x64' })?.name, 'Raphael-Publish-WinUI-2.2.0-windows-x64-Setup.exe')

const payloadBytes = Buffer.from('DMG-fake-raphael-publish-2.2.0-payload')
const payloadHash = createHash('sha256').update(payloadBytes).digest('hex')
assert.equal(
  parseSha256Sums(`${payloadHash}  Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg\n`, 'Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg'),
  payloadHash,
)

const createMockFetch = ({ sha = payloadHash, failNetwork = false, tagName = 'v2.2.0', draft = false } = {}) => async (url) => {
  if (failNetwork) throw new TypeError('fetch failed')
  const address = String(url)
  if (address.endsWith('/releases/latest')) {
    return Response.json({
      tag_name: tagName,
      name: `${tagName} · 自动检查更新`,
      body: '- 支持启动静默检查更新与一键自动下载安装',
      html_url: `https://github.com/DrivingGodJ/raphael-publish-desktop/releases/tag/${tagName}`,
      published_at: '2026-11-22T12:00:00Z',
      draft,
      prerelease: false,
      assets: [
        {
          name: 'Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg',
          browser_download_url: 'https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg',
          size: payloadBytes.length,
        },
        {
          name: 'SHA256SUMS.txt',
          browser_download_url: 'https://github.com/DrivingGodJ/raphael-publish-desktop/releases/download/v2.2.0/SHA256SUMS.txt',
          size: 120,
        },
      ],
    })
  }
  if (address.endsWith('SHA256SUMS.txt')) {
    return new Response(`${sha}  Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg\n`, { status: 200 })
  }
  if (address.endsWith('.dmg')) {
    return new Response(payloadBytes, {
      status: 200,
      headers: { 'content-length': String(payloadBytes.length) },
    })
  }
  return new Response('Not Found', { status: 404 })
}

const update = await checkLatestRelease({
  currentVersion: '2.1.0',
  platform: 'darwin',
  arch: 'arm64',
  fetchImpl: createMockFetch(),
})
assert.equal(update.hasUpdate, true)
assert.equal(update.canAutoInstall, true)
assert.equal(update.latestVersion, '2.2.0')
assert.equal(update.asset?.name, 'Raphael-Publish-WebUI-2.2.0-macos-arm64.dmg')

const sameVersion = await checkLatestRelease({
  currentVersion: '2.2.0',
  platform: 'darwin',
  arch: 'arm64',
  fetchImpl: createMockFetch(),
})
assert.equal(sameVersion.hasUpdate, false)

const draftRelease = await checkLatestRelease({
  currentVersion: '2.1.0',
  platform: 'darwin',
  arch: 'arm64',
  fetchImpl: createMockFetch({ draft: true }),
})
assert.equal(draftRelease.hasUpdate, false)

await assert.rejects(
  () => checkLatestRelease({ currentVersion: '2.1.0', fetchImpl: createMockFetch({ failNetwork: true }) }),
  /无法连接到 GitHub/,
)

const tempDir = await mkdtemp(join(tmpdir(), 'raphael-updater-test-'))
try {
  const stages = []
  const downloadedPath = await downloadReleaseAsset({
    asset: update.asset,
    checksumsUrl: update.checksumsUrl,
    currentVersion: '2.1.0',
    targetDir: tempDir,
    fetchImpl: createMockFetch(),
    onProgress: event => stages.push(event.stage),
  })
  assert.deepEqual(await readFile(downloadedPath), payloadBytes)
  assert.ok(stages.includes('downloading'))
  assert.ok(stages.includes('verifying'))
  assert.ok(stages.includes('ready'))

  await assert.rejects(
    () => downloadReleaseAsset({
      asset: update.asset,
      checksumsUrl: update.checksumsUrl,
      currentVersion: '2.1.0',
      targetDir: join(tempDir, 'bad'),
      fetchImpl: createMockFetch({ sha: '0'.repeat(64) }),
    }),
    /SHA-256/,
  )
}
finally {
  await rm(tempDir, { recursive: true, force: true })
}

assert.equal(
  resolveMacAppBundlePath('/Applications/Raphael Publish Web UI.app/Contents/MacOS/Raphael Publish Web UI'),
  '/Applications/Raphael Publish Web UI.app',
)
const macScript = buildMacDmgInstallScript({
  dmgPath: '/tmp/test.dmg',
  appBundlePath: '/Applications/Raphael Publish Web UI.app',
  currentPid: 9999,
})
assert.match(macScript, /TARGET_PID=9999/)
assert.match(macScript, /hdiutil attach/)
assert.match(macScript, /ditto "\$SOURCE_APP" "\$APP_PATH"/)
assert.match(macScript, /open -a "\$APP_PATH"/)

const winScript = buildWindowsInstallScript({
  installerPath: "C:\\Users\\O'Brien\\Setup.exe",
  currentPid: 4321,
  preferredExePath: 'C:\\App\\Raphael.exe',
})
assert.match(winScript, /\$targetPid = 4321/)
assert.match(winScript, /O''Brien/)
assert.match(winScript, /'\/SILENT'/)

console.log(JSON.stringify({ success: true, checked: 'electron/app-updater.mjs' }, null, 2))

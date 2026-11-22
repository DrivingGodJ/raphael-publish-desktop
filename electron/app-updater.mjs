import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, constants, mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, posix } from 'node:path'

export const DEFAULT_REPOSITORY = 'DrivingGodJ/raphael-publish-desktop'
export const DEFAULT_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${DEFAULT_REPOSITORY}/releases/latest`
export const DEFAULT_RELEASES_PAGE_URL = `https://github.com/${DEFAULT_REPOSITORY}/releases/latest`

const SHA256_LINE_PATTERN = /^([a-f0-9]{64})\s+\*?(.+)$/i

export function normalizeVersion(raw) {
  if (!raw || typeof raw !== 'string') return '0.0.0'
  let value = raw.trim()
  if (value.startsWith('v') || value.startsWith('V')) value = value.slice(1)
  const plusIndex = value.indexOf('+')
  if (plusIndex >= 0) value = value.slice(0, plusIndex)
  return value.trim()
}

export function parseSemVer(raw) {
  const normalized = normalizeVersion(raw)
  if (!normalized) return null
  const dashIndex = normalized.indexOf('-')
  const corePart = dashIndex >= 0 ? normalized.slice(0, dashIndex) : normalized
  const prePart = dashIndex >= 0 ? normalized.slice(dashIndex + 1) : ''
  const segments = corePart.split('.').filter(Boolean)
  if (segments.length < 2 || segments.length > 4) return null
  const core = [0, 0, 0]
  for (let index = 0; index < 3; index += 1) {
    if (index < segments.length) {
      if (!/^\d+$/.test(segments[index])) return null
      core[index] = Number.parseInt(segments[index], 10)
    }
  }
  const pre = prePart ? prePart.split('.').filter(Boolean) : []
  return { core, pre }
}

export function compareVersions(left, right) {
  const a = parseSemVer(left)
  const b = parseSemVer(right)
  if (!a || !b) throw new Error(`Invalid semantic version comparison: ${left} vs ${right}`)

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1

  const count = Math.min(a.pre.length, b.pre.length)
  for (let index = 0; index < count; index += 1) {
    const aNum = /^\d+$/.test(a.pre[index]) ? Number.parseInt(a.pre[index], 10) : null
    const bNum = /^\d+$/.test(b.pre[index]) ? Number.parseInt(b.pre[index], 10) : null
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum
    }
    else if (aNum !== null || bNum !== null) {
      return aNum !== null ? -1 : 1
    }
    else {
      const comparison = a.pre[index].localeCompare(b.pre[index], undefined, { sensitivity: 'accent' })
      if (comparison !== 0) return comparison
    }
  }
  return a.pre.length - b.pre.length
}

export function isNewerVersion(currentVersion, latestVersion) {
  if (!parseSemVer(currentVersion) || !parseSemVer(latestVersion)) return false
  return compareVersions(latestVersion, currentVersion) > 0
}

export function isAllowedGitHubUrl(rawUrl, allowCustomHosts = false) {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  let parsed
  try { parsed = new URL(rawUrl) }
  catch { return false }
  if (allowCustomHosts && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return true
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return host === 'github.com' || host === 'api.github.com' || host.endsWith('.githubusercontent.com')
}

export function selectReleaseAsset(assets, { platform = process.platform, arch = process.arch } = {}) {
  const list = Array.isArray(assets) ? assets : []
  if (platform === 'darwin') {
    const targetArch = arch === 'arm64' ? 'arm64' : 'x64'
    return (
      list.find(asset => new RegExp(`^Raphael-Publish-WebUI-.*-macos-${targetArch}\\.dmg$`, 'i').test(asset.name))
      || list.find(asset => /\.dmg$/i.test(asset.name) && asset.name.toLowerCase().includes(targetArch))
      || list.find(asset => /\.dmg$/i.test(asset.name))
      || null
    )
  }
  if (platform === 'win32') {
    return (
      list.find(asset => /^Raphael-Publish-WinUI-.*-windows-x64-Setup\.exe$/i.test(asset.name))
      || list.find(asset => /^Raphael-Publish-WebUI-.*-windows-x64-Setup\.exe$/i.test(asset.name))
      || list.find(asset => /\.exe$/i.test(asset.name) && /setup/i.test(asset.name))
      || null
    )
  }
  return null
}

export function parseSha256Sums(content, fileName) {
  const target = basename(String(fileName || '')).toLowerCase()
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const match = SHA256_LINE_PATTERN.exec(rawLine.trim())
    if (!match) continue
    const candidate = basename(match[2].trim()).toLowerCase()
    if (candidate === target) return match[1].toLowerCase()
  }
  return null
}

export async function checkLatestRelease({
  currentVersion,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  apiUrl = DEFAULT_LATEST_RELEASE_API_URL,
  allowCustomHosts = false,
  timeoutMs = 15_000,
} = {}) {
  const normalizedCurrent = normalizeVersion(currentVersion)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `Raphael-Publish-WebUI/${normalizedCurrent}`,
      },
      signal: controller.signal,
    })
  }
  catch (error) {
    if (error && error.name === 'AbortError') throw new Error('连接 GitHub 超时，请检查网络后重试。')
    throw new Error('无法连接到 GitHub，请检查网络后重试。')
  }
  finally {
    clearTimeout(timer)
  }

  if (response.status === 403 || response.status === 429)
    throw new Error('GitHub API 请求频率受限，请稍后再试或前往发布页查看。')
  if (response.status === 404)
    throw new Error('未在 GitHub 仓库中找到正式发布的版本。')
  if (!response.ok)
    throw new Error(`检查更新失败（HTTP ${response.status}）。`)

  let payload
  try { payload = await response.json() }
  catch { throw new Error('GitHub 返回了无法识别的版本信息。') }

  const isDraft = Boolean(payload?.draft)
  const isPrerelease = Boolean(payload?.prerelease)
  const tagName = String(payload?.tag_name || '')
  const latestVersion = normalizeVersion(tagName)
  const releaseName = String(payload?.name || tagName || `v${latestVersion}`)
  const releaseNotes = String(payload?.body || '')
  const releaseUrl = isAllowedGitHubUrl(payload?.html_url, allowCustomHosts)
    ? payload.html_url
    : DEFAULT_RELEASES_PAGE_URL
  const publishedAt = payload?.published_at ? String(payload.published_at) : null

  const assets = []
  let checksumsUrl = null
  for (const item of Array.isArray(payload?.assets) ? payload.assets : []) {
    const name = String(item?.name || '')
    const downloadUrl = String(item?.browser_download_url || '')
    const size = Number(item?.size || 0)
    if (!name || !isAllowedGitHubUrl(downloadUrl, allowCustomHosts)) continue
    if (name.toLowerCase() === 'sha256sums.txt') checksumsUrl = downloadUrl
    assets.push({ name, downloadUrl, size })
  }

  if (isDraft || isPrerelease || !parseSemVer(latestVersion)) {
    return {
      hasUpdate: false,
      canAutoInstall: false,
      currentVersion: normalizedCurrent,
      latestVersion: normalizedCurrent,
      releaseName,
      releaseNotes,
      releaseUrl,
      publishedAt,
      asset: null,
      checksumsUrl: null,
    }
  }

  const asset = selectReleaseAsset(assets, { platform, arch })
  const hasUpdate = isNewerVersion(normalizedCurrent, latestVersion)
  return {
    hasUpdate,
    canAutoInstall: hasUpdate && Boolean(asset),
    currentVersion: normalizedCurrent,
    latestVersion,
    releaseName,
    releaseNotes,
    releaseUrl,
    publishedAt,
    asset,
    checksumsUrl,
  }
}

async function cleanupOldDownloads(targetDir, keepFileName) {
  try {
    const entries = await readdir(targetDir)
    for (const entry of entries) {
      if (entry.toLowerCase() === keepFileName.toLowerCase()) continue
      await rm(join(targetDir, entry), { force: true, recursive: true }).catch(() => undefined)
    }
  }
  catch {
    // Ignore cleanup errors.
  }
}

export async function downloadReleaseAsset({
  asset,
  checksumsUrl = null,
  currentVersion = '0.0.0',
  targetDir,
  fetchImpl = globalThis.fetch,
  allowCustomHosts = false,
  signal,
  onProgress,
}) {
  if (!asset || !asset.downloadUrl || !asset.name)
    throw new Error('该版本未提供适用于当前系统的安装包，请前往 GitHub 发布页手动下载。')
  if (!isAllowedGitHubUrl(asset.downloadUrl, allowCustomHosts))
    throw new Error('安装包下载地址不受信任，已拒绝下载。')

  const safeName = basename(asset.name)
  if (!safeName || !/\.(dmg|exe)$/i.test(safeName))
    throw new Error('安装包文件名无效。')

  await mkdir(targetDir, { recursive: true })
  await cleanupOldDownloads(targetDir, safeName)
  const destinationPath = join(targetDir, safeName)
  const partPath = `${destinationPath}.part`

  let response
  try {
    response = await fetchImpl(asset.downloadUrl, {
      headers: { 'User-Agent': `Raphael-Publish-WebUI/${normalizeVersion(currentVersion)}` },
      signal,
    })
  }
  catch (error) {
    if (error && error.name === 'AbortError') throw error
    throw new Error('下载安装包失败，请检查网络连接后重试。')
  }
  if (!response.ok || !response.body)
    throw new Error(`下载安装包失败（HTTP ${response.status}）。`)

  const headerLength = Number(response.headers.get('content-length') || 0)
  const totalBytes = headerLength > 0 ? headerLength : (asset.size > 0 ? asset.size : null)
  const hash = createHash('sha256')
  const fileStream = createWriteStream(partPath)
  let downloadedBytes = 0
  let lastReport = 0

  try {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      hash.update(chunk)
      await new Promise((resolveWrite, rejectWrite) => {
        fileStream.write(chunk, err => (err ? rejectWrite(err) : resolveWrite()))
      })
      downloadedBytes += chunk.length
      const now = Date.now()
      if (now - lastReport >= 100 || (totalBytes && downloadedBytes >= totalBytes)) {
        lastReport = now
        const percentage = totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null
        onProgress?.({ stage: 'downloading', downloadedBytes, totalBytes, percentage })
      }
    }
    await new Promise((resolveEnd, rejectEnd) => {
      fileStream.end(err => (err ? rejectEnd(err) : resolveEnd()))
    })

    if (downloadedBytes <= 0 || (asset.size > 0 && downloadedBytes !== asset.size))
      throw new Error('安装包下载不完整，请重试。')

    if (checksumsUrl && isAllowedGitHubUrl(checksumsUrl, allowCustomHosts)) {
      onProgress?.({ stage: 'verifying', downloadedBytes, totalBytes: totalBytes || downloadedBytes, percentage: 100 })
      let expectedHash = null
      try {
        const sumResponse = await fetchImpl(checksumsUrl, {
          headers: { 'User-Agent': `Raphael-Publish-WebUI/${normalizeVersion(currentVersion)}` },
          signal,
        })
        if (sumResponse.ok) expectedHash = parseSha256Sums(await sumResponse.text(), safeName)
      }
      catch (error) {
        if (error && error.name === 'AbortError') throw error
      }
      if (expectedHash) {
        const actualHash = hash.digest('hex').toLowerCase()
        if (actualHash !== expectedHash)
          throw new Error('安装包完整性校验失败（SHA-256 不匹配），已取消安装。')
      }
    }

    await rename(partPath, destinationPath)
    onProgress?.({ stage: 'ready', downloadedBytes, totalBytes: totalBytes || downloadedBytes, percentage: 100 })
    return destinationPath
  }
  catch (error) {
    fileStream.destroy()
    await unlink(partPath).catch(() => undefined)
    throw error
  }
}

export function resolveMacAppBundlePath(execPath) {
  const normalized = posix.normalize(String(execPath || '').replace(/\\/g, '/'))
  const marker = '.app/Contents/MacOS/'
  const index = normalized.indexOf(marker)
  if (index <= 0) return null
  return normalized.slice(0, index + 4)
}

function escapeShSingleQuoted(value) {
  return String(value).replace(/'/g, `'\\''`)
}

export function buildMacDmgInstallScript({ dmgPath, appBundlePath, currentPid }) {
  const escapedDmg = escapeShSingleQuoted(dmgPath)
  const escapedApp = escapeShSingleQuoted(appBundlePath)
  const appName = escapeShSingleQuoted(basename(appBundlePath))
  return `#!/bin/sh
set -e
TARGET_PID=${Number(currentPid)}
DMG_PATH='${escapedDmg}'
APP_PATH='${escapedApp}'
APP_NAME='${appName}'

WAIT_COUNT=0
while kill -0 "$TARGET_PID" 2>/dev/null; do
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [ "$WAIT_COUNT" -ge 120 ]; then break; fi
  sleep 0.25
done
sleep 0.4

MOUNT_POINT=$(mktemp -d /tmp/raphael-update-mount.XXXXXX)
BACKUP_PATH="\${APP_PATH}.updater-backup.$$"
cleanup() {
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null || true
  rmdir "$MOUNT_POINT" 2>/dev/null || true
  rm -f "$0" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet
SOURCE_APP="$MOUNT_POINT/$APP_NAME"
if [ ! -d "$SOURCE_APP" ]; then
  SOURCE_APP=$(find "$MOUNT_POINT" -maxdepth 2 -name "*.app" | head -n 1)
fi
if [ -z "$SOURCE_APP" ] || [ ! -d "$SOURCE_APP" ]; then
  exit 1
fi

if [ -d "$APP_PATH" ]; then
  mv "$APP_PATH" "$BACKUP_PATH"
fi
if ditto "$SOURCE_APP" "$APP_PATH"; then
  rm -rf "$BACKUP_PATH" 2>/dev/null || true
  rm -f "$DMG_PATH" 2>/dev/null || true
  open -a "$APP_PATH"
else
  rm -rf "$APP_PATH" 2>/dev/null || true
  if [ -d "$BACKUP_PATH" ]; then
    mv "$BACKUP_PATH" "$APP_PATH"
  fi
  exit 1
fi
`
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''")
}

export function buildWindowsInstallScript({ installerPath, currentPid, preferredExePath = '' }) {
  const escapedInstaller = escapePowerShellSingleQuoted(installerPath)
  const escapedPreferred = escapePowerShellSingleQuoted(preferredExePath)
  return `$ErrorActionPreference = 'SilentlyContinue'
$targetPid = ${Number(currentPid)}
$installer = '${escapedInstaller}'
$preferredExe = '${escapedPreferred}'
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
Start-Sleep -Milliseconds 400
if (-not (Test-Path -LiteralPath $installer)) { exit 1 }
$proc = Start-Process -FilePath $installer -ArgumentList @('/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/SP-') -Wait -PassThru
if ($proc -and $proc.ExitCode -eq 0) {
  if ($preferredExe -and (Test-Path -LiteralPath $preferredExe)) {
    Start-Process -FilePath $preferredExe -WorkingDirectory (Split-Path -Parent $preferredExe)
  }
  Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`
}

export async function launchDownloadedUpdate({
  filePath,
  platform = process.platform,
  currentPid = process.pid,
  execPath = process.execPath,
  isPackaged = false,
  openPath,
}) {
  if (platform === 'darwin') {
    const appBundlePath = isPackaged ? resolveMacAppBundlePath(execPath) : null
    if (appBundlePath) {
      try {
        await access(dirname(appBundlePath), constants.W_OK)
        const scriptPath = join(tmpdir(), `raphael-update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sh`)
        await writeFile(scriptPath, buildMacDmgInstallScript({ dmgPath: filePath, appBundlePath, currentPid }), { mode: 0o700 })
        const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' })
        child.unref()
        return { mode: 'auto-relaunch' }
      }
      catch {
        // Fall back to opening the DMG in Finder if /Applications is not writable.
      }
    }
    if (openPath) {
      const error = await openPath(filePath)
      if (error) throw new Error(error)
      return { mode: 'opened-installer' }
    }
    throw new Error('无法自动打开更新安装包，请前往下载目录手动打开。')
  }

  if (platform === 'win32') {
    const scriptPath = join(tmpdir(), `raphael-update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`)
    await writeFile(scriptPath, `\uFEFF${buildWindowsInstallScript({ installerPath: filePath, currentPid, preferredExePath: execPath })}`, 'utf8')
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
    ], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return { mode: 'auto-relaunch' }
  }

  if (openPath) {
    const error = await openPath(filePath)
    if (error) throw new Error(error)
    return { mode: 'opened-installer' }
  }
  throw new Error('当前系统不支持自动安装，请前往 GitHub 发布页手动更新。')
}

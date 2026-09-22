import { readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { ensurePathInside, imageDirectoryName } from './project-store.mjs'

const WECHAT_API_ROOT = `https://api.weixin.qq.com`

const errorHints = new Map([
  [40013, `AppID 无效，请检查公众号开发设置。`],
  [40125, `AppSecret 无效或已经重置。`],
  [40164, `当前公网 IP 不在公众号白名单中。请在公众号后台“开发 → 基本配置”加入错误信息里显示的 IP。`],
  [45001, `图片超过微信接口允许的大小，请手动压缩后再试。`],
  [45004, `摘要过长，请控制在 120 个字符以内。`],
  [45009, `公众号接口今日调用次数已用完。`],
  [48001, `当前公众号没有草稿或素材接口权限，请检查账号认证和接口权限。`],
])

function wechatErrorMessage(payload, fallback) {
  const code = Number(payload?.errcode || 0)
  const detail = errorHints.get(code)
  const rawMessage = String(payload?.errmsg || ``).trim()
  if (detail) return `${detail}${rawMessage ? ` 微信返回：${rawMessage}` : ``}（${code}）`
  if (code) return `${fallback}：${payload?.errmsg || `微信接口错误`}（${code}）`
  return fallback
}

async function fetchJson(url, options, fallback) {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) })
  }
  catch (error) {
    throw new Error(`${fallback}：${error instanceof Error ? error.message : String(error)}`)
  }

  let payload
  try {
    payload = await response.json()
  }
  catch {
    throw new Error(`${fallback}：微信返回了无法识别的响应（HTTP ${response.status}）。`)
  }
  if (!response.ok || Number(payload?.errcode || 0) !== 0) throw new Error(wechatErrorMessage(payload, fallback))
  return payload
}

export async function getStableAccessToken(appId, appSecret) {
  const payload = await fetchJson(`${WECHAT_API_ROOT}/cgi-bin/stable_token`, {
    method: `POST`,
    headers: { 'content-type': `application/json; charset=utf-8` },
    body: JSON.stringify({
      grant_type: `client_credential`,
      appid: appId,
      secret: appSecret,
      force_refresh: false,
    }),
  }, `获取公众号接口凭据失败`)
  if (!payload.access_token) throw new Error(`微信没有返回 access_token。`)
  return payload.access_token
}

function findImageSources(html) {
  const sources = []
  const seen = new Set()
  const expression = /<img\b[^>]*?\b(?:src|data-src)=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = expression.exec(String(html))) !== null) {
    const source = match[1].trim()
    if (!source || seen.has(source)) continue
    seen.add(source)
    sources.push(source)
  }
  return sources
}

function isWechatHostedImage(source) {
  try {
    const host = new URL(source).hostname.toLowerCase()
    return host === `mmbiz.qpic.cn` || host.endsWith(`.mmbiz.qpic.cn`)
  }
  catch {
    return false
  }
}

function parseDataImage(source) {
  const match = String(source).match(/^data:(image\/[^;,]+)(;base64)?,(.*)$/s)
  if (!match) return null
  return {
    buffer: match[2] ? Buffer.from(match[3], `base64`) : Buffer.from(decodeURIComponent(match[3]), `utf8`),
    name: `clipboard-image`,
  }
}

async function readProjectImage(source, projectId, projectStore) {
  const url = new URL(source)
  if (url.protocol !== `raphael-asset:` || url.hostname !== `project`) return null
  const parts = url.pathname.split(`/`).filter(Boolean).map(decodeURIComponent)
  const sourceProjectId = parts.shift()
  if (sourceProjectId !== projectId || parts.length < 2 || parts[0] !== imageDirectoryName)
    throw new Error(`正文中存在不属于当前项目的图片。`)

  const { projectDirectory } = await projectStore.findProject(projectId)
  const imageRoot = ensurePathInside(projectDirectory, join(projectDirectory, imageDirectoryName))
  const filePath = ensurePathInside(imageRoot, join(imageRoot, ...parts.slice(1)))
  if (!(await stat(filePath)).isFile()) throw new Error(`项目图片不存在：${parts.at(-1) || source}`)
  return { buffer: await readFile(filePath), name: basename(filePath) }
}

async function readPublishImage(source, projectId, projectStore) {
  const dataImage = parseDataImage(source)
  if (dataImage) return dataImage
  const projectImage = await readProjectImage(source, projectId, projectStore)
  if (projectImage) return projectImage
  if (isWechatHostedImage(source)) return null
  throw new Error(`正文仍有未本地化的图片。请先点击“更新图片”后再发布：${source.slice(0, 100)}`)
}

export async function prepareImageForWechat(buffer, sourceName = `image`) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error(`图片文件为空。`)
  const isPng = buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
  if (!isPng && !isJpeg)
    throw new Error(`微信正文图片接口只接受 JPG 或 PNG，请手动转换后再试：${sourceName}`)

  const extension = isPng ? `png` : `jpg`
  return {
    buffer,
    mime: isPng ? `image/png` : `image/jpeg`,
    fileName: `${basename(sourceName, extname(sourceName)) || `image`}.${extension}`,
  }
}

async function uploadMultipart(accessToken, endpoint, image, fallback, query = ``) {
  const form = new FormData()
  form.append(`media`, new Blob([image.buffer], { type: image.mime }), image.fileName)
  return fetchJson(`${WECHAT_API_ROOT}${endpoint}?access_token=${encodeURIComponent(accessToken)}${query}`, {
    method: `POST`,
    body: form,
  }, fallback)
}

async function uploadInlineImage(accessToken, image) {
  const payload = await uploadMultipart(accessToken, `/cgi-bin/media/uploadimg`, image, `上传正文图片失败`)
  if (!payload.url) throw new Error(`微信没有返回正文图片地址。`)
  return payload.url
}

async function uploadCover(accessToken, image) {
  const payload = await uploadMultipart(accessToken, `/cgi-bin/material/add_material`, image, `上传封面图失败`, `&type=image`)
  if (!payload.media_id) throw new Error(`微信没有返回封面素材编号。`)
  return payload.media_id
}

function replaceImageSource(html, original, replacement) {
  return String(html)
    .split(`src="${original}"`).join(`src="${replacement}" data-src="${replacement}"`)
    .split(`src='${original}'`).join(`src='${replacement}' data-src='${replacement}'`)
    .split(`data-src="${original}"`).join(`data-src="${replacement}"`)
    .split(`data-src='${original}'`).join(`data-src='${replacement}'`)
}

async function readCoverImage(coverPath) {
  if (!coverPath) return null
  const coverStat = await stat(coverPath)
  if (!coverStat.isFile()) throw new Error(`所选封面不是有效文件。`)
  return { buffer: await readFile(coverPath), name: basename(coverPath) }
}

export async function publishWechatDraft(payload, projectStore) {
  const appId = String(payload.appId || ``).trim()
  const appSecret = String(payload.appSecret || ``).trim()
  const projectId = String(payload.projectId || ``).trim()
  const title = String(payload.title || ``).trim()
  const author = String(payload.author || ``).trim()
  const digest = String(payload.digest || ``).trim().slice(0, 120)
  let content = String(payload.content || ``).trim()

  if (!appId || !appSecret) throw new Error(`请先填写公众号 AppID 和 AppSecret。`)
  if (!projectId) throw new Error(`请先打开一个项目。`)
  if (!title) throw new Error(`请填写文章标题。`)
  if (!content) throw new Error(`正文为空，无法创建草稿。`)

  const accessToken = await getStableAccessToken(appId, appSecret)
  const sources = findImageSources(content)
  const uploaded = new Map()
  let firstPreparedImage = null

  for (const source of sources) {
    const localImage = await readPublishImage(source, projectId, projectStore)
    if (!localImage) continue
    const prepared = await prepareImageForWechat(localImage.buffer, localImage.name)
    if (!firstPreparedImage) firstPreparedImage = prepared
    const wechatUrl = await uploadInlineImage(accessToken, prepared)
    uploaded.set(source, wechatUrl)
    content = replaceImageSource(content, source, wechatUrl)
  }

  const selectedCover = await readCoverImage(String(payload.coverPath || ``).trim())
  const preparedCover = selectedCover
    ? await prepareImageForWechat(selectedCover.buffer, selectedCover.name)
    : firstPreparedImage
  if (!preparedCover) throw new Error(`请选择封面图，或先在正文中加入一张本地图片。`)
  const thumbMediaId = await uploadCover(accessToken, preparedCover)

  const draftPayload = await fetchJson(`${WECHAT_API_ROOT}/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: `POST`,
    headers: { 'content-type': `application/json; charset=utf-8` },
    body: JSON.stringify({
      articles: [{
        article_type: `news`,
        title,
        author,
        digest,
        content,
        content_source_url: ``,
        thumb_media_id: thumbMediaId,
        need_open_comment: 1,
        only_fans_can_comment: 0,
      }],
    }),
  }, `创建公众号草稿失败`)
  if (!draftPayload.media_id) throw new Error(`微信没有返回草稿编号。`)

  return {
    mediaId: draftPayload.media_id,
    uploadedImageCount: uploaded.size,
    usedSelectedCover: Boolean(selectedCover),
  }
}

export const wechatPublisherInternals = {
  findImageSources,
  isWechatHostedImage,
  replaceImageSource,
  wechatErrorMessage,
}

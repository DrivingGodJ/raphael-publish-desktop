import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'

export const metadataFileName = `project.json`
export const articleFileName = `正文.md`
export const imageDirectoryName = `图片`
const maxImageBytes = 30 * 1024 * 1024
const maxImagesPerImport = 200

function normalizeProjectId(value) {
  const projectId = String(value || ``)
  if (!/^\d{14}-[a-f0-9]{6}$/.test(projectId))
    throw new Error(`项目编号无效。`)
  return projectId
}

export function sanitizeFileName(value, fallback = `未命名项目`) {
  const sanitized = String(value || ``)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ` `)
    .replace(/\s+/g, ` `)
    .replace(/[. ]+$/g, ``)
    .trim()
    .slice(0, 80)
  return sanitized || fallback
}

function createProjectId() {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, `0`),
    String(now.getDate()).padStart(2, `0`),
    String(now.getHours()).padStart(2, `0`),
    String(now.getMinutes()).padStart(2, `0`),
    String(now.getSeconds()).padStart(2, `0`),
  ].join(``)
  return `${timestamp}-${randomBytes(3).toString(`hex`)}`
}

export function ensurePathInside(parent, candidate) {
  const parentPath = resolve(parent)
  const candidatePath = resolve(candidate)
  if (candidatePath !== parentPath && !candidatePath.startsWith(`${parentPath}${sep}`))
    throw new Error(`项目路径越界。`)
  return candidatePath
}

export function extractImageReferences(markdown) {
  const references = []
  const seen = new Set()
  const patterns = [
    { expression: /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g, kind: `markup` },
    { expression: /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, kind: `markup` },
  ]
  for (const { expression, kind } of patterns) {
    let match
    while ((match = expression.exec(markdown)) !== null) {
      const source = String(match[1] || match[2] || ``).trim()
      if (!source || seen.has(source)) continue
      if (!/^https?:\/\//i.test(source) && !/^data:image\//i.test(source)) continue
      seen.add(source)
      references.push({ source, kind })
      if (references.length >= maxImagesPerImport) return references
    }
  }

  const bareUrlPattern = /^[ \t]*(https?:\/\/\S+)[ \t]*$/gmi
  let bareMatch
  while ((bareMatch = bareUrlPattern.exec(String(markdown))) !== null) {
    const source = bareMatch[1].trim()
    if (seen.has(source)) continue
    seen.add(source)
    references.push({ source, kind: `bare` })
    if (references.length >= maxImagesPerImport) return references
  }
  return references
}

export function extractImageSources(markdown) {
  return extractImageReferences(markdown).map(reference => reference.source)
}

export function extractLocalProjectImageFiles(markdown) {
  const files = new Set()
  const patterns = [
    /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  ]
  for (const expression of patterns) {
    let match
    while ((match = expression.exec(String(markdown))) !== null) {
      const source = String(match[1] || match[2] || ``).trim().replace(/\\/g, `/`).replace(/^\.\//, ``)
      if (!source.startsWith(`${imageDirectoryName}/`)) continue
      const relativeName = source.slice(`${imageDirectoryName}/`.length)
      if (!relativeName || relativeName.includes(`/`) || relativeName === `.` || relativeName === `..`) continue
      files.add(relativeName)
    }
  }
  const fallbackExpression = new RegExp(`${imageDirectoryName}/[^\\n)>"']+`, `g`)
  let fallbackMatch
  while ((fallbackMatch = fallbackExpression.exec(String(markdown))) !== null) {
    const source = fallbackMatch[0].trim().replace(/[，。；;,]+$/, ``)
    const relativeName = source.slice(`${imageDirectoryName}/`.length)
    if (relativeName && !relativeName.includes(`/`) && relativeName !== `.` && relativeName !== `..`)
      files.add(relativeName)
  }
  return [...files]
}

function replaceImageReference(markdown, reference, localFile) {
  if (reference.kind !== `bare`) return markdown.split(reference.source).join(localFile)
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (line.trim() !== reference.source) return line
      const indentation = line.match(/^[ \t]*/)?.[0] || ``
      return `${indentation}![](${localFile})`
    })
    .join(`\n`)
}

function getSupportedImageExtension(buffer, contentType) {
  const extension = sniffImageExtension(buffer) || extensionFromMime(contentType)
  if (!extension) throw new Error(`链接返回的内容不是受支持的图片。`)
  return extension
}

function sniffImageExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return `.png`
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return `.jpg`
  if (buffer.length >= 6 && [`GIF87a`, `GIF89a`].includes(buffer.subarray(0, 6).toString(`ascii`))) return `.gif`
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString(`ascii`) === `RIFF` && buffer.subarray(8, 12).toString(`ascii`) === `WEBP`) return `.webp`
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString(`ascii`).includes(`ftypavif`)) return `.avif`
  return null
}

function extensionFromMime(contentType) {
  const mime = String(contentType || ``).split(`;`)[0].trim().toLowerCase()
  return new Map([
    [`image/png`, `.png`],
    [`image/jpeg`, `.jpg`],
    [`image/gif`, `.gif`],
    [`image/webp`, `.webp`],
    [`image/avif`, `.avif`],
    [`image/svg+xml`, `.svg`],
  ]).get(mime) || null
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase()
  return host === `localhost`
    || host === `::1`
    || host.endsWith(`.local`)
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

async function downloadImage(source) {
  if (source.startsWith(`data:image/`)) {
    const match = source.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
    if (!match) throw new Error(`无法解析粘贴图片。`)
    const buffer = match[2]
      ? Buffer.from(match[3], `base64`)
      : Buffer.from(decodeURIComponent(match[3]), `utf8`)
    if (buffer.length === 0 || buffer.length > maxImageBytes) throw new Error(`图片为空或超过 30 MB。`)
    return { buffer, contentType: match[1] }
  }

  const url = new URL(source)
  if (![`http:`, `https:`].includes(url.protocol) || isPrivateHost(url.hostname)) throw new Error(`不支持该图片地址。`)
  const response = await fetch(url, {
    headers: {
      'referer': `https://flowus.cn/`,
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36`,
    },
    redirect: `follow`,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`下载失败（${response.status}）。`)
  const finalUrl = new URL(response.url)
  if (![`http:`, `https:`].includes(finalUrl.protocol) || isPrivateHost(finalUrl.hostname)) throw new Error(`图片跳转到了不安全的地址。`)
  const contentLength = Number.parseInt(response.headers.get(`content-length`) || `0`, 10)
  if (contentLength > maxImageBytes) throw new Error(`图片超过 30 MB。`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0 || buffer.length > maxImageBytes) throw new Error(`图片为空或超过 30 MB。`)
  return { buffer, contentType: response.headers.get(`content-type`) || `` }
}

function chooseImageFileName(source, index, extension) {
  let sourceName = `图片`
  try {
    if (/^https?:\/\//i.test(source)) sourceName = decodeURIComponent(basename(new URL(source).pathname)) || sourceName
  }
  catch {
    // Use the generic name.
  }
  const stem = sanitizeFileName(sourceName.replace(extname(sourceName), ``), `图片`).slice(0, 48)
  const digest = createHash(`sha256`).update(source).digest(`hex`).slice(0, 8)
  return `${String(index + 1).padStart(3, `0`)}_${stem}_${digest}${extension}`
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile()
  }
  catch {
    return false
  }
}

export function createProjectStore(projectsRootInput, options = {}) {
  const projectsRoot = resolve(projectsRootInput)
  const discardFile = typeof options.discardFile === `function` ? options.discardFile : unlink

  async function writeMetadata(projectDirectory, metadata) {
    await writeFile(join(projectDirectory, metadataFileName), `${JSON.stringify(metadata, null, 2)}\n`, `utf8`)
  }

  async function listProjects() {
    await mkdir(projectsRoot, { recursive: true })
    const entries = await readdir(projectsRoot, { withFileTypes: true })
    const projects = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const projectDirectory = ensurePathInside(projectsRoot, join(projectsRoot, entry.name))
        const metadata = JSON.parse(await readFile(join(projectDirectory, metadataFileName), `utf8`))
        normalizeProjectId(metadata.id)
        projects.push({ ...metadata, folderName: entry.name })
      }
      catch {
        // Ignore folders that are not Raphael projects.
      }
    }
    return projects.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  }

  async function findProject(projectId) {
    const normalizedId = normalizeProjectId(projectId)
    const project = (await listProjects()).find(item => item.id === normalizedId)
    if (!project) throw new Error(`项目不存在，可能已经被删除。`)
    return {
      metadata: project,
      projectDirectory: ensurePathInside(projectsRoot, join(projectsRoot, project.folderName)),
    }
  }

  async function readProject(projectId) {
    const { metadata, projectDirectory } = await findProject(projectId)
    return { ...metadata, markdown: await readFile(join(projectDirectory, articleFileName), `utf8`) }
  }

  async function createProject({ name, markdown = `` }) {
    const title = sanitizeFileName(name)
    const projectId = createProjectId()
    const folderName = `${title}__${projectId}`
    const projectDirectory = ensurePathInside(projectsRoot, join(projectsRoot, folderName))
    await mkdir(ensurePathInside(projectDirectory, join(projectDirectory, imageDirectoryName)), { recursive: true })
    const now = new Date().toISOString()
    const content = String(markdown).trim() || `# ${title}\n\n`
    const metadata = {
      id: projectId,
      title,
      folderName,
      articleFile: articleFileName,
      imageDirectory: imageDirectoryName,
      createdAt: now,
      updatedAt: now,
      imageCount: 0,
      failedImageCount: 0,
      imageMappings: [],
      themeId: `apple`,
    }
    await writeFile(join(projectDirectory, articleFileName), content, `utf8`)
    await writeMetadata(projectDirectory, metadata)
    return { ...metadata, markdown: content }
  }

  async function importProject({ name, markdown }) {
    const content = String(markdown || ``).trim()
    if (!content) throw new Error(`请先粘贴文章内容。`)
    const project = await createProject({ name, markdown: content })
    const { projectDirectory } = await findProject(project.id)
    const imageDirectory = ensurePathInside(projectDirectory, join(projectDirectory, imageDirectoryName))
    const references = extractImageReferences(content)
    const mappings = []
    const failures = []
    let localizedMarkdown = content

    for (const [index, reference] of references.entries()) {
      const { source } = reference
      try {
        const downloaded = await downloadImage(source)
        const extension = getSupportedImageExtension(downloaded.buffer, downloaded.contentType)
        const fileName = chooseImageFileName(source, index, extension)
        const localFile = `${imageDirectoryName}/${fileName}`
        await writeFile(ensurePathInside(imageDirectory, join(imageDirectory, fileName)), downloaded.buffer)
        localizedMarkdown = replaceImageReference(localizedMarkdown, reference, localFile)
        mappings.push({ originalUrl: source, localFile, fileName, bytes: downloaded.buffer.length })
      }
      catch (error) {
        failures.push({
          originalUrl: source.slice(0, 500),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const metadata = {
      ...project,
      updatedAt: new Date().toISOString(),
      sourceImageCount: references.length,
      imageCount: mappings.length,
      failedImageCount: failures.length,
      imageMappings: mappings,
      imageFailures: failures,
    }
    delete metadata.markdown
    await writeFile(join(projectDirectory, articleFileName), localizedMarkdown, `utf8`)
    await writeMetadata(projectDirectory, metadata)
    return { ...metadata, markdown: localizedMarkdown }
  }

  async function updateProjectImages({ id, markdown, themeId }) {
    const { metadata, projectDirectory } = await findProject(id)
    const content = String(markdown ?? await readFile(join(projectDirectory, articleFileName), `utf8`))
    const imageDirectory = ensurePathInside(projectDirectory, join(projectDirectory, imageDirectoryName))
    await mkdir(imageDirectory, { recursive: true })

    const references = extractImageReferences(content)
    const mappings = Array.isArray(metadata.imageMappings) ? [...metadata.imageMappings] : []
    const mappingBySource = new Map(mappings.map(mapping => [mapping.originalUrl, mapping]))
    const failures = []
    let localizedMarkdown = content
    let downloadedImageCount = 0
    let reusedImageCount = 0

    for (const reference of references) {
      const { source } = reference
      const existing = mappingBySource.get(source)
      if (existing) {
        const existingName = basename(String(existing.fileName || existing.localFile || ``))
        const existingPath = ensurePathInside(imageDirectory, join(imageDirectory, existingName))
        if (existingName && await isFile(existingPath)) {
          localizedMarkdown = replaceImageReference(localizedMarkdown, reference, existing.localFile)
          reusedImageCount += 1
          continue
        }
      }

      try {
        const downloaded = await downloadImage(source)
        const extension = getSupportedImageExtension(downloaded.buffer, downloaded.contentType)
        const fileName = chooseImageFileName(source, mappings.length, extension)
        const localFile = `${imageDirectoryName}/${fileName}`
        await writeFile(ensurePathInside(imageDirectory, join(imageDirectory, fileName)), downloaded.buffer)
        localizedMarkdown = replaceImageReference(localizedMarkdown, reference, localFile)

        const mapping = { originalUrl: source, localFile, fileName, bytes: downloaded.buffer.length }
        const existingIndex = mappings.findIndex(item => item.originalUrl === source)
        if (existingIndex >= 0) mappings[existingIndex] = mapping
        else mappings.push(mapping)
        mappingBySource.set(source, mapping)
        downloadedImageCount += 1
      }
      catch (error) {
        failures.push({
          originalUrl: source.slice(0, 500),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const activeImageFiles = new Set(extractLocalProjectImageFiles(localizedMarkdown))
    const imageEntries = await readdir(imageDirectory, { withFileTypes: true })
    let removedImageCount = 0
    let remainingImageCount = 0
    const remainingImageFiles = new Set()
    for (const entry of imageEntries) {
      if (!entry.isFile()) continue
      if (activeImageFiles.has(entry.name)) {
        remainingImageCount += 1
        remainingImageFiles.add(entry.name)
        continue
      }
      const unusedPath = ensurePathInside(imageDirectory, join(imageDirectory, entry.name))
      await discardFile(unusedPath)
      removedImageCount += 1
    }
    const activeMappings = mappings.filter(mapping => remainingImageFiles.has(basename(String(mapping.fileName || mapping.localFile || ``))))

    const updated = {
      ...metadata,
      updatedAt: new Date().toISOString(),
      themeId: String(themeId || metadata.themeId || `apple`),
      sourceImageCount: remainingImageCount + failures.length,
      imageCount: remainingImageCount,
      failedImageCount: failures.length,
      imageMappings: activeMappings,
      imageFailures: failures,
    }
    await writeFile(join(projectDirectory, articleFileName), localizedMarkdown, `utf8`)
    await writeMetadata(projectDirectory, updated)

    return {
      project: { ...updated, markdown: localizedMarkdown },
      scannedImageCount: references.length,
      downloadedImageCount,
      reusedImageCount,
      failedImageCount: failures.length,
      removedImageCount,
    }
  }

  async function saveProject({ id, markdown, themeId }) {
    const { metadata, projectDirectory } = await findProject(id)
    const updated = { ...metadata, themeId: String(themeId || metadata.themeId || `apple`), updatedAt: new Date().toISOString() }
    await writeFile(join(projectDirectory, articleFileName), String(markdown ?? ``), `utf8`)
    await writeMetadata(projectDirectory, updated)
    return updated
  }

  async function renameProject({ id, name }) {
    const { metadata, projectDirectory } = await findProject(id)
    const updated = { ...metadata, title: sanitizeFileName(name), updatedAt: new Date().toISOString() }
    await writeMetadata(projectDirectory, updated)
    return updated
  }

  return {
    createProject,
    findProject,
    importProject,
    listProjects,
    projectsRoot,
    readProject,
    renameProject,
    saveProject,
    updateProjectImages,
  }
}

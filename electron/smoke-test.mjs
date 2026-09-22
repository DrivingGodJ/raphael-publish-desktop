import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createProjectStore, extractImageReferences, extractImageSources, extractLocalProjectImageFiles, imageDirectoryName } from './project-store.mjs'

const sourceFile = process.env.RAPHAEL_IMPORT_SAMPLE
const embeddedSample = `# FlowUs 粘贴格式测试

![第一张图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)

![第二张图片](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)`

const temporaryRoot = await mkdtemp(join(tmpdir(), `raphael-project-test-`))
const store = createProjectStore(temporaryRoot)
const {
  createProject,
  importProject,
  listProjects: readProjectRecords,
  readProject,
  renameProject,
  saveProject,
  updateProjectImages,
} = store

try {
  const sample = sourceFile ? await readFile(sourceFile, `utf8`) : embeddedSample
  const imageSources = extractImageSources(sample)
  const imageSource = imageSources[0]
  const secondImageSource = imageSources.find(source => source !== imageSource)
  assert(imageSource && secondImageSource, `The sample did not contain two distinct Markdown images.`)
  assert.deepEqual(
    extractImageReferences(`正文\n\nhttps://example.com/new-image.jpg\n\n[普通链接](https://example.com/page)`),
    [{ source: `https://example.com/new-image.jpg`, kind: `bare` }],
  )
  assert.deepEqual(extractLocalProjectImageFiles(`![带空格的图](图片/001_带 空格.jpg)`), [`001_带 空格.jpg`])

  const blank = await createProject({ name: `新建项目测试` })
  assert.match(blank.id, /^\d{14}-[a-f0-9]{6}$/)
  await saveProject({ id: blank.id, markdown: `# 已保存`, themeId: `wechat` })
  await renameProject({ id: blank.id, name: `重命名项目测试` })
  const saved = await readProject(blank.id)
  assert.equal(saved.markdown, `# 已保存`)
  assert.equal(saved.title, `重命名项目测试`)

  const imported = await importProject({
    name: `FlowUs 粘贴导入测试`,
    markdown: `## 导入测试\n\n${imageSource ? `![测试图片](${imageSource})` : ``}`,
  })
  assert.equal(imported.sourceImageCount, 1)
  assert.equal(imported.imageCount, 1)
  assert.equal(imported.failedImageCount, 0)
  assert.match(imported.markdown, /图片\/001_/)

  const importedProject = await readProject(imported.id)
  const localImage = importedProject.imageMappings?.[0]?.localFile
  assert(localImage)
  const { size } = await stat(join(temporaryRoot, imported.folderName, ...localImage.split(`/`)))
  assert(size > 0)

  const imageUpdate = await updateProjectImages({
    id: imported.id,
    markdown: `${imported.markdown}\n\n![复用图片](${imageSource})\n\n![新增图片](${secondImageSource})`,
    themeId: `apple`,
  })
  assert.equal(imageUpdate.scannedImageCount, 2)
  assert.equal(imageUpdate.downloadedImageCount, 1)
  assert.equal(imageUpdate.reusedImageCount, 1)
  assert.equal(imageUpdate.failedImageCount, 0)
  assert.equal(imageUpdate.project.imageCount, 2)
  assert.doesNotMatch(imageUpdate.project.markdown, /https?:\/\/|data:image\//)
  assert.equal(imageUpdate.removedImageCount, 0)

  const secondMapping = imageUpdate.project.imageMappings.find(mapping => mapping.originalUrl === secondImageSource)
  assert(secondMapping)
  assert.deepEqual(extractLocalProjectImageFiles(imageUpdate.project.markdown).sort(), imageUpdate.project.imageMappings.map(mapping => mapping.fileName).sort())
  const cleanupMarkdown = imageUpdate.project.markdown
    .split(/\r?\n/)
    .filter(line => !line.includes(secondMapping.localFile))
    .join(`\n`)
  const cleanupUpdate = await updateProjectImages({ id: imported.id, markdown: cleanupMarkdown, themeId: `apple` })
  assert.equal(cleanupUpdate.scannedImageCount, 0)
  assert.equal(cleanupUpdate.removedImageCount, 1)
  assert.equal(cleanupUpdate.project.imageCount, 1)
  assert.equal(cleanupUpdate.project.imageMappings.length, 1)
  await assert.rejects(
    () => stat(join(temporaryRoot, imported.folderName, imageDirectoryName, secondMapping.fileName)),
    error => error?.code === `ENOENT`,
  )

  const projects = await readProjectRecords()
  assert.equal(projects.length, 2)
  process.stdout.write(`${JSON.stringify({
    projectCreateSaveRename: true,
    flowUsMarkdownImport: true,
    downloadedImages: imported.imageCount,
    incrementalImageUpdate: true,
    newlyDownloadedImages: imageUpdate.downloadedImageCount,
    reusedImages: imageUpdate.reusedImageCount,
    unusedImageCleanup: true,
    localImageBytes: size,
    projectCount: projects.length,
  }, null, 2)}\n`)
}
finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

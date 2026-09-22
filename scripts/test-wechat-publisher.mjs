import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectStore } from '../electron/project-store.mjs'
import { prepareImageForWechat, publishWechatDraft, wechatPublisherInternals } from '../electron/wechat-publisher.mjs'

const originalPng = Buffer.from(`iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=`, `base64`)
const prepared = await prepareImageForWechat(originalPng, `cover.png`)
assert.equal(prepared.mime, `image/png`)
assert.equal(prepared.buffer, originalPng)
await assert.rejects(
  () => prepareImageForWechat(Buffer.from(`GIF89a`, `ascii`), `cover.gif`),
  /只接受 JPG 或 PNG/,
)

const sampleHtml = '<section><img src="raphael-asset://project/id/%E5%9B%BE%E7%89%87/a.png"><img data-src="https://mmbiz.qpic.cn/a"></section>'
assert.deepEqual(wechatPublisherInternals.findImageSources(sampleHtml), [
  `raphael-asset://project/id/%E5%9B%BE%E7%89%87/a.png`,
  `https://mmbiz.qpic.cn/a`,
])
assert.equal(wechatPublisherInternals.isWechatHostedImage(`https://mmbiz.qpic.cn/a`), true)
assert.match(wechatPublisherInternals.wechatErrorMessage({ errcode: 40164, errmsg: `invalid ip 203.0.113.7, not in whitelist` }, `失败`), /IP.*白名单.*203\.0\.113\.7/)

const temporaryRoot = await mkdtemp(join(tmpdir(), `raphael-wechat-publish-test-`))
const originalFetch = globalThis.fetch
let submittedDraft = null
try {
  const store = createProjectStore(temporaryRoot)
  const project = await store.importProject({
    name: `发布测试`,
    markdown: `# 发布测试\n\n![图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)`,
  })
  const fileName = project.imageMappings[0].fileName
  const localUrl = `raphael-asset://project/${project.id}/%E5%9B%BE%E7%89%87/${encodeURIComponent(fileName)}`

  globalThis.fetch = async (url, options = {}) => {
    const address = String(url)
    if (address.includes(`/stable_token`)) return Response.json({ access_token: `test-access-token`, expires_in: 7200 })
    if (address.includes(`/media/uploadimg`)) return Response.json({ url: `https://mmbiz.qpic.cn/test-image` })
    if (address.includes(`/material/add_material`)) return Response.json({ media_id: `cover-media-id` })
    if (address.includes(`/draft/add`)) {
      submittedDraft = JSON.parse(String(options.body))
      return Response.json({ media_id: `draft-media-id` })
    }
    throw new Error(`Unexpected URL: ${address}`)
  }

  const published = await publishWechatDraft({
    projectId: project.id,
    appId: `wx-app-id`,
    appSecret: `secret`,
    title: `发布测试`,
    author: ``,
    digest: ``,
    content: `<section><p>正文</p><img src="${localUrl}"></section>`,
  }, store)
  assert.equal(published.mediaId, `draft-media-id`)
  assert.equal(published.uploadedImageCount, 1)
  assert.match(submittedDraft.articles[0].content, /https:\/\/mmbiz\.qpic\.cn\/test-image/)
  assert.doesNotMatch(submittedDraft.articles[0].content, /raphael-asset:/)
}
finally {
  globalThis.fetch = originalFetch
  await rm(temporaryRoot, { recursive: true, force: true })
}

process.stdout.write(`${JSON.stringify({
  originalImagePreservation: true,
  unsupportedFormatRejection: true,
  imageSourceDiscovery: true,
  wechatErrorHints: true,
  mockedDraftPublish: true,
  preparedBytes: prepared.buffer.length,
}, null, 2)}\n`)

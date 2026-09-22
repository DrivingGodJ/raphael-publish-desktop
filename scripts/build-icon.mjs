import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import pngToIco from 'png-to-ico'

const root = resolve(import.meta.dirname, `..`)
const svg = await readFile(resolve(root, `favicon.svg`), `utf8`)
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString(`base64`)}`
const edgePath = `C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:256px;height:256px;background:transparent}img{display:block;width:256px;height:256px}</style><img src="${dataUrl}">`)
  await page.locator(`img`).waitFor({ state: `visible` })
  await page.screenshot({ path: resolve(root, `build`, `icon.png`), omitBackground: true })
  const ico = await pngToIco(resolve(root, `build`, `icon.png`))
  await writeFile(resolve(root, `build`, `icon.ico`), ico)
}
finally {
  await browser.close()
}

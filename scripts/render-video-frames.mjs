import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright'

const FRAME_COUNT = Number(process.env.COIN_FRAME_COUNT || 360)
const WIDTH = Number(process.env.COIN_RENDER_WIDTH || 1440)
const HEIGHT = Number(process.env.COIN_RENDER_HEIGHT || 1440)
const BASE_URL = process.env.COIN_RENDER_URL || 'http://127.0.0.1:4173/?capture=1'
const OUTPUT_DIR = path.resolve(process.env.COIN_FRAME_DIR || 'render-frames')

if (!Number.isInteger(FRAME_COUNT) || FRAME_COUNT < 2) {
  throw new Error('COIN_FRAME_COUNT must be an integer greater than 1')
}

await rm(OUTPUT_DIR, { recursive: true, force: true })
await mkdir(OUTPUT_DIR, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
})

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })

  page.on('console', (message) => {
    const type = message.type()
    if (type === 'warning' || type === 'error') {
      console.log(`[browser:${type}] ${message.text()}`)
    }
  })

  page.on('pageerror', (error) => {
    console.error('[browser:pageerror]', error)
  })

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 120_000 })

  const webglReady = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return false
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  })

  if (!webglReady) {
    throw new Error('WebGL is unavailable in the render browser')
  }

  await page.waitForFunction(
    () => window.coinCapture?.isReady?.() === true,
    null,
    { timeout: 120_000 },
  )

  await page.evaluate(() => {
    window.coinQuality?.ultra?.()
    window.coinColor?.green?.()
    window.logoColor?.default?.()
    window.coinRaised?.set?.(0.07)
  })

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    await page.evaluate(
      ({ frameIndex, totalFrames }) => {
        window.coinCapture.setFrame(frameIndex, totalFrames)
      },
      { frameIndex: frame, totalFrames: FRAME_COUNT },
    )

    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )

    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) throw new Error('Capture canvas disappeared')
      return canvas.toDataURL('image/png')
    })

    const prefix = 'data:image/png;base64,'
    if (!dataUrl.startsWith(prefix)) {
      throw new Error('Unexpected canvas image format')
    }

    const filename = `frame-${String(frame).padStart(6, '0')}.png`
    await writeFile(
      path.join(OUTPUT_DIR, filename),
      Buffer.from(dataUrl.slice(prefix.length), 'base64'),
    )

    if (frame % 30 === 0 || frame === FRAME_COUNT - 1) {
      console.log(`Rendered ${frame + 1}/${FRAME_COUNT}`)
    }
  }
} finally {
  await browser.close()
}

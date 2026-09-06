import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright'

const FRAME_COUNT = Number(process.env.COIN_FRAME_COUNT || 524)
const WIDTH = Number(process.env.COIN_RENDER_WIDTH || 1440)
const HEIGHT = Number(process.env.COIN_RENDER_HEIGHT || 1440)
const SAMPLES = Number(process.env.COIN_RENDER_SAMPLES || 10)
const BASE_URL = process.env.COIN_RENDER_URL || 'http://127.0.0.1:4173/?capture=1&alpha=1'
const OUTPUT_DIR = path.resolve(process.env.COIN_FRAME_DIR || 'render-transparent-frames')

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const executablePath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))

if (!executablePath) {
  throw new Error('No installed Chrome/Chromium found. Set CHROME_PATH to your browser executable.')
}
if (!Number.isInteger(FRAME_COUNT) || FRAME_COUNT < 2) {
  throw new Error('COIN_FRAME_COUNT must be an integer greater than 1')
}
if (!Number.isInteger(SAMPLES) || SAMPLES < 1 || SAMPLES > 32) {
  throw new Error('COIN_RENDER_SAMPLES must be an integer from 1 to 32')
}
if (!Number.isInteger(WIDTH) || !Number.isInteger(HEIGHT) || WIDTH < 1 || HEIGHT < 1) {
  throw new Error('COIN_RENDER_WIDTH and COIN_RENDER_HEIGHT must be positive integers')
}

function halton(index, base) {
  let result = 0
  let fraction = 1 / base
  let value = index

  while (value > 0) {
    result += fraction * (value % base)
    value = Math.floor(value / base)
    fraction /= base
  }

  return result
}

const jitterOffsets = Array.from({ length: SAMPLES }, (_, index) => [
  halton(index + 1, 2) - 0.5,
  halton(index + 1, 3) - 0.5,
])

await rm(OUTPUT_DIR, { recursive: true, force: true })
await mkdir(OUTPUT_DIR, { recursive: true })

console.log(`[3d-gold-coin] Browser: ${executablePath}`)
console.log(`[3d-gold-coin] Frames: ${FRAME_COUNT}, samples per frame: ${SAMPLES}`)

const browser = await chromium.launch({
  executablePath,
  headless: false,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
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

  await page.waitForFunction(
    () => window.coinCapture?.isReady?.() === true && window.coinCaptureCamera?.setJitter,
    null,
    { timeout: 120_000 },
  )

  const gpuInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { renderer: 'unknown', vendor: 'unknown' }

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return { renderer: 'WebGL unavailable', vendor: 'unknown' }

    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      vendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR),
    }
  })

  console.log(`[3d-gold-coin] WebGL vendor: ${gpuInfo.vendor}`)
  console.log(`[3d-gold-coin] WebGL renderer: ${gpuInfo.renderer}`)

  if (/swiftshader|llvmpipe|software/i.test(gpuInfo.renderer)) {
    throw new Error('Chrome is using software rendering. Refusing the HQ GPU render.')
  }

  await page.evaluate(() => {
    window.coinQuality.ultra()
    window.coinColor.green()
    window.logoColor.default()
    window.coinRaised.set(0.07)
    window.coinCapture.setProgress(0)
  })

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const dataUrl = await page.evaluate(
      async ({ frameIndex, totalFrames, offsets }) => {
        const canvas = document.querySelector('canvas')
        if (!canvas) throw new Error('Capture canvas disappeared')

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        if (!gl) throw new Error('WebGL context disappeared')

        const width = gl.drawingBufferWidth
        const height = gl.drawingBufferHeight
        const pixelCount = width * height * 4
        const accumulator = new Uint32Array(pixelCount)
        const pixels = new Uint8Array(pixelCount)

        for (const [jitterX, jitterY] of offsets) {
          window.coinCapture.setFrame(frameIndex, totalFrames)
          window.coinCaptureCamera.setJitter(jitterX, jitterY)

          await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          })

          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          for (let index = 0; index < pixelCount; index += 1) {
            accumulator[index] += pixels[index]
          }
        }

        window.coinCaptureCamera.clearJitter()

        const averaged = new Uint8ClampedArray(pixelCount)
        const rowLength = width * 4
        const sampleCount = offsets.length

        for (let sourceY = 0; sourceY < height; sourceY += 1) {
          const destinationY = height - 1 - sourceY
          const sourceRow = sourceY * rowLength
          const destinationRow = destinationY * rowLength

          for (let x = 0; x < rowLength; x += 1) {
            averaged[destinationRow + x] = Math.round(
              accumulator[sourceRow + x] / sampleCount,
            )
          }
        }

        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = width
        outputCanvas.height = height
        const context = outputCanvas.getContext('2d')
        if (!context) throw new Error('2D output canvas unavailable')

        context.putImageData(new ImageData(averaged, width, height), 0, 0)
        return outputCanvas.toDataURL('image/png')
      },
      {
        frameIndex: frame,
        totalFrames: FRAME_COUNT,
        offsets: jitterOffsets,
      },
    )

    const prefix = 'data:image/png;base64,'
    if (!dataUrl.startsWith(prefix)) throw new Error('Unexpected canvas image format')

    const filename = `frame-${String(frame).padStart(6, '0')}.png`
    await writeFile(
      path.join(OUTPUT_DIR, filename),
      Buffer.from(dataUrl.slice(prefix.length), 'base64'),
    )

    if (frame % 10 === 0 || frame === FRAME_COUNT - 1) {
      console.log(`Rendered ${frame + 1}/${FRAME_COUNT} (${SAMPLES}x samples)`)
    }
  }
} finally {
  await browser.close()
}

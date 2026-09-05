import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright'

const WIDTH = Number(process.env.COIN_RENDER_WIDTH || 1440)
const HEIGHT = Number(process.env.COIN_RENDER_HEIGHT || 1440)
const CAPTURE_FPS = Number(process.env.COIN_CAPTURE_FPS || 60)
const DURATION_SECONDS = Number(process.env.COIN_DURATION_SECONDS || 8.73)
const BASE_URL = process.env.COIN_RENDER_URL || 'http://127.0.0.1:4173/?capture=1'
const OUTPUT_FILE = path.resolve(process.env.COIN_VIDEO_FILE || 'media/coin-master.webm')

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const executablePath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))

if (!executablePath) {
  throw new Error(
    'No installed Chrome/Chromium found. Set CHROME_PATH to your browser executable.',
  )
}

if (!Number.isFinite(WIDTH) || WIDTH < 1 || !Number.isFinite(HEIGHT) || HEIGHT < 1) {
  throw new Error('COIN_RENDER_WIDTH and COIN_RENDER_HEIGHT must be positive numbers')
}

if (!Number.isFinite(CAPTURE_FPS) || CAPTURE_FPS < 1 || CAPTURE_FPS > 60) {
  throw new Error('COIN_CAPTURE_FPS must be between 1 and 60')
}

if (!Number.isFinite(DURATION_SECONDS) || DURATION_SECONDS <= 0) {
  throw new Error('COIN_DURATION_SECONDS must be greater than 0')
}

await rm(OUTPUT_FILE, { force: true })
await mkdir(path.dirname(OUTPUT_FILE), { recursive: true })

console.log(`[3d-gold-coin] Browser: ${executablePath}`)

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
    () => window.coinCapture?.isReady?.() === true,
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
    console.warn(
      '[3d-gold-coin] WARNING: Chrome is using software rendering instead of the GPU.',
    )
  }

  await page.evaluate(() => {
    window.coinQuality?.ultra?.()
    window.coinColor?.green?.()
    window.logoColor?.default?.()
    window.coinRaised?.set?.(0.07)
    window.coinCapture?.setProgress?.(0)
  })

  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )

  console.log(
    `Recording one full rotation at ${WIDTH}x${HEIGHT}, target ${CAPTURE_FPS} fps, ${DURATION_SECONDS}s`,
  )

  const recording = await page.evaluate(
    async ({ captureFps, durationSeconds }) => {
      const canvas = document.querySelector('canvas')
      if (!canvas) throw new Error('WebGL canvas not found')
      if (typeof canvas.captureStream !== 'function') {
        throw new Error('canvas.captureStream() is unavailable')
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is unavailable')
      }

      const preferredTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ]
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('No supported WebM MediaRecorder codec found')

      const stream = canvas.captureStream(captureFps)
      const chunks = []
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 18_000_000,
      })

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })

      const stopped = new Promise((resolve, reject) => {
        recorder.addEventListener('stop', resolve, { once: true })
        recorder.addEventListener(
          'error',
          (event) => reject(event.error || new Error('MediaRecorder failed')),
          { once: true },
        )
      })

      window.coinCapture.setProgress(0)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      recorder.start(500)

      const startedAt = performance.now()
      await new Promise((resolve) => {
        const animate = (now) => {
          const elapsedSeconds = (now - startedAt) / 1000

          if (elapsedSeconds >= durationSeconds) {
            const finalProgress = Math.max(0, 1 - 1 / (captureFps * durationSeconds))
            window.coinCapture.setProgress(finalProgress)
            requestAnimationFrame(resolve)
            return
          }

          window.coinCapture.setProgress(elapsedSeconds / durationSeconds)
          requestAnimationFrame(animate)
        }

        requestAnimationFrame(animate)
      })

      recorder.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())

      const blob = new Blob(chunks, { type: mimeType })
      const bytes = new Uint8Array(await blob.arrayBuffer())

      let binary = ''
      const chunkSize = 0x8000
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
      }

      return {
        mimeType,
        size: bytes.byteLength,
        base64: btoa(binary),
      }
    },
    { captureFps: CAPTURE_FPS, durationSeconds: DURATION_SECONDS },
  )

  await writeFile(OUTPUT_FILE, Buffer.from(recording.base64, 'base64'))
  console.log(`Recorded ${recording.size} bytes as ${recording.mimeType}`)
  console.log(`Saved ${OUTPUT_FILE}`)
} finally {
  await browser.close()
}

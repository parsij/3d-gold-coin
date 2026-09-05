const RELEASE_BASE =
  'https://github.com/parsij/3d-gold-coin/releases/download/landing-media'

const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra']

const VIDEO_URLS = {
  low: `${RELEASE_BASE}/coin-low.mp4`,
  medium: `${RELEASE_BASE}/coin-medium.mp4`,
  high: `${RELEASE_BASE}/coin-high.mp4`,
  ultra: `${RELEASE_BASE}/coin-ultra.mp4`,
}

export const COIN_POSTER_URL = `${RELEASE_BASE}/coin-poster.webp`

function lowerQuality(a, b) {
  return QUALITY_ORDER[
    Math.min(QUALITY_ORDER.indexOf(a), QUALITY_ORDER.indexOf(b))
  ]
}

function displayQualityCap(cssWidth) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const renderedPixels = cssWidth * dpr

  if (renderedPixels <= 480) return 'low'
  if (renderedPixels <= 720) return 'medium'
  if (renderedPixels <= 1080) return 'high'
  return 'ultra'
}

function networkQualityCap() {
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection

  if (!connection) return 'high'
  if (connection.saveData) return 'low'

  const effectiveType = connection.effectiveType
  const downlink = Number(connection.downlink)

  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'low'
  if (effectiveType === '3g') return 'medium'

  if (Number.isFinite(downlink)) {
    if (downlink < 1.5) return 'low'
    if (downlink < 4) return 'medium'
    if (downlink < 10) return 'high'
    return 'ultra'
  }

  return 'high'
}

export function chooseCoinVideoQuality(cssWidth) {
  return lowerQuality(displayQualityCap(cssWidth), networkQualityCap())
}

export function mountAdaptiveCoinVideo({ video, poster }) {
  if (!(video instanceof HTMLVideoElement)) {
    throw new TypeError('video must be an HTMLVideoElement')
  }

  const reducedMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches

  if (poster instanceof HTMLImageElement) {
    poster.src = COIN_POSTER_URL
  }

  if (reducedMotion) {
    video.removeAttribute('src')
    video.load()
    return { quality: null, reducedMotion: true }
  }

  const cssWidth = video.getBoundingClientRect().width || window.innerWidth
  const quality = chooseCoinVideoQuality(cssWidth)
  const nextSrc = VIDEO_URLS[quality]

  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = nextSrc

  const revealVideo = () => {
    video.dataset.ready = 'true'
    poster?.setAttribute('data-video-ready', 'true')
  }

  video.addEventListener('playing', revealVideo, { once: true })
  video.play().catch(() => {
    // Keep the matching first-frame poster visible if autoplay is blocked.
  })

  return { quality, reducedMotion: false, src: nextSrc }
}

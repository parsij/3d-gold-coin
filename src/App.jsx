import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import GoldCoin from './components/GoldCoin.jsx'

const QUALITY_PRESETS = [
  { name: 'low', dpr: 1, environmentResolution: 128 },
  { name: 'medium', dpr: 1.5, environmentResolution: 256 },
  { name: 'high', dpr: 2.25, environmentResolution: 512 },
  { name: 'ultra', dpr: Number.POSITIVE_INFINITY, environmentResolution: 1024 },
]

const QUALITY_INDEX = new Map(
  QUALITY_PRESETS.map((preset, index) => [preset.name, index]),
)

const AUTO_MAX_TIER = QUALITY_INDEX.get('high')

function isCaptureMode() {
  return new URLSearchParams(window.location.search).get('capture') === '1'
}

function isLikelyMobileDevice() {
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const shortestScreenSide = Math.min(
    window.screen?.width ?? window.innerWidth,
    window.screen?.height ?? window.innerHeight,
  )

  return hasTouch && (coarsePointer || shortestScreenSide <= 1024)
}

function getDefaultManualQualityTier() {
  if (isCaptureMode()) return QUALITY_INDEX.get('ultra')
  return QUALITY_INDEX.get(isLikelyMobileDevice() ? 'high' : 'ultra')
}

function getInitialQualityTier() {
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = navigator.deviceMemory ?? 8

  if (cores <= 4 || memory <= 4) return 0
  if (cores <= 6 || memory <= 6) return 1
  return AUTO_MAX_TIER
}

function performanceBounds(refreshRate) {
  return [Math.min(45, refreshRate * 0.68), Math.min(58, refreshRate * 0.9)]
}

function MovingLights({ qualityTier, captureMode }) {
  const warm = useRef(null)
  const white = useRef(null)

  useFrame(({ clock }) => {
    if (captureMode) {
      warm.current?.position.set(4.7, 1.4, 3.7)
      white.current?.position.set(-4.2, -1.1, 4.4)
      return
    }

    const time = clock.getElapsedTime()

    if (warm.current) {
      warm.current.position.set(
        Math.cos(time * 0.72) * 4.7,
        1.4 + Math.sin(time * 0.52) * 1.1,
        3.7 + Math.sin(time * 0.72) * 1.4,
      )
    }

    if (white.current) {
      white.current.position.set(
        Math.cos(time * 0.48 + Math.PI) * 4.2,
        -1.1 + Math.sin(time * 0.61) * 1.5,
        3.2 + Math.cos(time * 0.48) * 1.2,
      )
    }
  })

  return (
    <>
      <pointLight ref={warm} color="#ffd16a" intensity={58} distance={12} decay={2} />
      {qualityTier > 0 && (
        <pointLight ref={white} color="#ffffff" intensity={42} distance={11} decay={2} />
      )}
    </>
  )
}

function StudioEnvironment({ resolution }) {
  return (
    <Environment key={resolution} resolution={resolution} frames={1}>
      <Lightformer
        form="rect"
        intensity={7.5}
        color="#fff2c9"
        position={[-4, 2.5, 4]}
        rotation={[0, -0.55, 0]}
        scale={[3, 7, 1]}
      />
      <Lightformer
        form="rect"
        intensity={5.5}
        color="#ffffff"
        position={[4.5, 0.5, 3]}
        rotation={[0, 0.7, 0]}
        scale={[2, 6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={4.5}
        color="#ffba3c"
        position={[0, -4, 2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[7, 2, 1]}
      />
      <Lightformer
        form="ring"
        intensity={4}
        color="#fff7db"
        position={[0, 3.8, -3]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={3}
      />
    </Environment>
  )
}

function Scene({ qualityTier, environmentResolution, captureMode }) {
  return (
    <>
      <ambientLight intensity={0.055} />
      <MovingLights qualityTier={qualityTier} captureMode={captureMode} />
      <GoldCoin qualityTier={qualityTier} captureMode={captureMode} />
      <StudioEnvironment resolution={environmentResolution} />
    </>
  )
}

export default function App() {
  const captureMode = isCaptureMode()
  const [adaptiveQualityTier, setAdaptiveQualityTier] = useState(getInitialQualityTier)
  const [manualQualityTier, setManualQualityTier] = useState(getDefaultManualQualityTier)

  const isAdaptive = manualQualityTier === null
  const qualityTier = manualQualityTier ?? adaptiveQualityTier
  const preset = QUALITY_PRESETS[qualityTier]
  const deviceDpr = window.devicePixelRatio || 1
  const dpr = Math.min(deviceDpr, preset.dpr)

  const lowerQuality = useCallback(() => {
    if (!isAdaptive) return
    setAdaptiveQualityTier((current) => Math.max(0, current - 1))
  }, [isAdaptive])

  const raiseQuality = useCallback(() => {
    if (!isAdaptive) return
    setAdaptiveQualityTier((current) => Math.min(AUTO_MAX_TIER, current + 1))
  }, [isAdaptive])

  const useFallbackQuality = useCallback(() => {
    if (!isAdaptive) return
    setAdaptiveQualityTier(0)
  }, [isAdaptive])

  useEffect(() => {
    const setQuality = (value) => {
      const normalized = String(value).trim().toLowerCase()

      if (normalized === 'auto') {
        setManualQualityTier(null)
        console.info('[3d-gold-coin] quality: auto')
        return 'auto'
      }

      const nextTier = QUALITY_INDEX.get(normalized)
      if (nextTier === undefined) {
        console.warn(
          '[3d-gold-coin] Unknown quality. Use: low, medium, high, ultra, or auto.',
        )
        return null
      }

      setManualQualityTier(nextTier)
      console.info(`[3d-gold-coin] quality forced: ${normalized}`)
      return normalized
    }

    const getQuality = () => ({
      mode: isAdaptive ? 'auto' : 'manual',
      quality: preset.name,
      tier: qualityTier,
      dpr,
      deviceDpr,
      environmentResolution: preset.environmentResolution,
    })

    window.coinQuality = {
      set: setQuality,
      get: getQuality,
      low: () => setQuality('low'),
      medium: () => setQuality('medium'),
      high: () => setQuality('high'),
      ultra: () => setQuality('ultra'),
      auto: () => setQuality('auto'),
      levels: ['low', 'medium', 'high', 'ultra', 'auto'],
    }

    return () => {
      delete window.coinQuality
    }
  }, [deviceDpr, dpr, isAdaptive, preset, qualityTier])

  return (
    <main
      className="coin-page"
      aria-label="Rotating 3D gold coin"
      style={captureMode ? { background: '#191919' } : undefined}
    >
      <Canvas
        dpr={dpr}
        camera={{ position: [0, 0, 6.35], fov: 34, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: captureMode,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(captureMode ? '#191919' : '#000000', 1)
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.26
        }}
      >
        <PerformanceMonitor
          bounds={performanceBounds}
          flipflops={4}
          onDecline={lowerQuality}
          onIncline={raiseQuality}
          onFallback={useFallbackQuality}
        >
          <Suspense fallback={null}>
            <Scene
              qualityTier={qualityTier}
              environmentResolution={preset.environmentResolution}
              captureMode={captureMode}
            />
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
    </main>
  )
}

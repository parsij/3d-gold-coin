import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const RADIUS = 2
const DEPTH = 0.34
const LOGO_URL =
  'https://raw.githubusercontent.com/parsij/PistachioSwap/main/public/icons/PistachioLogo.svg'
const GREEN_LOGO_COLOR = '#78c744'
const MAX_LOGO_RAISE = 0.2

const QUALITY_PRESETS = [
  {
    curveSegments: 64,
    bevelSegments: 3,
    torusSegments: 64,
    torusRadialSegments: 12,
    reeds: 64,
    logoSegments: 40,
  },
  {
    curveSegments: 112,
    bevelSegments: 5,
    torusSegments: 112,
    torusRadialSegments: 18,
    reeds: 96,
    logoSegments: 64,
  },
  {
    curveSegments: 192,
    bevelSegments: 8,
    torusSegments: 192,
    torusRadialSegments: 24,
    reeds: 132,
    logoSegments: 96,
  },
  {
    curveSegments: 320,
    bevelSegments: 12,
    torusSegments: 320,
    torusRadialSegments: 32,
    reeds: 180,
    logoSegments: 144,
  },
]

const goldMaterial = {
  color: '#d69b2b',
  metalness: 1,
  roughness: 0.17,
  clearcoat: 0.18,
  clearcoatRoughness: 0.13,
  envMapIntensity: 2.55,
  anisotropy: 0.3,
  anisotropyRotation: Math.PI / 2,
}

function createLogoMaskTexture(sourceTexture, renderer) {
  const image = sourceTexture.image
  const width = image.naturalWidth || image.width || 549
  const height = image.naturalHeight || image.height || 616
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const pixels = context.getImageData(0, 0, width, height)
  const data = pixels.data
  const cornerIndexes = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    (height * width - 1) * 4,
  ]

  const background = cornerIndexes.reduce(
    (accumulator, index) => {
      accumulator.r += data[index]
      accumulator.g += data[index + 1]
      accumulator.b += data[index + 2]
      accumulator.a += data[index + 3]
      return accumulator
    },
    { r: 0, g: 0, b: 0, a: 0 },
  )

  background.r /= cornerIndexes.length
  background.g /= cornerIndexes.length
  background.b /= cornerIndexes.length
  background.a /= cornerIndexes.length

  const transparentBackground = background.a < 245

  for (let index = 0; index < data.length; index += 4) {
    const sourceAlpha = data[index + 3] / 255
    const redDistance = data[index] - background.r
    const greenDistance = data[index + 1] - background.g
    const blueDistance = data[index + 2] - background.b
    const colorDistance = Math.min(
      1,
      Math.sqrt(
        redDistance * redDistance +
          greenDistance * greenDistance +
          blueDistance * blueDistance,
      ) / 170,
    )
    const mask = transparentBackground
      ? sourceAlpha
      : Math.max(0, Math.min(1, colorDistance * sourceAlpha))
    const value = Math.round(mask * 255)

    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
    data[index + 3] = 255
  }

  context.putImageData(pixels, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  texture.needsUpdate = true
  return texture
}

function useLogoTextures() {
  const { gl } = useThree()
  const sourceTexture = useLoader(THREE.TextureLoader, LOGO_URL)

  const textures = useMemo(() => {
    const defaultTexture = sourceTexture.clone()
    defaultTexture.colorSpace = THREE.SRGBColorSpace
    defaultTexture.minFilter = THREE.LinearMipmapLinearFilter
    defaultTexture.magFilter = THREE.LinearFilter
    defaultTexture.generateMipmaps = true
    defaultTexture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy())
    defaultTexture.needsUpdate = true

    const greenMaskTexture = createLogoMaskTexture(sourceTexture, gl)

    return { defaultTexture, greenMaskTexture }
  }, [gl, sourceTexture])

  useEffect(
    () => () => {
      textures.defaultTexture.dispose()
      textures.greenMaskTexture?.dispose()
    },
    [textures],
  )

  return textures
}

function CoinBody({ curveSegments, bevelSegments }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, RADIUS, 0, Math.PI * 2, false)

    const result = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.055,
      bevelOffset: -0.018,
      bevelSegments,
      curveSegments,
    })

    result.translate(0, 0, -DEPTH / 2)
    result.computeVertexNormals()
    return result
  }, [bevelSegments, curveSegments])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial {...goldMaterial} />
    </mesh>
  )
}

function LogoMark({ defaultTexture, greenMaskTexture, colorMode, raisedAmount, segments }) {
  const useGreen = colorMode === 'green' && greenMaskTexture
  const isRaised = raisedAmount > 0 && greenMaskTexture

  return (
    <mesh position={[0, -0.015, 0.012]} renderOrder={4}>
      <planeGeometry args={[1.98, 2.22, segments, segments]} />
      {useGreen ? (
        <meshPhysicalMaterial
          color={GREEN_LOGO_COLOR}
          metalness={0.08}
          roughness={0.3}
          clearcoat={0.18}
          clearcoatRoughness={0.18}
          envMapIntensity={1.4}
          alphaMap={greenMaskTexture}
          displacementMap={isRaised ? greenMaskTexture : null}
          displacementScale={isRaised ? raisedAmount : 0}
          displacementBias={0}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      ) : (
        <meshPhysicalMaterial
          map={defaultTexture}
          color="#ffffff"
          metalness={0}
          roughness={0.35}
          clearcoat={0.12}
          clearcoatRoughness={0.2}
          envMapIntensity={1.1}
          displacementMap={isRaised ? greenMaskTexture : null}
          displacementScale={isRaised ? raisedAmount : 0}
          displacementBias={0}
          transparent
          alphaTest={0.01}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  )
}

function CoinFace({ z, flip = false, config, logoTextures, logoColorMode, logoRaisedAmount }) {
  return (
    <group position={[0, 0, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh>
        <circleGeometry args={[1.79, config.curveSegments]} />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#dfaa3b"
          roughness={0.205}
          clearcoat={0.14}
          envMapIntensity={2.2}
          anisotropy={0.42}
        />
      </mesh>

      <mesh>
        <torusGeometry
          args={[
            1.82,
            0.055,
            config.torusRadialSegments,
            config.torusSegments,
          ]}
        />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#f0bd4a"
          roughness={0.105}
          envMapIntensity={3}
        />
      </mesh>

      <mesh>
        <torusGeometry
          args={[
            1.55,
            0.018,
            Math.max(8, Math.floor(config.torusRadialSegments * 0.7)),
            config.torusSegments,
          ]}
        />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#b8750d"
          roughness={0.24}
        />
      </mesh>

      <LogoMark
        defaultTexture={logoTextures.defaultTexture}
        greenMaskTexture={logoTextures.greenMaskTexture}
        colorMode={logoColorMode}
        raisedAmount={logoRaisedAmount}
        segments={config.logoSegments}
      />
    </group>
  )
}

function ReededEdge({ reeds }) {
  const mesh = useRef(null)
  const helper = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    if (!mesh.current) return

    for (let index = 0; index < reeds; index += 1) {
      const angle = (index / reeds) * Math.PI * 2
      const radius = RADIUS + 0.022

      helper.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      helper.rotation.set(0, 0, angle)
      helper.updateMatrix()
      mesh.current.setMatrixAt(index, helper.matrix)
    }

    mesh.current.instanceMatrix.needsUpdate = true
  }, [helper, reeds])

  return (
    <instancedMesh key={reeds} ref={mesh} args={[null, null, reeds]}>
      <boxGeometry args={[0.034, 0.095, DEPTH * 1.16]} />
      <meshPhysicalMaterial
        {...goldMaterial}
        color="#ad6d0c"
        roughness={0.27}
        envMapIntensity={2.1}
      />
    </instancedMesh>
  )
}

export default function GoldCoin({ qualityTier = 2 }) {
  const coin = useRef(null)
  const config = QUALITY_PRESETS[qualityTier] ?? QUALITY_PRESETS[1]
  const logoTextures = useLogoTextures()
  const [logoColorMode, setLogoColorMode] = useState('default')
  const [logoRaisedAmount, setLogoRaisedAmount] = useState(0)

  useEffect(() => {
    const setColorMode = (value) => {
      const normalized = String(value).trim().toLowerCase()

      if (normalized !== 'green' && normalized !== 'default') {
        console.warn('[3d-gold-coin] Unknown logo color. Use: green or default.')
        return null
      }

      setLogoColorMode(normalized)
      console.info(`[3d-gold-coin] logo color: ${normalized}`)
      return normalized
    }

    window.coinColor = {
      set: setColorMode,
      get: () => logoColorMode,
      green: () => setColorMode('green'),
      default: () => setColorMode('default'),
      modes: ['green', 'default'],
    }

    return () => {
      delete window.coinColor
    }
  }, [logoColorMode])

  useEffect(() => {
    const setRaisedAmount = (value) => {
      const numeric = Number(value)

      if (!Number.isFinite(numeric) || numeric < 0) {
        console.warn(
          `[3d-gold-coin] Raise amount must be a number from 0 to ${MAX_LOGO_RAISE}.`,
        )
        return null
      }

      const nextAmount = Math.min(numeric, MAX_LOGO_RAISE)
      setLogoRaisedAmount(nextAmount)
      console.info(`[3d-gold-coin] logo raise: ${nextAmount}`)
      return nextAmount
    }

    const coinRaised = (value) => setRaisedAmount(value)
    coinRaised.set = setRaisedAmount
    coinRaised.get = () => logoRaisedAmount
    coinRaised.off = () => setRaisedAmount(0)
    coinRaised.max = MAX_LOGO_RAISE

    window.coinRaised = coinRaised

    return () => {
      delete window.coinRaised
    }
  }, [logoRaisedAmount])

  useFrame(({ clock }, delta) => {
    if (!coin.current) return

    coin.current.rotation.y += delta * 0.72
    coin.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 0.5) * 0.035
    coin.current.rotation.z = 0.045
  })

  return (
    <group
      ref={coin}
      rotation={[-0.12, -0.48, 0.045]}
      scale={[0.5, 0.5, 0.5]}
    >
      <CoinBody
        curveSegments={config.curveSegments}
        bevelSegments={config.bevelSegments}
      />
      <CoinFace
        z={DEPTH / 2 + 0.061}
        config={config}
        logoTextures={logoTextures}
        logoColorMode={logoColorMode}
        logoRaisedAmount={logoRaisedAmount}
      />
      <CoinFace
        z={-(DEPTH / 2 + 0.061)}
        flip
        config={config}
        logoTextures={logoTextures}
        logoColorMode={logoColorMode}
        logoRaisedAmount={logoRaisedAmount}
      />
      <ReededEdge reeds={config.reeds} />
    </group>
  )
}

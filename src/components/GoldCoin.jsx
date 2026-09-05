import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const RADIUS = 2
const DEPTH = 0.34
const LOGO_URL =
  'https://raw.githubusercontent.com/parsij/PistachioSwap/main/public/icons/PistachioLogo.svg'

const QUALITY_PRESETS = [
  { curveSegments: 64, bevelSegments: 3, torusSegments: 64, torusRadialSegments: 12, reeds: 64 },
  { curveSegments: 112, bevelSegments: 5, torusSegments: 112, torusRadialSegments: 18, reeds: 96 },
  { curveSegments: 192, bevelSegments: 8, torusSegments: 192, torusRadialSegments: 24, reeds: 132 },
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

function useLogoTexture() {
  const { gl } = useThree()

  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')

    const loaded = loader.load(LOGO_URL)
    loaded.colorSpace = THREE.SRGBColorSpace
    loaded.minFilter = THREE.LinearMipmapLinearFilter
    loaded.magFilter = THREE.LinearFilter
    loaded.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return loaded
  }, [gl])

  useEffect(() => () => texture.dispose(), [texture])

  return texture
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

function LogoMark({ texture }) {
  return (
    <mesh position={[0, 0, 0.019]} renderOrder={4}>
      <planeGeometry args={[1.12, 1.26]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.025}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function CoinFace({ z, flip = false, config, logoTexture }) {
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

      <LogoMark texture={logoTexture} />
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
  const logoTexture = useLogoTexture()
  const config = QUALITY_PRESETS[qualityTier] ?? QUALITY_PRESETS[1]

  useFrame(({ clock }, delta) => {
    if (!coin.current) return

    coin.current.rotation.y += delta * 0.72
    coin.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 0.5) * 0.035
    coin.current.rotation.z = 0.045
  })

  return (
    <group ref={coin} rotation={[-0.12, -0.48, 0.045]}>
      <CoinBody
        curveSegments={config.curveSegments}
        bevelSegments={config.bevelSegments}
      />
      <CoinFace
        z={DEPTH / 2 + 0.061}
        config={config}
        logoTexture={logoTexture}
      />
      <CoinFace
        z={-(DEPTH / 2 + 0.061)}
        flip
        config={config}
        logoTexture={logoTexture}
      />
      <ReededEdge reeds={config.reeds} />
    </group>
  )
}

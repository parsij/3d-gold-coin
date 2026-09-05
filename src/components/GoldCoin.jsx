import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const RADIUS = 2
const DEPTH = 0.34
const REEDS = 132

const goldMaterial = {
  color: '#d99c22',
  metalness: 1,
  roughness: 0.16,
  clearcoat: 0.32,
  clearcoatRoughness: 0.12,
  envMapIntensity: 2.4,
}

function CoinBody() {
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
      bevelSegments: 8,
      curveSegments: 192,
    })

    result.translate(0, 0, -DEPTH / 2)
    result.computeVertexNormals()
    return result
  }, [])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial {...goldMaterial} />
    </mesh>
  )
}

function CoinFace({ z, flip = false }) {
  return (
    <group position={[0, 0, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh>
        <circleGeometry args={[1.79, 192]} />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#e2aa35"
          roughness={0.2}
          clearcoat={0.24}
          envMapIntensity={2.1}
        />
      </mesh>

      <mesh>
        <torusGeometry args={[1.82, 0.055, 24, 192]} />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#f0c052"
          roughness={0.11}
          envMapIntensity={2.8}
        />
      </mesh>

      <mesh>
        <torusGeometry args={[1.55, 0.018, 16, 192]} />
        <meshPhysicalMaterial
          {...goldMaterial}
          color="#bd7910"
          roughness={0.24}
        />
      </mesh>
    </group>
  )
}

function ReededEdge() {
  const mesh = useRef(null)
  const helper = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    if (!mesh.current) return

    for (let index = 0; index < REEDS; index += 1) {
      const angle = (index / REEDS) * Math.PI * 2
      const radius = RADIUS + 0.022

      helper.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      helper.rotation.set(0, 0, angle)
      helper.updateMatrix()
      mesh.current.setMatrixAt(index, helper.matrix)
    }

    mesh.current.instanceMatrix.needsUpdate = true
  }, [helper])

  return (
    <instancedMesh ref={mesh} args={[null, null, REEDS]}>
      <boxGeometry args={[0.034, 0.095, DEPTH * 1.16]} />
      <meshPhysicalMaterial
        {...goldMaterial}
        color="#b8750c"
        roughness={0.25}
        envMapIntensity={2}
      />
    </instancedMesh>
  )
}

export default function GoldCoin() {
  const coin = useRef(null)

  useFrame(({ clock }, delta) => {
    if (!coin.current) return

    coin.current.rotation.y += delta * 0.72
    coin.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 0.5) * 0.035
    coin.current.rotation.z = 0.045
  })

  return (
    <group ref={coin} rotation={[-0.12, -0.48, 0.045]}>
      <CoinBody />
      <CoinFace z={DEPTH / 2 + 0.061} />
      <CoinFace z={-(DEPTH / 2 + 0.061)} flip />
      <ReededEdge />
    </group>
  )
}

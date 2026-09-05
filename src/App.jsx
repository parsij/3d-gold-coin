import { Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'

import GoldCoin from './components/GoldCoin.jsx'

function MovingLights() {
  const warm = useRef(null)
  const white = useRef(null)

  useFrame(({ clock }) => {
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
      <pointLight ref={white} color="#ffffff" intensity={42} distance={11} decay={2} />
    </>
  )
}

function StudioEnvironment() {
  return (
    <Environment resolution={512}>
      <Lightformer
        form="rect"
        intensity={7}
        color="#fff2c9"
        position={[-4, 2.5, 4]}
        rotation={[0, -0.55, 0]}
        scale={[3, 7, 1]}
      />
      <Lightformer
        form="rect"
        intensity={5}
        color="#ffffff"
        position={[4.5, 0.5, 3]}
        rotation={[0, 0.7, 0]}
        scale={[2, 6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={4}
        color="#ffba3c"
        position={[0, -4, 2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[7, 2, 1]}
      />
      <Lightformer
        form="ring"
        intensity={3.5}
        color="#fff7db"
        position={[0, 3.8, -3]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={3}
      />
    </Environment>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.06} />
      <MovingLights />
      <GoldCoin />
      <StudioEnvironment />
    </>
  )
}

export default function App() {
  return (
    <main className="coin-page" aria-label="Rotating 3D gold coin">
      <Canvas
        dpr={[1, 2.5]}
        camera={{ position: [0, 0, 6.35], fov: 34, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 1)
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.22
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </main>
  )
}

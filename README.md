# 3D Gold Coin

A deliberately simple fullscreen React + Three.js demo: pure black background, one high-quality metallic gold coin, infinite rotation, and animated highlights that travel across the surface.

## Run

```bash
corepack enable
pnpm install
pnpm dev
```

Open <http://localhost:5173>.

## Production build

```bash
pnpm build
pnpm preview
```

## Rendering

- React 19 + Vite
- React Three Fiber / Three.js
- physically based `MeshPhysicalMaterial`
- beveled procedural coin geometry
- reeded coin edge
- local studio environment built from `Lightformer` panels
- moving point lights for traveling specular highlights
- ACES filmic tone mapping
- high-DPI rendering capped at 2.5x device pixel ratio

No backend, external 3D model, image asset, or HDR download is required.

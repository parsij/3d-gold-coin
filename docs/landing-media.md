# Adaptive landing coin media

The landing-page coin is rendered from the real 3D source in GitHub Actions, then published as GitHub Release assets under the stable `landing-media` tag.

## Why Release assets

The landing site can fetch the media directly from GitHub instead of serving the video from the PistachioSwap origin. The stable base URL is:

```text
https://github.com/parsij/3d-gold-coin/releases/download/landing-media/
```

Generated assets:

- `coin-poster.webp` — first video frame, optimized still image
- `coin-poster.png` — lossless poster fallback/debug reference
- `coin-low.mp4` — 480×480, 24 fps
- `coin-medium.mp4` — 720×720, 30 fps
- `coin-high.mp4` — 1080×1080, 60 fps
- `coin-ultra.mp4` — 1440×1440, 60 fps
- `coin-media.json` — dimensions, fps, byte sizes, and stable URLs

## Smooth hand-off from poster to video

The poster is copied from render frame 0. The video also starts at render frame 0. The renderer captures exactly 360 frames over one turn, with frame 360 intentionally omitted, so the final encoded frame approaches 360° without duplicating frame 0.

For the landing page, keep a poster `<img>` underneath the `<video>` and fade the video in only after the `playing` event. The first decoded video frame and the poster are the same pose, so the transition is visually continuous.

```html
<div class="hero-coin-media">
  <img
    class="hero-coin-poster"
    src="https://github.com/parsij/3d-gold-coin/releases/download/landing-media/coin-poster.webp"
    width="1080"
    height="1080"
    alt=""
    fetchpriority="high"
  >
  <video
    class="hero-coin-video"
    muted
    loop
    playsinline
    preload="metadata"
    aria-hidden="true"
  ></video>
</div>
```

The example selector in `examples/adaptive-video.js` chooses a video quality using both the rendered pixel size and, when available, `navigator.connection` information.

## Selection policy

- `prefers-reduced-motion: reduce`: poster only, no video download
- data saver: low
- slow-2g / 2g: low
- 3g: medium
- measured downlink under 1.5 Mbps: low
- under 4 Mbps: medium
- under 10 Mbps: high
- 10 Mbps or faster: up to ultra, but only when the displayed pixel size benefits from it
- browsers without Network Information API: cap at high and choose primarily from rendered size

Ultra is deliberately not sent to a small viewport merely because the connection is fast.

## Encoding details

The workflow renders one 1440×1440, 60 fps master frame sequence and derives all four videos from it. This prevents differences in lighting or coin position between quality levels.

MP4 files use H.264, `yuv420p`, and `+faststart` for broad hardware-decoding support and faster progressive startup. Frame 0 is a keyframe and the GOP is fixed so seeking/looping behavior stays predictable.

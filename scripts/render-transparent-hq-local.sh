#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_TAG="${RELEASE_TAG:-landing-media}"
MASTER_SIZE="${MASTER_SIZE:-1440}"
FRAME_COUNT="${FRAME_COUNT:-524}"
MASTER_FPS="${MASTER_FPS:-60}"
SAMPLES="${SAMPLES:-10}"
PORT="${PORT:-4173}"
FRAME_DIR="${FRAME_DIR:-render-transparent-frames}"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require node
require pnpm
require ffmpeg
require ffprobe
require gh
require curl

if [[ -z "${CHROME_PATH:-}" ]]; then
  for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME_PATH="$(command -v "$candidate")"
      break
    fi
  done
fi

if [[ -z "${CHROME_PATH:-}" || ! -x "$CHROME_PATH" ]]; then
  echo "Could not find installed Chrome/Chromium." >&2
  echo "Set CHROME_PATH manually if needed." >&2
  exit 1
fi

echo "==> Browser: $CHROME_PATH"
echo "==> HQ transparent render: ${MASTER_SIZE}x${MASTER_SIZE}, ${FRAME_COUNT} frames, ${SAMPLES} GPU samples/frame"

echo "==> Installing dependencies"
pnpm install --no-frozen-lockfile

echo "==> Building app"
pnpm build

echo "==> Starting local preview"
pnpm exec vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/tmp/coin-preview-alpha.log 2>&1 &
PREVIEW_PID=$!

cleanup() {
  kill "$PREVIEW_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for attempt in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/" >/dev/null; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    cat /tmp/coin-preview-alpha.log >&2 || true
    echo "Preview server did not start." >&2
    exit 1
  fi
  sleep 1
done

rm -rf "$FRAME_DIR"
mkdir -p "$FRAME_DIR" media
rm -f \
  media/coin-poster-alpha.png \
  media/coin-poster-alpha.webp \
  media/coin-low-alpha.webm \
  media/coin-medium-alpha.webm \
  media/coin-high-alpha.webm \
  media/coin-ultra-alpha.webm \
  media/coin-alpha-media.json

echo "==> Rendering transparent Ultra frames on your GPU"
CHROME_PATH="$CHROME_PATH" \
COIN_FRAME_COUNT="$FRAME_COUNT" \
COIN_RENDER_WIDTH="$MASTER_SIZE" \
COIN_RENDER_HEIGHT="$MASTER_SIZE" \
COIN_RENDER_SAMPLES="$SAMPLES" \
COIN_FRAME_DIR="$FRAME_DIR" \
COIN_RENDER_URL="http://127.0.0.1:${PORT}/?capture=1&alpha=1" \
node scripts/render-transparent-frames-local.mjs

cp "$FRAME_DIR/frame-000000.png" media/coin-poster-alpha.png
ffmpeg -hide_banner -loglevel error -y \
  -i media/coin-poster-alpha.png \
  -c:v libwebp -quality 90 -compression_level 6 \
  media/coin-poster-alpha.webp

encode_alpha_webm() {
  local name="$1"
  local size="$2"
  local fps="$3"
  local crf="$4"

  echo "==> Encoding transparent ${name}: ${size}x${size} @ ${fps} fps"
  ffmpeg -hide_banner -loglevel error -y \
    -framerate "$MASTER_FPS" \
    -i "$FRAME_DIR/frame-%06d.png" \
    -vf "fps=${fps},scale=${size}:${size}:flags=lanczos" \
    -an \
    -c:v libvpx-vp9 \
    -b:v 0 \
    -crf "$crf" \
    -pix_fmt yuva420p \
    -auto-alt-ref 0 \
    -row-mt 1 \
    -deadline good \
    -cpu-used 2 \
    -metadata:s:v:0 alpha_mode=1 \
    "media/coin-${name}-alpha.webm"
}

encode_alpha_webm low 480 24 30
encode_alpha_webm medium 720 30 27
encode_alpha_webm high 1080 60 23
encode_alpha_webm ultra 1440 60 19

for quality in low medium high ultra; do
  ffprobe -v error \
    -show_entries stream=codec_name,width,height,pix_fmt:format=duration,size \
    -of default=noprint_wrappers=1 \
    "media/coin-${quality}-alpha.webm"
done

LOW_BYTES="$(stat -c%s media/coin-low-alpha.webm)"
MEDIUM_BYTES="$(stat -c%s media/coin-medium-alpha.webm)"
HIGH_BYTES="$(stat -c%s media/coin-high-alpha.webm)"
ULTRA_BYTES="$(stat -c%s media/coin-ultra-alpha.webm)"
POSTER_PNG_BYTES="$(stat -c%s media/coin-poster-alpha.png)"
POSTER_WEBP_BYTES="$(stat -c%s media/coin-poster-alpha.webp)"
GIT_SHA="$(git rev-parse HEAD)"
RELEASE_BASE="https://github.com/parsij/3d-gold-coin/releases/download/${RELEASE_TAG}"

cat > media/coin-alpha-media.json <<EOF
{
  "version": "${GIT_SHA}",
  "releaseTag": "${RELEASE_TAG}",
  "transparent": true,
  "masterFrames": ${FRAME_COUNT},
  "masterFps": ${MASTER_FPS},
  "samplesPerFrame": ${SAMPLES},
  "quality": "ultra-source",
  "poster": {
    "png": "${RELEASE_BASE}/coin-poster-alpha.png",
    "webp": "${RELEASE_BASE}/coin-poster-alpha.webp",
    "pngBytes": ${POSTER_PNG_BYTES},
    "webpBytes": ${POSTER_WEBP_BYTES}
  },
  "qualities": {
    "low": {
      "url": "${RELEASE_BASE}/coin-low-alpha.webm",
      "width": 480,
      "height": 480,
      "fps": 24,
      "bytes": ${LOW_BYTES}
    },
    "medium": {
      "url": "${RELEASE_BASE}/coin-medium-alpha.webm",
      "width": 720,
      "height": 720,
      "fps": 30,
      "bytes": ${MEDIUM_BYTES}
    },
    "high": {
      "url": "${RELEASE_BASE}/coin-high-alpha.webm",
      "width": 1080,
      "height": 1080,
      "fps": 60,
      "bytes": ${HIGH_BYTES}
    },
    "ultra": {
      "url": "${RELEASE_BASE}/coin-ultra-alpha.webm",
      "width": 1440,
      "height": 1440,
      "fps": 60,
      "bytes": ${ULTRA_BYTES}
    }
  }
}
EOF

ASSETS=(
  media/coin-poster-alpha.png
  media/coin-poster-alpha.webp
  media/coin-low-alpha.webm
  media/coin-medium-alpha.webm
  media/coin-high-alpha.webm
  media/coin-ultra-alpha.webm
  media/coin-alpha-media.json
)

echo "==> Uploading transparent assets to GitHub Release '${RELEASE_TAG}'"
if gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
  gh release upload "$RELEASE_TAG" "${ASSETS[@]}" --clobber
else
  gh release create "$RELEASE_TAG" "${ASSETS[@]}" \
    --title 'Pistachio landing coin media' \
    --notes 'Transparent supersampled landing coin media rendered locally on the GPU.'
fi

echo
echo "Done."
echo "Transparent assets uploaded to: https://github.com/parsij/3d-gold-coin/releases/tag/${RELEASE_TAG}"

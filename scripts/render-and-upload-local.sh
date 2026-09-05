#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_TAG="${RELEASE_TAG:-landing-media}"
MASTER_SIZE="${MASTER_SIZE:-1440}"
CAPTURE_FPS="${CAPTURE_FPS:-60}"
DURATION_SECONDS="${DURATION_SECONDS:-8.73}"
PORT="${PORT:-4173}"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

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
  echo "Set it manually, for example: CHROME_PATH=/usr/bin/google-chrome-stable" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" != "24" ]]; then
  echo "WARNING: repo requests Node 24, current Node is $(node -v). The render may still work."
fi

echo "==> Browser: $CHROME_PATH"
echo "==> Installing dependencies"
pnpm install --no-frozen-lockfile

echo "==> Building app"
pnpm build

echo "==> Starting local preview"
pnpm exec vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/tmp/coin-preview.log 2>&1 &
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
    cat /tmp/coin-preview.log >&2 || true
    echo "Preview server did not start." >&2
    exit 1
  fi
  sleep 1
done

mkdir -p media
rm -f \
  media/coin-master.webm \
  media/coin-poster.png \
  media/coin-poster.jpg \
  media/coin-poster.webp \
  media/coin-low.mp4 \
  media/coin-medium.mp4 \
  media/coin-high.mp4 \
  media/coin-ultra.mp4 \
  media/coin-media.json

echo "==> Recording one smooth browser rotation with your GPU"
CHROME_PATH="$CHROME_PATH" \
COIN_RENDER_WIDTH="$MASTER_SIZE" \
COIN_RENDER_HEIGHT="$MASTER_SIZE" \
COIN_CAPTURE_FPS="$CAPTURE_FPS" \
COIN_DURATION_SECONDS="$DURATION_SECONDS" \
COIN_RENDER_URL="http://127.0.0.1:${PORT}/?capture=1" \
COIN_VIDEO_FILE="media/coin-master.webm" \
pnpm render:video

echo "==> Creating poster from the exact first video frame"
ffmpeg -hide_banner -loglevel error -y \
  -i media/coin-master.webm \
  -frames:v 1 \
  media/coin-poster.png

ffmpeg -hide_banner -loglevel error -y \
  -i media/coin-poster.png \
  -vf 'scale=1080:1080:flags=lanczos' \
  -q:v 2 \
  media/coin-poster.jpg

ffmpeg -hide_banner -loglevel error -y \
  -i media/coin-poster.png \
  -vf 'scale=1080:1080:flags=lanczos' \
  -c:v libwebp -quality 86 -compression_level 6 \
  media/coin-poster.webp

encode_mp4() {
  local name="$1"
  local size="$2"
  local fps="$3"
  local crf="$4"
  local gop="$5"

  echo "==> Encoding ${name}: ${size}x${size} @ ${fps} fps"
  ffmpeg -hide_banner -loglevel error -y \
    -i media/coin-master.webm \
    -vf "fps=${fps},scale=${size}:${size}:flags=lanczos" \
    -an \
    -c:v libx264 \
    -preset medium \
    -tune animation \
    -crf "$crf" \
    -pix_fmt yuv420p \
    -movflags +faststart \
    -g "$gop" \
    -keyint_min "$gop" \
    -sc_threshold 0 \
    "media/coin-${name}.mp4"
}

encode_mp4 low 480 24 28 48
encode_mp4 medium 720 30 25 60
encode_mp4 high 1080 60 22 120
encode_mp4 ultra 1440 60 18 120

for quality in low medium high ultra; do
  ffprobe -v error -show_entries format=duration,size \
    -of default=noprint_wrappers=1 "media/coin-${quality}.mp4"
done

LOW_BYTES="$(stat -c%s media/coin-low.mp4)"
MEDIUM_BYTES="$(stat -c%s media/coin-medium.mp4)"
HIGH_BYTES="$(stat -c%s media/coin-high.mp4)"
ULTRA_BYTES="$(stat -c%s media/coin-ultra.mp4)"
POSTER_JPG_BYTES="$(stat -c%s media/coin-poster.jpg)"
POSTER_WEBP_BYTES="$(stat -c%s media/coin-poster.webp)"
POSTER_PNG_BYTES="$(stat -c%s media/coin-poster.png)"
GIT_SHA="$(git rev-parse HEAD)"
RELEASE_BASE="https://github.com/parsij/3d-gold-coin/releases/download/${RELEASE_TAG}"

cat > media/coin-media.json <<EOF
{
  "version": "${GIT_SHA}",
  "releaseTag": "${RELEASE_TAG}",
  "durationSeconds": ${DURATION_SECONDS},
  "background": "#191919",
  "poster": {
    "jpg": "${RELEASE_BASE}/coin-poster.jpg",
    "webp": "${RELEASE_BASE}/coin-poster.webp",
    "png": "${RELEASE_BASE}/coin-poster.png",
    "jpgBytes": ${POSTER_JPG_BYTES},
    "webpBytes": ${POSTER_WEBP_BYTES},
    "pngBytes": ${POSTER_PNG_BYTES},
    "matchesVideoFrame": 0
  },
  "qualities": {
    "low": {
      "url": "${RELEASE_BASE}/coin-low.mp4",
      "width": 480,
      "height": 480,
      "fps": 24,
      "bytes": ${LOW_BYTES}
    },
    "medium": {
      "url": "${RELEASE_BASE}/coin-medium.mp4",
      "width": 720,
      "height": 720,
      "fps": 30,
      "bytes": ${MEDIUM_BYTES}
    },
    "high": {
      "url": "${RELEASE_BASE}/coin-high.mp4",
      "width": 1080,
      "height": 1080,
      "fps": 60,
      "bytes": ${HIGH_BYTES}
    },
    "ultra": {
      "url": "${RELEASE_BASE}/coin-ultra.mp4",
      "width": 1440,
      "height": 1440,
      "fps": 60,
      "bytes": ${ULTRA_BYTES}
    }
  }
}
EOF

echo "==> Uploading finished media to GitHub Release '${RELEASE_TAG}'"
ASSETS=(
  media/coin-poster.jpg
  media/coin-poster.webp
  media/coin-poster.png
  media/coin-low.mp4
  media/coin-medium.mp4
  media/coin-high.mp4
  media/coin-ultra.mp4
  media/coin-media.json
)

if gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
  gh release upload "$RELEASE_TAG" "${ASSETS[@]}" --clobber
else
  gh release create "$RELEASE_TAG" "${ASSETS[@]}" \
    --title 'Pistachio landing coin media' \
    --notes 'Generated locally from the browser-rendered 3D coin and uploaded as stable landing-page media assets.'
fi

echo
echo "Done."
echo "Release: https://github.com/parsij/3d-gold-coin/releases/tag/${RELEASE_TAG}"

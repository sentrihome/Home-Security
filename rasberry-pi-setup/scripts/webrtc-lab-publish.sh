#!/bin/bash
# Manual publisher — only if pi_hub is NOT already publishing.
# Usage: ./webrtc-lab-publish.sh [/dev/video0]

set -euo pipefail

DEVICE="${1:-/dev/video0}"
RTSP_URL="${RTSP_URL:-rtsp://127.0.0.1:8554/cam}"
LOG_DIR="${LOG_DIR:-/home/koushik/homesecurity/logs}"

if [ ! -e "$DEVICE" ]; then
  echo "ERROR: camera device missing: $DEVICE" >&2
  exit 1
fi

if pgrep -af 'pi_hub|python3 -m pi_hub' >/dev/null 2>&1; then
  echo "WARNING: pi_hub looks running — it owns the publisher. Do not start a second ffmpeg." >&2
  echo "Use: curl -X POST http://127.0.0.1:4000/start" >&2
fi

mkdir -p "$LOG_DIR"
echo "Publishing $DEVICE → $RTSP_URL"

exec ffmpeg -hide_banner -loglevel info \
  -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i "$DEVICE" \
  -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 \
  -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp "$RTSP_URL" \
  2>&1 | tee -a "$LOG_DIR/ffmpeg-cam.log"

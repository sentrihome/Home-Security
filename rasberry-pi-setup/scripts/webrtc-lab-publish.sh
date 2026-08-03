#!/bin/bash
# Publish C270 (or other v4l2) camera to MediaMTX path "cam" for WebRTC lab.
# Prerequisites: MediaMTX running (see scripts/webrtc-lab-mediamtx.sh)
# Usage: ./webrtc-lab-publish.sh [/dev/video0]

set -euo pipefail

DEVICE="${1:-/dev/video0}"
RTSP_URL="${RTSP_URL:-rtsp://127.0.0.1:8554/cam}"
LOG_DIR="${LOG_DIR:-/home/koushik/homesecurity/logs}"

if [ ! -e "$DEVICE" ]; then
  echo "ERROR: camera device missing: $DEVICE" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
echo "Publishing $DEVICE → $RTSP_URL (log: $LOG_DIR/ffmpeg-cam.log)"

# Logitech C270: MJPEG 1280x720@30 works well on Pi
exec ffmpeg -hide_banner -loglevel info \
  -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i "$DEVICE" \
  -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 \
  -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp "$RTSP_URL" \
  2>&1 | tee -a "$LOG_DIR/ffmpeg-cam.log"

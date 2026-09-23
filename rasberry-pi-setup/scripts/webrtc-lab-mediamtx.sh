#!/bin/bash
# Start MediaMTX for the WebRTC / shared-feed lab (foreground by default).
# Usage:
#   ./webrtc-lab-mediamtx.sh           # foreground
#   ./webrtc-lab-mediamtx.sh --bg      # background + log
# Prefer: sudo systemctl start mediamtx

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CFG="$SCRIPT_DIR/../mediamtx/mediamtx.yml"
CFG="${MEDIAMTX_CONFIG:-/etc/mediamtx/mediamtx.yml}"
LOG_DIR="${LOG_DIR:-/home/koushik/homesecurity/logs}"

if [ ! -x /usr/local/bin/mediamtx ] && ! command -v mediamtx >/dev/null 2>&1; then
  echo "ERROR: mediamtx not installed. See docs/WEBRTC-LAB.md" >&2
  exit 1
fi

BIN="$(command -v mediamtx || echo /usr/local/bin/mediamtx)"

if [ ! -f "$CFG" ] && [ -f "$REPO_CFG" ]; then
  echo "Using repo config $REPO_CFG"
  CFG="$REPO_CFG"
fi

if [ ! -f "$CFG" ]; then
  echo "ERROR: config not found at $CFG" >&2
  exit 1
fi

if [ "${1:-}" = "--bg" ]; then
  mkdir -p "$LOG_DIR"
  pkill -x mediamtx 2>/dev/null || true
  sleep 1
  nohup "$BIN" "$CFG" >"$LOG_DIR/mediamtx.log" 2>&1 &
  echo "mediamtx pid=$! log=$LOG_DIR/mediamtx.log"
  exit 0
fi

exec "$BIN" "$CFG"

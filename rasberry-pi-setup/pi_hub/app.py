"""
Pi hub HTTP API — one Flask process on :4000 after home Wi‑Fi is up.

Endpoints (local-first; matches mobile piApi stubs + architecture §15–§18):
  GET  /health
  POST /start          → live HLS
  POST /stop
  POST /motion         → cache clip → Drive upload
  POST /auth/drive     → store refresh token from app
  GET  /hls/<file>     → serve HLS playlist/segments
  GET  /clips/cache    → list local cache (debug)
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from . import clips, config, drive, live

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("pi_hub")

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "mode": "hub",
            "device": "raspberry-pi-home-security",
            "static_ip": config.STATIC_IP,
            "streaming": live.is_streaming(),
            "drive_token": drive.has_token(),
        }
    )


@app.route("/start", methods=["POST"])
def start_live():
    body = request.get_json(silent=True) or {}
    type_ = body.get("type", "manual")
    value = body.get("value", "")
    result = live.start(type_=type_, value=value)
    return jsonify(result)


@app.route("/stop", methods=["POST"])
def stop_live():
    return jsonify(live.stop())


@app.route("/motion", methods=["POST"])
def motion():
    """Record a clip to local cache, then attempt Drive upload."""
    path = clips.record_clip()
    if path is None:
        return jsonify({"ok": False, "error": "record failed"}), 500

    upload = drive.upload_clip(path)
    return jsonify(
        {
            "ok": True,
            "clip": path.name,
            "path": str(path),
            "upload": upload,
        }
    )


@app.route("/auth/drive", methods=["POST"])
def auth_drive():
    """Phone hands off Google refresh token (LAN / Tailscale only)."""
    body = request.get_json(silent=True) or {}
    refresh_token = body.get("refresh_token") or body.get("refreshToken")
    email = body.get("email")
    result = drive.store_token(refresh_token=refresh_token or "", email=email or "")
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/clips/cache", methods=["GET"])
def clips_cache():
    """Debug: list files in the local clip cache (app lists Drive, not this)."""
    return jsonify({"clips": clips.list_cached()})


@app.route("/hls/<path:filename>", methods=["GET"])
def hls_file(filename: str):
    config.HLS_DIR.mkdir(parents=True, exist_ok=True)
    return send_from_directory(config.HLS_DIR, filename)


def main() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.HLS_DIR.mkdir(parents=True, exist_ok=True)
    config.CLIP_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    log.info("Pi hub starting on %s:%s (live + clips + Drive)", config.HOST, config.PORT)
    log.info("Data dir: %s", config.DATA_DIR)
    app.run(host=config.HOST, port=config.PORT, debug=False)


if __name__ == "__main__":
    main()
    sys.exit(0)

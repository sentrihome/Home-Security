"""
Pi hub HTTP API — one Flask process on :4000 after home Wi‑Fi is up.

Endpoints:
  GET  /health
  POST /start          → live WebRTC session (shared MediaMTX feed)
  POST /stop           → end live session (publisher stays for clips)
  POST /motion         → record clip from same RTSP feed → Drive upload
  POST /auth/drive
  GET  /hls/<file>     → legacy HLS dir (optional)
  GET  /clips/cache
  POST /detect/start   → start OpenCV object detection on the shared feed
  POST /detect/stop    → stop object detection
  GET  /detect/status  → detector state, counters, last detection
"""

from __future__ import annotations

import logging
import sys

from flask import Flask, jsonify, request, send_from_directory

from . import camera, clips, config, detect, drive, events, live

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("pi_hub")

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    pub = camera.status()
    return jsonify(
        {
            "status": "ok",
            "mode": "hub",
            "device": "raspberry-pi-home-security",
            "static_ip": config.STATIC_IP,
            "streaming": live.is_streaming(),
            "publishing": pub["publishing"],
            "publisher": pub,
            "webrtc": config.webrtc_urls(),
            "drive_token": drive.has_token(),
            "detection": detect.status(),
            "last_event": events.last_event(),
        }
    )


@app.route("/start", methods=["POST"])
def start_live():
    body = request.get_json(silent=True) or {}
    type_ = body.get("type", "manual")
    value = body.get("value", "")
    result = live.start(type_=type_, value=value)
    status = 200 if result.get("ok") else 503
    return jsonify(result), status


@app.route("/stop", methods=["POST"])
def stop_live():
    return jsonify(live.stop())


@app.route("/motion", methods=["POST"])
def motion():
    """Record a clip from the shared RTSP feed, then attempt Drive upload."""
    body = request.get_json(silent=True) or {}
    duration = body.get("duration")
    source = body.get("source", "manual")
    result = events.handle_motion(source=source, duration_sec=duration)
    return jsonify(result), 200 if result.get("ok") else 500


@app.route("/detect/start", methods=["POST"])
def detect_start():
    """Start OpenCV object detection on the shared MediaMTX feed."""
    camera.ensure_publisher()
    result = detect.start()
    return jsonify(result), 200 if result.get("ok") else 503


@app.route("/detect/stop", methods=["POST"])
def detect_stop():
    return jsonify(detect.stop())


@app.route("/detect/status", methods=["GET"])
def detect_status():
    return jsonify(detect.status())


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
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    config.MODEL_DIR.mkdir(parents=True, exist_ok=True)

    log.info("Pi hub starting on %s:%s (shared MediaMTX feed)", config.HOST, config.PORT)
    log.info("Data dir: %s", config.DATA_DIR)

    pub = camera.ensure_publisher()
    if pub.get("ok"):
        log.info("Camera publisher up pid=%s", pub.get("pid"))
    else:
        log.warning(
            "Camera publisher not started: %s — live/clips need MediaMTX + camera",
            pub.get("error"),
        )

    if config.DETECT_AUTOSTART:
        det = detect.start()
        if not det.get("ok"):
            log.warning("Object detection not started: %s", det.get("error"))

    app.run(host=config.HOST, port=config.PORT, debug=False)


if __name__ == "__main__":
    main()
    sys.exit(0)

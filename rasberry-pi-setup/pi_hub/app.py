"""
Pi hub HTTP API — one Flask process on :4000 after home Wi‑Fi is up.

Endpoints:
  GET  /health
  POST /start          → live WebRTC session (shared MediaMTX feed)
  POST /stop           → end live session (publisher stays for clips)
  POST /motion         → record clip from same RTSP feed → Drive upload
  POST /auth/drive     → phone hands off Google refresh token / auth code
  GET  /auth/drive     → linked? email? last upload (never the token)
  DELETE /auth/drive   → forget stored Drive credentials
  GET  /hls/<file>     → legacy HLS dir (optional)
  GET  /clips/cache
  POST /detect/start   → start OpenCV object detection on the shared feed
  POST /detect/stop    → stop object detection
  GET  /detect/status  → detector state, counters, last detection
  GET  /               → redirect to /dev
  GET  /dev            → Drive sign-in portal (LAN / Tailscale)
"""

from __future__ import annotations

import logging
import sys
import threading

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from . import camera, clips, config, detect, drive, events, live
from .dev_routes import _portal_page, register_dev_routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("pi_hub")

app = Flask(
    __name__,
    template_folder=str(Path(__file__).resolve().parent / "templates"),
)
register_dev_routes(app)


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
            "drive": drive.status(),
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
    """Ack immediately, then record a clip and attempt Drive upload."""
    body = request.get_json(silent=True) or {}
    duration = body.get("duration")
    source = body.get("source", "manual")
    threading.Thread(
        target=events.handle_motion,
        kwargs={"source": source, "duration_sec": duration},
        daemon=True,
        name="motion-clip",
    ).start()
    return jsonify({"received": "ok"}), 200


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


@app.route("/dev/actions/motion", methods=["POST"])
def dev_test_clip():
    result = events.handle_motion(source="dev-portal")
    if not result.get("ok"):
        return _portal_page(False, result.get("error") or "Clip failed"), 500
    upload = result.get("upload") or {}
    if upload.get("ok"):
        return _portal_page(True, f"Clip {result.get('clip')} uploaded to Drive.")
    return _portal_page(
        False,
        f"Clip saved locally ({result.get('clip')}) but Drive upload failed: {upload.get('error')}",
    )


@app.route("/clips/cache", methods=["GET"])
def clips_cache():
    """Debug: list files in the local clip cache (app lists Drive, not this)."""
    return jsonify({"clips": clips.list_cached()})


@app.route("/clips/file/<filename>", methods=["GET"])
def clips_file(filename: str):
    """Stream a local cached mp4 (LAN). Names must match clip-*.mp4."""
    if not filename.startswith("clip-") or not filename.endswith(".mp4"):
        return jsonify({"error": "invalid clip name"}), 400
    if "/" in filename or "\\" in filename or ".." in filename:
        return jsonify({"error": "invalid clip name"}), 400
    config.CLIP_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = config.CLIP_CACHE_DIR / filename
    if not path.is_file():
        return jsonify({"error": "not found"}), 404
    return send_from_directory(config.CLIP_CACHE_DIR, filename, mimetype="video/mp4")


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

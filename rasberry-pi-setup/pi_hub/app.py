"""
Pi hub HTTP API — one Flask process on :4000 after home Wi‑Fi is up.

Endpoints (local-first; matches mobile piApi stubs + architecture §15–§18):
  GET  /health
  POST /start          → live HLS
  POST /stop
  POST /motion         → FCM alert + cache clip → Drive upload
  POST /auth/drive     → store refresh token from app
  POST /auth/fcm       → store Android FCM token
  POST /alert/test     → send test FCM alert
  GET  /hls/<file>     → serve HLS playlist/segments
  GET  /clips/cache    → list local cache (debug)
"""

from __future__ import annotations

import logging
import sys

from flask import Flask, jsonify, request, send_from_directory

from . import clips, config, drive, fcm, live

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
            "fcm_token": fcm.has_token(),
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
    """Send FCM alert, record a clip to local cache, then attempt Drive upload."""
    alert = fcm.send_alert(
        "Home Security",
        "Motion detected",
        {"screen": "live"},
    )

    path = clips.record_clip()
    if path is None:
        return jsonify({"ok": False, "error": "record failed", "alert": alert}), 500

    upload = drive.upload_clip(path)
    return jsonify(
        {
            "ok": True,
            "clip": path.name,
            "path": str(path),
            "upload": upload,
            "alert": alert,
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


@app.route("/auth/fcm", methods=["POST"])
def auth_fcm():
    """Phone registers Android FCM device token (LAN / Tailscale)."""
    body = request.get_json(silent=True) or {}
    token = body.get("token") or ""
    platform = body.get("platform") or "android"
    result = fcm.store_token(token=token, platform=platform)
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@app.route("/alert/test", methods=["POST"])
def alert_test():
    """Send a test FCM notification (no clip)."""
    body = request.get_json(silent=True) or {}
    title = body.get("title") or "Home Security"
    message = body.get("body") or "Test alert"
    result = fcm.send_alert(title, message, {"screen": "live"})
    status = 200 if result.get("ok") else 502
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

    log.info("Pi hub starting on %s:%s (live + clips + Drive + FCM)", config.HOST, config.PORT)
    log.info("Data dir: %s", config.DATA_DIR)
    log.info("FCM service account: %s", config.FCM_SERVICE_ACCOUNT_PATH)
    app.run(host=config.HOST, port=config.PORT, debug=False)


if __name__ == "__main__":
    main()
    sys.exit(0)

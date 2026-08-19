"""Single owner of /dev/video0 — publishes to MediaMTX for live + clips.

Live (WebRTC) and clips (ffmpeg RTSP read) both consume MediaMTX path `cam`.
Nothing else should open VIDEO_DEVICE.
"""

from __future__ import annotations

import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

from . import config

log = logging.getLogger("pi_hub.camera")

_publisher: Optional[subprocess.Popen] = None


def is_publishing() -> bool:
    return _publisher is not None and _publisher.poll() is None


def ensure_publisher() -> dict:
    """Start ffmpeg → MediaMTX if not already running."""
    global _publisher

    if is_publishing():
        return {"ok": True, "publishing": True, "pid": _publisher.pid}

    if not Path(config.VIDEO_DEVICE).exists():
        log.error("Camera missing at %s", config.VIDEO_DEVICE)
        return {
            "ok": False,
            "publishing": False,
            "error": f"camera missing at {config.VIDEO_DEVICE}",
        }

    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = config.LOG_DIR / "ffmpeg-publisher.log"

    # C270: MJPEG 1280x720 → H.264 into MediaMTX (same as WebRTC lab)
    cmd = [
        config.FFMPEG_BIN,
        "-hide_banner",
        "-loglevel",
        "info",
        "-f",
        "v4l2",
        "-input_format",
        "mjpeg",
        "-video_size",
        "1280x720",
        "-framerate",
        "30",
        "-i",
        config.VIDEO_DEVICE,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-profile:v",
        "baseline",
        "-bf",
        "0",
        "-g",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-f",
        "rtsp",
        "-rtsp_transport",
        "tcp",
        config.MEDIAMTX_RTSP_URL,
    ]
    log.info("Starting camera publisher: %s", " ".join(cmd))
    log_f = open(log_path, "ab", buffering=0)
    _publisher = subprocess.Popen(
        cmd,
        stdout=log_f,
        stderr=subprocess.STDOUT,
    )
    # Brief settle — MediaMTX must accept the publish
    time.sleep(1.5)
    if _publisher.poll() is not None:
        log.error("Publisher exited immediately; see %s", log_path)
        _publisher = None
        return {
            "ok": False,
            "publishing": False,
            "error": "publisher exited; is MediaMTX running?",
            "log": str(log_path),
        }
    return {"ok": True, "publishing": True, "pid": _publisher.pid}


def stop_publisher() -> dict:
    """Stop the camera publisher (breaks live and clips until restarted)."""
    global _publisher

    if _publisher is None or _publisher.poll() is not None:
        _publisher = None
        return {"ok": True, "publishing": False, "message": "not publishing"}

    log.info("Stopping camera publisher (pid=%s)", _publisher.pid)
    _publisher.terminate()
    try:
        _publisher.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _publisher.kill()
        _publisher.wait(timeout=2)
    _publisher = None
    return {"ok": True, "publishing": False}


def status() -> dict:
    return {
        "publishing": is_publishing(),
        "pid": _publisher.pid if is_publishing() else None,
        "device": config.VIDEO_DEVICE,
        "rtsp": config.MEDIAMTX_RTSP_URL,
        "webrtc": config.webrtc_urls(),
    }

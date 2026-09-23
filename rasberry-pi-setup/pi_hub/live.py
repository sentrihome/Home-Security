"""On-demand live session — WebRTC via MediaMTX (does not open /dev/video0).

Camera ownership lives in camera.py (ffmpeg → MediaMTX).
"""

from __future__ import annotations

import logging

from . import camera, config

log = logging.getLogger("pi_hub.live")

# Client "watching live" session — independent of publisher lifetime
_session_active = False


def is_streaming() -> bool:
    return _session_active and camera.is_publishing()


def start(type_: str = "manual", value: str = "") -> dict:
    """Ensure publisher is up; mark live session active; return WebRTC URLs."""
    global _session_active

    pub = camera.ensure_publisher()
    if not pub.get("ok"):
        _session_active = False
        return {
            "ok": False,
            "streaming": False,
            "error": pub.get("error", "publisher failed"),
            "publisher": pub,
        }

    _session_active = True
    urls = config.webrtc_urls()
    log.info("Live session start type=%s webrtc=%s", type_, urls["lan"])
    return {
        "ok": True,
        "streaming": True,
        "type": type_,
        "value": value,
        "webrtc_url": urls["lan"],
        "webrtc": urls,
        "publisher": pub,
    }


def stop() -> dict:
    """End live session only — publisher stays up for clips."""
    global _session_active

    _session_active = False
    log.info("Live session stop (publisher left running for clips)")
    return {
        "ok": True,
        "streaming": False,
        "publishing": camera.is_publishing(),
        "message": "session stopped; camera publisher still running",
    }

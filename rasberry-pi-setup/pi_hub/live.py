"""On-demand ffmpeg HLS live stream (LAN / Tailscale).

One process owns /dev/video0 — do not run a separate camera daemon.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Optional

from . import config

log = logging.getLogger("pi_hub.live")

_ffmpeg: Optional[subprocess.Popen] = None


def is_streaming() -> bool:
    return _ffmpeg is not None and _ffmpeg.poll() is None


def start(type_: str = "manual", value: str = "") -> dict:
    """Start ffmpeg → HLS under config.HLS_DIR. Stub until camera is wired."""
    global _ffmpeg

    if is_streaming():
        return {"ok": True, "streaming": True, "message": "already streaming"}

    config.HLS_DIR.mkdir(parents=True, exist_ok=True)
    playlist = config.HLS_DIR / config.HLS_PLAYLIST_NAME

    # Placeholder command — replace with real device/format flags on the Pi.
    # Intentionally not started until VIDEO_DEVICE is confirmed present.
    if not Path(config.VIDEO_DEVICE).exists():
        log.warning("No camera at %s — live start is a no-op stub", config.VIDEO_DEVICE)
        return {
            "ok": True,
            "streaming": False,
            "stub": True,
            "message": f"camera missing at {config.VIDEO_DEVICE}",
            "type": type_,
            "value": value,
            "playlist": f"/hls/{config.HLS_PLAYLIST_NAME}",
        }

    cmd = [
        config.FFMPEG_BIN,
        "-f",
        "v4l2",
        "-i",
        config.VIDEO_DEVICE,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-f",
        "hls",
        "-hls_time",
        "2",
        "-hls_list_size",
        "5",
        "-hls_flags",
        "delete_segments",
        str(playlist),
    ]
    log.info("Starting live: %s", " ".join(cmd))
    _ffmpeg = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    return {
        "ok": True,
        "streaming": True,
        "type": type_,
        "value": value,
        "playlist": f"/hls/{config.HLS_PLAYLIST_NAME}",
    }


def stop() -> dict:
    """Stop the ffmpeg HLS process if running."""
    global _ffmpeg

    if _ffmpeg is None or _ffmpeg.poll() is not None:
        _ffmpeg = None
        return {"ok": True, "streaming": False, "message": "not streaming"}

    log.info("Stopping live stream (pid=%s)", _ffmpeg.pid)
    _ffmpeg.terminate()
    try:
        _ffmpeg.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _ffmpeg.kill()
        _ffmpeg.wait(timeout=2)
    _ffmpeg = None
    return {"ok": True, "streaming": False}

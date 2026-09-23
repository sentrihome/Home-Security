"""Local clip cache — record from MediaMTX RTSP (not /dev/video0)."""

from __future__ import annotations

import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

from . import camera, config

log = logging.getLogger("pi_hub.clips")


def ensure_dirs() -> None:
    config.CLIP_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def record_clip(duration_sec: float | None = None) -> Optional[Path]:
    """
    Record a short clip by reading MediaMTX path `cam` over RTSP.

    Live WebRTC readers keep working — only the publisher holds /dev/video0.
    """
    duration = float(duration_sec if duration_sec is not None else config.CLIP_DURATION_SEC)
    ensure_dirs()

    pub = camera.ensure_publisher()
    if not pub.get("ok"):
        log.error("Cannot record: publisher not up (%s)", pub.get("error"))
        return None

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = config.CLIP_CACHE_DIR / f"clip-{stamp}.mp4"

    # Prefer stream copy (low CPU); fall back to re-encode if needed
    cmd_copy = [
        config.FFMPEG_BIN,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        "tcp",
        "-i",
        config.MEDIAMTX_RTSP_URL,
        "-t",
        str(duration),
        "-c",
        "copy",
        str(out),
    ]
    log.info("Recording clip %ss → %s", duration, out)
    result = subprocess.run(cmd_copy, capture_output=True, text=True, timeout=duration + 30)

    if result.returncode != 0 or not out.exists() or out.stat().st_size < 1000:
        log.warning("stream copy failed (%s); retrying with re-encode", result.stderr[-200:])
        if out.exists():
            out.unlink(missing_ok=True)
        cmd_enc = [
            config.FFMPEG_BIN,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            config.MEDIAMTX_RTSP_URL,
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(out),
        ]
        result = subprocess.run(cmd_enc, capture_output=True, text=True, timeout=duration + 60)
        if result.returncode != 0 or not out.exists() or out.stat().st_size < 1000:
            log.error("clip record failed: %s", result.stderr[-500:])
            if out.exists():
                out.unlink(missing_ok=True)
            return None

    log.info("Clip saved %s (%s bytes)", out.name, out.stat().st_size)
    return out


def list_cached() -> list[dict]:
    ensure_dirs()
    clips = sorted(config.CLIP_CACHE_DIR.glob("clip-*.mp4"), reverse=True)
    return [
        {
            "name": p.name,
            "path": str(p),
            "size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
        }
        for p in clips
    ]

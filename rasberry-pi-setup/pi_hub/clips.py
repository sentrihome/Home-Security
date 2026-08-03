"""Local clip cache — record on motion, then hand off to Drive upload."""

from __future__ import annotations

import logging
import subprocess
import time
from pathlib import Path
from typing import Optional

from . import config, live

log = logging.getLogger("pi_hub.clips")


def ensure_dirs() -> None:
    config.CLIP_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def record_clip(duration_sec: float = 10.0) -> Optional[Path]:
    """
    Record a short clip into the local cache with ffmpeg.

    Stops live streaming first if needed so live and clips don't fight
    over /dev/video0.
    """
    ensure_dirs()

    if live.is_streaming():
        log.info("Stopping live stream before clip record")
        live.stop()

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = config.CLIP_CACHE_DIR / f"clip-{stamp}.mp4"

    if not Path(config.VIDEO_DEVICE).exists():
        log.error("No camera at %s", config.VIDEO_DEVICE)
        return None

    cmd = [
        config.FFMPEG_BIN,
        "-y",
        "-f",
        "v4l2",
        "-i",
        config.VIDEO_DEVICE,
        "-t",
        str(duration_sec),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        str(out),
    ]
    log.info("Recording clip: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            timeout=duration_sec + 30,
        )
        if result.stderr:
            log.debug("ffmpeg stderr: %s", result.stderr.decode(errors="replace")[-500:])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log.error("ffmpeg failed: %s", e)
        if isinstance(e, subprocess.CalledProcessError) and e.stderr:
            log.error("ffmpeg stderr: %s", e.stderr.decode(errors="replace")[-1000:])
        if out.exists():
            out.unlink(missing_ok=True)
        return None

    if not out.exists() or out.stat().st_size == 0:
        log.error("Clip missing or empty: %s", out)
        return None

    log.info("Clip saved: %s (%s bytes)", out, out.stat().st_size)
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


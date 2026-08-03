"""Local clip cache — record on motion, then hand off to Drive upload."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

from . import config

log = logging.getLogger("pi_hub.clips")


def ensure_dirs() -> None:
    config.CLIP_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def record_clip(duration_sec: float = 10.0) -> Optional[Path]:
    """
    Record a short clip into the local cache.

    Barebones: writes a placeholder path/timestamp. Replace with ffmpeg
    (or share the live capture pipeline) so live + clips never fight over
    /dev/video0 — prefer stopping live briefly or a single capture source.
    """
    ensure_dirs()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = config.CLIP_CACHE_DIR / f"clip-{stamp}.mp4"

    # Stub: do not touch the camera yet. Callers still get a path to upload later.
    log.info(
        "clip stub: would record %ss → %s (ffmpeg not started)",
        duration_sec,
        out,
    )
    out.write_bytes(b"")  # empty placeholder so Drive can be tested later
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

"""Motion event pipeline — one path for every trigger source.

Both the HTTP /motion endpoint and the OpenCV detector land here, so a clip
is recorded and uploaded the same way regardless of what noticed the motion.
"""

from __future__ import annotations

import logging
from typing import Optional, Sequence

from . import clips, drive

log = logging.getLogger("pi_hub.events")

_last_event: Optional[dict] = None


def handle_motion(
    source: str = "manual",
    duration_sec: float | None = None,
    labels: Sequence[str] | None = None,
) -> dict:
    """Record a clip from the shared RTSP feed, then attempt Drive upload.

    Returns the same shape the mobile app already expects from POST /motion,
    plus `source` and `labels` for detector-raised events.
    """
    global _last_event

    path = clips.record_clip(duration_sec=duration_sec)
    if path is None:
        result = {
            "ok": False,
            "source": source,
            "error": "record failed — is MediaMTX + publisher up?",
        }
        _last_event = result
        return result

    upload = drive.upload_clip(path)
    result = {
        "ok": True,
        "source": source,
        "clip": path.name,
        "path": str(path),
        "size": path.stat().st_size,
        "upload": upload,
    }
    if labels:
        result["labels"] = list(labels)

    log.info(
        "Motion event source=%s clip=%s labels=%s",
        source,
        path.name,
        list(labels) if labels else [],
    )
    _last_event = result
    return result


def last_event() -> Optional[dict]:
    return _last_event

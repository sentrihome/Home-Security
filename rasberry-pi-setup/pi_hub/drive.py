"""Google Drive upload — refresh token from app, encrypted at rest (stub)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from . import config

log = logging.getLogger("pi_hub.drive")


def _ensure_data_dir() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)


def store_token(refresh_token: str, email: str) -> dict:
    """
    Persist Drive refresh token from the phone (LAN / Tailscale only).

    TODO: encrypt at rest (architecture §18). Never log the token.
    """
    if not refresh_token or not email:
        return {"ok": False, "error": "refresh_token and email required"}

    _ensure_data_dir()
    # Stub plaintext JSON — replace with encryption before shipping.
    payload = {
        "email": email,
        "refresh_token": refresh_token,
        "encrypted": False,
    }
    config.DRIVE_TOKEN_PATH.write_text(json.dumps(payload, indent=2))
    config.DRIVE_TOKEN_PATH.chmod(0o600)
    log.info("Drive token stored for %s (stub, not yet encrypted)", email)
    return {"ok": True, "email": email}


def load_token() -> Optional[dict]:
    if not config.DRIVE_TOKEN_PATH.exists():
        return None
    try:
        return json.loads(config.DRIVE_TOKEN_PATH.read_text())
    except (json.JSONDecodeError, OSError) as e:
        log.error("Failed to load Drive token: %s", e)
        return None


def has_token() -> bool:
    data = load_token()
    return bool(data and data.get("refresh_token"))


def upload_clip(path: Path) -> dict:
    """
    Upload a local clip to the user's Drive (`drive.file` scope).

    Stub: requires stored token + google-api client wiring.
    """
    if not path.exists():
        return {"ok": False, "error": "file not found", "path": str(path)}

    token = load_token()
    if not token:
        return {"ok": False, "error": "no Drive token — POST /auth/drive first"}

    log.info(
        "Drive upload stub: would upload %s as %s",
        path.name,
        token.get("email"),
    )
    return {
        "ok": True,
        "stub": True,
        "file": path.name,
        "email": token.get("email"),
        "message": "upload not implemented yet",
    }

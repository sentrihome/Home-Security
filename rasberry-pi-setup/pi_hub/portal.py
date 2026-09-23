"""Dev portal helpers — Google OAuth client store + authorize URL (no secrets in logs)."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import time
import urllib.parse
from typing import Optional

from . import config

log = logging.getLogger("pi_hub.portal")

AUTHORIZE_URI = "https://accounts.google.com/o/oauth2/v2/auth"
SCOPES = (
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
)

# In-process PKCE/state for the in-flight Google redirect. One hub process.
_pending: dict[str, dict] = {}
_PENDING_TTL_SEC = 15 * 60


def _purge_pending() -> None:
    now = time.time()
    expired = [k for k, v in _pending.items() if now - v.get("at", 0) > _PENDING_TTL_SEC]
    for k in expired:
        _pending.pop(k, None)


def load_oauth_client() -> Optional[dict]:
    path = config.DRIVE_OAUTH_CLIENT_PATH
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        log.error("Failed to load Drive OAuth client: %s", e)
        return None
    if not data.get("client_id") or not data.get("client_secret"):
        return None
    return data


def save_oauth_client(client_id: str, client_secret: str) -> dict:
    client_id = (client_id or "").strip()
    client_secret = (client_secret or "").strip()
    if not client_id or not client_secret:
        return {"ok": False, "error": "client_id and client_secret required"}
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = config.DRIVE_OAUTH_CLIENT_PATH
    path.write_text(json.dumps({"client_id": client_id, "client_secret": client_secret}, indent=2))
    path.chmod(0o600)
    log.info("Drive OAuth client stored (id ends …%s)", client_id[-4:] if len(client_id) >= 4 else "????")
    return {"ok": True, "client_id_suffix": client_id[-4:]}


def clear_oauth_client() -> None:
    path = config.DRIVE_OAUTH_CLIENT_PATH
    if path.exists():
        path.unlink()


def client_id_suffix() -> Optional[str]:
    data = load_oauth_client()
    if not data:
        return None
    cid = data["client_id"]
    return cid[-4:] if len(cid) >= 4 else cid


def _pkce_verifier() -> str:
    return secrets.token_urlsafe(48)


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def start_login(redirect_uri: str) -> dict:
    """Build a Google authorize URL. Stores PKCE verifier keyed by `state`."""
    oauth = load_oauth_client()
    if not oauth:
        return {"ok": False, "error": "Save a Google OAuth client id and secret first"}

    _purge_pending()
    verifier = _pkce_verifier()
    state = secrets.token_urlsafe(24)
    _pending[state] = {
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
        "at": time.time(),
    }
    params = {
        "client_id": oauth["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": _pkce_challenge(verifier),
        "code_challenge_method": "S256",
    }
    url = AUTHORIZE_URI + "?" + urllib.parse.urlencode(params)
    return {"ok": True, "url": url, "state": state}


def take_pending(state: str) -> Optional[dict]:
    _purge_pending()
    return _pending.pop(state, None)

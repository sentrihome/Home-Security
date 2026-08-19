"""FCM token storage + HTTP v1 send (Android)."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from . import config

log = logging.getLogger("pi_hub.fcm")

_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


def _ensure_data_dir() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)


def store_token(token: str, platform: str = "android") -> dict:
    if not token or not str(token).strip():
        return {"ok": False, "error": "token required"}

    _ensure_data_dir()
    payload = {
        "token": str(token).strip(),
        "platform": (platform or "android").strip().lower(),
    }
    config.FCM_TOKEN_PATH.write_text(json.dumps(payload, indent=2))
    config.FCM_TOKEN_PATH.chmod(0o600)
    log.info("FCM token stored (platform=%s)", payload["platform"])
    return {"ok": True, "platform": payload["platform"]}


def load_token() -> Optional[dict]:
    if not config.FCM_TOKEN_PATH.exists():
        return None
    try:
        return json.loads(config.FCM_TOKEN_PATH.read_text())
    except (json.JSONDecodeError, OSError) as e:
        log.error("Failed to load FCM token: %s", e)
        return None


def has_token() -> bool:
    data = load_token()
    return bool(data and data.get("token"))


def _access_token() -> str:
    if not config.FCM_SERVICE_ACCOUNT_PATH.exists():
        raise FileNotFoundError(
            f"FCM service account missing: {config.FCM_SERVICE_ACCOUNT_PATH}"
        )
    creds = service_account.Credentials.from_service_account_file(
        str(config.FCM_SERVICE_ACCOUNT_PATH),
        scopes=[_FCM_SCOPE],
    )
    creds.refresh(Request())
    if not creds.token:
        raise RuntimeError("Failed to obtain Google access token for FCM")
    return creds.token


def send_alert(
    title: str,
    body: str,
    data: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """
    Send an Android notification via FCM HTTP v1.
    On failure returns {ok: False, error: ...} and logs details (no silent success).
    """
    stored = load_token()
    if not stored or not stored.get("token"):
        err = "no FCM token — POST /auth/fcm first"
        log.error(err)
        return {"ok": False, "error": err}

    project_id = config.fcm_project_id()
    if not project_id:
        err = "FCM project_id missing (env FCM_PROJECT_ID or service account JSON)"
        log.error(err)
        return {"ok": False, "error": err}

    device_token = stored["token"]
    data_payload = {k: str(v) for k, v in (data or {"screen": "live"}).items()}

    message = {
        "message": {
            "token": device_token,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": data_payload,
            "android": {
                "priority": "HIGH",
                "notification": {
                    "channel_id": "alerts",
                    "sound": "default",
                },
            },
        }
    }

    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

    try:
        access = _access_token()
        res = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json=message,
            timeout=15,
        )
    except Exception as e:
        log.exception("FCM send failed: %s", e)
        return {"ok": False, "error": str(e)}

    if res.status_code >= 400:
        log.error("FCM HTTP %s: %s", res.status_code, res.text)
        return {
            "ok": False,
            "error": f"FCM HTTP {res.status_code}",
            "details": res.text[:500],
        }

    log.info("FCM alert sent: %s", title)
    try:
        payload = res.json() if res.content else {}
    except ValueError:
        payload = {}
    return {"ok": True, "response": payload}

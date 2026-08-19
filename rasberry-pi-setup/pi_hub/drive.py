"""Google Drive upload — refresh token from the phone, encrypted at rest.

The phone completes Google OAuth (`drive.file`, offline) and POSTs the
result to `/auth/drive`. This module stores the refresh token, refreshes
an access token when a clip is ready, and uploads into an app-created
folder in the user's Drive.

Never log tokens. Never make uploaded files public — the app lists them
as the same signed-in Google user (architecture §17 / §18).
"""

from __future__ import annotations

import json
import logging
import mimetypes
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken

from . import config

log = logging.getLogger("pi_hub.drive")

TOKEN_URI = "https://oauth2.googleapis.com/token"
DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

_SSL = ssl.create_default_context()
_access_token: Optional[str] = None
_access_expires_at: float = 0.0
_last_upload: Optional[dict] = None
_last_error: Optional[str] = None


def _ensure_data_dir() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_or_create_fernet() -> Fernet:
    _ensure_data_dir()
    path = config.DRIVE_KEY_PATH
    if path.exists():
        key = path.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        path.write_bytes(key)
        path.chmod(0o600)
    return Fernet(key)


def _encrypt_payload(payload: dict) -> None:
    _ensure_data_dir()
    blob = _load_or_create_fernet().encrypt(json.dumps(payload).encode("utf-8"))
    config.DRIVE_TOKEN_PATH.write_bytes(blob)
    config.DRIVE_TOKEN_PATH.chmod(0o600)


def load_token() -> Optional[dict]:
    """Return the stored credential dict, or None. Never logs secrets."""
    path = config.DRIVE_TOKEN_PATH
    if not path.exists():
        return None
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
        if text.lstrip().startswith("{"):
            # Legacy plaintext stub from earlier hub builds — migrate.
            payload = json.loads(text)
            _encrypt_payload(payload)
            log.info("Migrated Drive token store to encrypted-at-rest")
            return payload
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
    try:
        decrypted = _load_or_create_fernet().decrypt(raw)
        return json.loads(decrypted.decode("utf-8"))
    except (InvalidToken, json.JSONDecodeError, OSError) as e:
        log.error("Failed to load Drive token: %s", e)
        return None


def has_token() -> bool:
    data = load_token()
    if not data or not data.get("refresh_token"):
        return False
    cid, secret = _client_credentials(data)
    return bool(cid and secret)


def status() -> dict:
    data = load_token()
    linked = has_token()
    out: dict[str, Any] = {
        "linked": linked,
        "email": (data or {}).get("email") if linked else None,
        "folder_name": (data or {}).get("folder_name") or config.DRIVE_FOLDER_NAME,
        "folder_id": (data or {}).get("folder_id") if linked else None,
        "last_upload": _last_upload,
        "error": _last_error,
    }
    if data and data.get("refresh_token") and not linked:
        out["error"] = out["error"] or (
            "token on Pi is incomplete — on home Wi-Fi, open the phone app and tap Send Drive token"
        )
    return out


def clear_token() -> dict:
    global _access_token, _access_expires_at, _last_error
    if config.DRIVE_TOKEN_PATH.exists():
        config.DRIVE_TOKEN_PATH.unlink()
    _access_token = None
    _access_expires_at = 0.0
    _last_error = None
    log.info("Drive token cleared")
    return {"ok": True, "linked": False}


def store_token(
    refresh_token: str = "",
    email: str = "",
    client_id: str = "",
    client_secret: str = "",
    auth_code: str = "",
    redirect_uri: str = "",
    code_verifier: str = "",
    folder_name: str = "",
) -> dict:
    """
    Persist Drive credentials from the phone (LAN / Tailscale only).

    Accepts either a refresh_token (phone already exchanged the auth code)
    or an auth_code / server_auth_code that this module exchanges itself.
    client_id + client_secret are required — the refresh token is bound to
    the OAuth client that issued it (architecture §18).
    """
    global _access_token, _access_expires_at, _last_error

    existing = load_token() or {}
    oauth = {}
    try:
        from . import portal as _portal

        oauth = _portal.load_oauth_client() or {}
    except Exception:
        oauth = {}
    client_id = client_id or existing.get("client_id") or oauth.get("client_id") or ""
    client_secret = (
        client_secret or existing.get("client_secret") or oauth.get("client_secret") or ""
    )
    folder_name = folder_name or existing.get("folder_name") or config.DRIVE_FOLDER_NAME

    if auth_code:
        if not client_id or not client_secret:
            return {
                "ok": False,
                "error": "auth_code requires client_id and client_secret",
            }
        exchanged = _exchange_auth_code(
            auth_code, client_id, client_secret, redirect_uri, code_verifier
        )
        if not exchanged.get("ok"):
            return exchanged
        refresh_token = exchanged["refresh_token"]
        email = email or exchanged.get("email") or ""

    if not refresh_token:
        return {"ok": False, "error": "refresh_token (or auth_code) required"}
    if not client_id or not client_secret:
        return {
            "ok": False,
            "error": "client_id and client_secret required — see DOCUMENTATION.md phone guide",
        }
    if not email:
        email = _email_from_refresh(refresh_token, client_id, client_secret) or ""
    if not email:
        return {"ok": False, "error": "email required (could not fetch from Google)"}

    payload = {
        "email": email,
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "folder_name": folder_name,
        "folder_id": existing.get("folder_id") if existing.get("email") == email else None,
        "token_uri": TOKEN_URI,
        "encrypted": True,
    }
    _encrypt_payload(payload)
    _access_token = None
    _access_expires_at = 0.0
    _last_error = None
    log.info("Drive token stored for %s (encrypted at rest)", email)
    return {"ok": True, "email": email, "folder_name": folder_name, "linked": True}


def _http_json(
    url: str,
    method: str = "GET",
    headers: Optional[dict] = None,
    data: Optional[bytes] = None,
    timeout: int = 30,
) -> tuple[int, dict | list | str]:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        status = e.code
    try:
        parsed: dict | list | str = json.loads(body) if body else {}
    except json.JSONDecodeError:
        parsed = body
    return status, parsed


def _google_error(parsed: dict | list | str, fallback: str) -> str:
    if isinstance(parsed, dict):
        err = parsed.get("error")
        if isinstance(err, dict):
            return err.get("message") or fallback
        desc = parsed.get("error_description")
        if err and desc:
            return f"{err}: {desc}"
        if err:
            return str(err)
    return fallback


def _exchange_auth_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    code_verifier: str = "",
) -> dict:
    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
    }
    if redirect_uri:
        payload["redirect_uri"] = redirect_uri
    if code_verifier:
        payload["code_verifier"] = code_verifier
    form = urllib.parse.urlencode(payload).encode("utf-8")
    status, parsed = _http_json(
        TOKEN_URI,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=form,
    )
    if status != 200 or not isinstance(parsed, dict) or not parsed.get("refresh_token"):
        err = _google_error(parsed, "auth code exchange failed")
        log.warning("Drive auth_code exchange failed: %s", err)
        return {
            "ok": False,
            "error": err,
            "hint": "Need access_type=offline and prompt=consent or Google will not issue a refresh_token",
        }
    email = ""
    access = parsed.get("access_token")
    if access:
        email = _email_from_access(access) or ""
    return {
        "ok": True,
        "refresh_token": parsed["refresh_token"],
        "email": email,
    }


def _email_from_access(access_token: str) -> Optional[str]:
    status, parsed = _http_json(
        USERINFO,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if status == 200 and isinstance(parsed, dict):
        return parsed.get("email")
    return None


def _email_from_refresh(refresh_token: str, client_id: str, client_secret: str) -> Optional[str]:
    token, err = _refresh_access_token_raw(refresh_token, client_id, client_secret)
    if not token:
        log.warning("Could not fetch email: %s", err)
        return None
    return _email_from_access(token)


def _refresh_access_token_raw(
    refresh_token: str, client_id: str, client_secret: str
) -> tuple[Optional[str], Optional[str]]:
    form = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    status, parsed = _http_json(
        TOKEN_URI,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=form,
    )
    if status != 200 or not isinstance(parsed, dict) or not parsed.get("access_token"):
        return None, _google_error(parsed, "token refresh failed")
    expires = float(parsed.get("expires_in") or 3600)
    global _access_token, _access_expires_at
    _access_token = parsed["access_token"]
    _access_expires_at = time.time() + expires - 60
    return _access_token, None


def _client_credentials(data: dict) -> tuple[str, str]:
    """Prefer credentials stored with the refresh token; else /dev portal file."""
    cid = str(data.get("client_id") or "").strip()
    secret = str(data.get("client_secret") or "").strip()
    if cid and secret:
        return cid, secret
    try:
        from . import portal as _portal

        oauth = _portal.load_oauth_client() or {}
    except Exception:
        oauth = {}
    cid = cid or str(oauth.get("client_id") or "").strip()
    secret = secret or str(oauth.get("client_secret") or "").strip()
    return cid, secret


def _access_token_for_upload() -> tuple[Optional[str], Optional[str]]:
    global _last_error
    now = time.time()
    if _access_token and now < _access_expires_at:
        return _access_token, None
    data = load_token()
    if not data or not data.get("refresh_token"):
        _last_error = "no Drive token — POST /auth/drive first"
        return None, _last_error
    client_id, client_secret = _client_credentials(data)
    if not client_id or not client_secret:
        _last_error = (
            "Drive token is missing client_id/client_secret. "
            "On home Wi-Fi, open the phone app Setup → Drive and tap Send Drive token."
        )
        return None, _last_error
    if not data.get("client_id") or not data.get("client_secret"):
        data["client_id"] = client_id
        data["client_secret"] = client_secret
        _encrypt_payload(data)
    token, err = _refresh_access_token_raw(
        data["refresh_token"], client_id, client_secret
    )
    if err:
        _last_error = err
        if "invalid_grant" in err:
            log.error("Drive refresh token revoked or expired — app must re-auth")
        else:
            log.error("Drive token refresh failed: %s", err)
        return None, err
    _last_error = None
    return token, None


def _ensure_folder(access_token: str, data: dict) -> tuple[Optional[str], Optional[str]]:
    folder_id = data.get("folder_id")
    folder_name = data.get("folder_name") or config.DRIVE_FOLDER_NAME
    if folder_id:
        return folder_id, None

    q = (
        f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    url = DRIVE_FILES + "?" + urllib.parse.urlencode(
        {"q": q, "fields": "files(id,name)", "pageSize": "1", "spaces": "drive"}
    )
    status, parsed = _http_json(
        url, headers={"Authorization": f"Bearer {access_token}"}
    )
    if status == 200 and isinstance(parsed, dict):
        files = parsed.get("files") or []
        if files:
            folder_id = files[0]["id"]
            data["folder_id"] = folder_id
            _encrypt_payload(data)
            return folder_id, None

    body = json.dumps(
        {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
    ).encode("utf-8")
    status, parsed = _http_json(
        DRIVE_FILES + "?fields=id,name",
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        data=body,
    )
    if status not in (200, 201) or not isinstance(parsed, dict) or not parsed.get("id"):
        err = _google_error(parsed, "could not create Drive folder")
        return None, err
    folder_id = parsed["id"]
    data["folder_id"] = folder_id
    _encrypt_payload(data)
    log.info("Created Drive folder %s (%s)", folder_name, folder_id)
    return folder_id, None


def _multipart_body(metadata: dict, file_bytes: bytes, mime: str) -> tuple[bytes, str]:
    boundary = "====sentrihome_clip===="
    parts = [
        f"--{boundary}\r\n".encode("utf-8"),
        b"Content-Type: application/json; charset=UTF-8\r\n\r\n",
        json.dumps(metadata).encode("utf-8"),
        b"\r\n",
        f"--{boundary}\r\n".encode("utf-8"),
        f"Content-Type: {mime}\r\n\r\n".encode("utf-8"),
        file_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(parts), f"multipart/related; boundary={boundary}"


def upload_clip(path: Path) -> dict:
    """Upload a local clip into the user's SentriHome Drive folder."""
    global _last_upload, _last_error

    if not path.exists():
        result = {"ok": False, "error": "file not found", "path": str(path)}
        _last_upload = result
        return result

    access, err = _access_token_for_upload()
    if not access:
        result = {"ok": False, "error": err or "no access token"}
        _last_upload = result
        return result

    data = load_token() or {}
    folder_id, ferr = _ensure_folder(access, data)
    if ferr or not folder_id:
        result = {"ok": False, "error": ferr or "no Drive folder"}
        _last_error = result["error"]
        _last_upload = result
        return result

    mime = mimetypes.guess_type(path.name)[0] or "video/mp4"
    metadata = {"name": path.name, "parents": [folder_id]}
    body, content_type = _multipart_body(metadata, path.read_bytes(), mime)
    url = DRIVE_UPLOAD + "?" + urllib.parse.urlencode(
        {"uploadType": "multipart", "fields": "id,name,webViewLink,webContentLink"}
    )
    status, parsed = _http_json(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {access}",
            "Content-Type": content_type,
        },
        data=body,
        timeout=120,
    )
    if status not in (200, 201) or not isinstance(parsed, dict) or not parsed.get("id"):
        err_msg = _google_error(parsed, f"Drive upload failed ({status})")
        log.error("Drive upload failed for %s: %s", path.name, err_msg)
        _last_error = err_msg
        result = {"ok": False, "error": err_msg, "file": path.name}
        _last_upload = result
        return result

    result = {
        "ok": True,
        "file": path.name,
        "email": data.get("email"),
        "file_id": parsed.get("id"),
        "web_view_link": parsed.get("webViewLink"),
        "folder_id": folder_id,
        "folder_name": data.get("folder_name") or config.DRIVE_FOLDER_NAME,
    }
    _last_error = None
    _last_upload = {k: v for k, v in result.items() if k != "email"}
    log.info("Uploaded %s to Drive file_id=%s", path.name, parsed.get("id"))
    return result

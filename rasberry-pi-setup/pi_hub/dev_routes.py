"""Flask routes for /dev portal + /auth/drive. Used by hub and SoftAP setup API."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from flask import Flask, jsonify, redirect, render_template, request, url_for

from . import drive, portal

OnLinked = Optional[Callable[[], None]]
_on_linked: OnLinked = None


def _callback_uri() -> str:
    return request.host_url.rstrip("/") + "/dev/drive/callback"


def _portal_page(ok: bool | None = None, message: str = ""):
    st = drive.status()
    last = st.get("last_upload") or {}
    last_upload = None
    if last.get("file"):
        last_upload = last.get("file")
        if last.get("ok") is False:
            last_upload = f"{last.get('file')} failed"
    return render_template(
        "dev.html",
        drive=st,
        last_upload=last_upload,
        client_suffix=portal.client_id_suffix(),
        callback_uri=_callback_uri(),
        ok=bool(ok),
        message=message,
    )


def _notify_linked() -> None:
    if _on_linked:
        _on_linked()


def register_dev_routes(app: Flask, on_linked: OnLinked = None) -> None:
    """Attach /dev and /auth/drive to a Flask app."""
    global _on_linked
    _on_linked = on_linked
    templates = Path(__file__).resolve().parent / "templates"
    if not app.template_folder:
        app.template_folder = str(templates)

    @app.route("/", methods=["GET"])
    def root():
        return redirect(url_for("dev_portal"))

    @app.route("/dev", methods=["GET"])
    def dev_portal():
        return _portal_page()

    @app.route("/dev/oauth-client", methods=["POST"])
    def dev_save_client():
        result = portal.save_oauth_client(
            request.form.get("client_id") or "",
            request.form.get("client_secret") or "",
        )
        if not result.get("ok"):
            return _portal_page(False, result.get("error") or "Could not save client"), 400
        return _portal_page(True, "OAuth client saved on the Pi (chmod 600).")

    @app.route("/dev/drive/start", methods=["POST"])
    def dev_drive_start():
        started = portal.start_login(_callback_uri())
        if not started.get("ok"):
            return _portal_page(False, started.get("error") or "Cannot start Google sign-in"), 400
        return redirect(started["url"])

    @app.route("/dev/drive/callback", methods=["GET"])
    def dev_drive_callback():
        err = request.args.get("error")
        if err:
            return _portal_page(False, f"Google returned {err}"), 400
        state = request.args.get("state") or ""
        code = request.args.get("code") or ""
        pending = portal.take_pending(state)
        if not pending or not code:
            return _portal_page(False, "Sign-in expired or invalid. Try Connect again."), 400
        oauth = portal.load_oauth_client() or {}
        result = drive.store_token(
            auth_code=code,
            client_id=oauth.get("client_id") or "",
            client_secret=oauth.get("client_secret") or "",
            redirect_uri=pending.get("redirect_uri") or "",
            code_verifier=pending.get("code_verifier") or "",
        )
        if not result.get("ok"):
            hint = result.get("hint") or ""
            msg = result.get("error") or "Token exchange failed"
            return _portal_page(False, f"{msg} {hint}".strip()), 400
        _notify_linked()
        return _portal_page(True, f"Drive linked as {result.get('email')}. Joining home Wi‑Fi if credentials are saved.")

    @app.route("/dev/drive/disconnect", methods=["POST"])
    def dev_disconnect():
        drive.clear_token()
        return _portal_page(True, "Drive disconnected on this Pi.")

    @app.route("/dev/drive/paste", methods=["POST"])
    def dev_paste_token():
        oauth = portal.load_oauth_client() or {}
        result = drive.store_token(
            refresh_token=request.form.get("refresh_token") or "",
            email=request.form.get("email") or "",
            client_id=oauth.get("client_id") or "",
            client_secret=oauth.get("client_secret") or "",
        )
        if not result.get("ok"):
            return _portal_page(False, result.get("error") or "Could not store token"), 400
        _notify_linked()
        return _portal_page(True, f"Drive linked as {result.get('email')}.")

    @app.route("/auth/drive", methods=["GET", "POST", "DELETE"])
    def auth_drive():
        if request.method == "GET":
            return jsonify(drive.status())
        if request.method == "DELETE":
            return jsonify(drive.clear_token())
        body = request.get_json(silent=True) or {}
        oauth = portal.load_oauth_client() or {}
        result = drive.store_token(
            refresh_token=body.get("refresh_token") or body.get("refreshToken") or "",
            email=body.get("email") or "",
            client_id=body.get("client_id") or body.get("clientId") or oauth.get("client_id") or "",
            client_secret=body.get("client_secret")
            or body.get("clientSecret")
            or oauth.get("client_secret")
            or "",
            auth_code=body.get("auth_code")
            or body.get("authCode")
            or body.get("server_auth_code")
            or body.get("serverAuthCode")
            or "",
            redirect_uri=body.get("redirect_uri") or body.get("redirectUri") or "",
            code_verifier=body.get("code_verifier") or body.get("codeVerifier") or "",
            folder_name=body.get("folder_name") or body.get("folderName") or "",
        )
        status = 200 if result.get("ok") else 400
        if result.get("ok"):
            _notify_linked()
        return jsonify(result), status

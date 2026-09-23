"""Shared paths and constants for the Pi hub."""

from __future__ import annotations

import json
import os
from pathlib import Path

# Listen address — same port as SoftAP setup API; only one mode binds at a time.
HOST = "0.0.0.0"
PORT = 4000

STATIC_IP = "192.168.0.236"

# On-device paths (match SoftAP / install scripts)
HOME = Path("/home/koushik")
DATA_DIR = HOME / "homesecurity"
HLS_DIR = DATA_DIR / "hls"
CLIP_CACHE_DIR = DATA_DIR / "clips"
DRIVE_TOKEN_PATH = DATA_DIR / "drive_token.json.enc"
WIFI_CREDENTIALS_FILE = HOME / "wifi-credentials.json"

# FCM (Android push)
FCM_TOKEN_PATH = DATA_DIR / "fcm_token.json"
FCM_SERVICE_ACCOUNT_PATH = Path(
    os.environ.get(
        "FCM_SERVICE_ACCOUNT",
        str(DATA_DIR / "firebase-service-account.json"),
    )
)


def fcm_project_id() -> str:
    """Prefer env FCM_PROJECT_ID; else read project_id from the service-account JSON."""
    env_id = os.environ.get("FCM_PROJECT_ID", "").strip()
    if env_id:
        return env_id
    try:
        data = json.loads(FCM_SERVICE_ACCOUNT_PATH.read_text())
        return str(data.get("project_id") or "").strip()
    except (OSError, json.JSONDecodeError, TypeError):
        return ""


# Camera / ffmpeg (fill in on the Pi)
VIDEO_DEVICE = "/dev/video0"
FFMPEG_BIN = "ffmpeg"

# HLS playlist the app plays over LAN / Tailscale
HLS_PLAYLIST_NAME = "index.m3u8"

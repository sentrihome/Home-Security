"""Shared paths and constants for the Pi hub."""

from pathlib import Path

# Listen address — same port as SoftAP setup API; only one mode binds at a time.
HOST = "0.0.0.0"
PORT = 4000

STATIC_IP = "192.168.0.236"
TAILSCALE_IP = "100.66.51.106"
TAILSCALE_HOST = "mypi"

# On-device paths (match SoftAP / install scripts)
HOME = Path("/home/koushik")
DATA_DIR = HOME / "homesecurity"
HLS_DIR = DATA_DIR / "hls"
CLIP_CACHE_DIR = DATA_DIR / "clips"
DRIVE_TOKEN_PATH = DATA_DIR / "drive_token.json.enc"
WIFI_CREDENTIALS_FILE = HOME / "wifi-credentials.json"
LOG_DIR = DATA_DIR / "logs"

# Camera — only the publisher opens this device
VIDEO_DEVICE = "/dev/video0"
FFMPEG_BIN = "ffmpeg"

# MediaMTX fan-out (one publisher, many readers)
MEDIAMTX_BIN = "/usr/local/bin/mediamtx"
MEDIAMTX_CONFIG = Path("/etc/mediamtx/mediamtx.yml")
MEDIAMTX_RTSP_URL = "rtsp://127.0.0.1:8554/cam"
MEDIAMTX_WEBRTC_PATH = "cam"
WEBRTC_PORT = 8889

# Live session + clips
CLIP_DURATION_SEC = 10.0
HLS_PLAYLIST_NAME = "index.m3u8"  # legacy; live now prefers WebRTC


def webrtc_play_url(host: str | None = None) -> str:
    """Browser URL for MediaMTX built-in WebRTC player."""
    h = host or STATIC_IP
    return f"http://{h}:{WEBRTC_PORT}/{MEDIAMTX_WEBRTC_PATH}"


def webrtc_urls() -> dict:
    return {
        "lan": webrtc_play_url(STATIC_IP),
        "tailscale_ip": webrtc_play_url(TAILSCALE_IP),
        "tailscale_host": webrtc_play_url(TAILSCALE_HOST),
    }

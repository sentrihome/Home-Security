# WebRTC lab — MediaMTX + ffmpeg (local → Tailscale)

Low-latency live path for experiments. Product docs (README D4/§15) still describe HLS; this lab uses **WebRTC** via MediaMTX until we promote it.

```
/dev/video0 → ffmpeg (H.264) → RTSP :8554/cam → MediaMTX → WebRTC :8889/cam → browser
```

## Status on the lab Pi (as of setup)

| Item | Value |
|------|--------|
| Camera | Logitech C270 HD → `/dev/video0` (MJPG 1280×720 @ 30) |
| MediaMTX | v1.19.3 at `/usr/local/bin/mediamtx` |
| Config | `/etc/mediamtx/mediamtx.yml` (also in repo `mediamtx/mediamtx.yml`) |
| Tailscale | `100.66.51.106` / hostname `mypi` |
| LAN play | http://192.168.0.236:8889/cam |
| Tailscale play | http://100.66.51.106:8889/cam |

## Install MediaMTX (once)

On the Pi (arm64):

```bash
cd /tmp
curl -fsSL -o mediamtx.tar.gz \
  https://github.com/bluenviron/mediamtx/releases/download/v1.19.3/mediamtx_v1.19.3_linux_arm64.tar.gz
tar -xzf mediamtx.tar.gz
sudo install -m 755 mediamtx /usr/local/bin/mediamtx
sudo mkdir -p /etc/mediamtx
sudo cp /path/to/Home-Security/rasberry-pi-setup/mediamtx/mediamtx.yml /etc/mediamtx/
```

## Run MediaMTX

```bash
# Foreground
mediamtx /etc/mediamtx/mediamtx.yml

# Or from repo helper
./scripts/webrtc-lab-mediamtx.sh
# Background:
./scripts/webrtc-lab-mediamtx.sh --bg
```

Logs (bg): `/home/koushik/homesecurity/logs/mediamtx.log`

## Publish with ffmpeg

```bash
./scripts/webrtc-lab-publish.sh /dev/video0
```

Equivalent command:

```bash
ffmpeg -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 \
  -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 \
  -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam
```

Fallback if MJPEG fails:

```bash
ffmpeg -f v4l2 -i /dev/video0 \
  -c:v libx264 -preset ultrafast -tune zerolatency -bf 0 -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam
```

MediaMTX should log: `is publishing to path 'cam'` and `stream is available and online, 1 track (H264)`.

## Test — LAN

1. Phone/laptop on home Wi‑Fi.
2. Open **http://192.168.0.236:8889/cam** (trailing slash OK; server may 302).
3. Built-in MediaMTX WebRTC player should show live video within ~1–2s.

**Pass:** ffmpeg stays up; browser shows live feed; no Tailscale required.

## Test — Tailscale

1. Leave home Wi‑Fi; enable Tailscale on the client (same tailnet as Pi).
2. Open **http://100.66.51.106:8889/cam** or **http://mypi:8889/cam** (MagicDNS).
3. Confirm playback.

**Pass:** same page plays off home LAN.

**Fail checklist:** Tailscale off; wrong host; `webrtcAdditionalHosts` missing Tailscale IP; ports `8889` / `8189` (ICE UDP) blocked.

## Stop lab

```bash
pkill -f 'rtsp://127.0.0.1:8554/cam' || true
pkill -x mediamtx || true
```

## Not in this lab

- `pi_hub` `/start` automation (later)
- Mobile app WebRTC player
- systemd units (add after LAN + Tailscale both pass consistently)
- Auth on MediaMTX paths (add before exposing beyond your tailnet)

## Camera check

```bash
ls -l /dev/video*
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
```

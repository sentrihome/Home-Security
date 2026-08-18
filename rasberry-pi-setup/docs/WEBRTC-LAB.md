# WebRTC + shared camera feed (MediaMTX)

One process owns `/dev/video0` and publishes to MediaMTX. Live (WebRTC) and clips (RTSP record) both read that path — they no longer fight over the camera.

```
/dev/video0 → ffmpeg publisher (pi_hub.camera)
                    ↓
              MediaMTX path cam
               ├─ WebRTC :8889  → live
               └─ RTSP :8554    → clips.record_clip()
```

## Install MediaMTX (once, arm64 Pi)

```bash
cd /tmp
curl -fsSL -o mediamtx.tar.gz \
  https://github.com/bluenviron/mediamtx/releases/download/v1.19.3/mediamtx_v1.19.3_linux_arm64.tar.gz
tar -xzf mediamtx.tar.gz
sudo install -m 755 mediamtx /usr/local/bin/mediamtx
sudo mkdir -p /etc/mediamtx
sudo cp rasberry-pi-setup/mediamtx/mediamtx.yml /etc/mediamtx/
sudo cp rasberry-pi-setup/systemd/mediamtx.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx
```

`install-pi-setup.sh` copies the unit/config and starts MediaMTX if the binary exists.

## Hub behavior

| Call | Effect |
|------|--------|
| Hub start | `camera.ensure_publisher()` — ffmpeg → `rtsp://127.0.0.1:8554/cam` |
| `POST /start` | Live session on; returns `webrtc_url` / `webrtc` URLs |
| `POST /stop` | Live session off; **publisher stays** for clips |
| `POST /motion` | `ffmpeg -i rtsp://.../cam -t 10` → `homesecurity/clips/` |
| Hub start | `detect.start()` — OpenCV DNN reads the same RTSP path, person → `/motion` pipeline |

The detector is a third consumer of the shared `cam` path, alongside WebRTC (live) and
ffmpeg (clips). It opens RTSP, never `/dev/video0`, so the single-publisher rule holds.

Play live: http://192.168.0.236:8889/cam · Tailscale: http://100.66.51.106:8889/cam

## Manual lab (without hub)

```bash
./scripts/webrtc-lab-mediamtx.sh --bg   # or systemctl start mediamtx
./scripts/webrtc-lab-publish.sh         # only if hub publisher is not running
```

Do **not** run the lab publish script while `pi_hub` publisher is active — both would try to open `/dev/video0`.

## Concurrent test

```bash
curl -s http://192.168.0.236:4000/health
# open browser on :8889/cam
curl -s -X POST http://192.168.0.236:4000/motion
curl -s http://192.168.0.236:4000/clips/cache
curl -s http://192.168.0.236:4000/detect/status   # running, frames_sampled, last_detection
# sudo fuser -v /dev/video0  → should show only the publisher ffmpeg
# walk in front of the camera → events_raised increments, a clip lands in clips/
```

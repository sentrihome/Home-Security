# Pi SoftAP Provisioning System

Automatic WiFi setup for Raspberry Pi using SoftAP (Access Point) mode.

## How It Works

1. **Unconfigured Pi boots** → starts SoftAP "HomeSecurity-Setup" + HTTP API on `10.42.0.1:4000`
2. **Phone joins hotspot** → app discovers Pi at `10.42.0.1`
3. **App sends credentials** → `POST /wifi` with home WiFi SSID/password
4. **Pi switches to home WiFi** → saves credentials, connects as normal client
5. **Future boots (prod)** → Pi joins home WiFi (no SoftAP)
6. **DEV boots (`pie-dev-testing`)** → git pull, wipe wifi + Drive token + clip cache, SoftAP. After Google token **and** home WiFi creds, join LAN and start the hub.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Pi Boot Sequence                      │
├─────────────────────────────────────────────────────────┤
│  1. systemd starts pi-setup.service                      │
│  2. pi-setup-boot.sh checks /home/koushik/wifi-creds.json│
│                                                           │
│  IF configured → connect to home WiFi ────────────────┐  │
│  IF NOT → start SoftAP + API                          │  │
│                                                        │  │
│  ┌──────────────────────────────────┐                │  │
│  │  SoftAP Mode (First Boot)        │                │  │
│  ├──────────────────────────────────┤                │  │
│  │  • SSID: HomeSecurity-Setup      │                │  │
│  │  • Password: setup1234           │                │  │
│  │  • Pi IP: 10.42.0.1              │                │  │
│  │  • DHCP: 10.42.0.10–.254         │                │  │
│  │  • API: :4000                    │                │  │
│  └──────────────────────────────────┘                │  │
│                                                        │  │
│  ┌──────────────────────────────────┐                │  │
│  │  Normal Mode (After Setup)       │◄───────────────┘  │
│  ├──────────────────────────────────┤                   │
│  │  • Connects to home WiFi         │                   │
│  │  • Static IP: 192.168.0.236      │                   │
│  │  • Starts pi_hub on :4000        │                   │
│  │    (live HLS + clips + Drive)    │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Hub (after home Wi‑Fi)

SoftAP and hub never share `:4000` at the same time. Boot script:

1. SoftAP / unconfigured → `pi-setup-api.py` only  
2. Home Wi‑Fi OK → touch `.hub-ready` → `systemctl start pi-hub`

Shared camera: **one** ffmpeg publisher → MediaMTX; live uses WebRTC, clips record from the same RTSP path (see [docs/WEBRTC-LAB.md](docs/WEBRTC-LAB.md)).

| Method | Path | Module |
|--------|------|--------|
| GET | `/health` | hub (`mode: hub`, `publishing`, `webrtc`, `detection`, `drive`) |
| GET | `/` | redirect to `/dev` |
| GET | `/dev` | Drive sign-in portal (Google OAuth on the Pi) |
| POST | `/start` `/stop` | `pi_hub.live` (WebRTC session; publisher stays) |
| POST | `/motion` | `pi_hub.events` → `pi_hub.clips` (RTSP record) → `pi_hub.drive` |
| POST / GET / DELETE | `/auth/drive` | phone OAuth handoff; status; disconnect |
| GET | `/clips/cache` | local clip list (debug — app lists Drive, not this) |
| POST | `/detect/start` `/detect/stop` | `pi_hub.detect` (OpenCV DNN on the shared RTSP feed) |
| GET | `/detect/status` | detector state, counters, last detection |

Package: `pi_hub/` · units: `systemd/pi-hub.service`, `systemd/mediamtx.service`

### Object detection

`pi_hub.detect` reads the same MediaMTX RTSP path as clips (never `/dev/video0` —
`pi_hub.camera` owns that) and runs MobileNet-SSD through OpenCV's DNN module on a
background thread. A `person` above the confidence floor raises a motion event via
`pi_hub.events`, the identical path `POST /motion` uses, so detection and manual
triggers produce the same clip + Drive upload.

Weights are not in git. Fetch them (sha256-verified) once per Pi:

```bash
sudo ./scripts/fetch-detection-model.sh   # → homesecurity/models/
sudo systemctl restart pi-hub
curl -s http://localhost:4000/detect/status | jq
```

Tuning lives in `pi_hub/config.py`: `DETECT_TARGET_LABELS` (default `person` only —
a cat should not wake anyone), `DETECT_MIN_CONFIDENCE`, `DETECT_INTERVAL_SEC`
(inference sample rate, not frame rate) and `DETECT_COOLDOWN_SEC` (event
suppression window). Without weights or without OpenCV installed the hub still
boots and serves every other endpoint; `/detect/status` reports why detection is off.

Decision logic is unit tested without hardware:

```bash
cd rasberry-pi-setup && python3 -m unittest discover -s tests -v
```

### Google Drive uploads

Clips upload to the user's Drive once the phone completes OAuth and
`POST /auth/drive` (LAN or Tailscale only). Token is Fernet-encrypted at
`homesecurity/drive_token.json.enc`. Files land in an app-created **SentriHome**
folder (`drive.file` scope — not shared publicly).

Phone contract + Expo template: repo root `DOCUMENTATION.md`.

Until the app ships OAuth, open the Pi’s **dev portal** and sign in there:

```
http://192.168.0.236:4000/dev
http://100.66.51.106:4000/dev
```

Save a Google Cloud **Web application** client, add the callback URI shown on
the page, then **Connect Google Drive**. Clips then upload to a `SentriHome`
folder.

```bash
# after the phone (or curl) has posted credentials:
curl -s http://192.168.0.236:4000/auth/drive   # { linked, email, last_upload, error }
curl -s -X POST http://192.168.0.236:4000/motion
# Drive → SentriHome / clip-*.mp4
```

Re-deploy needs `pip3 install -r requirements.txt` (now includes `cryptography`).

## API Endpoints

### `GET /status`
Health check
```json
{
  "status": "ready",
  "mode": "setup",
  "device": "raspberry-pi-home-security"
}
```

### `GET /scan`
List available WiFi networks
```json
{
  "networks": [
    {"ssid": "HomeNetwork", "signal": 75, "security": "WPA2"},
    {"ssid": "Guest", "signal": 45, "security": "WPA2"}
  ]
}
```

### `POST /wifi`
Set WiFi credentials
```json
{
  "ssid": "HomeNetwork",
  "password": "mypassword"
}
```

Response:
```json
{
  "success": true,
  "message": "WiFi credentials saved, switching to home network..."
}
```

## Installation

On the Pi:

```bash
cd /path/to/Home-Security
chmod +x install-pi-setup.sh
sudo ./install-pi-setup.sh
sudo reboot
```

## Files

- `pi-setup-api.py` → Flask HTTP server for credential submission
- `pi-setup-boot.sh` → Boot script (checks config, starts SoftAP or connects)
- `pi-setup.service` → systemd service
- `install-pi-setup.sh` → One-command installer
- `/home/koushik/wifi-credentials.json` → Saved WiFi config (created on setup)

## Troubleshooting

### Check status
```bash
systemctl status pi-setup.service
tail -f /var/log/pi-setup.log
```

### Reset to SoftAP mode
```bash
sudo rm /home/koushik/wifi-credentials.json
sudo systemctl restart pi-setup.service
```

### Manual hotspot control
```bash
# Start SoftAP (also done automatically by pi-setup.service when unconfigured)
sudo nmcli connection up HomeSecurity-Setup

# Stop SoftAP, return to home WiFi
sudo nmcli connection down HomeSecurity-Setup
sudo nmcli connection up "<your-home-ssid>"
```

SoftAP should **start on its own** at boot when `/home/koushik/wifi-credentials.json` is missing.
You should not need to click **HomeSecurity-Setup** in the WiFi menu — that entry is only the NetworkManager profile.

### DHCP conflict (dnsmasq)
Fixed automatically by install script. Verify:
```bash
systemctl is-active dnsmasq  # should be: inactive
sudo ss -ulnp | grep :67     # should be empty when NOT in hotspot
```

## Mobile App Integration

See `mobile/app/(tabs)/setup.tsx` for React Native implementation.

Expected flow:
1. App guides user to join "HomeSecurity-Setup"
2. Once connected, app detects `10.42.0.1:4000`
3. App shows WiFi picker (from `GET /scan`)
4. User selects network + enters password
5. App sends `POST /wifi`
6. App instructs user to reconnect phone to home WiFi
7. App discovers Pi at `192.168.0.236` (mDNS or static IP)

## Network Summary

| Mode | Interface | IP | SSID | Purpose |
|------|-----------|-------|------|---------|
| **Setup** | wlan0 AP | 10.42.0.1 | HomeSecurity-Setup | First-time config |
| **Normal** | wlan0 STA | 192.168.0.236 | (home WiFi) | Day-to-day operation |

Home mode always uses NetworkManager **manual** IPv4 `192.168.0.236/24` (gateway `192.168.0.1`), applied on SoftAP provisioning and reasserted on every boot.

## Security Notes

- SoftAP password is hardcoded (`setup1234`) → change in `pi-setup-boot.sh` nmcli command
- API runs HTTP only (no TLS) → acceptable on isolated SoftAP; add TLS if needed
- Credentials stored plaintext in `/home/koushik/wifi-credentials.json` → restrict perms
- API requires root for `nmcli` → runs as root (systemd User=root)

## Next Steps

1. ✓ Pi SoftAP + HTTP API
2. ⏭ Mobile app setup screen (connect + credential submission)
3. ⏭ Boot automation (systemd service on Pi)
4. ⏭ mDNS discovery (optional alternative to static `.236`)

# Pi SoftAP Setup — Implementation Complete

## What We Built

A complete **WiFi provisioning system** for Raspberry Pi using SoftAP (Access Point mode), allowing first-time setup via mobile app without keyboard/monitor.

## Components

### 1. Pi Backend (`/`)

- **`pi-setup-api.py`** — Flask HTTP server
  - `GET /status` — health check
  - `GET /scan` — list available WiFi networks
  - `POST /wifi` — receive credentials, configure NetworkManager, switch to home WiFi

- **`pi-setup-boot.sh`** — Boot script
  - Checks if WiFi configured (`/home/koushik/wifi-credentials.json`)
  - If configured → connect to home WiFi
  - If not → start SoftAP + HTTP API

- **`pi-setup.service`** — systemd service
  - Runs boot script on startup
  - Logs to `/var/log/pi-setup.log`

- **`install-pi-setup.sh`** — One-command installer
  - Installs dependencies (Flask, jq)
  - Copies files and enables service

### 2. Mobile App (`/mobile`)

- **`app/(tabs)/setup.tsx`** — Provisioning screen
  - Instructions to join `HomeSecurity-Setup`
  - Network scan from Pi API
  - WiFi credential input
  - Submission to Pi
  - Device linking to cloud account

### 3. Documentation

- **`PI-SOFTAP-README.md`** — Architecture, API docs, troubleshooting
- **`mobile/README.md`** — Updated with SoftAP feature docs

## Network Flow

```
┌─────────────────────────────────────────┐
│         Unconfigured Pi Boots            │
├─────────────────────────────────────────┤
│  systemd → pi-setup.service             │
│  → pi-setup-boot.sh checks config       │
│  → no config → start SoftAP + API       │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         SoftAP Mode Active               │
├─────────────────────────────────────────┤
│  SSID: HomeSecurity-Setup                │
│  Password: setup1234                     │
│  Pi IP: 10.42.0.1                        │
│  API: http://10.42.0.1:4000              │
│  DHCP: 10.42.0.10–.254                   │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Phone Joins Hotspot                 │
├─────────────────────────────────────────┤
│  1. User opens mobile app                │
│  2. App: GET /scan                       │
│  3. User selects network + password      │
│  4. App: POST /wifi {ssid, password}     │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Pi Switches to Home WiFi            │
├─────────────────────────────────────────┤
│  • Saves credentials.json                │
│  • nmcli connection down Hotspot         │
│  • nmcli connection up HomeNetwork       │
│  • Now at 192.168.0.236 (static)         │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Future Boots: Normal Mode           │
├─────────────────────────────────────────┤
│  boot → checks config → has credentials  │
│  → connects to home WiFi directly        │
│  → starts pi_hub (live + clips + Drive)  │
│     on :4000 — not the SoftAP setup API  │
└─────────────────────────────────────────┘
```

## Installation

### On the Pi:

```bash
cd /path/to/Home-Security
chmod +x install-pi-setup.sh
sudo ./install-pi-setup.sh
sudo reboot
```

After reboot, Pi will be in SoftAP mode (`HomeSecurity-Setup`).

### On the Mobile App:

```bash
cd mobile
npm install
npm start
```

Open Setup tab, follow on-screen instructions.

## Testing

1. **Fresh Pi (no config):**
   ```bash
   sudo rm /home/koushik/wifi-credentials.json
   sudo reboot
   ```
   Pi should broadcast `HomeSecurity-Setup`

2. **Join from phone:**
   - iOS/Android WiFi settings → join `HomeSecurity-Setup` / `setup1234`
   - Open mobile app → Setup tab → Scan Networks

3. **Submit credentials:**
   - Select home network
   - Enter password
   - Tap "Configure Pi"

4. **Verify switch:**
   - Pi should disappear from SoftAP
   - Reconnect phone to home WiFi
   - Pi should be at `192.168.0.236`
   - `ssh koushik@192.168.0.236` should work

5. **Check persistence:**
   ```bash
   sudo reboot
   ```
   Pi should auto-connect to home WiFi (no SoftAP)

## Issues Fixed

1. **DHCP port conflict** — `dnsmasq.service` was blocking NetworkManager's DHCP
   - Fixed: installer disables standalone dnsmasq
   
2. **Dual WiFi interfaces** — `ap0` + `wlan0` caused IP jumping
   - Fixed: disabled `99-wireless-ap.rules` udev rule
   
3. **Static IP for ESP compatibility** — ESP hardcodes Pi IP
   - Fixed: Pi uses static `192.168.0.236` on home WiFi

4. **5GHz visibility** — Phone couldn't see 2.4GHz channel 6
   - Fixed: switched to 5GHz band `a`, channel 36

## Security Notes

- SoftAP password is hardcoded (`setup1234`) — change in boot script if needed
- API is HTTP-only (no TLS) — acceptable on isolated SoftAP
- Credentials stored plaintext in `/home/koushik/wifi-credentials.json`
- API runs as root (required for `nmcli`) — runs via systemd

## What's Next

- [x] Pi SoftAP + HTTP API
- [x] Mobile app provisioning UI
- [x] Boot automation (systemd)
- [x] SoftAP → hub handoff + `pi_hub` barebones (`/health` `/start` `/stop` `/motion` `/auth/drive`)
- [x] OpenCV object detection on the shared RTSP feed (`pi_hub.detect`, MobileNet-SSD, person-gated)
- [x] Real clip record (`pi_hub.clips`) + Drive upload (`pi_hub.drive`)
- [x] Encrypt Drive token at rest
- [ ] Real ffmpeg HLS in `pi_hub.live` (live is WebRTC; HLS is leftover)
- [ ] mDNS discovery (`homesecurity.local`) instead of hardcoded IP

## Layout

```
rasberry-pi-setup/
├── pi-setup-api.py           # SoftAP-only Flask (:4000 in setup mode)
├── pi-setup-boot.sh          # Gate: SoftAP vs start pi-hub
├── pi_hub/                   # Product hub after home Wi‑Fi
│   ├── app.py                # One Flask process :4000
│   ├── camera.py             # sole owner of /dev/video0 → MediaMTX
│   ├── live.py               # WebRTC session (HLS legacy)
│   ├── clips.py              # local clip cache
│   ├── detect.py             # OpenCV DNN person detection on RTSP
│   ├── events.py             # shared motion pipeline (clip → Drive)
│   └── drive.py              # encrypted token store + Drive upload
├── scripts/
│   └── fetch-detection-model.sh   # sha256-verified MobileNet-SSD weights
├── tests/
│   ├── test_detect.py        # detection gating / cooldown / backoff
│   └── test_drive.py         # token store + mocked Drive upload
├── systemd/
│   ├── pi-setup.service
│   └── pi-hub.service
├── install-pi-setup.sh
├── deploy-to-pi.sh
└── requirements.txt
```

## Quick Reference

| What | Where | Command |
|------|-------|---------|
| Start SoftAP | Pi | `sudo nmcli connection up Hotspot` |
| Stop SoftAP | Pi | `sudo nmcli connection down Hotspot` |
| View logs | Pi | `tail -f /var/log/pi-setup.log` |
| Reset config | Pi | `sudo rm /home/koushik/wifi-credentials.json && sudo reboot` |
| Check service | Pi | `systemctl status pi-setup.service` |
| Pi SoftAP IP | Mobile | `http://10.42.0.1:4000` |
| Pi home IP | Mobile | `http://192.168.0.236:4000` |

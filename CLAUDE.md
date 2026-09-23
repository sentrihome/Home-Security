# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
Home-Security/
├── ESPFirmwareV2/                   ESP32 firmware projects
│   ├── centralconsole_reboot/       Central console (ESP32-S3) firmware — main firmware target
│   ├── espflasher/                  Next.js web app for flashing ESP devices via browser
│   └── printed circuit/             PCB design exports (DXF)
├── mobile/                          React Native (Expo SDK 57) mobile app
├── rasberry-pi-setup/               Pi SoftAP provisioning + systemd service
├── DOCUMENTATION.md                 Full architecture spec (§1–§23, ~600 lines)
├── todo.md                          Phased implementation TODO (Priority order)
└── setup.md                         Backend setup instructions
```

**README.md is the architecture spec (§1–§23).** Implementation guides (currently
the phone Drive OAuth handoff) live in `DOCUMENTATION.md`. Read README.md
before making decisions about cross-component behavior, credential flows, or
protocol specs. The `todo.md` file orders implementation phases — follow its
priority ordering.

## Branch Naming Convention

Format: `<type>-<firstname>-<task>`

| Type prefix | Scope |
|-------------|-------|
| `raspberry-pi` / `pi` | Pi-related work |
| `esp` | ESP32 firmware work |
| `mob` | Mobile app work |

## 1. ESP32-S3 Central Console Firmware (`ESPFirmwareV2/centralconsole_reboot/`)

**Framework:** ESP-IDF v5.5.2 + Arduino-ESP32 v3.3.6. Minimal build enabled to keep binary small. 8MB flash.

```bash
idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyUSB0 flash
idf.py -p /dev/ttyUSB0 monitor
```

### Firmware Structure (`main/`)

| Files | Purpose |
|---|---|
| `main.cpp` | Entry point (`app_main`) — wires all subsystems |
| `core.h/.cpp` | Shared `log()` helper (timestamped Serial output) |
| `display.h/.cpp` | TFT init (TFT_eSPI), armed/unarmed UI state machine, touch gesture reading |
| `uielements.h/.c` | UI sprite assets — **1.9 MB RGB565 blob**. Do not edit manually; regenerate from PNG mockups or the web mockup in `espflasher/` |
| `connectivity.h/.cpp` | WiFi station init (ESP-IDF `esp_wifi`/`esp_event`). Hardcoded SSID/password for prototyping |
| `app_uart.h/.cpp` | UART1 driver (GPIO17 TX, GPIO18 RX, 230120 baud). RX poll only — no TX path yet |
| `jsonhandler.h/.cpp` | JSON parsing for incoming UART payloads |

### Key Wiring

- **TFT + Touch share SPI bus** (GPIO11/12/13); CS: TFT=GPIO10, Touch=GPIO8
- **Touch gesture area (ARM/DISARM):** x: 1982–2432, y: 350–803 (panel-specific, not calibrated)
- **UART1:** TX=17, RX=18, RTS=4, CTS=5 — receives sensor data
- **TFT pins:** DC=GPIO9, RST=GPIO14, BL=GPIO15
- **Touch PEN (IRQ):** GPIO7

### Known Issues

- **Parity bug** (`app_uart.cpp`): `UART_PARITY_ODD` set but protocol expects `UART_PARITY_DISABLE`
- **No UART TX path** — `uart_init()` only sets up RX
- **No event queue for UART** — synchronous poll only
- **SETTINGS page** defined in enum but unimplemented

## 2. Mobile App (`mobile/`)

**Stack:** Expo SDK 57 + Expo Router (file-based navigation) + TypeScript + SecureStore.

```bash
cd mobile
npm start          # dev server (press i/a/w or use expo dev client)
npm run ios        # iOS simulator
npm run android    # Android emulator
```

### App Map

| Route | Screen | Notes |
|---|---|---|
| `(tabs)/index` | Live stream | Pi start/stop/motion + cloud status stubs |
| `(tabs)/clips` | Clips | `GET /api/events` + thumbnail URLs from S3 |
| `(tabs)/setup` | Setup | Pi SoftAP provisioning + device linking |
| `(tabs)/settings` | Settings | Cloud URL + account |
| `/login` | Sign in | Token paste until OAuth deep links wired |

### Key Modules

| File | Purpose |
|---|---|
| `lib/api.ts` | `cloudApi` (port 3001) + `piApi` (port 4000) clients |
| `lib/config.ts` | Default backend URLs, Pi host normalization |
| `lib/storage.ts` | Session + URL persistence (SecureStore on native, AsyncStorage on web) |
| `lib/esp.ts` | ESP device communication helpers |
| `lib/pairing.ts` | Sensor pairing logic |
| `context/AuthContext.tsx` | `AuthProvider` + `useAuth()` — manages `AuthSession` (token + email) |
| `context/SetupWizardContext.tsx` | Setup wizard state machine |
| `types/index.ts` | `AuthSession`, `EventClip`, `StreamStatus`, `DeviceLinkRequest` |

### Env Overrides (create `mobile/.env`)

```
EXPO_PUBLIC_CLOUD_URL=https://your-ngrok.ngrok-free.app
EXPO_PUBLIC_PI_URL=http://192.168.x.x:4000
```

## 3. Pi Setup (`rasberry-pi-setup/`)

Flask HTTP API on port 4000 + systemd service. Handles SoftAP provisioning → home WiFi transition.

```bash
chmod +x install-pi-setup.sh
sudo ./install-pi-setup.sh
sudo reboot
```

**API endpoints:** `GET /status`, `GET /scan`, `POST /wifi`, `POST /start`, `POST /stop`, `POST /motion`,
`POST /detect/start`, `POST /detect/stop`, `GET /detect/status`,
`POST|GET|DELETE /auth/drive` (phone Google OAuth handoff → clip upload to Drive)

**Object detection:** `pi_hub/detect.py` runs MobileNet-SSD via OpenCV DNN against the shared
MediaMTX RTSP feed (never `/dev/video0` — `camera.py` owns that) and raises person-gated events
through `pi_hub/events.py`, the same pipeline `POST /motion` uses. Weights are fetched by
`scripts/fetch-detection-model.sh` with sha256 verification, not committed. Decision logic is
unit tested: `cd rasberry-pi-setup && python3 -m unittest discover -s tests`.

Pi runs at static IP `192.168.0.236` after provisioning. First-boot SoftAP: `HomeSecurity-Setup` at `10.42.0.1`.

## 4. ESP Flasher Web App (`ESPFirmwareV2/espflasher/`)

Next.js 16 + shadcn/ui + esptool-js. Browser-based ESP device flashing UI.

```bash
cd ESPFirmwareV2/espflasher
npm install
npm run dev
npm run build
npm run lint
```

## Architecture Overview (from DOCUMENTATION.md)

Three subsystems connected by two fully-specified links and one TBD:

```
Sensor Network → Central Console → Pi → Cloud/Mobile
(WROOM AP)      (S3 + WROOM)      (Raspberry Pi)  (FCM/ntfy/Drive)
```

**Key design decisions (D1–D19 in DOCUMENTATION.md §3):**
- No camera on any ESP32 — camera is Pi-attached only
- No persistent WebSocket for alerts — FCM (Android) + ntfy.sh (iOS)
- Livestream via Tailscale to Pi (only while app is open)
- Clips: Pi cache → Google Drive (app reads Drive directly)
- Sensor auth: WiFi PSK (network) + `sensor_key` (application)
- Arm/disarm: Pi is state authority; S3 validates PIN locally in NVS
- UART framing: `SYNC(2B) | CMD(1B) | LEN(2B) | PAYLOAD | CRC(1-2B)`
- Setup APs: unique per-unit credentials (HMAC-MAC derived), WPA2-secured

**Biggest open item:** §16 — Pi↔S3 link transport (static IP / mDNS / hybrid). Blocks alerting, PIN-set flow, and PSK backup. See `README.md` §16 and `todo.md` Phase 0.

## Implementation Order (from todo.md)

Follow the phased ordering in `todo.md`. Current priority:

1. **Phase 0** — Close blocking decisions (Pi↔S3 transport, arm/disarm scope)
2. **Phase 1** — ESP32 firmware provisioning core (UART framing, WiFi creds, PSK)
3. **Phase 2** — Sensor pairing and network
4. **Phase 3** — Pi baseline (validate existing, extend)
5. **Phase 4** — Pi↔S3 link (the big dependency)
6. **Phase 5+** — Arm/disarm, alerts, live view, clips

## IDE Configuration

ESP-IDF VSCode settings are pre-configured in `ESPFirmwareV2/centralconsole_reboot/.vscode/settings.json`:
- ESP-IDF v5.5.2 at `~/.espressif/v5.5.2/esp-idf`
- Target: `esp32s3`, port: `/dev/tty.usbmodem101`
- clangd 19.1.2 path configured

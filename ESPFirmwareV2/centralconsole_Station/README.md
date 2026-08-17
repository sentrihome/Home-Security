# Central Console (ESP32-S3) — Home Security System

An ESP32-S3 firmware serving as the central control console for a home security system. It manages a TFT display with touch input, communicates with external sensor devices over UART, connects to WiFi (station mode), and exposes a lightweight HTTP API.

## Overview

| Component | Details |
|---|---|
| **MCU** | ESP32-S3 |
| **Framework** | ESP-IDF + Arduino-ESP32 v3.3.6 |
| **Display** | 480×320 TFT LCD (SPI) with touch controller, using `TFT_eSPI` |
| **UART** | UART1 at 230,120 baud — receives data from external sensor devices |
| **WiFi** | Station mode (connects to SSID `espwifi`) |
| **HTTP API** | `/health` (GET) and `/pass` (POST) endpoints |

## Wiring

### TFT Display (SPI)

| TFT Pin | Function            | GPIO  |
|---------|---------------------|-------|
| SCK     | SPI Clock           | GPIO12|
| SDI     | SPI Data In (MOSI)  | GPIO11|
| SDO     | SPI Data Out (MISO) | GPIO13|
| CS      | Chip Select         | GPIO10|
| DC      | Data/Command        | GPIO9 |
| RST     | Reset               | GPIO14|
| BL      | Backlight           | GPIO15|

### Touch Controller (SPI)

| Touch Pin | Function            | GPIO  |
|-----------|---------------------|-------|
| TCK       | SPI Clock           | GPIO12|
| TDI       | SPI Data In (MOSI)  | GPIO11|
| TDO       | SPI Data Out (MISO) | GPIO13|
| TCS       | Touch Chip Select   | GPIO8 |
| PEN       | Touch Interrupt (IRQ)| GPIO7|

### UART1 (Sensor Communication)

| Function      | GPIO  |
|---------------|-------|
| TX            | GPIO17|
| RX            | GPIO18|
| RTS           | GPIO4 |
| CTS           | GPIO5 |

**Notes:**
- TFT display and touch controller share the same SPI bus; each has its own CS line (GPIO10 / GPIO8).
- DC (GPIO9) selects between command and data mode for the TFT.
- RST (GPIO14) resets the TFT display.
- BL (GPIO15) controls the display backlight (can often be tied to 3.3V or PWM-controlled for brightness).
- PEN (GPIO7) is the touch controller's interrupt/pen-down signal, used to detect touch events without polling.

### 4x4 Keypad

| Keypad Pin | Function   | GPIO  |
|------------|------------|-------|
| R1         | Row 1      | GPIO42|
| R2         | Row 2      | GPIO41|
| R3         | Row 3      | GPIO40|
| R4         | Row 4      | GPIO39|
| C1         | Column 1   | GPIO38|
| C2         | Column 2   | GPIO37|
| C3         | Column 3   | GPIO36|
| C4         | Column 4   | GPIO35|

### Pin Summary (by GPIO)

| GPIO   | Connected To            |
|--------|--------------------------|
| GPIO4  | UART RTS                |
| GPIO5  | UART CTS                |
| GPIO7  | Touch PEN (IRQ)         |
| GPIO8  | Touch TCS (CS)          |
| GPIO9  | TFT DC                  |
| GPIO10 | TFT CS                  |
| GPIO11 | Shared SDI/TDI (MOSI)   |
| GPIO12 | Shared SCK/TCK (Clock)  |
| GPIO13 | Shared SDO/TDO (MISO)  |
| GPIO14 | TFT RST                 |
| GPIO15 | TFT BL                  |
| GPIO17 | UART TX                 |
| GPIO18 | UART RX                 |
| GPIO35 | Keypad C4 (Column 4)    |
| GPIO36 | Keypad C3 (Column 3)    |
| GPIO37 | Keypad C2 (Column 2)    |
| GPIO38 | Keypad C1 (Column 1)    |
| GPIO39 | Keypad R4 (Row 4)       |
| GPIO40 | Keypad R3 (Row 3)       |
| GPIO41 | Keypad R2 (Row 2)       |
| GPIO42 | Keypad R1 (Row 1)       |

## Firmware Structure

```
main/
├── main.cpp              ← entry point (app_main), init & main loop
├── core.h / .cpp         ← shared log() helper
├── display.h / .cpp      ← TFT initialization, armed/unarmed UI rendering, touch processing
├── connectivity.h / .cpp ← WiFi station setup & auto-reconnect handler
├── app_uart.h / .cpp     ← UART1 driver config & receive polling
├── httpendpoints.h / .cpp← HTTP server with /health and /pass endpoints
└── uielements.h / .c     ← UI sprite assets (idle, armed, unarmed bitmaps)
```

## Runtime Flow

```
app_main()
  ├── initArduino()         — Arduino ESP32 compatibility layer
  ├── Serial.begin(115200)
  ├── wifi_init()           — connect to SSID espwifi via ESP-IDF WiFi driver
  ├── uart_init()           — install UART1 driver at 230,120 baud
  └── while(true):
      ├── display.init()    — one-shot: boot splash → idle screen
      ├── display.process() — read touch → toggle armed/unarmed state
      └── uart_receive()    — poll UART1 for incoming sensor data
```

## Build & Flash

```bash
# Set target and build
idf.py set-target esp32s3
idf.py build

# Flash (adjust COM port)
idf.py -p /dev/ttyUSB0 flash
```

### Build Configuration

This project requires specific sdkconfig and partition settings that differ from defaults:

| Setting | Value | Why |
|---|---|---|
| **Flash size** | 8MB (`CONFIG_ESPTOOLPY_FLASHSIZE_8MB`) | Board has 8MB flash (detected via `esptool.py flash_id`) |
| **TFT pins** | MOSI=11, SCLK=12, MISO=13, CS=10, DC=9, RST=14, BL=15 | Match physical wiring to the TFT_eSPI driver |
| **Touch** | TOUCH_CS=8, `CONFIG_ENABLE_TOUCH=y` | SPI touch controller on GPIO8 |
| **Partition table** | Custom `partitions.csv` (factory = `0x1F0000`) | Overrides arduino-esp32's default 1MB partition scheme |

The TFT_eSPI library reads pin configuration from sdkconfig (Kconfig), not from `User_Setup.h`. If you reset menuconfig, you must re-apply these settings.

---

## Development Timeline

| Date       | Milestone                            | Details |
|------------|--------------------------------------|---------|
| 2026-03-23 | **Project reinitialization**         | Cleaned up repo, started screen component work and prototyping |
| 2026-03-24 | Screen component                     | Got display driver compiling, added screen component |
| 2026-03-27 | Display okay                         | Display was functional |
| 2026-03-29 | UI rehaul                            | Major UI overhaul |
| 2026-06-04 | 3D object files                      | Added 3D model files (project casing) |
| 2026-06-09 | **ESP32 firmware reboot**            | Fresh start on the ESP32 firmware codebase |
| 2026-06-11 | Display configuration                | Configured TFT display with correct SPI wiring |
| 2026-06-16 | UI framework                         | Restructured display module, added armed ↔ disarmed state transition, fixed full-screen redraw bug when returning from armed to disarmed, mapped touch coordinates to actions |
| 2026-06-16 | Touch command integration            | Implemented `Touch` class — reads raw touch coords via SPI, maps a gesture area for ARM/DISARM toggle |
| 2026-06-18 | ESP-IDF migration                    | Transitioned codebase to ESP-IDF |
| 2026-06-29 | WiFi driver revision                 | Rewrote WiFi init using `esp_wifi`/`esp_event` APIs, solved auto-reconnection on disconnect |
| 2026-06-30 | AP mode prototype                    | Added Access Point mode alongside station mode |
| 2026-07-08 | Startup display polish               | Added status updates on display during boot (display init → wifi station), fixed startup comments appearing on UI, resolved AP discovery & channel issues |
| 2026-07-08 | HTTP API                             | Configured HTTP server with routes (`/health`, `/pass`), POST password validation flow |
| 2026-07-09 | UART parsing fix                     | Fixed data receive corruption in UART parsing |
| 2026-07-10 | Second ESP (AP mode)                 | Initialized second ESP as access point with HTTP endpoints |
| 2026-07-11 | AP disabled                          | Removed AP mode from central console, added wiring documentation |
| 2026-07-11 | UART driver                          | Configured UART driver for sensor communication (GPIO17 TX / GPIO18 RX) |
| 2026-07-28 | **Module separation (current)**      | Separated device modules into distinct files (`connectivity`, `app_uart`, `httpendpoints`), moved endpoints out of `main.cpp`, wired all modules into `app_main()` entry point |

---

## Known Issues & Notes

### WiFi credential buffer in `wifi_start()`

`connectivity_esp.cpp` copies SSID/password into the `wifi_config_t` struct using `memcpy` with `size() + 1` (including null terminator):

| Buffer | Size | Overflow triggers at |
|--------|------|---------------------|
| `sta.ssid` | 32 bytes | SSID ≥ 32 bytes (33 bytes copied) |
| `sta.password` | 64 bytes | Password ≥ 64 bytes (65 bytes copied) |

**Why this is not a practical bug:**
- IEEE 802.11 caps SSIDs at 32 bytes; WPA2 caps passphrases at 64 bytes. No valid credential can exceed these limits.
- Even with a 32-byte SSID, the overflow null byte overwrites `password[0]`, which is immediately overwritten by the next `memcpy` for the password. The struct ends up correct.
- The WiFi driver (`esp_wifi_set_config`) would reject credentials longer than the spec anyway.

**Safe input limits:** SSID ≤ 31 bytes, password ≤ 63 bytes. These are also within the WPA2 passphrase range (8–63 bytes).

### UART

- TX/RX pins are swapped (`uart_set_pin(UART_NUM_1, 18, 17, ...)`) because the physical connector is wired straight-through (pin 1 to pin 1). This is intentional for the current hardware.
- Parity is set to `UART_PARITY_ODD` — both ends of the UART link use odd parity.

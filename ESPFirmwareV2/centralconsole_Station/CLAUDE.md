# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Two co-located projects in one repo:

1. **ESP32-S3 firmware** (`main/`) — Home security central console: 480×320 TFT touch display, UART sensor comms, WiFi station, HTTP API.
2. **Next.js web app** (`plan/`) — Home Security panel UI (desktop mockup of the TFT display), built with Next.js 16 + shadcn/ui + Tailwind CSS v4.

## Build & Run

### ESP Firmware

```bash
# Set target and build
idf.py set-target esp32s3
idf.py build

# Flash (adjust COM port)
idf.py -p /dev/ttyUSB0 flash

# Monitor serial output
idf.py -p /dev/ttyUSB0 monitor
```

Uses minimal build (`idf_build_set_property(MINIMAL_BUILD ON)`) to keep binary size small. Partition layout: 6KB NVS + 4KB phy + 2M factory app (`partitions.csv`).

### Next.js Web App

```bash
cd plan
npm install          # if dependencies not installed
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint
```

## Architecture

### ESP Firmware (`main/`)

Single endless loop — no RTOS tasks, no FreeRTOS:

```
app_main()
  ├── initArduino()          — Arduino ESP32 compat layer
  ├── Serial.begin(115200)   — debug output
  ├── wifi_init()            — station mode to "espwifi"
  ├── // endpoint_init()     — HTTP server (currently commented out in main.cpp:25)
  ├── uart_init()            — UART1 at 230,120 baud for sensor comms
  └── while(true):
      ├── display.init()     — one-shot: boot splash → idle screen
      ├── display.process()  — read touch → toggle armed/unarmed
      └── uart_receive()     — poll UART1 (up to 199 bytes) for incoming data
```

### Web App (`plan/`)

Next.js 16 app-router project with shadcn/ui component library. The main page ([plan/app/page.tsx](plan/app/page.tsx)) is a pixel-accurate mockup of the TFT display (480×320) with armed/disarmed state, motion detection toggle, and settings navigation. Also includes [plan/scripts/home_security_ui.ino](plan/scripts/home_security_ui.ino) — a more complete Arduino UI design with bitmap icons, rounded cards, switch controls, and a planned settings page.

### Cross-Project Architecture

The web app (`plan/`) is a **design mockup / reference implementation** of what the TFT display should look like. The firmware's current UI ([main/display.cpp](main/display.cpp)) uses pre-flashed 16-bit BMP sprites for armed/disarmed states, while the web app uses Tailwind + Lucide icons as the target aesthetic. The Arduino sketch in [plan/scripts/home_security_ui.ino](plan/scripts/home_security_ui.ino) bridges the two — it's a full TFT_eSPI sketch implementing the planned UI with drawn primitives and bitmap icons.

### Module Map (`main/`)

| Files | Purpose |
|---|---|
| `main.cpp` | Entry point and main loop — wires all subsystems together |
| `core.h/.cpp` | Shared `log()` helper printing timestamped messages to Serial |
| `display.h/.cpp` + `uielements.h` | TFT init (TFT_eSPI), armed/unarmed UI state machine, touch gesture reading |
| `uielements.c` | UI sprite assets — **1.9 MB blob** of raw RGB565 pixel arrays (502 lines). Do not edit manually; regenerate from PNG mockups if needed. |
| `connectivity.h/.cpp` | WiFi station init using ESP-IDF `esp_wifi`/`esp_event`. Hardcoded SSID/password (`espwifi`/`23012003`). Auto-reconnects on disconnect. |
| `app_uart.h/.cpp` | UART1 driver (GPIO17 TX, GPIO18 RX, RTS=4, CTS=5, 230120 baud). Synchronous poll receive — no TX API exposed yet. |
| `httpendpoints.h/.cpp` | HTTP server with `/health` (GET) and `/pass` (POST). Currently disabled in main.cpp but functional as-is. |

### Wiring Summary

- **TFT + Touch share SPI bus** on GPIO11/12/13; separate CS: TFT=GPIO10, Touch=GPIO8
- **Touch gesture area (ARM/DISARM button):** x: 1982–2432, y: 350–803
- **UART1:** TX=17, RX=18, RTS=4, CTS=5 — receives sensor data
- **TFT-specific pins:** DC=GPIO9, RST=GPIO14, BL=GPIO15
- **Touch PEN (IRQ):** GPIO7

### Global State

Several globals are shared across modules without synchronization:
- `app_wifi_station_start` (in [display.cpp:10](main/display.cpp:10)) — set by WiFi event handler, read by Display::init()
- `display_wifi_station_start`, `init_done`, `startup_phase_1/2` — display boot-phase flags
- `motionArmed` (in [plan/scripts/home_security_ui.ino](plan/scripts/home_security_ui.ino:169)) — web app UI state

## IDE Configuration

VSCode settings ([.vscode/settings.json](.vscode/settings.json)) are pre-configured for ESP-IDF development:
- `idf.currentSetup`: ESP-IDF v5.5.2 at `~/.espressif/v5.5.2/esp-idf`
- `IDF_TARGET`: esp32s3
- `clangd.path`: ESP clang 19.1.2
- `idf.port`: `/dev/tty.usbmodem101`
- `idf.openOcdConfigs`: `board/esp32s3-builtin.cfg`

C++ IntelliSense ([.vscode/c_cpp_properties.json](.vscode/c_cpp_properties.json)) uses the ESP-IDF compiler path and compile_commands.json from the build directory.

## Coding Conventions Observed

- All modules are plain C++ with `extern "C"` only for `app_main()` (ESP-IDF requirement)
- No headers guard (`#pragma once`) on `.cpp` files — only `.h` files use it
- Buffers that hold strings: **always leave room for null terminator** when using fixed-size arrays
- Touch coordinates are hardcoded pixel ranges from the specific display unit used during development (not calibrated at runtime)
- Uses ESP-IDF HTTPD server (`esp_http_server`) — handlers return `esp_err_t` and use `httpd_req_recv`/`httpd_resp_sendstr` etc.
- UART config uses 230,120 baud. **Do not change without confirming against the external device protocol spec.**

## Notable Current Limitations & Bugs

- **Parity bug** (app_uart.cpp:21) — `uartconf.parity` is set to `UART_PARITY_ODD` but the protocol expects no parity (`UART_PARITY_DISABLE`). This is likely a copy-paste error.
- **Fixed: UART buffer overflow** (app_uart.cpp) — was writing past buffer bounds when `uart_read_bytes` returned 200; fixed by limiting to `sizeof-1` and terminating at the last safe byte
- **No UART TX path** — `uart_init()` only sets up RX; no send function exists
- **Touch coordinates are panel-specific** — fixed pixel ranges won't calibrate across different display units
- **WiFi credentials hardcoded** in source (acceptable for prototyping)
- **HTTP endpoints disabled** in `main.cpp` (`// endpoint_init()`) — uncomment to enable
- **No event queue for UART** — synchronous poll only, fragile under high throughput
- **SETTINGS page defined but unimplemented** — `Display::Page` enum has `SETTINGS` but no corresponding method or UI
- **uielements.c is a 1.9 MB blob** — raw RGB565 pixel data; use PNG mockups in `UI Mockups/` or the web app in `plan/` as reference for UI changes

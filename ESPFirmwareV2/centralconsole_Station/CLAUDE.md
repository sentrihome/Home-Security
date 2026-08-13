# CLAUDE.md

## IMPORTANT: Always Read All Files First

**Before answering any question about this codebase, read every source file in `main/` and understand the full codebase.** Do not answer from partial context, assumptions, or references to files you haven't read. If a question requires understanding behavior, trace through the actual code — don't guess. If you haven't read a file yet, read it before making claims about it. This applies to bug reports, feature questions, architecture discussions, and code reviews.

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
  ├── storage.init()         — NVS init + open namespace "app"
  ├── wifi_init()            — WiFi driver + event loop (no connect yet)
  ├── wifi_start(ssid, pass) — connect if creds exist in NVS
  ├── uart.init()            — UART1 at 230,120 baud, odd parity
  └── while(true):
      ├── display.init()     — one-shot: boot splash → idle screen
      ├── display.process()  — read touch → toggle armed/unarmed
      └── pair.receive()     — poll UART1 for sensor data
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
| `storage.h/.cpp` | NVS storage wrapper — `init()` opens namespace "app", `store()` writes strings, `read()` reads strings (up to 63 bytes) |
| `display.h/.cpp` + `uielements.h` | TFT init (TFT_eSPI), armed/unarmed UI state machine, touch gesture reading |
| `uielements.c` | UI sprite assets — **1.9 MB blob** of raw RGB565 pixel arrays (502 lines). Do not edit manually; regenerate from PNG mockups if needed. |
| `connectivity.h/.cpp` | WiFi station init using ESP-IDF `esp_wifi`/`esp_event`. `wifi_init()` sets up event loop; `wifi_start(ssid, pass)` configures and connects. Auto-reconnects on disconnect. |
| `app_uart.h/.cpp` | UART1 driver (`uart_s`) + frame parser/builder (`pair_s`). TX=GPIO18, RX=GPIO17 (swapped for straight-through physical wiring), RTS=4, CTS=5, 230120 baud, odd parity. Frame format: `SYNC(2B: "c8") | CMD(1B) | LEN(2B) | PAYLOAD | CRC(2B)`. CRC = `cmd + 2*length`. Only command: `MOBILE_PAIRING` — extracts JSON fields, stores creds in NVS, triggers WiFi reconnection. |
| `jsonhandler.h/.cpp` | cJSON wrapper — `jsonparser(json_str, key)` returns string value for a key, or "" if not found |

**Note:** HTTP endpoints (`httpendpoints.h/.cpp`) are mentioned in documentation but do not exist in this project. They are not in `CMakeLists.txt` and no source files exist.

### Wiring Summary

- **TFT + Touch share SPI bus** on GPIO11/12/13; separate CS: TFT=GPIO10, Touch=GPIO8
- **Touch gesture area (ARM/DISARM button):** x: 1982–2432, y: 350–803
- **UART1:** TX=GPIO18, RX=GPIO17 (swapped — physical connector is wired straight-through, pin 1 to pin 1), RTS=4, CTS=5, 230120 baud, odd parity (both ends use odd parity)
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

## General Instructions

- **Always make the minimal changes needed.** Do not refactor, rename, or reformat code unless explicitly asked. Only touch the specific lines that address the issue at hand.

## Coding Conventions Observed

- All modules are plain C++ with `extern "C"` only for `app_main()` (ESP-IDF requirement)
- No headers guard (`#pragma once`) on `.cpp` files — only `.h` files use it
- Buffers that hold strings: **always leave room for null terminator** when using fixed-size arrays
- Touch coordinates are hardcoded pixel ranges from the specific display unit used during development (not calibrated at runtime)
- Uses ESP-IDF HTTPD server (`esp_http_server`) — handlers return `esp_err_t` and use `httpd_req_recv`/`httpd_resp_sendstr` etc.
- UART config uses 230,120 baud. **Do not change without confirming against the external device protocol spec.**

## Notable Current Limitations & Bugs

- **UART TX/RX swapped** (`app_uart.cpp:32`) — intentional: physical connector is wired straight-through (pin 1 to pin 1). Do not "fix" this.
- **Parity set to `UART_PARITY_ODD`** (`app_uart.cpp:26`) — intentional: both UART ends use odd parity.
- **Touch uses `getTouchRaw()`** (`display.cpp:76`) — reads raw ADC noise when not touched. The proper method `getTouch()` checks pressure. This can cause spurious armed/disarmed toggles.
- **Touch debounce** (`display.cpp:95`) — `delay(80)` after toggle helps, but no state tracking for "is touch currently pressed". A sustained press could toggle multiple times.
- **Touch coordinates are panel-specific** — fixed pixel ranges won't calibrate across different display units.
- **No UART TX API** — `uart_s::init()` exists but `pair_s::send()` uses `uart_write_bytes` directly on `UART_NUM_1`. The TX path works but isn't part of a public API.
- **No event queue for UART** — synchronous poll only, `uart_read_bytes()` blocks up to 100ms. During this time, display and touch are not processed.
- **`pair.receive()` return value ignored** in main loop — caller doesn't know if data was actually processed.
- **`storage_s::read()` uses fixed 64-byte buffer** — if a stored value exceeds 63 bytes + null, `nvs_get_str` returns `ESP_ERR_NVS_INVALID_LENGTH` and the function returns empty string.
- **`wifi_start()` called unconditionally at boot** — if NVS has no credentials, `wifi_start("")` runs and tries to connect to an empty SSID. The device won't be useful without WiFi anyway.
- **NVS errors logged via printf** — `storage.cpp` now checks all NVS return values. On failure, errors are printed but no recovery logic exists beyond the initial `nvs_flash_erase()` retry in `init()`.
- **CRC validation** — uses `cmd + 2*length` as a simple checksum. `cmd_rec` is now `uint8_t` (was `char`), so all command values 0x00–0xFF work correctly.
- **uielements.c is a 1.9 MB blob** — raw RGB565 pixel data; use PNG mockups in `UI Mockups/` or the web app in `plan/` as reference for UI changes.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ESP32-S3 firmware for a home security central console running ESP-IDF + Arduino-ESP32 v3.3.6. Manages a 480x320 TFT touch display, communicates with external sensor devices over UART, connects to WiFi (station mode), and exposes a lightweight HTTP API.

## Build & Flash

```bash
# Set target and build
idf.py set-target esp32s3
idf.py build

# Flash (adjust COM port)
idf.py -p /dev/ttyUSB0 flash
# Monitor serial output
idf.py -p /dev/ttyUSB0 monitor
```

The project uses minimal build (`idf_build_set_property(MINIMAL_BUILD ON)`) in `CMakeLists.txt` to keep binary size small. Dependencies are managed via `main/idf_component.yml`.

## Architecture

### Entry Point & Runtime (`main/main.cpp`)

Single endless loop — no RTOS tasks, no FreeRTOS:

```
app_main()
  ├── initArduino()          — Arduino ESP32 compat layer
  ├── Serial.begin(115200)   — debug output
  ├── wifi_init()            — station mode to "espwifi"
  ├── uart_init()            — UART1 at 230,120 baud for sensor comms
  └── while(true):
      ├── display.init()     — one-shot: boot splash → idle screen
      ├── display.process()  — read touch → toggle armed/unarmed
      └── uart_receive()     — poll UART1 (up to 199 bytes) for incoming data
```

### Module Map (`main/`)

| Files | Purpose |
|---|---|
| `main.cpp` | Entry point and main loop — wires all subsystems together |
| `core.h/.cpp` | Shared `log()` helper printing timestamped messages to Serial |
| `display.h/.cpp` + `uielements.h/.c` | TFT init (TFT_eSPI), armed/unarmed UI state machine, touch gesture reading. UI assets are 16-bit BMP arrays flashed with firmware. |
| `connectivity.h/.cpp` | WiFi station init using ESP-IDF `esp_wifi`/`esp_event`. Hardcoded SSID/password (`espwifi`/`23012003`). Auto-reconnects on disconnect. |
| `app_uart.h/.cpp` | UART1 driver (GPIO17 TX, GPIO18 RX, RTS=4, CTS=5, 230120 baud, 8N1). Synchronous poll receive — no TX API exposed yet. |
| `httpendpoints.h/.cpp` | HTTP server with `/health` (GET) and `/pass` (POST accepts body like `password=[val]`). Currently commented out in main.cpp but functional as-is. |

### Wiring Summary

- **TFT + Touch share SPI bus** on GPIO11/12/13; separate CS: TFT=GPIO10, Touch=GPIO8
- **Touch gesture area (ARM/DISARM button):** x: 1982–2432, y: 350–803
- **UART1:** TX=17, RX=18, RTS=4, CTS=5 — receives sensor data
- **TFT-specific pins:** DC=GPIO9, RST=GPIO14, BL=GPIO15

## Coding Conventions Observed

- All modules are plain C++ with `extern "C"` only for `app_main()` (ESP-IDF requirement)
- No headers guard (`#pragma once`) on `.cpp` files — only `.h` files use it
- Buffers that hold strings: **always leave room for null terminator** when using fixed-size arrays
- Touch coordinates are hardcoded pixel ranges from the specific display unit used during development (not calibrated at runtime)
- Uses ESP-IDF HTTPD server (`esp_http_server`) — handlers return `esp_err_t` and use `httpd_req_recv`/`httpd_resp_sendstr` etc.
- UART config uses 230,120 baud with 8N1 parity (no parity). Do not change without confirming against the external device protocol spec.

## Notable Current Limitations & Bugs

- **Fixed: UART buffer overflow** (app_uart.cpp) — was writing past buffer bounds when `uart_read_bytes` returned 200; fixed by limiting to `sizeof-1` and terminating at the last safe byte
- **No UART TX path** — `uart_init()` only sets up RX; no send function exists
- **Touch coordinates are panel-specific** — fixed pixel ranges won't calibrate across different display units
- **WiFi credentials hardcoded** in source (acceptable for prototyping)
- **HTTP endpoints disabled** in `main.cpp` (`// endpoint_init()`) — uncomment to enable
- **No event queue for UART** — synchronous poll only, fragile under high throughput

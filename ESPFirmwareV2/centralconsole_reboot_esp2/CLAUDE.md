# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ESP32 firmware for a home security central console running ESP-IDF v5.5 + Arduino-ESP32 v3.3.7. This variant (esp2) exposes an HTTP server that accepts configuration parameters (SSID, passwords, OTP, schedule) via query-string POST endpoints and relays them to external sensor devices over UART1. The device runs as a WiFi Access Point (`espwifi` / `23012003`) rather than station mode.

## Build & Flash

```bash
# Set target and build
idf.py set-target esp32
idf.py build

# Flash (adjust COM port)
idf.py -p /dev/tty.usbserial-110 flash

# Monitor serial output
idf.py -p /dev/tty.usbserial-110 monitor
```

Local dev config in `.vscode/settings.json`: IDF at `~/.espressif/v5.5.2/esp-idf`, target `esp32`, UART port `/dev/tty.usbserial-110`. The project uses minimal build (`idf_build_set_property(MINIMAL_BUILD ON)`) in the root `CMakeLists.txt`.

## Endpoints

| Method | Path | Query Param | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check, returns `{ "health": "ok" }` |
| `POST` | `/pass` | `password` | Receive permanent password |
| `POST` | `/ssid` | `ssid` | Receive Wi-Fi SSID |
| `POST` | `/permanentpass` | `permanentpass` | Receive permanent pass (redundant with `/pass`) |
| `POST` | `/encryptedpass` | `encryptedpass` | Receive encrypted password |
| `POST` | `/otp` | `otp` | Receive one-time password |
| `POST` | `/schedule` | `schedulestart` | Set schedule start time |
| `POST` | `/schedule` | `schedulestop` | Set schedule stop time |

All POST handlers extract the named query parameter, forward its value to the UART-connected sensor device, and return a JSON ack.

## Architecture

### Entry Point & Runtime (`main/main.cpp`)

Single endless loop — no RTOS tasks, no FreeRTOS:

```
app_main()
  ├── initArduino()          — Arduino ESP32 compat layer
  ├── Serial.begin(115200)   — debug output over USB-CDC
  ├── wifi_init()            — AP mode "espwifi" / "23012003"
  ├── endpoint_init()        — HTTP server on default port (80)
  └── while(true):
      ├── delay(2000)        — ~500mHz tick
      └── uart_receive()     — poll UART1 for incoming sensor data
```

### Module Map (`main/`)

| Files | Purpose |
|---|---|
| `main.cpp` | Entry point and main loop — wires all subsystems together |
| `httpendpoints.h/.cpp` | HTTP server (esp_http_server). Endpoints: `GET /health`, `POST /pass`, `POST /ssid`, `POST /permanentpass`, `POST /encryptedpass`, `POST /otp`, `POST /schedule` (x2 — start/stop distinguished by query param name). All POST handlers extract a single query-string parameter, call `uart_send()`, then respond JSON |
| `connectivity.h/.cpp` | WiFi AP init using ESP-IDF. Hardcoded SSID/password (`espwifi` / `23012003`), WPA2-PSK, channel 11, max 5 connections |
| `app_uart.h/.cpp` | UART1 driver (GPIO17 TX, GPIO18 RX, RTS=4, CTS=5, **230120 baud**, 8 bits, odd parity, no flow control). Poll receive on a 200-byte global buffer. `uart_send()` writes payload then appends `"END_OF_MESSAGE"` delimiter with 1s delays between each write |

### Data Flow

```
HTTP client ──POST──> HTTP server (port 80)
                         │ extract query param
                         ▼
                    uart_send() ──UART1──> External sensor device
                ("END_OF_MESSAGE" delimiter appended)
                ◄──────────────────────────────
              uart_receive() polls for inbound data
```

### Key Constants

| Setting | Value | Notes |
|---|---|---|
| WiFi AP SSID | `espwifi` | Hardcoded |
| WiFi AP Password | `23012003` | Hardcoded |
| UART Baud Rate | 230120 | Odd parity — do not change without protocol spec |
| UART GPIO | TX=17, RX=18, RTS=4, CTS=5 | ESP32 pinout |
| Serial debug | 115200 | USB-CDC |
| Main loop period | 2000ms | `delay(2000)` in while(true) |

## Coding Conventions Observed

- All modules are plain C++ with `extern "C"` only for `app_main()` (ESP-IDF requirement)
- `.h` files use `#pragma once`; no guards on `.cpp` files
- Query-string parameters parsed via `httpd_query_key_value()` — buffers are 50 bytes, params must fit within that
- UART TX adds a `"END_OF_MESSAGE"` delimiter with 1s delays between writes — the receiver presumably uses this as frame boundary
- Fixed-size char arrays used throughout (buf[50], extract[50]) — parameter values are silently truncated past capacity

## Security Findings

### HIGH

**1. No authentication on credential endpoints** (`httpendpoints.cpp` lines 26-138) — All 7 POST endpoints accept passwords, OTPs, and schedules with zero access control. Any device connected to the AP WiFi can submit credentials that get relayed to downstream sensor hardware via UART.

**2. Plaintext credential logging** (`httpendpoints.cpp` lines ~31,46,61,78,95) — Every credential handler does `printf("... extracted part %s\n", extract)`, dumping submitted secrets to UART debug output accessible to anyone with physical serial console access.

### MEDIUM

**3. Unvalidated forwarding to UART** (all handlers) — Query parameters are passed directly to `uart_send()` with no length, charset, or format validation. Oversized inputs corrupt the 200-byte `uart_message` buffer in `app_uart.cpp`.

**4. Duplicate `/schedule` URI** (`httpendpoints.cpp` lines 178-187) — Both schedule start and stop register the same path/method; esp_http_server silently discards one (last wins). One endpoint is completely broken with no error or warning.

## Dependencies

| Dependency | Version | Source |
|---|---|---|
| ESP-IDF | v5.5 | `~/.espressif/v5.5.2/esp-idf` |
| Arduino-ESP32 | 3.3.7 | `idf_component.yml` |
| esp_http_server | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |
| esp_driver_uart | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |
| spi_flash | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |

## Testing & Dev Container

The project includes a QEMU-based dev container and ESP-IDF pytest harness:

```bash
# Run pytest tests (requires ESP-IDF with QEMU)
pytest pytest_hello_world.py -v

# Dev container (QEMU) — see .devcontainer/devcontainer.json
# Builds and runs the firmware in QEMU for headless testing
```

The `pytest_hello_world.py` covers: generic target test, macOS host test, Linux host test, and ELF SHA256 embedding verification via QEMU.

## Notable Current Limitations & Bugs

- **Blocking main loop** — `delay(2000)` in the while(true) tick means nothing runs between polls; long UART reads will block HTTP handlers and vice versa
- **Shared global buffer** — `uart_message[200]` is a single mutable global with no mutex or double-buffering; concurrent access from loop poll and any async callback would corrupt data
- **WiFi AP is always-on** with hardcoded credentials in plaintext source code

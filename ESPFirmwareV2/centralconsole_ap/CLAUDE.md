# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ESP32 (original, not S3) firmware for a home security central console. This variant (`esp2`) runs as a WiFi Access Point and exposes a single HTTP endpoint (`/pair`) that accepts a JSON configuration payload, then relays it over UART1 to the companion S3 firmware (internal inter-ESP link) using a binary frame protocol. See `README.md` for endpoint specs and UART frame format.

## Build & Flash

```bash
# Set target and build
idf.py set-target esp32
idf.py build

# Flash (adjust COM port)
idf.py -p /dev/tty.usbserial-110 flash

# Monitor serial output (USB-CDC debug, 115200 baud)
idf.py -p /dev/tty.usbserial-110 monitor
```

Local dev config in `.vscode/settings.json`: IDF at `~/.espressif/v5.5.2/esp-idf`, target `esp32`, UART port `/dev/tty.usbserial-110`. Minimal build enabled in root `CMakeLists.txt`.

## Architecture

### Entry Point & Runtime (`main/main.cpp`)

Single threaded loop — no RTOS tasks, no FreeRTOS:

```
app_main()
  ├── initArduino()              — Arduino ESP32 compat layer
  ├── Serial.begin(115200)       — debug output over USB-CDC
  ├── wifi_init()                — AP mode "espwifi" / "23012003"
  ├── endpoint_init()            — HTTP server on port 80
  ├── uart.init()                — UART1 driver (230120 baud, odd parity)
  ├── ap_start("espwifi", "23012003")
  └── while(true):
      ├── delay(100)             — 10 Hz poll
      └── uart.receive()         — poll for incoming sensor data
```

### Module Map (`main/`)

| Files | Purpose |
|---|---|
| `main.cpp` | Entry point and main loop |
| `httpendpoints.h/.cpp` | HTTP server (esp_http_server). Endpoints: `GET /health`, `POST /pair` (JSON body). `/pair` parses JSON via cJSON, forwards raw body to UART, waits up to 6s for S3 response via FreeRTOS queue, then relays result back |
| `app_uart.h/.cpp` | UART1 driver (GPIO17 TX, GPIO18 RX, RTS=4, CTS=5, 230120 baud, 8N1+odd parity). Class-based `uart_s` with binary frame encoding (SYNC | CMD | LEN | PAYLOAD | CRC). `receive()` polls on a 200-byte buffer and dispatches parsed responses to a queue |
| `connectivity.h/.cpp` | WiFi AP init (`esp_wifi`/`esp_event`). SSID/password hardcoded. `ap_start()` configures and starts AP |
| `jsonhandler.h/.cpp` | Thin cJSON wrapper: `jsonparser(json_str, key)` returns the string value for a given key, or `""` if missing/not found |

### Data Flow

```
Client Device ──HTTP POST /pair──> ESP32 (AP: espwifi)
                                     │
                                     ▼
                              Binary frame encoding
                              SYNC|CMD|LEN|PAYLOAD|CRC
                                     │
                                     ▼
                              UART1 (230120 baud, odd parity)
                                     │
                                     ▼
                          Companion ESP32-S3 firmware (station)
                                     │
                     ◄──────────────┘
                  (response via same frame format)
```

### Key Constants

| Setting | Value | Notes |
|---|---|---|
| WiFi AP SSID | `espwifi` | Hardcoded |
| WiFi AP Password | `23012003` | Hardcoded |
| UART Baud Rate | 230120 | Odd parity, verified matching S3 side |
| UART GPIO | TX=17, RX=18, RTS=4, CTS=5 | ESP32 pinout |
| Serial debug | 115200 | USB-CDC |
| Main loop period | 100ms | `delay(100)` in while(true) |
| HTTP stack size | 8192 bytes | Sufficient for ~170-byte JSON payload |
| Queue depth (`waitfors3`) | 1 slot | 1-slot queue of `std::string*` for sensor responses |

### Dependencies

| Dependency | Version | Source |
|---|---|---|
| ESP-IDF | v5.5.2 | `~/.espressif/v5.5.2/esp-idf` |
| Arduino-ESP32 | 3.3.7 | `idf_component.yml` |
| cJSON | ^1.7.19~2 | `idf_component.yml` |
| esp_http_server | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |
| esp_driver_uart | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |
| spi_flash | (ESP-IDF bundled) | `main/CMakeLists.txt` REQUIRES |

## Coding Conventions Observed

- All modules are plain C++ with `extern "C"` only for `app_main()` (ESP-IDF requirement)
- `.h` files use `#pragma once`; no guards on `.cpp` files
- Binary UART framing: `SYNC(2B: 0x63 0x38) | CMD(1B) | LEN(2B BE) | PAYLOAD(N) | CRC(2B BE)`
- CRC formula: `cmd_int + 2 * payload_len` (additive hash, big-endian)
- Queue-based response handling: writer allocates with `new`, sends non-blocking (`ticks=0`); reader waits up to 6s, then `delete`s. Return value of `xQueueSend` is checked and leaked memory is freed on failure
- `jsonparser()` returns `""` for both parse failure and key-not-found — indistinguishable from an empty string value

## Notable Current Limitations

- **Blocking main loop** — HTTP handlers and UART polling share the same thread. FreeRTOS tasks needed for production
- **No authentication on `/pair`** — Any device on the AP WiFi can submit credentials
- **Plaintext credential logging** — All parsed values logged via `printf` to UART debug console
- **No persistent storage** — Credentials passed through to UART and forgotten; nothing stored in NVS
- **Weak checksum** — CRC is an additive hash (`cmd + 2*len`) that doesn't include payload bytes

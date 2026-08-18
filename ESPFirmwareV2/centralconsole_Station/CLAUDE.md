# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Debugging & Verification Discipline

The local model backing this session (quantized, non-frontier) is prone to two failure patterns on precision-critical code — buffer offsets, index arithmetic, byte/bit-level parsing, pointer math, off-by-one conditions. Follow these rules when investigating bugs or verifying claims about correctness in this class of code:

1. **No verdict before a full trace.** Before stating whether something is a bug, write out an explicit step-by-step trace — one row per index/offset/iteration — covering the entire relevant range, not a representative subset or a summary. If you catch yourself concluding without having listed every step, stop and produce the full trace first.

2. **Re-derive, don't re-assert.** If asked to "check again," "verify," or "are you sure," do not simply flip your answer in response to the pushback itself. Redo the full trace from scratch as if you had never produced a prior answer, then explicitly compare the new trace's conclusion to the old one and state whether they agree and why.

3. **Trace and verdict are separate steps.** Produce the full trace as its own complete output first. Only after the trace is finished, state the verdict as a distinct final step that references specific rows/steps from the trace above it — not a general impression of "this looks correct/incorrect."

4. **Concrete example required, not abstract description.** Trace against a concrete example input with explicit values (actual byte contents, actual indices, actual pointer addresses) — never reason about the logic in the abstract without instantiating real data.

5. **State uncertainty explicitly.** If the trace is inconclusive, or if you're not fully confident after tracing, say so directly rather than picking the more confident-sounding of two possible answers. "The trace shows X, but I'm not certain about edge case Y" is a better answer than a confident verdict that might be wrong.

## Project Overview

ESP32-S3 firmware for a home security central console. The firmware runs on an ESP32-S3 with a 480x320 TFT LCD (ILI9488), SPI touch controller, UART1 for sensor communication, and WiFi station mode. It serves as the central control panel — users arm/disarm via touch gestures, and sensor data arrives over UART from external ESP32 sensor devices.

This is one of two ESP32 firmware projects in the repo. See the sibling `centralconsole_ap/` (the WROOM sensor AP firmware). For cross-project architecture, credential flows, and protocol specs, read the root-level [DOCUMENTATION.md](../../DOCUMENTATION.md) and [todo.md](../../todo.md).

## Build & Flash

```bash
# Set target (one-time)
idf.py set-target esp32s3

# Build
idf.py build

# Flash (adjust port)
idf.py -p /dev/tty.usbmodem1101 flash

# Monitor
idf.py -p /dev/tty.usbmodem1101 monitor
```

### Key Build Settings

| Setting | Value |
|---|---|
| Framework | ESP-IDF v5.5.2 + Arduino-ESP32 v3.3.6 |
| Flash | 8MB (`partitions.csv`: factory = 0x1F0000) |
| Minimal build | ON (trim binary size) |
| Target | ESP32-S3 |

The `CMakeLists.txt` uses `idf_build_set_property(MINIMAL_BUILD ON)` and wraps `esp_log_write` for binary size reduction.

### Dependencies

Managed via `main/idf_component.yml`:
- `espressif/arduino-esp32` ==3.3.6
- `espressif/cjson` ^1.7.19~2
- TFT_eSPI (local component under `components/TFT_eSPI/`)
- Plus ~30 managed components (libsodium, rmaker_common, esp_diagnostics, mdns, etc.)

## Architecture

### Entry Point (`main/main.cpp`)

```
app_main()
  ├── initArduino()
  ├── Serial.begin(115200)
  ├── storage.init()           — NVS init (nvs_flash)
  ├── wifi_init()              — ESP-IDF WiFi event loop setup
  ├── wifi_start(ssid, pass)   — push creds from NVS, start station
  └── while(true):
      ├── display.init()       — one-shot: boot splash → idle screen
      ├── display.process()    — read touch → toggle armed/unarmed
      └── pair.receive()       — poll UART1 for sensor data
```

### Module Map

| Module | Files | Purpose |
|---|---|---|
| **Display** | `display.h/.cpp` | TFT init (TFT_eSPI), armed/unarmed UI state machine, touch gesture reading |
| **Touch** | (in `display.cpp`) | `Touch::read()` — raw SPI touch coordinates |
| **WiFi** | `connectivity.h/.cpp` | ESP-IDF `esp_wifi`/`esp_event` init, auto-reconnect handler |
| **UART** | `app_uart.h/.cpp` | UART1 driver, frame parsing (SYNC|CMD|LEN|PAYLOAD|CRC), command dispatch |
| **Storage** | `storage.h/.cpp` | NVS wrapper — `store(key, value)`, `read(key)` |
| **JSON** | `jsonhandler.h/.cpp` | cJSON wrapper — `jsonparser(json_str, key)` |
| **UI Assets** | `uielements.h/.c` | RGB565 sprite bitmaps (idle, armed, disarmed states) |
| **Logging** | `core.h/.cpp` | Shared `log()` helper with timestamped Serial output |

### Key Wiring

- **TFT + Touch share SPI bus** (GPIO11/12/13); CS: TFT=GPIO10, Touch=GPIO8
- **Touch gesture area (ARM/DISARM):** x: 1982–2432, y: 350–803 (raw panel coordinates)
- **UART1:** TX=17, RX=18, RTS=4, CTS=5 — receives sensor data at 230120 baud, odd parity
- **TFT pins:** DC=GPIO9, RST=GPIO14, BL=GPIO15
- **Touch PEN (IRQ):** GPIO7
- **Note:** UART TX/RX pins are swapped (`uart_set_pin(1, 18, 17, ...)`) — intentional for straight-through connector wiring

### UART Frame Protocol

```
SYNC(2B: 'c','8') | CMD(1B) | LEN(2B big-endian) | PAYLOAD | CRC(2B big-endian)
```

CRC validation: `cmd_byte + 2 * payload_length == crc_received`

Current commands (`cmd_s` enum):
- `MOBILE_PAIRING` — receives JSON with WiFi creds, stores in NVS, triggers WiFi reconnection, sends acknowledgment

## IDE Configuration

- **VSCode settings:** `.vscode/settings.json` — ESP-IDF v5.5.2, target esp32s3, port `/dev/tty.usbmodem1101`
- **clangd:** Uses Espressif's esp-clang 19.1.2, compile commands from `build/`
- **DevContainer:** Available (`.devcontainer/`) for ESP-IDF QEMU environment
- **.clangd:** Strips architecture flags (`-f*`, `-m*`)

## Plan Directory (`plan/`)

A Next.js 16 + shadcn/ui (New York style) project for TFT display mockups/UI design. Not part of the firmware build.

```bash
cd plan
npm install
npm run dev    # start dev server
npm run build  # production build
npm run lint   # ESLint
```

Config: Tailwind CSS v4, TypeScript strict mode, RSC enabled, Lucide icons, Vercel Analytics. Built for unoptimized Image rendering (ESP32 target preview).

## Known Issues

1. **UART TX/RX swapped** — `uart_set_pin(UART_NUM_1, 18, 17, ...)` is intentional for current hardware but will break if connector wiring changes.
2. **Parity** — `UART_PARITY_ODD` is set; both ends must use odd parity.
3. **No UART TX path in `uart_s::init()`** — only RX is configured; TX is used only via `pair_s::send()` which calls `uart_write_bytes` directly.
4. **No FreeRTOS event queue for UART** — `uart_driver_install` passes `queue_size=0, uart_queue=NULL`; `pair.receive()` is synchronous poll only.
5. **SETTINGS page** — defined in `Display::Page` enum but unimplemented.
6. **WiFi credential buffer** — `memcpy` uses `size() + 1` (32-byte SSID → 33 bytes copied, 64-byte password → 65 bytes). Safe in practice since IEEE 802.11 caps SSIDs at 32 and WPA2 at 64.

## Testing

- `pytest_hello_world.py` — ESP-IDF pytest template (QEMU/host tests). Not wired for this project yet; the firmware doesn't print "Hello world!".
- No automated tests currently exist for the firmware modules.
- Manual testing: flash → monitor serial output → touch ARM/DISARM area → verify state toggle → send UART frames from sensor device.

## Development Tips

- **sdkconfig is gitignored** — if you reset menuconfig, re-apply TFT pins, flash size, and touch settings. The TFT_eSPI library reads pin config from sdkconfig (Kconfig), not `User_Setup.h`.
- **UI bitmaps** — `uielements.c` is a large RGB565 blob. Do not edit manually; regenerate from PNG mockups in `UI Mockups/` or the web mockup in `plan/`.
- **NVS keys** — current keys: `"ssid"`, `"pass"`. New credentials should follow this naming convention.
- **WiFi auto-reconnect** — built into `wifi_event_handler`; on `WIFI_EVENT_STA_DISCONNECTED`, it calls `esp_wifi_connect()`.
- **`wait_for_wifi_to_connect` queue** — used by `pair.receive()` to wait for WiFi connection after receiving pairing data.

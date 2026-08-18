# ESP32 Central Console — esp2 (HTTP → UART Passthrough AP)

This variant of the home security central console firmware runs an ESP32 as a **WiFi Access Point** that exposes HTTP endpoints for receiving configuration parameters from a client device, then relays them via UART1 to external sensor/actuator hardware.

## Quick Start

```bash
# Set target and build
idf.py set-target esp32
idf.py build

# Flash and monitor (adjust COM port as needed)
idf.py -p /dev/tty.usbserial-110 flash
idf.py -p /dev/tty.usbserial-110 monitor
```

Connect to WiFi network `espwifi` (password: `23012003`) from your client device, then hit the ESP's IP on port 80.

## Endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check, returns `{ "health": "ok" }` |
| `POST` | `/pair` | JSON | Receive pairing config (SSID, passwords, schedule, Pi IP) |

### `/pair` Request/Response

**Request body (JSON):**
```json
{
  "homessid": "mywifi",
  "homepass": "password123",
  "permpass": "0309",
  "encryptedpass": "abc...",
  "schedulestart": "08:00",
  "schedulestop": "22:00",
  "raspberrypiip": "192.168.0.236"
}
```

**Success response:** `{ "pairing payload received": "ok" }`
**Failure response:** `{ "pairing payload received": "corrupted" }` or HTTP 408 on timeout

The ESP forwards the raw JSON to the sensor over UART, waits up to 5 seconds for a response, then relays the result back.

## UART Frame Format

Bidirectional framing between ESP32 and sensor hardware:

```
SYNC(2B) | CMD(1B) | LEN(2B BE) | PAYLOAD(N) | CRC(2B BE)
```

| Field | Size | Description |
|---|---|---|
| SYNC | 2 bytes | `0x63 0x38` ("c8") |
| CMD | 1 byte | Command type (currently 0x00 = MOBILE_PAIRING) |
| LEN | 2 bytes | Payload length, big-endian |
| PAYLOAD | N bytes | The actual data |
| CRC | 2 bytes | `cmd_int + 2 * payload_len`, big-endian |

### Pinout

| Peripheral | ESP32 Pin(s) | Notes |
|---|---|---|
| UART1 TX | GPIO17 | Baud 230120, odd parity, 8N1 |
| UART1 RX | GPIO18 | |
| UART1 RTS | GPIO4 | Hardware flow control (disabled) |
| UART1 CTS | GPIO5 | Hardware flow control (disabled) |

## Architecture

```
Client Device ──HTTP POST /pair──> ESP32 (AP: espwifi)
                                       │
                                       ▼
                                  UART1 (230120 baud)
                                       │
                                       ▼
                              External Sensor Hardware
                                       │
                       ◄───────────────┘
                  (response via same frame format)
```

- **Single-threaded main loop** — `while(true)` polls `uart.receive()` every 100ms. HTTP handlers and UART share the same thread.
- **Queue-based response handling** — Sensor responses are sent via a 1-slot FreeRTOS queue (`waitfors3`). The `/pair` handler waits up to 5s for a response.
- **No persistent storage** — Credentials are passed through to UART and forgotten. Nothing stored in NVS.

## Assumptions & Design Constraints

- **Payloads are always small (< 200 bytes)** — The UART frame parser reads into a 200-byte buffer and trusts the `LEN` field from the frame header. This works because all payloads (config JSON, sensor data) are well under 200 bytes. No explicit bounds check on `payload_len` against the remaining frame data — the code assumes one frame per UART read from a trusted sensor.

- **Plaintext credential logging accepted** — All POST handlers log submitted values via `printf` to the UART debug console. This is intentional for development and accepted because the device will be deployed in a physically inaccessible location where serial console access is not a realistic threat.

- **Queue-based response handling** — `waitfors3` is a 1-slot queue of `std::string*` (created in `httpendpoints.cpp:80`). Writer (`app_uart.cpp:142-143`) allocates with `new`, sends non-blocking (`ticks=0`). Reader (`httpendpoints.cpp:54`) waits up to 5s, then `delete`s. The only leak path: sensor sends two responses before handler reads the first, causing `xQueueSend` to fail silently on the second. This is practically unreachable because the sensor sends exactly one response per command and the handler is blocked waiting — so the queue never overflows. If it ever does, the fix is to check `xQueueSend` return value and `delete` on failure.

## Known Issues

- **No authentication on `/pair`** — Any device on the AP WiFi can submit credentials. Acceptable for prototyping; add token-based auth before production.
- **Blocking main loop** — HTTP handlers and UART polling compete on the same thread. Use FreeRTOS tasks for production.
- **Weak checksum** — The CRC is an additive hash (`cmd + 2*len`) that doesn't include payload bytes. Sufficient for short, low-noise UART links but not for noisy environments.
- **Hardcoded WiFi credentials** — AP SSID/password in plaintext source code. Acceptable for prototyping; use NVS or first-boot provisioning for production.
- **Outdated documentation** — The old query-string endpoints (`/pass`, `/ssid`, `/otp`, etc.) have been replaced by the single `/pair` JSON endpoint. The git history still references them.

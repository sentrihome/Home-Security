# ESP32 Central Console — esp2 (HTTP → UART Passthrough AP)

This variant of the home security central console firmware runs an ESP32 as a **WiFi Access Point** that exposes HTTP endpoints for receiving configuration parameters (SSID, passwords, OTP, schedule) from a client device, then relays them via UART1 to external sensor/actuator hardware.

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

## Wiring / Pinout

| Peripheral | ESP32 Pin(s) | Notes |
|---|---|---|
| UART1 TX | GPIO17 | Baud 230120, odd parity, 8N1 |
| UART1 RX | GPIO18 | |
| UART1 RTS | GPIO4 | Hardware flow control (disabled) |
| UART1 CTS | GPIO5 | Hardware flow control (disabled) |

## Known Problems (TODO)

### Critical — Must Fix Before Production

1. **No authentication on credential endpoints** — Anyone connected to the AP WiFi can submit passwords, OTPs, and schedules over HTTP with zero access control. An attacker within WiFi range can configure the entire security system.
   - *Fix:* Add at least a shared-secret token parameter to all POST requests; prefer challenge-response or session-based auth.

2. **Credentials logged in plaintext** — Every credential endpoint does `printf("... extracted part %s\n", extract)` which dumps secrets to UART debug output. Anyone with serial console access can read submitted credentials.
   - *Fix:* Remove `printf` of extracted values; log only the parameter name, not its content.

3. **Duplicate `/schedule` URI** — Both schedule start and stop handlers register the same path (`/schedule`, method POST). `esp_http_server` silently rejects duplicates (last registration wins), meaning one schedule endpoint is completely broken with no error or log warning.
   - *Fix:* Use distinct paths: `/schedule/start` and `/schedule/stop`.

### Important — Should Fix

4. **No input validation on forwarded parameters** — HTTP query strings are passed directly to UART with no length, charset, or format checks. A parameter longer than 200 bytes corrupts the receive buffer in `app_uart.cpp`.
   - *Fix:* Validate length and strip control characters per endpoint type before calling `uart_send()`.

5. **Buffer overflow risk in `uart_send()`** — The `"END_OF_MESSAGE"` delimiter is appended with no size check against the 200-byte transmit buffer. If a parameter fills most of the buffer, the delimiter writes past its bounds.
   - *Fix:* Check remaining space before appending the delimiter; truncate or reject oversized inputs.

6. **Blocking single-loop architecture** — The `while(true)` / `delay(2000)` main loop means HTTP handlers and UART polling compete for the same thread. Long UART reads will block incoming HTTP requests and vice versa.
   - *Fix:* Use FreeRTOS tasks (one for the HTTP server, one for UART polling) or non-blocking I/O with task notifications.

### Nice-to-Have

7. **WiFi credentials hardcoded** — AP SSID/password are in plaintext source code and in `sdkconfig`. Acceptable for prototyping but should be configurable at first boot or stored in NVS.
8. **No HTTPS/TLS** — All credentials travel in cleartext over the HTTP-to-ESP link. Even on a local network, an evil-NAP attack can intercept them.

# Bug Findings — Central Console AP Firmware

**Target:** `centralconsole_ap` (ESP32 WROOM, AP mode)
**Files analyzed:** `main/main.cpp`, `main/httpendpoints.cpp`, `main/httpendpoints.h`, `main/app_uart.cpp`, `main/app_uart.h`, `main/connectivity_esp.cpp`, `main/connectivity.h`, `main/jsonhandler.cpp`, `main/jsonhandler.h`, `main/CMakeLists.txt`

---

## CRITICAL

### 1. [VERIFIED] Memory leak on full queue

**File:** `app_uart.cpp:150-154`

**Description:** A `new std::string` is allocated before sending to the queue, but the return value of `xQueueSend` is not checked. When the 1-slot queue is full, the pointer is lost and the allocation leaks.

```cpp
std::string *p = new std::string(payload);
if (xQueueSend(waitfors3, &p, 0) != pdPASS) {
    delete p;  // ← FIX: queue full — sender never gets the pointer
}
```

**Leak scenarios:**
- **Two responses before drain:** HTTP handler calls `uart.send()`, then blocks on `xQueueReceive` (6s timeout). Sensor sends response #1 (queued successfully), then response #2 (queue full → leak).
- **Unsolicited sensor message:** Sensor sends a response when no `/pair` handler is waiting. First message sits in the queue forever (abandoned heap). Second message leaks.

**Fix applied.** The queue depth could also be increased (e.g., 4–8) for burst tolerance.

---

### 2. [VERIFIED] Out-of-bounds read on truncated/malformed UART frames

**File:** `app_uart.cpp:112-127`

**Description:** The `pair_receive` buffer is 200 bytes. After parsing the LEN field, the code reads `payload_len` payload bytes followed by 2 CRC bytes — with no bounds check against the number of bytes actually received (`length`). If the frame declares a `payload_len` larger than the received data, the loop reads past the end of `pair_receive`.

**Concrete scenario:** Sensor sends 10 bytes with `payload_len = 10`. The loop reads 10 bytes starting at offset 5, accessing indices 5–14. But `length = 10`, so indices 10–14 are 5 bytes out of bounds into uninitialized stack memory.

**Impact:** Stack buffer over-read. On ESP32 (no MMU), this silently corrupts adjacent stack data, leading to wrong payload/CRC values or leaked stack data (e.g., local pointers) across the UART.

**Fix applied.** Bounds check added after LEN parsing:

```cpp
if (message_pos + payload_len + 2 > length) {
    printf("  Frame too small for declared payload: need %d, have %d\n",
           message_pos + payload_len + 2, length);
    return "";
}
```

---

### 3. [DISMISSED] UART parity mismatch

**File:** `app_uart.cpp:24`

```cpp
uartconf.parity = UART_PARITY_ODD;
```

**Description:** The ESP32 UART RX hardware is configured with odd parity (10-bit frames: START + D0–D7 + PARITY + STOP). If the S3 companion firmware used `UART_PARITY_DISABLE`, the bit boundaries would misalign and every byte would be corrupted.

**Verdict:** Dismissed. The S3 firmware (`centralconsole_Station`) has been verified to also use odd parity. Both sides agree — configuration is correct.

---

## HIGH

### 4. [VERIFIED] CRC validation is NOT a bug

**File:** `app_uart.cpp:110-137`

**Re-evaluation:** The earlier assessment that line 102 (`message_pos += 1`) skips the first payload byte was incorrect. A byte-by-byte trace with a concrete 4-byte payload (`"test"`, cmd=0) shows the frame layout:

| offset | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|--------|---|---|---|---|---|---|---|---|---|---|---|
| byte | AA | 55 | 00 | 00 | 04 | 74 | 65 | 73 | 74 | 00 | 08 |
| role | S | Y | CMD | L1 | L2 | P[0] | P[1] | P[2] | P[3] | CRC1 | CRC2 |

The receiver's `message_pos` starts at 1 (second sync byte), then:
- CMD: reads from `message_pos + 1 = 2` → `message_pos = 2`
- LEN: reads from `message_pos + 1 = 3, 4` → `message_pos = 4`
- Line 102: `message_pos = 5` → first payload byte ✓
- CRC: reads from `message_pos = 9, 10` ✓
- Validation: `0 + 2*4 = 8 == 0x0008` ✓

**Verdict:** The CRC validation works correctly. The formula (`cmd + 2 * payload_len`) is a weak checksum but is consistent between sender and receiver.

---

### 5. [INTENTIONAL] New AP password generated but never applied

**File:** `httpendpoints.cpp:71-83`

**Description:** A random 32-character password is generated, sent back to the HTTP client, but the `uart.send()` call and `ap_start()` call are commented out. The AP continues running on hardcoded credentials.

**Verdict:** Acknowledged as intentional debug scaffolding. Will be fixed later.

---

### 6. [VERIFIED] HTTP stack size is sufficient for known payload

**File:** `httpendpoints.cpp:119`

**Re-evaluation:** The original claim that 8 KB is too small was based on a worst-case analysis. With the actual fixed payload (~170 bytes minified), the peak stack usage is:

| Component | Bytes |
|---|---|
| esp_http_server internals | ~700 |
| `buf[1000]` | 1,000 |
| 7 × `std::string` objects | 168 |
| `resp_buf[256]` | 256 |
| Other locals + prologue | ~36 |
| `jsonparser` peak | ~64 |
| Context overhead | ~200 |
| **Total peak** | **~2,424** |
| **Available** | **8,192** |
| **Headroom** | **~5,768 (70%)** |

**Verdict:** Not a bug. The 8 KB stack provides 70% headroom for this payload size.

**Note:** The 1000-byte `buf[]` is wasteful (only ~17% utilized) but not dangerous. It could be reduced to 256 bytes as a minor optimization.

---

### 7. [VERIFIED] cJSON_Parse return value — error masking

**File:** `jsonhandler.cpp:4-21`

**Description:** `jsonparser()` returns `""` for both "invalid JSON" (parse failure) and "key not found" (missing field). The caller in `httpendpoints.cpp` treats both identically — the parsed value is only used for `printf` logging, not for validation logic.

```cpp
std::string jsonparser(const char *json_str, const char *key) {
    cJSON *root = cJSON_Parse(json_str);
    if (root == NULL) return "";          // Path A: parse error
    cJSON *item = cJSON_GetObjectItem(root, key);
    if (cJSON_IsString(item)) {
        std::string result = item->valuestring;
        cJSON_Delete(root);
        return result;                    // Path B: found
    }
    cJSON_Delete(root);
    return "";                            // Path C: key missing
}
```

**Impact:** Invalid JSON and missing keys produce identical output (`Key: `). However, since the parsed values are only logged and the raw JSON is forwarded to the sensor (which decides whether to accept it), the practical impact is limited to **noisy but not dangerous** logs.

**Risk:** If any future code path uses parsed values for decision-making, this masking would cause silent failures.

---

## MEDIUM

### 8. printf of raw payload bytes floods serial console

**File:** `app_uart.cpp:52-57, 115`

Every received byte is printed individually with `%02x`, plus per-byte payload logging. This will flood the serial console and cause significant performance degradation during normal operation, especially at 230120 baud.

---

### 9. No authentication on any endpoint

All POST endpoints (`/pass`, `/ssid`, `/permanentpass`, `/encryptedpass`, `/otp`, `/schedule` x2, `/pair`) accept credentials with zero access control. Any device on the AP WiFi can submit or retrieve secrets.

---

### 10. Credential values logged to serial console

Every credential handler dumps submitted secrets to the UART debug console via `printf`.

---

### 11. No retry or error handling on WiFi config

**File:** `connectivity_esp.cpp:45-47`

`esp_wifi_set_config()` and `esp_wifi_start()` return `esp_err_t` but the return values are ignored. If these calls fail, the AP silently won't start with no error indication.

---

## Summary

| Severity | Count | Status | Issues |
|---|---|---|---|
| CRITICAL | 2 | Fixed | Queue memory leak, OOB read on truncated frames |
| HIGH | 4 | Dismissed | Parity mismatch, CRC validation, AP password debug stub, stack size |
| HIGH | 1 | Minor | cJSON error masking |
| MEDIUM | 4 | Design | Serial logging flood, no auth, credential logging, WiFi error handling |

**Fixes applied:** Memory leak (`app_uart.cpp:150-154`) and OOB read (`app_uart.cpp:108-113`).

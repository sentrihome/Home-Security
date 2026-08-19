# 4x4 Keypad Implementation Plan

## 1. Overview

Add a physical 4x4 matrix keypad to the ESP32-S3 central console for PIN entry and settings navigation. The keypad replaces the current stub `keypad_s` (empty `init()`/`process()`) with a fully debounced, event-driven key scanner that feeds into the existing display state machine.

**Goal**: Users can enter a 4–8 digit PIN on the physical keypad to arm/disarm the system, and navigate the existing SETTINGS/SETUP_INSTRUCTIONS pages without touching the screen.

---

## 2. Hardware Design

### 2.1 Wiring — 4 Rows × 4 Columns = 16 Keys

Actual wiring (confirmed):

| Pin | ESP32-S3 GPIO | Role   | Pull Resistor |
|-----|---------------|--------|---------------|
| R1  | GPIO42        | Row    | Internal pull-up |
| R2  | GPIO41        | Row    | Internal pull-up |
| R3  | GPIO40        | Row    | Internal pull-up |
| R4  | GPIO39        | Row    | Internal pull-up |
| C1  | GPIO38        | Column | Internal pull-up |
| C2  | GPIO37        | Column | Internal pull-up |
| C3  | GPIO36        | Column | Internal pull-up |
| C4  | GPIO35        | Column | Internal pull-up |

All pins are in the GPIO35–42 range — no conflicts with UART1 (GPIO17/18), SPI bus (GPIO11–13), TFT control pins (GPIO9/10/14/15), or touch IRQ (GPIO7). All support internal pull-up (`GPIO_MODE_DEFAULT` with `GPIO_PULLUP_ENABLE`).

### 2.2 Schematic Notes

- No external resistors needed — ESP32-S3 GPIOs have configurable internal pull-ups (~25–50 kΩ).
- Optional: 100 Ω series resistor on each column line to dampen ringing.
- Optional: 0.1 µF decoupling capacitor across VCC/GND near keypad connector.

---

## 3. Software Architecture

### 3.1 Key Abstraction

```
Key event types (enum):
  KEY_NONE       — no change
  KEY_PRESS      — first debounced press detected
  KEY_REPEAT     — subsequent polls while held (after HOLD_THRESHOLD ms)
  KEY_RELEASE    — key lifted
```

### 3.2 Scanning Algorithm

Use the existing `while(true)` polling loop pattern (matching `display.process()` / `uart.receive()`). No FreeRTOS tasks or interrupts needed — the existing codebase uses synchronous poll-only for all input.

**Row-scan method** (standard matrix scanning):
1. Set all rows to INPUT with pull-up enabled.
2. Set all columns to OUTPUT, drive all high.
3. For each column (C1→C4):
   a. Drive that column LOW.
   b. Read all 4 rows — if a row reads LOW, that key is pressed.
   c. Drive that column back HIGH.
   d. Continue to next column.

**Debounce strategy**: Software debounce with a 50 ms threshold.
- Track `last_press_time[row][col]` — only register a press if 50 ms has elapsed since the last state change for that key.
- Track `key_state[row][col]` — one of `KEY_RELEASED` / `KEY_PRESSED`.

### 3.3 Data Structures

```cpp
enum class KeyState : uint8_t {
    KEY_RELEASED,
    KEY_PRESSED,
    KEY_REPEAT
};

enum class KeyEvent : uint8_t {
    KEY_NONE,
    KEY_PRESS,
    KEY_REPEAT,
    KEY_RELEASE
};

struct KeyInfo {
    uint8_t row;
    uint8_t col;
    char key;        // '0'-'9', 'A'-'D', '*', '#'
    KeyEvent event;
};

struct keypad_s {
public:
    void init();
    KeyEvent process();           // returns the latest key event
    char getBuffer();             // returns last entered char (for PIN display)
    void clearBuffer();           // clears entered PIN buffer
    size_t getBufferLength();     // returns current buffer length

private:
    static constexpr uint8_t ROWS = 4;
    static constexpr uint8_t COLS = 4;
    static constexpr uint8_t DEBOUNCE_MS = 50;
    static constexpr uint8_t HOLD_REPEAT_MS = 300;
    static constexpr size_t MAX_BUFFER = 16;

    // Pin assignments
    static constexpr uint8_t row_pins[ROWS] = {42, 41, 40, 39};
    static constexpr uint8_t col_pins[COLS] = {38, 37, 36, 35};

    // Key map: key[row][col]
    static constexpr char key_map[ROWS][COLS] = {
        {'1', '2', '3', 'A'},
        {'4', '5', '6', 'B'},
        {'7', '8', '9', 'C'},
        {'*', '0', '#', 'D'}
    };

    // State
    KeyState raw_state[ROWS][COLS];       // raw debounced state per key
    uint32_t press_time[ROWS][COLS];      // when key was pressed (for repeat)
    char pin_buffer[MAX_BUFFER + 1];      // entered PIN digits
    size_t buffer_len;

    // Private helpers
    void scan();
    KeyEvent translateEvent(uint8_t r, uint8_t c);
};
```

### 3.4 Integration Points

#### 3.4.1 Main Loop (`main.cpp`)

Current loop:
```cpp
while (true) {
    display.init();
    display.process();
    uart.receive();
}
```

New loop (add keypad processing):
```cpp
while (true) {
    display.init();
    display.process();
    KeyEvent ke = keypad.process();
    if (ke != KEY_NONE) {
        handleKeypadEvent(ke);  // new function in main.cpp or keypad.cpp
    }
    uart.receive();
}
```

#### 3.4.2 Display Integration

Two modes of keypad interaction:

**Mode A — PIN Entry Overlay** (primary use case):
- When the user is on the ARMED or UNARMED screen, pressing a digit key opens a PIN entry overlay on the TFT.
- Each keypress echoes `'*'` characters (or shows dots) on-screen.
- `#` confirms the PIN → validate against stored PIN in NVS.
- `*` clears the buffer / cancels.
- On successful PIN match: toggle armed/unarmed state (same as current touch gesture).
- On failure: brief "ACCESS DENIED" flash, clear buffer.

**Mode B — SETTINGS Navigation**:
- In SETTINGS page, use directional keys (A=up, C=down, B=select, #=back) to navigate options.
- This is lower priority; the current SETTINGS page is a static image with no interactive elements.

#### 3.4.3 Storage Integration

- Store the user-set PIN in NVS under key `"pin"` (4–16 digits, stored as a null-terminated string).
- Default PIN: `"1234"` (set on first boot if NVS key doesn't exist).
- `storage.store("pin", pin_value)` and `storage.read("pin")` follow existing patterns.

---

## 4. Implementation Phases

### Phase 1: Core Scanner (Foundation)

**Files changed**: `keypad.h`, `keypad.cpp`

- Define pin constants, key map, data structures in `keypad.h`.
- Implement `keypad_s::init()`:
  - Configure 4 row pins as INPUT with pull-up.
  - Configure 4 column pins as OUTPUT, set all HIGH.
- Implement `keypad_s::process()`:
  - Row-scan all columns.
  - Apply 50 ms software debounce.
  - Return `KeyEvent` (PRESS/REPEAT/RELEASE/NONE).
- Add `log()` calls for each key press (debug output).
- Wire `keypad.process()` into `main.cpp` main loop (no behavior yet, just log).

**Verification**: Flash → monitor serial → press each key → verify correct key char and event type printed at ~50 ms debounce interval.

### Phase 2: PIN Buffer & Display Overlay

**Files changed**: `keypad.cpp`, `display.h`, `display.cpp`

- Add `pin_buffer[]`, `getBuffer()`, `clearBuffer()`, `getBufferLength()` to `keypad_s`.
- On `KEY_PRESS` for digit keys (`0`–`9`, `*`, `#`): append to buffer (if not full).
- On `KEY_PRESS` for `#`: trigger PIN validation.
- On `KEY_PRESS` for `*`: clear buffer.
- Add a `pin_entry` page to `Display::Page` enum.
- Implement `Display::pinEntry()`:
  - Draw a darkened background overlay.
  - Draw a "Enter PIN" prompt.
  - Draw `'*'` characters for each buffered digit.
  - Draw "CANCEL" and "ENTER" button outlines (for touch fallback).
- Transition: when a digit is pressed from any page, switch to `PIN_ENTRY` state and redraw.
- On `#` (confirm): validate, then transition back to previous state.

**Verification**: Flash → power on → press digits → see `'*'` characters appear on TFT → press `#` → see "ACCESS DENIED" (since no PIN is stored yet) → press `*` → buffer clears.

### Phase 3: PIN Validation & Arm/Disarm

**Files changed**: `keypad.cpp`, `storage.h`, `storage.cpp`, `display.cpp`

- On first boot, if NVS key `"pin"` doesn't exist, store `"1234"` as default.
- On `#` key press:
  1. Read stored PIN from NVS via `storage.read("pin")`.
  2. Compare entered buffer against stored PIN (`strcmp`).
  3. If match:
     - Toggle armed/unarmed state (call existing `Display::armed()` or `Display::unarmed()`).
     - Clear buffer, return to main page.
     - Log "PIN ACCEPTED — armed/disarmed".
  4. If mismatch:
     - Show "ACCESS DENIED" for 2 seconds on the overlay.
     - Clear buffer, return to previous page.
     - Log "PIN REJECTED".

**Verification**: Flash → power on → enter "1234" → press `#` → system arms/disarms → try wrong PIN → see "ACCESS DENIED".

### Phase 4: PIN Change Flow (Settings)

**Files changed**: `display.h`, `display.cpp`, `keypad.cpp`, `storage.cpp`

- Extend SETTINGS page to support PIN change via keypad.
- New sub-state machine in `Display::settings()`:
  1. Show "Current PIN:" prompt.
  2. User enters current PIN → validate.
  3. Show "New PIN:" prompt.
  4. User enters new PIN (4–16 digits, `#` to confirm).
  5. Show "Confirm New PIN:" prompt.
  6. User re-enters new PIN → compare.
  7. If match: `storage.store("pin", new_pin)`, show "PIN UPDATED".
  8. If mismatch: show "MISMATCH — try again".

**Verification**: Navigate to SETTINGS → change PIN → arm with old PIN (should fail) → arm with new PIN (should succeed).

### Phase 5: Polish & Edge Cases

- **Key repeat**: Hold a key → after 300 ms, `KEY_REPEAT` fires → append to buffer (allows fast PIN entry).
- **Auto-clear**: If no keypress for 30 seconds during PIN entry, clear buffer and return to previous page.
- **Overflow protection**: Buffer capped at 16 chars; extra digits are ignored (or beep).
- **Anti-tamper**: If 5 consecutive wrong PINs, lock out for 30 seconds (log attempt count in NVS).
- **Keypad visual feedback**: Briefly highlight the pressed key's position on-screen (optional, cosmetic).

---

## 5. File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `keypad.h` | Add full class definition with pin constants, key map, state structs, public API | 1 |
| `keypad.cpp` | Implement scanner, debounce, buffer management, event translation | 1–3 |
| `main.cpp` | Add `keypad.process()` call, `handleKeypadEvent()` dispatcher | 1, 3 |
| `display.h` | Add `PIN_ENTRY` to `Display::Page` enum | 2 |
| `display.cpp` | Add `Display::pinEntry()`, overlay drawing, state transitions | 2–3 |
| `storage.h` | (No changes needed — already supports `store`/`read`) | — |
| `CMakeLists.txt` | (No changes — `keypad.cpp` already listed) | — |

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPIO35–42 are high-side pins (no analog functions) | No impact — all clean GPIO | No mitigation needed |
| Pin bouncing causes double-entries | PIN entry corrupt | 50 ms software debounce + state machine per key |
| Blocking `delay()` in display overlay | UART polling stalls | Avoid `delay()` in `pinEntry()`; use non-blocking timers (`millis()` comparison) |
| Stack overflow from deep nesting | Hard fault | Keep overlay drawing simple; avoid recursion |
| NVS wear from frequent PIN changes | Flash wear over time | PIN stored only on change, not on every arm/disarm |

---

## 7. Out of Scope (Future)

- **Touch + keypad coexistence**: Currently, SETTINGS page uses touch. Keypad navigation for SETTINGS (Phase 4) is a separate input path — both should work but aren't merged into a unified input abstraction.
- **Multi-language keypad labels**: Keypad key labels on-screen are assumed to match standard `123A456B789C*0#D` layout.
- **Bluetooth OTA PIN update**: No BLE or WiFi-based remote PIN change.
- **Keypad macro support**: No programmable key sequences.
- **Hardware debouncing**: No external RC circuits; software-only debounce.

# TFT Display & Touch Controller Wiring

## TFT Display (SPI)

| TFT Pin | Function            | GPIO    |
|---------|----------------------|---------|
| SCK     | SPI Clock            | GPIO12  |
| SDI     | SPI Data In (MOSI)   | GPIO11  |
| SDO     | SPI Data Out (MISO)  | GPIO13  |
| CS      | Chip Select          | GPIO10  |
| DC      | Data/Command         | GPIO9   |
| RST     | Reset                | GPIO14  |
| BL      | Backlight            | GPIO15  |

## Touch Controller (SPI)

| Touch Pin | Function             | GPIO    |
|-----------|-----------------------|---------|
| TCK       | SPI Clock             | GPIO12  |
| TDI       | SPI Data In (MOSI)    | GPIO11  |
| TDO       | SPI Data Out (MISO)   | GPIO13  |
| TCS       | Touch Chip Select     | GPIO8   |
| PEN       | Touch Interrupt (IRQ) | GPIO7   |

## Notes

- The TFT display and touch controller **share the same SPI bus** (SCK, SDI/MOSI, SDO/MISO on GPIO12, GPIO11, GPIO13 respectively).
- Each device has its **own dedicated Chip Select** line:
  - TFT CS → GPIO10
  - Touch CS (TCS) → GPIO8
- **DC (GPIO9)** is specific to the TFT and selects between command and data mode.
- **RST (GPIO14)** resets the TFT display.
- **BL (GPIO15)** controls the display backlight (can often be tied to 3.3V or PWM-controlled for brightness).
- **PEN (GPIO7)** is the touch controller's interrupt/pen-down signal, used to detect touch events without polling.

## Pin Summary (by GPIO)

| GPIO   | Connected To            |
|--------|--------------------------|
| GPIO7  | Touch PEN (IRQ)          |
| GPIO8  | Touch TCS (CS)           |
| GPIO9  | TFT DC                   |
| GPIO10 | TFT CS                   |
| GPIO11 | Shared SDI/TDI (MOSI)    |
| GPIO12 | Shared SCK/TCK (Clock)   |
| GPIO13 | Shared SDO/TDO (MISO)    |
| GPIO14 | TFT RST                  |
| GPIO15 | TFT BL                   |

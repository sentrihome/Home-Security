/*
 * Home Security UI for TFT_eSPI
 * Display: 480x320 TFT
 * 
 * Wiring (ESP32 example):
 * TFT_MOSI -> GPIO 23
 * TFT_SCLK -> GPIO 18
 * TFT_CS   -> GPIO 15
 * TFT_DC   -> GPIO 2
 * TFT_RST  -> GPIO 4
 * TOUCH_CS -> GPIO 21
 */

#include <TFT_eSPI.h>
#include <SPI.h>

TFT_eSPI tft = TFT_eSPI();

// Colors (RGB565 format)
#define COLOR_BG           0x0841  // Neutral 950 (#0a0a0a)
#define COLOR_CARD_BG      0x10A2  // Neutral 900 (#171717)
#define COLOR_BORDER       0x2104  // Neutral 800 (#262626)
#define COLOR_TEXT_PRIMARY 0xFFFF  // White
#define COLOR_TEXT_MUTED   0x7BCF  // Neutral 400
#define COLOR_TEXT_DIM     0x528A  // Neutral 500
#define COLOR_EMERALD      0x2E8B  // Emerald 500 (#10b981)
#define COLOR_EMERALD_DIM  0x1344  // Emerald 500/20
#define COLOR_SWITCH_OFF   0x39C7  // Neutral 700

// ============================================
// BITMAP ICONS (24x24 pixels, 1-bit)
// ============================================

// Shield icon with checkmark (24x24)
const unsigned char icon_shield[] PROGMEM = {
  0x00, 0xFF, 0x00,  // ........########........
  0x03, 0xFF, 0xC0,  // ......############......
  0x07, 0xFF, 0xE0,  // .....##############.....
  0x0F, 0xFF, 0xF0,  // ....################....
  0x1F, 0xFF, 0xF8,  // ...##################...
  0x3F, 0xFF, 0xFC,  // ..####################..
  0x3F, 0xFF, 0xFC,  // ..####################..
  0x3F, 0xFF, 0xFC,  // ..####################..
  0x3F, 0xFF, 0xFC,  // ..####################..
  0x3F, 0xC1, 0xFC,  // ..########....#######..
  0x3F, 0x80, 0xFC,  // ..#######......######..
  0x3F, 0x01, 0xFC,  // ..######......#######..
  0x1E, 0x03, 0xF8,  // ...####......#######...
  0x1F, 0x07, 0xF8,  // ...#####....########...
  0x1F, 0x8F, 0xF8,  // ...######..#########...
  0x0F, 0xDF, 0xF0,  // ....######.#########....
  0x0F, 0xFF, 0xF0,  // ....################....
  0x07, 0xFF, 0xE0,  // .....##############.....
  0x03, 0xFF, 0xC0,  // ......############......
  0x01, 0xFF, 0x80,  // .......##########.......
  0x00, 0xFF, 0x00,  // ........########........
  0x00, 0x7E, 0x00,  // .........######.........
  0x00, 0x3C, 0x00,  // ..........####..........
  0x00, 0x18, 0x00   // ...........##...........
};

// Motion/Activity radar icon (24x24)
const unsigned char icon_motion[] PROGMEM = {
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x3C,  // ......................####
  0x00, 0x00, 0x7E,  // .....................######
  0x00, 0x01, 0xE7,  // ................####..###
  0x00, 0x03, 0xC3,  // ..............####....##
  0x00, 0x07, 0x9E,  // .............####..####
  0x01, 0xC7, 0x3C,  // .......###...###..####
  0x03, 0xE6, 0x78,  // ......#####..##..####.
  0x07, 0x0E, 0x70,  // .....###....###..###..
  0x06, 0x1C, 0xE0,  // .....##....###..###...
  0x0E, 0x18, 0xE0,  // ....###....##...###...
  0x0C, 0x39, 0xC0,  // ....##....###..###....
  0x0C, 0x31, 0x80,  // ....##....##...##.....
  0x0C, 0x73, 0x80,  // ....##...###..###.....
  0x06, 0x63, 0x00,  // .....##..##...##......
  0x07, 0xE6, 0x00,  // .....######..##.......
  0x03, 0xC6, 0x00,  // ......####...##.......
  0x00, 0x0C, 0x00,  // ............##........
  0x00, 0x18, 0x00,  // ...........##.........
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00   // ........................
};

// Gear/Settings icon (24x24)
const unsigned char icon_gear[] PROGMEM = {
  0x00, 0x00, 0x00,  // ........................
  0x01, 0x81, 0x80,  // .......##.....##.......
  0x01, 0x81, 0x80,  // .......##.....##.......
  0x0F, 0xC3, 0xF0,  // ....######...######....
  0x1F, 0xE7, 0xF8,  // ...########.#########...
  0x1F, 0xFF, 0xF8,  // ...##################...
  0x0F, 0xFF, 0xF0,  // ....################....
  0x07, 0xFF, 0xE0,  // .....##############.....
  0x67, 0xC3, 0xE6,  // .##..#####....#####..##.
  0xFF, 0x00, 0xFF,  // ########......########
  0xFF, 0x00, 0xFF,  // ########......########
  0xFF, 0x00, 0xFF,  // ########......########
  0xFF, 0x00, 0xFF,  // ########......########
  0x67, 0xC3, 0xE6,  // .##..#####....#####..##.
  0x07, 0xFF, 0xE0,  // .....##############.....
  0x0F, 0xFF, 0xF0,  // ....################....
  0x1F, 0xFF, 0xF8,  // ...##################...
  0x1F, 0xE7, 0xF8,  // ...########.#########...
  0x0F, 0xC3, 0xF0,  // ....######...######....
  0x01, 0x81, 0x80,  // .......##.....##.......
  0x01, 0x81, 0x80,  // .......##.....##.......
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00   // ........................
};

// Chevron right icon (24x24)
const unsigned char icon_chevron[] PROGMEM = {
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x03, 0x00, 0x00,  // ......##................
  0x07, 0x80, 0x00,  // .....####...............
  0x0F, 0xC0, 0x00,  // ....######..............
  0x1F, 0xE0, 0x00,  // ...########.............
  0x0F, 0xF0, 0x00,  // ....########............
  0x07, 0xF8, 0x00,  // .....########...........
  0x03, 0xFC, 0x00,  // ......########..........
  0x01, 0xFE, 0x00,  // .......########.........
  0x01, 0xFE, 0x00,  // .......########.........
  0x03, 0xFC, 0x00,  // ......########..........
  0x07, 0xF8, 0x00,  // .....########...........
  0x0F, 0xF0, 0x00,  // ....########............
  0x1F, 0xE0, 0x00,  // ...########.............
  0x0F, 0xC0, 0x00,  // ....######..............
  0x07, 0x80, 0x00,  // .....####...............
  0x03, 0x00, 0x00,  // ......##................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00,  // ........................
  0x00, 0x00, 0x00   // ........................
};

// WiFi icon (16x16)
const unsigned char icon_wifi[] PROGMEM = {
  0x07, 0xE0,  // .....######.....
  0x1F, 0xF8,  // ...##########...
  0x3F, 0xFC,  // ..############..
  0x78, 0x1E,  // .####......####.
  0xE0, 0x07,  // ###..........###
  0x0F, 0xF0,  // ....########....
  0x1F, 0xF8,  // ...##########...
  0x30, 0x0C,  // ..##........##..
  0x00, 0x00,  // ................
  0x03, 0xC0,  // ......####......
  0x07, 0xE0,  // .....######.....
  0x06, 0x60,  // .....##..##.....
  0x00, 0x00,  // ................
  0x01, 0x80,  // .......##.......
  0x01, 0x80,  // .......##.......
  0x00, 0x00   // ................
};

// ============================================
// UI State
// ============================================
bool motionArmed = false;
bool settingsPressed = false;

// Touch regions
struct TouchRegion {
  int16_t x, y, w, h;
};

TouchRegion armMotionSwitch = {400, 95, 48, 28};
TouchRegion settingsButton = {16, 168, 448, 64};

// Function prototypes
void drawUI();
void drawStatusBar();
void drawHeader();
void drawArmMotionCard();
void drawSettingsCard();
void drawBottomBar();
void drawSwitch(int16_t x, int16_t y, bool state);
void drawBitmapIcon(int16_t x, int16_t y, const unsigned char* bitmap, int16_t w, int16_t h, uint16_t color);
void drawFilledRoundedRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color);
void drawRoundedRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color);
void handleTouch();

void setup() {
  Serial.begin(115200);
  
  tft.init();
  tft.setRotation(1);  // Landscape mode
  tft.fillScreen(COLOR_BG);
  
  // Initialize touch
  uint16_t calData[5] = {275, 3620, 264, 3532, 1};
  tft.setTouch(calData);
  
  drawUI();
}

void loop() {
  handleTouch();
  delay(50);
}

// Draw bitmap icon at position with specified color
void drawBitmapIcon(int16_t x, int16_t y, const unsigned char* bitmap, int16_t w, int16_t h, uint16_t color) {
  int16_t byteWidth = (w + 7) / 8;
  uint8_t byte = 0;
  
  for (int16_t j = 0; j < h; j++) {
    for (int16_t i = 0; i < w; i++) {
      if (i & 7) {
        byte <<= 1;
      } else {
        byte = pgm_read_byte(&bitmap[j * byteWidth + i / 8]);
      }
      if (byte & 0x80) {
        tft.drawPixel(x + i, y + j, color);
      }
    }
  }
}

void drawUI() {
  tft.fillScreen(COLOR_BG);
  drawStatusBar();
  drawHeader();
  drawArmMotionCard();
  drawSettingsCard();
  drawBottomBar();
}

void drawStatusBar() {
  // Background
  tft.fillRect(0, 0, 480, 32, COLOR_CARD_BG);
  tft.drawFastHLine(0, 31, 480, COLOR_BORDER);
  
  // Status indicator dot
  int dotX = 16;
  int dotY = 16;
  if (motionArmed) {
    tft.fillCircle(dotX, dotY, 4, COLOR_EMERALD);
  } else {
    tft.fillCircle(dotX, dotY, 4, COLOR_TEXT_DIM);
  }
  
  // Status text
  tft.setTextColor(COLOR_TEXT_MUTED);
  tft.setTextSize(1);
  tft.setCursor(28, 12);
  if (motionArmed) {
    tft.print("System Armed");
  } else {
    tft.print("System Disarmed");
  }
  
  // Time
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setCursor(430, 12);
  tft.print("12:34");
}

void drawHeader() {
  // Shield icon background
  drawFilledRoundedRect(16, 48, 40, 40, 8, COLOR_EMERALD_DIM);
  
  // Shield bitmap icon (centered in the 40x40 box)
  drawBitmapIcon(24, 56, icon_shield, 24, 24, COLOR_EMERALD);
  
  // Title
  tft.setTextColor(COLOR_TEXT_PRIMARY);
  tft.setTextSize(2);
  tft.setCursor(68, 52);
  tft.print("Home Security");
  
  // Subtitle
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setTextSize(1);
  tft.setCursor(68, 74);
  tft.print("Control Panel");
}

void drawArmMotionCard() {
  // Card background
  drawFilledRoundedRect(16, 100, 448, 56, 12, COLOR_CARD_BG);
  drawRoundedRect(16, 100, 448, 56, 12, COLOR_BORDER);
  
  // Icon background
  if (motionArmed) {
    drawFilledRoundedRect(28, 112, 32, 32, 8, COLOR_EMERALD_DIM);
  } else {
    drawFilledRoundedRect(28, 112, 32, 32, 8, COLOR_BORDER);
  }
  
  // Motion bitmap icon (centered in the 32x32 box)
  uint16_t iconColor = motionArmed ? COLOR_EMERALD : COLOR_TEXT_DIM;
  drawBitmapIcon(32, 116, icon_motion, 24, 24, iconColor);
  
  // Text
  tft.setTextColor(COLOR_TEXT_PRIMARY);
  tft.setTextSize(1);
  tft.setCursor(72, 116);
  tft.print("Arm Motion");
  
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setCursor(72, 132);
  tft.print("Motion detection sensor");
  
  // Switch
  drawSwitch(400, 114, motionArmed);
}

void drawSwitch(int16_t x, int16_t y, bool state) {
  uint16_t bgColor = state ? COLOR_EMERALD : COLOR_SWITCH_OFF;
  
  // Switch background
  tft.fillRoundRect(x, y, 48, 28, 14, bgColor);
  
  // Switch knob
  int knobX = state ? x + 48 - 24 - 2 : x + 2;
  tft.fillCircle(knobX + 12, y + 14, 11, COLOR_TEXT_PRIMARY);
}

void drawSettingsCard() {
  // Card background
  drawFilledRoundedRect(16, 168, 448, 56, 12, COLOR_CARD_BG);
  drawRoundedRect(16, 168, 448, 56, 12, COLOR_BORDER);
  
  // Icon background
  drawFilledRoundedRect(28, 180, 32, 32, 8, COLOR_BORDER);
  
  // Gear bitmap icon (centered in the 32x32 box)
  drawBitmapIcon(32, 184, icon_gear, 24, 24, COLOR_TEXT_MUTED);
  
  // Text
  tft.setTextColor(COLOR_TEXT_PRIMARY);
  tft.setTextSize(1);
  tft.setCursor(72, 184);
  tft.print("Settings");
  
  tft.setTextColor(COLOR_TEXT_DIM);
  tft.setCursor(72, 200);
  tft.print("System configuration");
  
  // Chevron bitmap icon
  drawBitmapIcon(432, 184, icon_chevron, 24, 24, COLOR_TEXT_DIM);
}

void drawBottomBar() {
  // Background
  tft.fillRect(0, 284, 480, 36, COLOR_CARD_BG);
  tft.drawFastHLine(0, 284, 480, COLOR_BORDER);
  
  // Status indicators
  int y = 302;
  
  // WiFi
  tft.fillCircle(150, y, 4, COLOR_EMERALD);
  tft.setTextColor(COLOR_TEXT_MUTED);
  tft.setTextSize(1);
  tft.setCursor(160, y - 4);
  tft.print("WiFi");
  
  // Sensors
  tft.fillCircle(230, y, 4, COLOR_EMERALD);
  tft.setCursor(240, y - 4);
  tft.print("Sensors");
  
  // Battery
  tft.fillCircle(320, y, 4, 0xFD20); // Orange/amber color
  tft.setCursor(330, y - 4);
  tft.print("Battery");
}

void drawFilledRoundedRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color) {
  tft.fillRoundRect(x, y, w, h, r, color);
}

void drawRoundedRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color) {
  tft.drawRoundRect(x, y, w, h, r, color);
}

void handleTouch() {
  uint16_t touchX, touchY;
  
  if (tft.getTouch(&touchX, &touchY)) {
    // Check Arm Motion switch
    if (touchX >= armMotionSwitch.x && touchX <= armMotionSwitch.x + armMotionSwitch.w &&
        touchY >= armMotionSwitch.y && touchY <= armMotionSwitch.y + armMotionSwitch.h) {
      motionArmed = !motionArmed;
      
      // Redraw affected areas
      drawStatusBar();
      drawArmMotionCard();
      
      Serial.print("Motion Armed: ");
      Serial.println(motionArmed ? "ON" : "OFF");
      
      delay(200); // Debounce
    }
    
    // Check Settings button
    if (touchX >= settingsButton.x && touchX <= settingsButton.x + settingsButton.w &&
        touchY >= settingsButton.y && touchY <= settingsButton.y + settingsButton.h) {
      
      // Visual feedback - briefly highlight
      drawRoundedRect(16, 168, 448, 56, 12, COLOR_TEXT_MUTED);
      delay(100);
      drawRoundedRect(16, 168, 448, 56, 12, COLOR_BORDER);
      
      Serial.println("Settings pressed");
      
      // Add your settings navigation here
      // openSettingsMenu();
    }
  }
}

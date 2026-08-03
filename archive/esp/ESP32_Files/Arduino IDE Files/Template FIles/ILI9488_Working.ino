/*
 * ILI9488 Working Example - ESP32-S3
 * This configuration works!
 */

#include <TFT_eSPI.h>

TFT_eSPI tft = TFT_eSPI();

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("ILI9488 Display Test");
  
  // Setup backlight
  pinMode(15, OUTPUT);
  digitalWrite(15, HIGH);
  delay(100);
  
  // Initialize display
  tft.init();
  delay(200);
  
  // Set rotation
  tft.setRotation(1);  // Landscape
  
  // Clear screen
  tft.fillScreen(TFT_BLACK);
  delay(100);
  
  // Draw colored rectangles
  // Top row: Red, Green, Blue
  tft.fillRect(0, 0, 160, 160, TFT_RED);
  tft.fillRect(160, 0, 160, 160, TFT_GREEN);
  tft.fillRect(320, 0, 160, 160, TFT_BLUE);
  
  // Bottom row: Yellow, Cyan, Magenta
  tft.fillRect(0, 160, 160, 160, TFT_YELLOW);
  tft.fillRect(160, 160, 160, 160, TFT_CYAN);
  tft.fillRect(320, 160, 160, 160, TFT_MAGENTA);
  
  // Draw text
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(150, 145);
  tft.print("WORKING!");
  
  Serial.println("Display is working! You should see 6 colored rectangles.");
}

void loop() {
  delay(1000);
}





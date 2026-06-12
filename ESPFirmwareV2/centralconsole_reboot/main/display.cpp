#include "display.h"
#include "uielements.h"

#include <SPI.h>
#include <TFT_eSPI.h>

TFT_eSPI tft;


void Display::init() {
    tft.init();
    Serial.println("Display Initialized");
    Serial.println("Setting Background to black");
    tft.fillScreen(0x0000);
    Serial.println("Rotation to landscape");
    tft.setRotation(1);
    tft.setCursor(0, 0);
    tft.setTextSize(1);
    tft.print("Display setup, rotation landscape");
    delay(2000);
    tft.setSwapBytes(true);
    tft.pushImage(0, 0, 480, 320, (const uint16_t *) uidashboard);
    delay(2000);
    tft.pushImage(0, 0, 480, 320, (const uint16_t *) uiarmed);
}

void Display::dashboard(){
    
}

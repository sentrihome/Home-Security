#include "display.h"
#include "uielements.h"

#include <SPI.h>
#include <TFT_eSPI.h>

TFT_eSPI tft;


void Display::init() {
    tft.init();
    log("Display Initialized");
    log("Setting Background to black");
    tft.fillScreen(0x0000);
    log("Rotation to landscape");
    tft.setRotation(1);
    tft.setCursor(0, 0);
    tft.setTextSize(1);
    tft.print("Display setup, rotation landscape");
    delay(2000);
    tft.setSwapBytes(true);
    state = "idle";
    tft.pushImage(0, 0, 480, 320, (const uint16_t *) uiidle);
}

void Display::idle(){
    if (state == "idle") {
        log("State idle, sending uiid");
        tft.pushImage(17, 8, 113, 16, (const uint16_t *) uisysdisarmed);
        tft.pushImage(30, 124, 36, 36, (const uint16_t *) uisysdisarmed2);
        tft.pushImage(402, 129, 48, 28, (const uint16_t *) uisysdisarmed3);
        state = "set";
        log("Screening uiidle, state set");
    }
}

void Display::armed(){
    tft.pushImage(17, 8, 113, 16, (const uint16_t *) uisysarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *) uisysarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *) uisysarmed3);
}

void Display::process(){
    tft.pushImage(17, 8, 113, 16, (const uint16_t *) uisysdisarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *) uisysdisarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *) uisysdisarmed3);    
    delay(1000);
    armed();
    delay(1000);
    // uint16_t x, y;

    // tft.getTouchRaw(&x, &y);
    
    // Serial.printf("x: %i     ", x);

    // Serial.printf("y: %i     ", y);

    // Serial.printf("z: %i \n", tft.getTouchRawZ());

    // delay(250);
}

// x: 2432     y: 803     z: 2254 
// x: 2432     y: 368     z: 2295 
// x: 1982     y: 350     z: 2231 
// x: 1984     y: 800     z: 2351 
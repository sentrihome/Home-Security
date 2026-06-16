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
}

void Display::idle(){
    if (state == "idle") {
        log("State idle, sending uiid");
        tft.pushImage(0, 0, 480, 320, (const uint16_t *) uiidle);
        state = "set";
        log("Screening uiidle, state set");
    }
}

void Display::armed(){

}

void Display::process(){
    idle();
}
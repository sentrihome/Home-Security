#include "display.h"
#include "uielements.h"

#include <SPI.h>
#include <TFT_eSPI.h>

TFT_eSPI tft;
Touch touch;

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
    state = UNARMED;
    tft.pushImage(0, 0, 480, 320, (const uint16_t *) uiidle);
}

void Display::unarmed(){
    log("State unarmed, sending ui");
    tft.pushImage(17, 8, 113, 16, (const uint16_t *) uisysdisarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *) uisysdisarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *) uisysdisarmed3);
    state = UNARMED;
    log("Screening uiunarmed, state unarmed");
}

void Display::armed(){
    log("State armed, sending ui");
    tft.pushImage(17, 8, 113, 16, (const uint16_t *) uisysarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *) uisysarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *) uisysarmed3);
    state = ARMED;
    log("Screening uiarmed, state armed");
}

void Touch::read(){
    tft.getTouchRaw(&x, &y);
}

void Touch::debug(){
    Serial.printf("x: %i     ", x);
    Serial.printf("y: %i     ", y);
    Serial.printf("z: %i \n", tft.getTouchRawZ());
    delay(250);
}

void Display::process(){ 
    touch.read();
    if ((touch.x >= 1982) && (touch.x <= 2432) && (touch.y >= 350) && (touch.y <= 803)){
        if (state == UNARMED){
            armed();
            delay(80);
        }
        else if (state == ARMED){
            unarmed();
            delay(80);
        }        
    }
}

// x: 2432     y: 803     z: 2254 
// x: 2432     y: 368     z: 2295 
// x: 1982     y: 350     z: 2231 
// x: 1984     y: 800     z: 2351 
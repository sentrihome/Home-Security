#include "display.h"

TFT_eSPI tft = TFT_eSPI();

bool motiondetectorstate = false;
bool homepage = true;
bool setuppage = false;
bool disarmauthpage = false;

void displayinit(){
  uint16_t calibrationData[5];
  uint8_t calDataOK = 0;

  Serial.begin(115200);
  Serial.println("starting");

  tft.init();

  tft.setRotation(1);
  tft.fillScreen((0xFFFF));

  tft.setCursor(20, 0, 2);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);  tft.setTextSize(1);
  tft.println("calibration run");

  // Initialize LittleFS
  // if (!LittleFS.begin(true)) {  // true = format if mount fails
  //   Serial.println("LittleFS mount failed");
  //   return;
  // }

  // check if calibration file exists
  if (LittleFS.exists(CALIBRATION_FILE)) {
    File f = LittleFS.open(CALIBRATION_FILE, "r");
    if (f) {
      if (f.readBytes((char *)calibrationData, 14) == 14)
        calDataOK = 1;
      f.close();
    }
  }
  if (calDataOK) {
    // calibration data valid
    tft.setTouch(calibrationData);
  } else {
    // data not valid. recalibrate
    tft.calibrateTouch(calibrationData, TFT_WHITE, TFT_RED, 15);
    // store data
    File f = LittleFS.open(CALIBRATION_FILE, "w");
    if (f) {
      f.write((const unsigned char *)calibrationData, 14);
      f.close();
    }
  }

  tft.fillScreen(TFT_BLACK);
}

void display(){
  if (homepage && !setuppage && !disarmauthpage){
    displayMainMenu();
  }
  if (!homepage && setuppage && !disarmauthpage){
    displaySetupPage();
  }
  if (!homepage && !setuppage && disarmauthpage){
    displayDisarmAuthPage();
  }
}
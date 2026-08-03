#include "tft_interface.h"

TFT_eSPI tft = TFT_eSPI();

int option1state = 0;
int option2state = 0;

void display_init(void) {
  
  uint16_t calibrationData[5];
  uint8_t calDataOK = 0;

  Serial.begin(115200);
  Serial.println("starting");

  tft.init();

  tft.setRotation(1);
  tft.fillScreen((0xFFFF));

  tft.setCursor(20, 0, 2);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);  
  tft.setTextSize(1);
  tft.println("calibration run");

  // check file system
  if (!SPIFFS.begin()) {
    Serial.println("formatting file system");

    SPIFFS.format();
    SPIFFS.begin();
  }
  if (SPIFFS.exists(CALIBRATION_FILE)) {
    if (SPIFFS.remove(CALIBRATION_FILE)) {
      Serial.println("Calibration file deleted successfully!");
    } else {
      Serial.println("Failed to delete calibration file");
    }
  } else {
    Serial.println("Calibration file does not exist");
  }
  // check if calibration file exists
  if (SPIFFS.exists(CALIBRATION_FILE)) {
    File f = SPIFFS.open(CALIBRATION_FILE, "r");
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
    File f = SPIFFS.open(CALIBRATION_FILE, "w");
    if (f) {
      f.write((const unsigned char *)calibrationData, 14);
      f.close();
    }
  }

  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(3);
  tft.setCursor(0, 0);
  tft.print("Center Interface");

  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(2);
  tft.setCursor(0, 100);
  tft.print("ARM Motion Detection");

  tft.drawCircle(290, 120, 10, TFT_WHITE);

  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(2);
  tft.setCursor(0, 200);
  tft.print("View Data");
}

void display_func() {
  uint16_t x, y;

  //tft.drawCircle(290, 120, 10, TFT_WHITE);
  if (tft.getTouch(&x, &y)) {
    if ( (x >= 260) && (x <= 320) && (y >= 90) && (y <= 150)){
      if (option1state == 0){
        tft.fillCircle(290, 120, 10, TFT_GREEN);
        option1state = 1;
        while (tft.getTouch(&x, &y)){

        }
      }
      else if (option1state == 1){
        tft.fillCircle(290, 120, 10, TFT_BLACK);
        tft.drawCircle(290, 120, 10, TFT_WHITE);
        option1state = 0;
        while (tft.getTouch(&x, &y)){
          
        }
      }
    }
  }

}


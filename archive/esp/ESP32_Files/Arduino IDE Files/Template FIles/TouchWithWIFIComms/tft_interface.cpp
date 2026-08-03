#include "tft_interface.h"
#include "wifi_udp.h"
#include "setuppage.h"

TFT_eSPI tft = TFT_eSPI();

int option1state = 0;
int option2state = 0;
int setupstate = 0;

void display_init(void) {
  
  uint16_t calibrationData[5];
  uint8_t calDataOK = 0;

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
  tft.setCursor(0, 150);
  tft.print("Setup");
  tft.drawLine(0, 185, 65, 185, TFT_WHITE);
  /*tft.drawLine(0, 150, 65, 150, TFT_WHITE);
  tft.drawLine(0, 150, 0, 185, TFT_WHITE);
  tft.drawLine(65, 150, 65, 185, TFT_WHITE);*/
}

void display_func() {
  uint16_t x, y;

  //////////////////////////////////motion detector on/off///////////////////////////////////
  if (tft.getTouch(&x, &y)) {
    if ( (x >= 260) && (x <= 320) && (y >= 90) && (y <= 150)){
      if (option1state == 0){
        tft.fillCircle(290, 120, 10, TFT_GREEN);
        option1state = 1;
        wifi_send("turnonmotiondetectorespmotion");
        while (tft.getTouch(&x, &y)){
          wifi_send("turnonmotiondetectorespmotion");
        }
      }
      else if (option1state == 1){
        tft.fillCircle(290, 120, 10, TFT_BLACK);
        tft.drawCircle(290, 120, 10, TFT_WHITE);
        option1state = 0;
        wifi_send("turnoffmotiondetectorespmotion");
        while (tft.getTouch(&x, &y)){
          wifi_send("turnoffmotiondetectorespmotion");
        }
      }
    }
  }
  //////////////////////////////////motion detector on/off///////////////////////////////////
  //////////////////////////////////////////setup////////////////////////////////////////////
  if (tft.getTouch(&x, &y)) {
    if ( (x >= 0) && (x <= 65) && (y >= 150) && (y <= 185)){
      if (setupstate == 0){
        //////////////////////////existing stuff in black///////////////////////////
        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(3);
        tft.setCursor(0, 0);
        tft.print("Center Interface");

        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, 100);
        tft.print("ARM Motion Detection");

        tft.drawCircle(290, 120, 10, TFT_BLACK);

        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, 150);
        tft.print("Setup");
        tft.drawLine(0, 185, 65, 185, TFT_BLACK);
        //////////////////////////existing stuff in black///////////////////////////
        ////////////////////////////////new stuff///////////////////////////////////
        tft.setTextColor(TFT_WHITE);
        tft.setTextSize(2);
        tft.setCursor(0, 0);
        tft.println("Exit");
        tft.drawRect(0, 0, 100, 40, TFT_BLACK);
        tft.println("\nConnect to the WIFI \nESP32_Master_Config\nGo to 192.168.10.1\n\nRESET");
        setupstate = 1;
        server.begin();
        ////////////////////////////////new stuff///////////////////////////////////
      }
    }
    if ( (x >= 0) && (x <= 100) && (y >= 0) && (y <= 40)){
      if (setupstate == 1){
        //////////////////////////existing stuff in black///////////////////////////
        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, 0);
        tft.println("Exit");
        tft.drawRect(0, 0, 100, 40, TFT_BLACK);
        tft.println("\nConnect to the WIFI \nESP32_Master_Config\nGo to 192.168.10.1\n\nRESET");
        setupstate = 0;
        server.stop();
        //////////////////////////existing stuff in black///////////////////////////
        ////////////////////////////////new stuff///////////////////////////////////
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
        tft.setCursor(0, 150);
        tft.print("Setup");
        tft.drawLine(0, 185, 65, 185, TFT_WHITE);
        ////////////////////////////////new stuff///////////////////////////////////
      }
    }
    
  }    
  //////////////////////////////////////////setup////////////////////////////////////////////
}


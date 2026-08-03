#include "FS.h"
#include <SPI.h>
#include <TFT_eSPI.h>
TFT_eSPI tft = TFT_eSPI();

#define CALIBRATION_FILE "/calibrationData"

void setup(void) {
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

  tft.fillScreen((0xFFFF));
  
}

void loop() {
  uint16_t x, y;
  static uint16_t color;

  if (tft.getTouch(&x, &y)) {

    tft.setTextSize(1);
    tft.setCursor(5, 5, 2);
    tft.printf("x: %i     ", x);
    tft.setCursor(5, 20, 2);
    tft.printf("y: %i    ", y);

    tft.drawPixel(x, y, color);
    color += 155;
    if ( (x >= 70) && (x <= 180) && (y >= 60) && (y <= 130)){
      Serial.printf("\n1");
      while (tft.getTouch(&x, &y)){

      }
    }
    if ( (x >= 180) && (x <= 300) && (y >= 60) && (y <= 130)){
      Serial.printf("\n2");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 300) && (x <= 400) && (y >= 60) && (y <= 130)){
      Serial.printf("\n3");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    
    if ( (x >= 70) && (x <= 180) && (y >= 130) && (y <= 190)){
      Serial.printf("\n4");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 180) && (x <= 300) && (y >= 130) && (y <= 190)){
      Serial.printf("\n5");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 300) && (x <= 400) && (y >= 130) && (y <= 190)){
      Serial.printf("\n6");
      while (tft.getTouch(&x, &y)){
        
      }
    }

    if ( (x >= 70) && (x <= 180) && (y >= 190) && (y <= 250)){
      Serial.printf("\n7");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 180) && (x <= 300) && (y >= 190) && (y <= 250)){
      Serial.printf("\n8");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 300) && (x <= 400) && (y >= 190) && (y <= 250)){
      Serial.printf("\n9");
      while (tft.getTouch(&x, &y)){
        
      }
    }

    if ( (x >= 70) && (x <= 180) && (y >= 250) && (y <= 310)){
      Serial.printf("\n*");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 180) && (x <= 300) && (y >= 250) && (y <= 310)){
      Serial.printf("\n0");
      while (tft.getTouch(&x, &y)){
        
      }
    }
    if ( (x >= 300) && (x <= 400) && (y >= 250) && (y <= 310)){
      Serial.printf("\n#");
      while (tft.getTouch(&x, &y)){
        
      }
    }

  }
  /**/tft.setTextSize(2);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setCursor(0, 80);
  tft.printf("          1        2        3\n\n          4        5        6\n\n          7        8        9\n\n          *        0        #");
  
}

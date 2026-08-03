#include "tft_interface.h"
#include "wifi_udp.h"
#include "setuppage.h"

TFT_eSPI tft = TFT_eSPI();

int motiondetectorstate = 0;
int option2state = 0;
int setupstate = 0;
int disarmcheck = 0;
bool pressed = false;
bool lastpressed = false;
int keypadx = 180;

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
  /*if (SPIFFS.exists(CALIBRATION_FILE)) {
    if (SPIFFS.remove(CALIBRATION_FILE)) {
      Serial.println("Calibration file deleted successfully!");
    } else {
      Serial.println("Failed to delete calibration file");
    }
  } else {
    Serial.println("Calibration file does not exist");
  }*/
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
      if (motiondetectorstate == 0){
        tft.fillCircle(290, 120, 10, TFT_GREEN);
        motiondetectorstate = 1;
        disarmcheck = 0;
        wifi_send("turnonmotiondetectorespmotion");
        while (tft.getTouch(&x, &y)){
          wifi_send("turnonmotiondetectorespmotion");
        }
      }
      else if (motiondetectorstate == 1){
        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(3);
        tft.setCursor(0, 0);
        tft.print("Center Interface");

        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, 100);
        tft.print("ARM Motion Detection");

        tft.fillCircle(290, 120, 10, TFT_BLACK);
        tft.drawCircle(290, 120, 10, TFT_BLACK);

        tft.setTextColor(TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, 150);
        tft.print("Setup");
        tft.drawLine(0, 185, 65, 185, TFT_BLACK);
        tft.setTextColor(TFT_WHITE);
        tft.setTextSize(2);
        tft.setCursor(415, 20);
        tft.printf("<-");
        tft.setCursor(0, 80);
        tft.printf("          1        2        3\n\n          4        5        6\n\n          7        8        9\n\n          *        0        #");
        
        
        while (disarmcheck == 0){
          pressed = tft.getTouch(&x, &y);
          if (pressed && !lastpressed) {
            tft.setTextSize(1);
            tft.setTextColor(TFT_WHITE, TFT_BLACK);
            tft.setCursor(5, 5, 2);
            tft.printf("x: %i     ", x);
            tft.setCursor(5, 20, 2);
            tft.printf("y: %i    ", y);

            tft.drawPixel(x, y, TFT_WHITE);
            tft.setTextSize(2);
            tft.setCursor(keypadx, 20);
            if ( (x >= 400) && (x <= 460) && (y >= 15) && (y <= 60)){
              keypadx -= 20;
              Serial.printf("");
              tft.fillRect(keypadx, 20, 20, 30, TFT_BLACK);
              delay(200);
            }
            if ( (x >= 70) && (x <= 180) && (y >= 60) && (y <= 130)){
              Serial.printf("\n1");
              tft.printf("1");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 180) && (x <= 300) && (y >= 60) && (y <= 130)){
              Serial.printf("\n2");
              tft.printf("2");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 300) && (x <= 400) && (y >= 60) && (y <= 130)){
              Serial.printf("\n3");
              tft.printf("3");
              keypadx += 20;
              delay(200);
            }
            
            if ( (x >= 70) && (x <= 180) && (y >= 130) && (y <= 190)){
              Serial.printf("\n4");
              tft.printf("4");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 180) && (x <= 300) && (y >= 130) && (y <= 190)){
              Serial.printf("\n5");
              tft.printf("5");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 300) && (x <= 400) && (y >= 130) && (y <= 190)){
              Serial.printf("\n6");
              tft.printf("6");
              keypadx += 20;
              delay(200);
            }

            if ( (x >= 70) && (x <= 180) && (y >= 190) && (y <= 250)){
              Serial.printf("\n7");
              tft.printf("7");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 180) && (x <= 300) && (y >= 190) && (y <= 250)){
              Serial.printf("\n8");
              tft.printf("8");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 300) && (x <= 400) && (y >= 190) && (y <= 250)){
              Serial.printf("\n9");
              tft.printf("9");
              keypadx += 20;
              delay(200);
            }

            if ( (x >= 70) && (x <= 180) && (y >= 250) && (y <= 310)){
              Serial.printf("\n*");
              tft.printf("*");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 180) && (x <= 300) && (y >= 250) && (y <= 310)){
              Serial.printf("\n0");
              tft.printf("0");
              keypadx += 20;
              delay(200);
            }
            if ( (x >= 300) && (x <= 400) && (y >= 250) && (y <= 310)){
              Serial.printf("\n#");
              tft.printf("#");
              keypadx += 20;
              delay(200);
            }

          }
          lastpressed = pressed;
        }
        

        /*tft.fillCircle(290, 120, 10, TFT_BLACK);
        tft.drawCircle(290, 120, 10, TFT_WHITE);
        motiondetectorstate = 0;
        wifi_send("turnoffmotiondetectorespmotion");
        while (tft.getTouch(&x, &y)){
          wifi_send("turnoffmotiondetectorespmotion");
        }*/
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


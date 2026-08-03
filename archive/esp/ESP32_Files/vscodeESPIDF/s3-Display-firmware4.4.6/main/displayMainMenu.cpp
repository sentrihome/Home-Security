#include "display.h"


int pressnum = 0;

void displayMainMenu(){
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

    uint16_t x, y;
    if (tft.getTouch(&x, &y)) {
        if ( (x <= 65) && (y >= 150) && (y <= 185)){
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

            homepage = false;
            setuppage = true;
        }
        if ( (x >= 260) && (x <= 320) && (y >= 90) && (y <= 150)){
            if (!motiondetectorstate){
                tft.fillCircle(290, 120, 10, TFT_GREEN);
                motiondetectorstate = true;
                wifi_send("turnonmotiondetectorespmotion");
                delay(1000);
                wifi_send("idle");
            }
            else if (motiondetectorstate){
                delay(1000);
                tft.setTextColor(TFT_BLACK);
                tft.setTextSize(3);
                tft.setCursor(0, 0);
                tft.print("Center Interface");

                tft.setTextColor(TFT_BLACK);
                tft.setTextSize(2);
                tft.setCursor(0, 100);
                tft.print("ARM Motion Detection");

                tft.fillCircle(290, 120, 12, TFT_BLACK);

                tft.setTextColor(TFT_BLACK);
                tft.setTextSize(2);
                tft.setCursor(0, 150);
                tft.print("Setup");
                tft.drawLine(0, 185, 65, 185, TFT_BLACK);

                homepage = false;
                setuppage = false;
                disarmauthpage = true;
            }
        }
    }
}
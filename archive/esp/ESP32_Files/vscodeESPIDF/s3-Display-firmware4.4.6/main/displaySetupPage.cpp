#include "display.h"

void displaySetupPage(){
    tft.setTextColor(TFT_WHITE);
    tft.setTextSize(2);
    tft.setCursor(0, 0);
    tft.println("Exit");
    tft.println("\nConnect to the WIFI \nESP32_Master_Config\nGo to 192.168.10.1\n\nRESET");
    // static bool serverStarted = false;
    // if (!serverStarted) {
    //     server.begin();
    //     serverStarted = true;
    // }

    uint16_t x, y;
    if (tft.getTouch(&x, &y)){
        if ( (x <= 100) && (y <= 40)){
            tft.setTextColor(TFT_BLACK);
            tft.setTextSize(2);
            tft.setCursor(0, 0);
            tft.println("Exit");
            tft.println("\nConnect to the WIFI \nESP32_Master_Config\nGo to 192.168.10.1\n\nRESET");
            // server.stop();
            // serverStarted = false;

            homepage = true;
            setuppage = false;
        }
    }
    
}
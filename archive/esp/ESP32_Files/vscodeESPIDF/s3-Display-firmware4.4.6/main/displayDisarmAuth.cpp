#include "display.h"

bool disarmauthapprove = false;
char pass[] = "23012";
int length = strlen(pass);
char userpass[] = "000000000000000";
int passpos = 0;
int keypadcursor = 180;


void displayDisarmAuthPage(){
    tft.setTextColor(TFT_WHITE);
    tft.setTextSize(2);
    tft.setCursor(415, 20);
    tft.printf("<-");
    tft.setCursor(0, 80);
    tft.printf("          1        2        3\n"  
               "                                   E\n"
               "          4        5        6     N\n"
               "                                   T\n"
               "          7        8        9     E\n"
               "                                   R\n"
               "          *        0        #");
    uint16_t x, y;

    tft.setCursor(keypadcursor, 20);
    if (tft.getTouch(&x, &y)){
        if ( (x >= 70) && (x <= 180) && (y >= 60) && (y <= 130)){
            Serial.printf("\n1");
            tft.printf("1");
            keypadcursor += 20;
            userpass[passpos] = '1';
            passpos++;
            while (tft.getTouch(&x, &y)){

            }
        }
        if ( (x >= 180) && (x <= 300) && (y >= 60) && (y <= 130)){
            Serial.printf("\n2");
            tft.printf("2");
            keypadcursor += 20;
            userpass[passpos] = '2';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 300) && (x <= 400) && (y >= 60) && (y <= 130)){
            Serial.printf("\n3");
            tft.printf("3");
            keypadcursor += 20;
            userpass[passpos] = '3';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
            
        if ( (x >= 70) && (x <= 180) && (y >= 130) && (y <= 190)){
            Serial.printf("\n4");
            tft.printf("4");
            keypadcursor += 20;
            userpass[passpos] = '4';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 180) && (x <= 300) && (y >= 130) && (y <= 190)){
            Serial.printf("\n5");
            tft.printf("5");
            keypadcursor += 20;
            userpass[passpos] = '5';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 300) && (x <= 400) && (y >= 130) && (y <= 190)){
            Serial.printf("\n6");
            tft.printf("6");
            keypadcursor += 20;
            userpass[passpos] = '6';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }

        if ( (x >= 70) && (x <= 180) && (y >= 190) && (y <= 250)){
            Serial.printf("\n7");
            tft.printf("7");
            keypadcursor += 20;
            userpass[passpos] = '7';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 180) && (x <= 300) && (y >= 190) && (y <= 250)){
            Serial.printf("\n8");
            tft.printf("8");
            keypadcursor += 20;
            userpass[passpos] = '8';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 300) && (x <= 400) && (y >= 190) && (y <= 250)){
            Serial.printf("\n9");
            tft.printf("9");
            keypadcursor += 20;
            userpass[passpos] = '9';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }

        if ( (x >= 70) && (x <= 180) && (y >= 250) && (y <= 310)){
            Serial.printf("\n*");
            tft.printf("*");
            keypadcursor += 20;
            userpass[passpos] = '*';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 180) && (x <= 300) && (y >= 250) && (y <= 310)){
            Serial.printf("\n0");
            tft.printf("0");
            keypadcursor += 20;
            userpass[passpos] = '0';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 300) && (x <= 400) && (y >= 250) && (y <= 310)){
            Serial.printf("\n#");
            tft.printf("#");
            keypadcursor += 20;
            userpass[passpos] = '#';
            passpos++;
            while (tft.getTouch(&x, &y)){
                
            }
        }
        if ( (x >= 400) && (y >= 10) && (y <= 110)){
            keypadcursor -= 20;
            if (keypadcursor < 180){
                tft.fillRect(180, 20, 20, 30, TFT_BLACK);
            }
            else{
                tft.fillRect(keypadcursor, 20, 20, 30, TFT_BLACK);
            }
            passpos--;
            delay(200);
        }
        if (keypadcursor <= 180){
            keypadcursor = 180;
        }
        if (passpos < 0){
            passpos = 0;
        }
        if (passpos >= 14){
            passpos = 14;
        }
        if ( (x >= 420) && (y >= 130)){
            userpass[passpos] = '\0';
            if (!(strcmp(userpass, pass))){
                tft.setTextColor(TFT_BLACK);
                tft.setTextSize(2);
                tft.setCursor(415, 20);
                tft.printf("<-");
                tft.setCursor(0, 80);
                tft.printf("          1        2        3\n"  
                           "                                   E\n"
                           "          4        5        6     N\n"
                           "                                   T\n"
                           "          7        8        9     E\n"
                           "                                   R\n"
                           "          *        0        #");
                tft.fillRect(180, 20, 300, 40, TFT_BLACK);

                passpos = 0;
                for (int i = 0; i < 14; i++) {
                    userpass[i] = '0';
                }
                userpass[14] = '\0';
                keypadcursor = 180;

                wifi_send("turnoffmotiondetectorespmotion");
                delay(1000);
                wifi_send("idle");
                motiondetectorstate = false;
                homepage = true;
                setuppage = false;
                disarmauthpage = false;
            }
            else if (strcmp(userpass, pass)){
                tft.setTextColor(TFT_RED);
                tft.setTextSize(2);
                tft.setCursor(200, 20);
                tft.printf("DENIED");
                delay(2000);
                tft.setTextColor(TFT_BLACK);
                tft.setTextSize(2);
                tft.setCursor(200, 20);
                tft.printf("DENIED");
                tft.fillRect(180, 20, 300, 40, TFT_BLACK);
                keypadcursor = 180;
                passpos = 0;
                for (int i = 0; i < 14; i++) {
                    userpass[i] = '0';
                }
                userpass[14] = '\0';
            }
        }
    }
    
    
    
}
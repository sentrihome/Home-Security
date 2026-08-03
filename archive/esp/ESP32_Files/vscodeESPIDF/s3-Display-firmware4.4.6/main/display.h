#ifndef DISPLAY_H
#define DISPLAY_H

#include "FS.h"
#include "SPI.h"
#include "TFT_eSPI.h"
#include "filesys.h"
#include "wificonfig.h"

#define CALIBRATION_FILE "/calibrationData"

extern TFT_eSPI tft;
extern bool motiondetectorstate;
extern bool homepage;
extern bool setuppage;
extern bool disarmauthpage;

void displayinit(void);
void display(void);
void displayMainMenu(void);
void displaySetupPage(void);
void displayDisarmAuthPage(void);

#endif 


#ifndef TFT_INTERFACE_H
#define TFT_INTERFACE_H

#include "FS.h"
#include <SPI.h>
#include <TFT_eSPI.h>

#define CALIBRATION_FILE "/calibrationData"

extern TFT_eSPI tft;

extern int option1state;
extern int option2state;

void display_init(void);
void display_func(void);

#endif // TFT_INTERFACE_H


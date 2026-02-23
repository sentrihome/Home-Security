#ifndef KEYPAD_H
#define KEYPAD_H

#include <Arduino.h>
#include "api.h"

void keypadinit(void);
void keypadpress(void);

extern int motiononflag;
extern String setpassword;

#endif
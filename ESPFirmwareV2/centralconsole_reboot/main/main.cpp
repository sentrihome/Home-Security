#include <Arduino.h>
#include "display.h"

Display display;

void setup(){
  Serial.begin(115200);
  display.init();
  delay(10);
}

void loop(){
  delay(10);
}

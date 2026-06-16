#include "display.h"


Display display;

void setup(){
  Serial.begin(115200);
  display.init();
  delay(10);
}

void loop(){
  display.process();
  delay(200);
}

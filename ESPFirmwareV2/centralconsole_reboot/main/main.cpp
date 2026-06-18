#include "display.h"
#include "connectivity.h"

Display display;

// void setup(){
//   Serial.begin(115200);
//   display.init();
//   delay(10);
//   wifi_start();
// }

// void loop(){
//   display.process();
//   delay(200);
// }

extern "C" void app_main(void) {
  initArduino();
  Serial.begin(115200);
  display.init();
  delay(10);
  wifi_start();

  while(true){
    display.process();
    delay(200);
  }
}
#include "display.h"
#include "connectivity.h"
#include "app_uart.h"

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

extern "C" void app_main(void)
{
  initArduino();
  Serial.begin(115200);
  delay(10);
  wifi_init();
  uart.init();

  while (true)
  {
    display.init();
    display.process();
    pair.receive();
  }
}
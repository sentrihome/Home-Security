#include "display.h"
#include "connectivity.h"
#include "app_uart.h"
#include "storage.h"

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
  wait_for_wifi_to_connect = xQueueCreate(1, sizeof(bool));

  // nvs_flash_erase();

  storage.init();
  wifi_init();
  wifi_start(storage.read("ssid"), storage.read("pass"));
  uart.init();


  while (true)
  {
    display.init();
    display.process();
    uart.receive();
  }
}
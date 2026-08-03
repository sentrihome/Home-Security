#include "tft_interface.h"
#include "wifi_udp.h"
#include "setuppage.h"

void setup() {
  Serial.begin(115200);
  wifi_init();
  display_init();
  setuppage_init();
}

void loop() {
  display_func();
  wifi_receive();
  setuppage_func();
}

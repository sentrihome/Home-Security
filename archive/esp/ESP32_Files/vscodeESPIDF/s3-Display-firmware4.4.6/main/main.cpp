#include "display.h"
#include "filesys.h"
#include "wificonfig.h"

Servo myServo;
void setup() {
  Serial.begin(115200);
  littlefsinit();
  wifiInit();
  displayinit();
  apihandle();
  server.begin();
  
  myServo.setPeriodHertz(50);  // 50 Hz for standard servos
  myServo.attach(13, 500, 2400);  // pin, min µs, max µs
}

void loop() {
  display();
  wifi_receive();
  //setuppageserver();
  server.handleClient();
}

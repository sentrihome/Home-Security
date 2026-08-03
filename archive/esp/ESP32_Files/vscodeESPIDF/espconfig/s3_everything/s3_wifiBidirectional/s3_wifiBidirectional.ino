#include <WiFi.h>      // ESP8266 → #include <ESP8266WiFi.h>
#include <WiFiUdp.h>

const char* ssid = "vvlowspeed";
const char* password = "10022024";

const char* DEVICE_NAME = "ESP_DISPLAY";   // <-- change to ESP_B on the other board
const char* targetIP   = "192.168.1.73"; // <-- put the OTHER ESP's IP here
const int   udpPort    = 5005;

WiFiUDP udp;
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);

  WiFi.begin(ssid, password);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(400);
  }

  Serial.println("\nConnected!");
  Serial.print("My IP: ");
  Serial.println(WiFi.localIP());

  udp.begin(udpPort);
  Serial.println("UDP listening...");
}

void loop() {

  // ---- RECEIVE ----
  char buf[128];
  int packetSize = udp.parsePacket();
  if (packetSize) {
    
    int len = udp.read(buf, sizeof(buf) - 1);
    buf[len] = 0;
    Serial.print("Received: ");
    Serial.println(buf);
  }

  // ---- SEND ----
  if (millis() - lastSend > 1000) {
    lastSend = millis();

    udp.beginPacket(targetIP, udpPort);
    udp.print("turnoffmotiondetectorespmotion");
    //udp.print(DEVICE_NAME);
    udp.endPacket();

    Serial.println("Sent message");
  }
}

#include "wifi_udp.h"

const char* ssid = "vvlowspeed";
const char* password = "10022024";

const char* DEVICE_NAME = "ESP_DISPLAY";
const char* targetIP = "192.168.1.73";
const int udpPort = 5005;

WiFiUDP udp;
unsigned long lastSend = 0;
char wifiReceiveBuffer[128];

void wifi_init(void) {
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

void wifi_send(const char* message) {
  if (millis() - lastSend > 1000) {
    lastSend = millis();

    udp.beginPacket(targetIP, udpPort);
    udp.print(message);
    udp.endPacket();

    Serial.println("Sent message");
  }
}

int wifi_receive(void) {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(wifiReceiveBuffer, sizeof(wifiReceiveBuffer) - 1);
    wifiReceiveBuffer[len] = 0;
    Serial.print("Received: ");
    Serial.println(wifiReceiveBuffer);
    return len;
  }
  return 0;
}


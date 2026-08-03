#include "wifi_udp.h"
#include "setuppage.h"



const char* DEVICE_NAME = "ESP_DISPLAY";
const char* targetIP = "192.168.10.2"; 
const int udpPort = 5005;
int trys = 0;

WiFiUDP udp;
unsigned long lastSend = 0;
char wifiReceiveBuffer[128];

void wifi_init(void) {
  String ssid = littlefsReadFile("wifissid.txt");
  String password = littlefsReadFile("wifipass.txt");
  
  WiFi.mode(WIFI_AP);
  WiFi.begin(ssid, password);
  // Serial.print("Connecting");
  // while (WiFi.status() != WL_CONNECTED) {
  //   Serial.print(".");
  //   delay(400);
  //   trys++;
  //   if (trys == 10){
  //     break;
  //   }
  // }

  // Serial.println("\nConnected!");
  // Serial.print("My IP: ");
  // Serial.println(WiFi.localIP());

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


// 1. First start the wifi as Station, creds from LittleFS
// 2. If setuppage, then start Accesspoint, and have the webpage delivered
// 3. Webpage takes the credentials, and stores it in LittleFS

#include "wificonfig.h"

String wifissid = "";
String wifipassword = "";

const char* DEVICE_NAME = "ESP_DISPLAY";
const char* targetIP = "192.168.10.2"; 
const int udpPort = 5005;
WiFiUDP udp;
unsigned long lastSend = 0;
char wifiReceiveBuffer[128];

void handleRoot();
void handleSaveWifi();

static bool serverStarted = false;

bool nonblockingdelay(unsigned long time){
    static unsigned long start = 0;
    if (start == 0) {
        start = millis();
        return false;
    }
    
    unsigned long elapse = millis() - start;
    if (elapse >= time){
        start = 0;  
        return true;
    }
    return false;
}

void wifiInit(){
    wifissid = littlefsReadFile("/wifissid.txt");
    wifipassword = littlefsReadFile("/wifipass.txt");
    WiFi.mode(WIFI_AP_STA);
    wifissid.trim();
    wifipassword.trim();
    WiFi.begin(wifissid, wifipassword);

    IPAddress apIP(192,168,10,1);
    IPAddress gateway(192,168,10,1);
    IPAddress subnet(255,255,255,0);
    WiFi.softAPConfig(apIP, gateway, subnet);
    WiFi.softAP("ESP32_Master_Config", "12345678");
    
    udp.begin(udpPort);
}

void wifiupdate(){
    if (WiFi.status() == WL_DISCONNECTED || WiFi.status() == WL_CONNECTION_LOST){
      //Serial.printf("Disconnected\n");
        if (nonblockingdelay(2000)) {
            WiFi.begin(wifissid, wifipassword);
        }
    }
    else if (WiFi.status() == WL_CONNECTED){
      //Serial.printf("Connected to %s\n", WiFi.SSID().c_str());
    }
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

void wifi_receive(void) {
  static char buf[128];   // static avoids stack churn (nice on ESP32)

  int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;

  int len = udp.read(buf, sizeof(buf) - 1);
  if (len <= 0) return;

  buf[len] = '\0';

  Serial.print("Received: ");
  Serial.println(buf);

  // Robust command match (ignores trailing junk)
  if (strncmp(buf, "INTRUDER INTRUDER", 16) == 0) {

    udp.beginPacket("192.168.1.74", 5005);
    udp.print("INTRUDER INTRUDER\n");
    udp.endPacket();
  }
}

void setuppageweb(){
    if (!homepage && setuppage && !disarmauthpage){
        
        if (!serverStarted) {
            server.begin();
            serverStarted = true;
        }
        server.handleClient();
    }
    else{
        if (serverStarted) {
          server.stop();
          serverStarted = false;
        }
    }
}
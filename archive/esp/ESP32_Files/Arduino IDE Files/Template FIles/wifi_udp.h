#ifndef WIFI_UDP_H
#define WIFI_UDP_H

#include <WiFi.h>
#include <WiFiUdp.h>

extern const char* ssid;
extern const char* password;

extern const char* DEVICE_NAME;
extern const char* targetIP;
extern const int udpPort;

extern WiFiUDP udp;
extern unsigned long lastSend;
extern char wifiReceiveBuffer[128];

void wifi_init(void);
void wifi_send(const char* message);
int wifi_receive(void);

#endif // WIFI_UDP_H


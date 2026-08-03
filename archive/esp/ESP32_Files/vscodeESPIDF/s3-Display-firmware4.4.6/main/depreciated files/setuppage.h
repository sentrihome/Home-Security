#ifndef SETUPPAGE_H
#define SETUPPAGE_H

#include <WiFi.h>
#include <WebServer.h>
#include "ArduinoJson.h"
#include "filesys.h"

extern WebServer server;
extern int setupstate;
extern String wifiSSID;
extern String wifiPASS;

void handleRoot(void);
void setuppage_init(void);
void setuppage_func(void);
void handleSaveWifi(void);

#endif 


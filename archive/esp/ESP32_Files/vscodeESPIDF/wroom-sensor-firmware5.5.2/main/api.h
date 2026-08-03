#ifndef API_H
#define API_H

#include "WebServer.h"
#include "HTTPClient.h"
#include <WiFi.h>
#include <WiFiUdp.h>
#include "keypad.h"

extern WebServer server;
void sendalert(String message);
void apirouting(void);
void littlefsinit(void);
void littlefsWriteFile(String filename, String content);
String littlefsReadFile(String filename);

extern String onetimepass;
extern bool setupdone;


#endif
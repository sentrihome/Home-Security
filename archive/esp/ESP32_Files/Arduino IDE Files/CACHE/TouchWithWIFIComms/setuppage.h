#ifndef SETUPPAGE_H
#define SETUPPAGE_H

#include <WiFi.h>
#include <WebServer.h>

extern WebServer server;
extern int setupstate;

void handleRoot(void);
void setuppage_init(void);
void setuppage_func(void);

#endif 


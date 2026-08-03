#include "api.h"

WebServer server(80);

void sendalert(String message){
    HTTPClient http;
    http.begin("http://192.168.10.1/api/module");
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    http.POST(message);
    http.end();
}

void onetimepassset(){
    onetimepass = server.arg("otp");
    Serial.print("OTP Received");
}

String permanentpass;
void permanentpassset(){
    permanentpass = server.arg("pass");
    Serial.print(permanentpass);
}

void mainconnectionset(){
    String espmainpass = server.arg("pass");
    Serial.println(espmainpass);
    server.send(200, "text/plain", "OK");
    littlefsWriteFile("/wifissid.txt", espmainpass);
    WiFi.mode(WIFI_OFF);
    delay(500);
    WiFi.mode(WIFI_STA);
    WiFi.begin("ESP32_Master_Config", espmainpass);
    delay(2000);
    setupdone = true;
}


void apirouting(){
    server.on("/api/onetimepass", HTTP_POST, onetimepassset);
    server.on("/api/permanentpass", HTTP_POST, permanentpassset);
    server.on("/api/mainconnection", HTTP_POST, mainconnectionset);
}
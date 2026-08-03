#include "wificonfig.h"

WebServer server(80);

void apihealth(){
    server.send(200, "application/json", "{\"esp32\" : \"ok\"}");
}

void apicreds(){
    String json = "{\n  \"SSID\": \"" + wifissid + "\",\n  \"PASS\": \"" + wifipassword + "\"\n}";
    server.send(200, "application/json", json);
}

String newssid;
void apinewssid(){
    newssid = server.arg("SSID");
    Serial.println("SSID:" + newssid);
    server.send(200, "text/plain", "OK");
}
void apinewpass(){
    String newpass = server.arg("pass");
    Serial.println("Password:" + newpass);
    server.send(200, "text/plain", "OK");
    WiFi.begin(newssid, newpass);
}

void apisetmasterip(){
    String setmasterip = server.arg("setmasterip");
    Serial.println("Raspberry IP:" + setmasterip);
    server.send(200, "text/plain", "OK");
}

void apichangedpass(){
    String encryptedpass = server.arg("pass");
    Serial.println("Encrypted pass: " + encryptedpass);
    server.send(200, "text/plain", "OK");
    WiFi.softAP("ESP32_Master_Config", encryptedpass, 11);
    delay(500);

}

void apionetimepass(){
    String otprec = server.arg("otp");
    HTTPClient http;
    for (int i = 0; i < idscount; i++) {
        if (IDS[i].length() > 0) {
            String url = "http://" + IDS[i] + "/api/onetimepass";
            http.begin(url);
            http.addHeader("Content-Type", "application/x-www-form-urlencoded");
            http.POST("otp=" + otprec); 
            http.end();
        }
    }
    Serial.println("OTP Received: " + otprec);
    server.send(200, "text/plain", "OK");
}

void apiwifistatus(){
    bool connected = false;
    if (WiFi.status() == WL_CONNECTED){
        connected = true;
    }else{
        connected = false;
    }
    String json = "{\n"
                  "  \"connected\": " + String(connected ? "true" : "false") + "\n"
                  "}";             
    server.send(200, "application/json", json);
}

int idscount = 0;
String IDS[20];
void apimodule(){
    if (idscount < 20){
        IDS[idscount] = server.arg("alert");
        Serial.print(IDS[idscount]);
        idscount++;
    }
    server.send(200, "text/plain", "OK");
}

void apischedule(){
    String armstart = server.arg("start");
    String armstop = server.arg("stop");
    Serial.print("Scheduling time starts at " + armstart + " and stops at " + armstop);
    //times saved and actions taked elsewhere
    server.send(200, "text/plain", "OK");
}

String permanentpassrec;
void apipermanentpass(){
    permanentpassrec = server.arg("pass");
    Serial.println(permanentpassrec);
    HTTPClient http;
    for (int i = 0; i < idscount; i++){
        if (IDS[i].length() > 0) {
            String url = IDS[i];
            http.begin("http://" + url + "/api/permanentpass");
            http.addHeader("Content-Type", "application/x-www-form-urlencoded");
            http.POST("pass=" + permanentpassrec);
            http.end();
        }
    }
    server.send(200, "text/plain", "OK");
}

void apigetpermanentpass(){
    server.send(200, "text/plain", "pass=" + permanentpassrec);
}

void apihandle(){
    server.on("/api/health", HTTP_GET, apihealth);
    server.on("/api/creds", HTTP_GET, apicreds);
    server.on("/api/newpass", HTTP_POST, apinewpass);
    server.on("/api/encryptedpass", HTTP_POST, apichangedpass);
    server.on("/api/newssid", HTTP_POST, apinewssid);
    server.on("/api/wifistatus", HTTP_GET, apiwifistatus);
    server.on("/api/setmasterip", HTTP_POST, apisetmasterip);
    server.on("/api/onetimepass", HTTP_POST, apionetimepass);
    server.on("/api/module", HTTP_POST, apimodule);
    server.on("/api/schedule", HTTP_POST, apischedule);
    server.on("/api/permanentpass", HTTP_POST, apipermanentpass);
    server.on("/api/getpermanentpass", HTTP_GET, apigetpermanentpass);
    
}
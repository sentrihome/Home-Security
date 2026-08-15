#include "pair.h"

pair_s pair;

QueueHandle_t wait_for_wifi_to_connect;

void pair_s::process(std::string payload){

    if (display.state == Display::Page::SETUP_INSTRUCTIONS){
        // Parse JSON fields from validated payload
        std::string home_ssid = jsonparser(payload.c_str(), "homessid");
        storage.store("ssid", home_ssid.c_str());
        printf("Home SSID: %s\n", home_ssid.c_str());
    
        std::string home_pass = jsonparser(payload.c_str(), "homepass");
        storage.store("pass", home_pass.c_str());
        wifi_start(storage.read("ssid"), storage.read("pass"));
        printf("Home Pass: %s\n", home_pass.c_str());
    
        std::string permanent_pass = jsonparser(payload.c_str(), "permpass");
        printf("Permanent Pass: %s\n", permanent_pass.c_str());
    
        std::string encrypted_pass = jsonparser(payload.c_str(), "encryptedpass");
        printf("Encrypted Pass: %s\n", encrypted_pass.c_str());
    
        std::string schedule_start = jsonparser(payload.c_str(), "schedulestart");
        printf("Schedule Start: %s\n", schedule_start.c_str());
    
        std::string schedule_stop = jsonparser(payload.c_str(), "schedulestop");
        printf("Schedule Stop: %s\n", schedule_stop.c_str());
    
        std::string raspberrypi_ip = jsonparser(payload.c_str(), "raspberrypiip");
        printf("RaspberryPi IP: %s\n", raspberrypi_ip.c_str());
    
        bool received;
        if (xQueueReceive(wait_for_wifi_to_connect, &received, pdMS_TO_TICKS(5000))){
            uart.send("{\"pairing payload\" : \"received\", \"wifiConnection\" : \"true\"}", cmd_s::MOBILE_PAIRING);
        }
        else {
            uart.send("{\"pairing payload\" : \"received\", \"wifiConnection\" : \"false\"}", cmd_s::MOBILE_PAIRING);
        }
    }
    else {
        uart.send("{\"pairing payload\" : \"NO ACCESS\"}", cmd_s::MOBILE_PAIRING);
    }
}
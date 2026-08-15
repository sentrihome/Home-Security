#pragma once
#include "Arduino.h"
#include "core.h"

extern bool app_wifi_station_start;

class Display
{
public:
    void init();
    void process();

private:
    enum Page
    {
        UNARMED,
        ARMED,
        SETTINGS,
        SETUP_INSTRUCTIONS
    };
    Page state;
    void unarmed();
    void armed();
    void settings();
    void setupInstructions();
};

class Touch
{
public:
    void read();
    void debug();
    uint16_t x;
    uint16_t y;
};
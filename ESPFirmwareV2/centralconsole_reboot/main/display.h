#pragma once
#include "Arduino.h"
#include "core.h"

class Display {
public:
    void init();
    void process();

private:
    enum Page {
        UNARMED,
        ARMED,
        SETTINGS
    };
    Page state;
    void unarmed();
    void armed();
};

class Touch {
public:
    void read();
    void debug();
    uint16_t x;
    uint16_t y;
};
#pragma once
#include "Arduino.h"
#include "core.h"

class Display {
public:
    void init();
    void process();

private:
    String state;
    void idle();
    void armed();
};

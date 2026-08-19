#pragma once

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"


struct keypad_s
{
    public:
        void init();
        void process();
        void debounce();
};
enum class keystate_e : int {
    KEY_RELEASED,
    KEY_PRESSED,
};
    
void debounce_task(void *arg);
extern keypad_s keypad;
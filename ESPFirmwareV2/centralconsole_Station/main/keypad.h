#pragma once

struct keypad_s
{
    public:
        void init();
        void process();
};

extern keypad_s keypad;
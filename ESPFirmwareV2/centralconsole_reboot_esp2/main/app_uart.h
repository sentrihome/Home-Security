#pragma once
#ifndef APP_UART_H
#define APP_UART_H

#include "driver/uart.h"
#include "string.h"
#include <string>


struct uart_s
{
    public:
    void init();
};

struct pair_s
{
    public:
    std::string receive();
    void send(char* transmission);
};

extern pair_s pair;
extern uart_s uart;
#endif // APP_UART_H

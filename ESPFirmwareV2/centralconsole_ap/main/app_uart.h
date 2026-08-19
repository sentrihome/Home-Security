#pragma once
#ifndef APP_UART_H
#define APP_UART_H

#include "driver/uart.h"
#include "string.h"
#include <string>
#include "httpendpoints.h"

enum class cmd_s : int
{
    MOBILE_PAIRING,
    SENSOR
};

struct uart_s
{
public:
    void init();
    std::string receive();
    void send(std::string transmission, cmd_s cmd);

private:
    std::string sync0 = "\xAA";
    std::string sync1 = "\x55";
};

extern uart_s uart;
#endif // APP_UART_H

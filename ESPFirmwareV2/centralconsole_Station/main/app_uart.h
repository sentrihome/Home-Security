#pragma once
#ifndef APP_UART_H
#define APP_UART_H

#include "driver/uart.h"
#include "string.h"
#include <string>
#include "storage.h"
#include "connectivity.h"
#include "freertos/queue.h"
#include "pair.h"


enum class cmd_s : int
{
    MOBILE_PAIRING,
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

extern QueueHandle_t wait_for_wifi_to_connect;

#endif // APP_UART_H

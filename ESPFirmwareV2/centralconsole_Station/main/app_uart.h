#pragma once
#ifndef APP_UART_H
#define APP_UART_H

#include "driver/uart.h"
#include "string.h"
#include <string>
#include "storage.h"
#include "connectivity.h"
#include "freertos/queue.h"


enum class cmd_s : int
{
    MOBILE_PAIRING,
};

struct uart_s
{
public:
    void init();
};

struct pair_s
{
public:
    std::string receive();
    void send(std::string transmission, cmd_s cmd);

private:
    std::string sync0 = "c";
    std::string sync1 = "8";
};

extern pair_s pair;
extern uart_s uart;

extern QueueHandle_t wait_for_wifi_to_connect;

#endif // APP_UART_H

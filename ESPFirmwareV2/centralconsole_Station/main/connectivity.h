#pragma once
#include <string>
#include "storage.h"
#include "app_uart.h"

// #ifdef __cplusplus
// extern "C" {
// #endif

void wifi_init(void);
void wifi_start(std::string ssid, std::string password);

extern bool wifi_connected;

// #ifdef __cplusplus
// }
// #endif
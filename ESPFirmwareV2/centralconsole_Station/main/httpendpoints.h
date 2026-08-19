#pragma once

#include "esp_http_server.h"
#include "jsonhandler.h"
#include "app_uart.h"

extern void endpoint_init();
extern void trigger_motion_remote(const std::string &payload);

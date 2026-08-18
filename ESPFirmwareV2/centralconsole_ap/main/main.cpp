#include "Arduino.h"
#include "httpendpoints.h"
#include "connectivity.h"
#include "app_uart.h"
#include "jsonhandler.h"

extern "C" void app_main(void)
{
    initArduino();
    Serial.begin(115200);
    delay(10);
    wifi_init();
    endpoint_init();
    uart.init();
    ap_start("espwifi", "23012003");


    while (true)
    {
        delay(100);
        uart.receive();
    }
}

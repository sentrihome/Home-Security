#include "Arduino.h"
#include "httpendpoints.h"
#include "connectivity.h"

extern "C" void app_main(void)
{
    initArduino();
    Serial.begin(115200);
    delay(10);
    wifi_init();
    endpoint_init();
}

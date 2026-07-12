#include "Arduino.h"
#include "httpendpoints.h"
#include "connectivity.h"
#include "app_uart.h"

extern "C" void app_main(void)
{
    initArduino();
    Serial.begin(115200);
    delay(10);
    wifi_init();
    endpoint_init();
    uart_init();
    char* test_str = "This is a test string.\n";

    while (true){
        uart_write_bytes(UART_NUM_1, (const char*)test_str, strlen(test_str));
        printf("sending test message\n");
        delay(2000);
    }
}

#include "display.h"
#include "connectivity.h"
#include "httpendpoints.h"
#include "app_uart.h"

Display display;

// void setup(){
//   Serial.begin(115200);
//   display.init();
//   delay(10);
//   wifi_start();
// }

// void loop(){
//   display.process();
//   delay(200);
// }

extern "C" void app_main(void) {
  initArduino();
  Serial.begin(115200);
  delay(10);
  wifi_init();
  endpoint_init();
  uart_init();
  
  while(true){
    display.init();
    display.process();

    uint8_t data[128];
    size_t length = 0;

    ESP_ERROR_CHECK(uart_get_buffered_data_len(UART_NUM_1, &length));

    if (length > sizeof(data) - 1) {
        length = sizeof(data) - 1;   // prevent buffer overflow
    }

    int read = uart_read_bytes(UART_NUM_1, data, length, pdMS_TO_TICKS(100));
    if (read > 0) {
        data[read] = '\0';           // null-terminate before treating as string
        printf("%s", data);
    }

    delay(200);
  }
}
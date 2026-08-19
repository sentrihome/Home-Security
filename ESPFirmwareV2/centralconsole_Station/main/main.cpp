#include "display.h"
#include "connectivity.h"
#include "app_uart.h"
#include "storage.h"
#include "keypad.h"

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

void display_task(void *arg)
{
  for (;;)
  {
    display.init();
    display.process();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void uart_task(void *arg)
{
  for (;;)
  {
    uart.receive();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void keypad_task(void *arg)
{
  for (;;)
  {
    keypad.process();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void debounce_task(void *arg)
{
  for (;;)
  {
    keypad.debounce();
    vTaskDelay(pdMS_TO_TICKS(25));
  }
}

extern "C" void app_main(void)
{
  initArduino();
  Serial.begin(115200);
  delay(10);
  wait_for_wifi_to_connect = xQueueCreate(1, sizeof(bool));

  // nvs_flash_erase();

  storage.init();
  wifi_init();
  wifi_start(storage.read("ssid"), storage.read("pass"));
  uart.init();
  keypad.init();

  xTaskCreate(display_task, "display_task", 4096, NULL, 2, NULL);
  xTaskCreate(uart_task, "uart_task", 4096, NULL, 2, NULL);
  xTaskCreate(keypad_task, "keypad_task", 4096, NULL, 2, NULL);
  xTaskCreate(debounce_task, "debounce_task", 4096, NULL, 2, NULL);

}
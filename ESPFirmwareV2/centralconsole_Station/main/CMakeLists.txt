idf_component_register(SRCS "core.cpp" "jsonhandler.cpp" "app_uart.cpp" "connectivity_esp.cpp" "main.cpp"
                           
                            "display.cpp"
                            "uielements.c"
                       PRIV_REQUIRES spi_flash
                       INCLUDE_DIRS "."
                       REQUIRES espressif__arduino-esp32 TFT_eSPI esp_wifi nvs_flash esp_event esp_http_server esp_driver_uart)
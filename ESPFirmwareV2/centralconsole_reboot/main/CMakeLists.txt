idf_component_register(SRCS "connectivity_esp.c" "main.cpp"
                            "core.cpp"
                            "display.cpp"
                            "uielements.c"
                       PRIV_REQUIRES spi_flash
                       INCLUDE_DIRS "."
                       REQUIRES espressif__arduino-esp32 TFT_eSPI esp_wifi nvs_flash)
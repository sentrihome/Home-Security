idf_component_register(SRCS "main.cpp"
                            "display.cpp"
                            "ui_dashboard.c"
                            "ui_armed.c"
                       PRIV_REQUIRES spi_flash
                       INCLUDE_DIRS "."
                       REQUIRES espressif__arduino-esp32 TFT_eSPI)
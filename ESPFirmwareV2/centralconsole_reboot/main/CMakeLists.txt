idf_component_register(SRCS "main.cpp"
                            "core.cpp"
                            "display.cpp"
                            "uielements.c"
                       PRIV_REQUIRES spi_flash
                       INCLUDE_DIRS "."
                       REQUIRES espressif__arduino-esp32 TFT_eSPI)
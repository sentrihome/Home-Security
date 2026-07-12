idf_component_register(SRCS "app_uart.cpp" "httpendpoints.cpp" "main.cpp" "connectivity_esp.cpp"
                       REQUIRES spi_flash esp_http_server esp_wifi esp_driver_uart
                       INCLUDE_DIRS "")

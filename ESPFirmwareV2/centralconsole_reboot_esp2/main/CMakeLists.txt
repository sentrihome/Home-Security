idf_component_register(SRCS "httpendpoints.cpp" "main.cpp" "connectivity_esp.cpp"
                       REQUIRES spi_flash esp_http_server esp_wifi
                       INCLUDE_DIRS "")

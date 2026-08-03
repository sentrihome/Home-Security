idf_component_register(SRCS "TFT_eSPI.cpp"
                    INCLUDE_DIRS "."
                    PRIV_REQUIRES espressif__arduino-esp32)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-error=misleading-indentation)
idf_component_register(
    SRCS "src/ESP32Servo.cpp" "src/ESP32PWM.cpp"
    INCLUDE_DIRS "src"
    REQUIRES driver
    PRIV_REQUIRES arduino
)

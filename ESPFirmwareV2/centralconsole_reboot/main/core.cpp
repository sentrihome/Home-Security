#include "core.h"

void log(const char* message){
    Serial.printf("\n[%lu] %s", millis(), message);
}
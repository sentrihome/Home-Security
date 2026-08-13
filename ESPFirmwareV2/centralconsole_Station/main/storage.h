#pragma once
#include "nvs_flash.h"
#include <string.h>
#include <string>

class storage_s {
    public:
        void init();
        void store(const char* what_to_store, const char* info);
        std::string read(const char *what_to_find);
};

extern storage_s storage;
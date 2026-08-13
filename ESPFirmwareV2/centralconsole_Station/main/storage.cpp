#include "storage.h"

storage_s storage;
nvs_handle_t h;

void storage_s::init(){
    esp_err_t err = nvs_flash_init();
    if (err != ESP_OK) {
        printf("NVS init failed, trying erase\n");
        nvs_flash_erase();
        err = nvs_flash_init();
        if (err != ESP_OK) {
            printf("NVS init failed after erase\n");
            return;
        }
    }
    err = nvs_open("app", NVS_READWRITE, &h);
    if (err != ESP_OK) {
        printf("NVS open failed: %d\n", err);
        return;
    }
    printf("Storage Initialized\n");
}

void storage_s::store(const char* what_to_store, const char* info){
    esp_err_t err = nvs_set_str(h, what_to_store, info);
    if (err != ESP_OK) {
        printf("NVS set failed: %d\n", err);
        return;
    }
    err = nvs_commit(h);
    if (err != ESP_OK) {
        printf("NVS commit failed: %d\n", err);
    }
}

std::string storage_s::read(const char* what_to_find){
    char info_from_flash[64];
    memset(info_from_flash, 0, sizeof(info_from_flash));
    size_t len = sizeof(info_from_flash);
    esp_err_t err = nvs_get_str(h, what_to_find, info_from_flash, &len);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        printf("Key not found in NVS\n");
        return "";
    }
    if (err != ESP_OK) {
        printf("NVS get failed: %d\n", err);
        return "";
    }
    printf("%s\n", info_from_flash);
    return std::string(info_from_flash);
}

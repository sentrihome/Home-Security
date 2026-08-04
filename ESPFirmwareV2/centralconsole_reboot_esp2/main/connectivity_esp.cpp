#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_event_base.h"
#include "esp_log.h"

static const char *TAG = "Wifi";

static void wifi_event_handler(void *event_handler_arg,
                               esp_event_base_t event_base,
                               int32_t event_id,
                               void *event_data)
{
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_AP_START))
    {
        ESP_LOGI(TAG, "Accesspoint Started");
    }
}

void wifi_init()
{
    esp_netif_init();
    esp_event_loop_create_default();

    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL);

    esp_netif_create_default_wifi_ap();

    wifi_init_config_t wifi_driver_config = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&wifi_driver_config);

    wifi_config_t accesspoint_configuration = {};
    const char *ap_ssid = "espwifi";
    const char *ap_password = "23012003";
    memcpy(accesspoint_configuration.ap.ssid, ap_ssid, strlen(ap_ssid) + 1);
    memcpy(accesspoint_configuration.ap.password, ap_password, strlen(ap_password) + 1);
    accesspoint_configuration.ap.authmode = WIFI_AUTH_WPA2_PSK;
    accesspoint_configuration.ap.max_connection = 5;
    accesspoint_configuration.ap.channel = 11;

    esp_wifi_set_config(WIFI_IF_AP, &accesspoint_configuration);
    esp_wifi_set_mode(WIFI_MODE_AP);
    esp_wifi_start();
}
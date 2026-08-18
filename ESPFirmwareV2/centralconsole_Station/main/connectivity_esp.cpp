#include "connectivity.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_event_base.h"
#include "esp_log.h"
#include "display.h"

static const char *TAG = "Wifi";


static void wifi_event_handler(void *event_handler_arg,
                               esp_event_base_t event_base,
                               int32_t event_id,
                               void *event_data)
{
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_START))
    {
        ESP_LOGI(TAG, "Station Started");
        esp_wifi_connect();
        app_wifi_station_start = true;
    }
    // if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_AP_START)){
    //     ESP_LOGI(TAG, "Accesspoint Started");
    //     app_wifi_ap_start = true;
    // }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_STOP))
    {
        ESP_LOGI(TAG, "Station Stopped");
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_CONNECTED))
    {
        ESP_LOGI(TAG, "Connected");
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_DISCONNECTED))
    {
        ESP_LOGI(TAG, "Disconnected, Retrying");
        esp_wifi_connect();
    }
    if ((event_base == IP_EVENT) && (event_id == IP_EVENT_STA_GOT_IP))
    {
        bool queue_flag_for_wifi_connection = true;
        xQueueSend(wait_for_wifi_to_connect, &queue_flag_for_wifi_connection, pdMS_TO_TICKS(5000));
        ESP_LOGI(TAG, "Got IP ");
    }
}

void wifi_init()
{
    esp_netif_init();
    esp_event_loop_create_default();

    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL);

    esp_netif_create_default_wifi_sta();
    // esp_netif_create_default_wifi_ap();

    wifi_init_config_t wifi_driver_config = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&wifi_driver_config);

    // wifi_config_t station_configuration = {};
    // memcpy(station_configuration.sta.ssid, ssid.c_str(), ssid.size() + 1);
    // memcpy(station_configuration.sta.password, password.c_str(), password.size() + 1);

    // esp_wifi_set_config(WIFI_IF_STA, &station_configuration);
    // esp_wifi_set_mode(WIFI_MODE_STA);
    // esp_wifi_start();
}

void wifi_start(std::string ssid, std::string password){
    esp_wifi_stop();
    wifi_config_t station_configuration = {};
    memcpy(station_configuration.sta.ssid, ssid.c_str(), ssid.size() + 1);
    memcpy(station_configuration.sta.password, password.c_str(), password.size() + 1);
    
    esp_wifi_set_config(WIFI_IF_STA, &station_configuration);
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_start();
    xQueueReset(wait_for_wifi_to_connect);
}
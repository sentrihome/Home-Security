#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_event_base.h"
#include "esp_log.h"



static const char* TAG = "Wifi";

static void wifi_event_handler(void *event_handler_arg, 
                               esp_event_base_t event_base, 
                               int32_t event_id, 
                               void *event_data)
{
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_START)){
        ESP_LOGI(TAG, "Station Started");
        esp_wifi_connect();
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_AP_START)){
        ESP_LOGI(TAG, "Accesspoint Started");
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_STOP)){
        ESP_LOGI(TAG, "Station Stopped");
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_CONNECTED)){
        ESP_LOGI(TAG, "Connected");
    }
    if ((event_base == WIFI_EVENT) && (event_id == WIFI_EVENT_STA_DISCONNECTED)){
        ESP_LOGI(TAG, "Disconnected, Retrying");
        esp_wifi_connect();
    }
    if ((event_base == IP_EVENT) && (event_id == IP_EVENT_STA_GOT_IP)){
        ESP_LOGI(TAG, "Got IP ");
    }
}



void wifi_init(){
    esp_netif_init();
    esp_event_loop_create_default();
    
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL);

    esp_netif_create_default_wifi_sta();

    wifi_init_config_t wifi_driver_config = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&wifi_driver_config);

    wifi_config_t station_configuration = {
        .sta = {
            .ssid = "test",
            .password = "55555555",
        },
    };

    wifi_config_t accesspoint_configuration = {
        .ap = {
            .ssid = "espwifitest",
            .password = "23012003",
            .max_connection = 5,
            .authmode = WIFI_AUTH_WPA2_PSK,
        }
    };

    esp_wifi_set_config(WIFI_IF_STA, &station_configuration);
    esp_wifi_set_config(WIFI_IF_AP, &accesspoint_configuration);
    esp_wifi_set_mode(WIFI_MODE_APSTA);
    esp_wifi_start();
}
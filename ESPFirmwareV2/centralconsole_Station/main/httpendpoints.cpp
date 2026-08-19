#include "httpendpoints.h"
#include "connectivity.h"
#include <cstring>
#include <esp_wifi.h>
#include <esp_random.h>
#include <esp_http_client.h>
#include <esp_log.h>

static const char *TAG = "http_client";

esp_err_t api_health_resp(httpd_req_t *r)
{
    return httpd_resp_sendstr(r, "{ \"health\": \"ok\" }");
}

// --- POST to 192.168.0.236:4000/motion ---
// Standalone function: fires POST to the Pi with the given payload,
// callable from anywhere (HTTP handler, UART task, etc.)
void trigger_motion_remote(const std::string &payload)
{
    esp_http_client_config_t config = {
        .url = "http://192.168.0.236:4000/motion",
        .method = HTTP_METHOD_POST,
        .timeout_ms = 5000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to initialize HTTP client");
        return;
    }

    if (!payload.empty()) {
        esp_http_client_set_header(client, "Content-Type", "text/plain");
        esp_http_client_set_post_field(client, payload.data(), payload.size());
    }

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "POST /motion failed: %s", esp_err_to_name(err));
    } else {
        int status = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "POST /motion response: %d", status);
    }

    esp_http_client_cleanup(client);
}

// HTTP request handler: receives POST /motion from a web client, proxies to the Pi
esp_err_t trigger_motion(httpd_req_t *r)
{
    trigger_motion_remote("");
    return httpd_resp_sendstr(r, "{ \"proxied\": true }");
}

void endpoint_init()
{
    // httpd_start(httpd_handle_t *handle, const httpd_config_t *config);
    httpd_handle_t api;
    httpd_config_t api_config = HTTPD_DEFAULT_CONFIG();
    api_config.stack_size = 8192;
    httpd_start(&api, &api_config);

    // httpd_register_uri_handler(httpd_handle_t handle, const httpd_uri_t *uri_handler);
    httpd_uri_t api_health_addr = {};
    api_health_addr.uri = "/health";
    api_health_addr.method = HTTP_GET;
    api_health_addr.handler = api_health_resp;
    httpd_register_uri_handler(api, &api_health_addr);

    // --- NEW: register POST /motion trigger ---
    httpd_uri_t motion_trigger = {};
    motion_trigger.uri = "/motion";
    motion_trigger.method = HTTP_POST;
    motion_trigger.handler = trigger_motion;
    httpd_register_uri_handler(api, &motion_trigger);
    // ------------------------------------------

}

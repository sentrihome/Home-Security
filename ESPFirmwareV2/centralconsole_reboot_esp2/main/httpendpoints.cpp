#include "httpendpoints.h"

esp_err_t api_health_resp(httpd_req_t *r) {
    return httpd_resp_sendstr(r, "{ \"health\": \"ok\" }");
}

esp_err_t api_pair_resp(httpd_req_t *r) {
    char buf[1000];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    
    std::string home_ssid = jsonparser(buf, "homessid");
    printf("Home SSID: %s\n", home_ssid.c_str());
    
    std::string home_pass = jsonparser(buf, "homepass");
    printf("Home Pass: %s\n", home_pass.c_str());
    
    std::string permanent_pass = jsonparser(buf, "permpass");
    printf("Permanent Pass: %s\n", permanent_pass.c_str());
    
    std::string encrypted_pass = jsonparser(buf, "encryptedpass");
    printf("Encrypted Pass: %s\n", encrypted_pass.c_str());

    std::string schedule_start = jsonparser(buf, "schedulestart");
    printf("Schedule Start: %s\n", schedule_start.c_str());

    std::string schedule_stop = jsonparser(buf, "schedulestop");
    printf("Schedule Stop: %s\n", schedule_stop.c_str());

    std::string raspberrypi_ip = jsonparser(buf, "raspberrypiip");
    printf("RaspberryPi IP: %s\n", raspberrypi_ip.c_str());

    pair.send(buf);
    printf("Relayed the data through UART");

    int timeout = 0;
    while (timeout <= 30)
    {
        printf("Awaiting S3 Confirmation\n");
        std::string response_full = pair.receive();
        std::string response_partsed = jsonparser(response_full.c_str(), "pairing payload");
        if (response_partsed == "received")
        {
            printf("Received Confirmation from S3\n");
            return httpd_resp_sendstr(r, "{ \"pairing payload received\": \"ok\" }");
        }
        timeout++;
        if (timeout == 30)
            return httpd_resp_send_408(r);
    }

    return httpd_resp_sendstr(r, "{ \"pairing payload received\": \"ok\" }");
}

void endpoint_init() {
    //httpd_start(httpd_handle_t *handle, const httpd_config_t *config);
    httpd_handle_t api;
    httpd_config_t api_config = HTTPD_DEFAULT_CONFIG();
    api_config.stack_size = 8192; 
    httpd_start(&api, &api_config);

    //httpd_register_uri_handler(httpd_handle_t handle, const httpd_uri_t *uri_handler);
    httpd_uri_t api_health_addr = {};
    api_health_addr.uri = "/health";
    api_health_addr.method = HTTP_GET;
    api_health_addr.handler = api_health_resp;
    httpd_register_uri_handler(api, &api_health_addr);

    httpd_uri_t api_pair_addr = {};
    api_pair_addr.uri = "/pair";
    api_pair_addr.method = HTTP_POST;
    api_pair_addr.handler = api_pair_resp;
    httpd_register_uri_handler(api, &api_pair_addr);
}
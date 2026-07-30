#include "httpendpoints.h"
#include "app_uart.h"

esp_err_t api_health_resp(httpd_req_t *r) {
    return httpd_resp_sendstr(r, "{ \"health\": \"ok\" }");
}

esp_err_t api_pass_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "password", extract, sizeof(extract));
    printf("permanent pass extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"permanent pass received\": \"ok\" }");
}

esp_err_t api_ssid_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "ssid", extract, sizeof(extract));
    printf("ssid extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"ssid received\": \"ok\" }");
}

esp_err_t api_permanent_pass_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "permanentpass", extract, sizeof(extract));
    printf("permanent pass extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"permanent pass received\": \"ok\" }");
}

esp_err_t api_encrypted_pass_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "encryptedpass", extract, sizeof(extract));
    printf("encrypted pass extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"encrypted pass received\": \"ok\" }");
}

esp_err_t api_otp_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "otp", extract, sizeof(extract));
    printf("otp extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"otp received\": \"ok\" }");
}

esp_err_t api_schedule_start_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "schedulestart", extract, sizeof(extract));
    printf("schedule start extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"schedule start received\": \"ok\" }");
}

esp_err_t api_schedule_stop_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf) - 1);
    if (length <= 0) {
        if (length == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(r);
        }
        return ESP_FAIL;
    }
    buf[length] = '\0';
    printf("buff %s\n", buf);
    char extract[50];
    httpd_query_key_value(buf, "schedulestop", extract, sizeof(extract));
    printf("schedule stop extracted part %s\n", extract);
    uart_send(extract);
    return httpd_resp_sendstr(r, "{ \"schedule stop received\": \"ok\" }");
}

void endpoint_init() {
    //httpd_start(httpd_handle_t *handle, const httpd_config_t *config);
    httpd_handle_t api;
    httpd_config_t api_config = HTTPD_DEFAULT_CONFIG();
    httpd_start(&api, &api_config);

    //httpd_register_uri_handler(httpd_handle_t handle, const httpd_uri_t *uri_handler);
    httpd_uri_t api_health_addr = {};
    api_health_addr.uri = "/health";
    api_health_addr.method = HTTP_GET;
    api_health_addr.handler = api_health_resp;
    httpd_register_uri_handler(api, &api_health_addr);
    
    httpd_uri_t api_pass_addr = {};
    api_pass_addr.uri = "/pass";
    api_pass_addr.method = HTTP_POST;
    api_pass_addr.handler = api_pass_resp;
    httpd_register_uri_handler(api, &api_pass_addr);
    
    httpd_uri_t api_ssid_addr = {};
    api_ssid_addr.uri = "/ssid";
    api_ssid_addr.method = HTTP_POST;
    api_ssid_addr.handler = api_ssid_resp;
    httpd_register_uri_handler(api, &api_ssid_addr);
    
    httpd_uri_t api_permanent_pass_addr = {};
    api_permanent_pass_addr.uri = "/permanentpass";
    api_permanent_pass_addr.method = HTTP_POST;
    api_permanent_pass_addr.handler = api_permanent_pass_resp;
    httpd_register_uri_handler(api, &api_permanent_pass_addr);
    
    httpd_uri_t api_encrypted_pass_addr = {};
    api_encrypted_pass_addr.uri = "/encryptedpass";
    api_encrypted_pass_addr.method = HTTP_POST;
    api_encrypted_pass_addr.handler = api_encrypted_pass_resp;
    httpd_register_uri_handler(api, &api_encrypted_pass_addr);
    
    httpd_uri_t api_otp_addr = {};
    api_otp_addr.uri = "/otp";
    api_otp_addr.method = HTTP_POST;
    api_otp_addr.handler = api_otp_resp;
    httpd_register_uri_handler(api, &api_otp_addr);
    
    httpd_uri_t api_schedule_start_addr = {};
    api_schedule_start_addr.uri = "/schedule";
    api_schedule_start_addr.method = HTTP_POST;
    api_schedule_start_addr.handler = api_schedule_start_resp;
    httpd_register_uri_handler(api, &api_schedule_start_addr);
    
    httpd_uri_t api_schedule_stop_addr = {};
    api_schedule_stop_addr.uri = "/schedule";
    api_schedule_stop_addr.method = HTTP_POST;
    api_schedule_stop_addr.handler = api_schedule_stop_resp;
    httpd_register_uri_handler(api, &api_schedule_stop_addr);
}
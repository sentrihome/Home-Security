#include "httpendpoints.h"

esp_err_t api_health_resp(httpd_req_t *r) {
    return httpd_resp_sendstr(r, "{ \"health\": \"ok\" }");
}

esp_err_t api_pass_resp(httpd_req_t *r) {
    char buf[50];
    int length = httpd_req_recv(r, buf, sizeof(buf));
    buf[length] = '\0';
    printf("buff %s", buf);
    char extract[50];
    httpd_query_key_value(buf, "password", extract, sizeof(extract));
    printf("extracted part %s", extract);
    return httpd_resp_sendstr(r, "{ \"received\": \"ok\" }");
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
}
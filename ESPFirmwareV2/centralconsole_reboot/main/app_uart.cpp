#include "app_uart.h"

// Install Drivers
// First of all, install the driver by calling uart_driver_install() and specify the following parameters:
// UART port number
// Size of RX ring buffer
// Size of TX ring buffer
// Event queue size
// Pointer to store the event queue handle
// Flags to allocate an interrupt
// The function allocates the required internal resources for the UART driver.

pair_s pair;
uart_s uart;

void uart_s::init() {
    //uart_driver_install(uart_port_t uart_num, int rx_buffer_size, int tx_buffer_size, int queue_size, QueueHandle_t *uart_queue, int intr_alloc_flags);
    uart_driver_install(UART_NUM_1, 1024, 1024, 0, NULL, ESP_INTR_FLAG_LEVEL1);

    //uart_param_config(uart_port_t uart_num, const uart_config_t *uart_config);
    uart_config_t uartconf = {};
    uartconf.baud_rate = 230120;
    uartconf.data_bits = UART_DATA_8_BITS;
    uartconf.parity = UART_PARITY_ODD;
    uartconf.stop_bits = UART_STOP_BITS_1;
    uartconf.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
    uart_param_config(UART_NUM_1, &uartconf);

    //uart_set_pin(uart_port_t uart_num, int tx_io_num, int rx_io_num, int rts_io_num, int cts_io_num);
    uart_set_pin(UART_NUM_1, 18, 17, 4, 5);
    printf("Uart initialized, UART baud rate: ");
    uint32_t baudrate_print = 0;
    uart_get_baudrate(UART_NUM_1, &baudrate_print);
    printf("%lu\n", baudrate_print);
}

void pair_s::send(char* transmission){
    uart_write_bytes(UART_NUM_1, transmission, strlen(transmission));
    printf("Transmitted: %s\n", transmission);
    vTaskDelay(1000);
}

std::string pair_s::receive(){
    char pair_receive[1000];
    int length = uart_read_bytes(UART_NUM_1, pair_receive, sizeof(pair_receive) - 1, 100);
    pair_receive[sizeof(pair_receive) - 1] = '\0';
    if (length <= 0 ){
        return "";
    }

    std::string home_ssid = jsonparser(pair_receive, "homessid");
    printf("Home SSID: %s\n", home_ssid.c_str());
    
    std::string home_pass = jsonparser(pair_receive, "homepass");
    printf("Home Pass: %s\n", home_pass.c_str());
    
    std::string permanent_pass = jsonparser(pair_receive, "permpass");
    printf("Permanent Pass: %s\n", permanent_pass.c_str());
    
    std::string encrypted_pass = jsonparser(pair_receive, "encryptedpass");
    printf("Encrypted Pass: %s\n", encrypted_pass.c_str());

    std::string schedule_start = jsonparser(pair_receive, "schedulestart");
    printf("Schedule Start: %s\n", schedule_start.c_str());

    std::string schedule_stop = jsonparser(pair_receive, "schedulestop");
    printf("Schedule Stop: %s\n", schedule_stop.c_str());

    std::string raspberrypi_ip = jsonparser(pair_receive, "raspberrypiip");
    printf("RaspberryPi IP: %s\n", raspberrypi_ip.c_str());

    pair.send("{\"pairing payload\" : \"received\"}");

    printf("Received_UART: %s\n", pair_receive);
    return pair_receive;
    
}
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

uart_s uart;
pair_s pair;

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
    uart_set_pin(UART_NUM_1, 17, 18, 4, 5);
    printf("Uart initialized, UART baud rate: ");
    uint32_t baudrate_print = 0;
    uart_get_baudrate(UART_NUM_1, &baudrate_print);
    printf("%lu\n", baudrate_print);
}


std::string pair_s::receive(){
    char pair_receive[200];
    int length = uart_read_bytes(UART_NUM_1, pair_receive, sizeof(pair_receive) - 1, 100);
    pair_receive[sizeof(pair_receive) - 1] = '\0';
    if (length <= 0 ){
        return "";
    }
    printf("Received_UART: %s\n", pair_receive);
    return pair_receive;
}

void pair_s::send(char* transmission){
    uart_write_bytes(UART_NUM_1, transmission, strlen(transmission));
    printf("Transmitted: %s\n", transmission);
    vTaskDelay(1000);
}
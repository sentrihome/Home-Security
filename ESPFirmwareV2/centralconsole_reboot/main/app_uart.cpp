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

void uart_init() {
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

const char* stop = "END_OF_MESSAGE";
unsigned char uart_message[200] = "END_OF_MESSAGE";


void uart_receive(){
    int length = uart_read_bytes(UART_NUM_1, uart_message, sizeof(uart_message), 100);
    uart_message[length] = '\0';
    if (length <= 0 ){
        return;
    }
    if (memcmp(uart_message, stop, strlen(stop)) != 0){
        printf("Received: %s\n", uart_message);
    }
}
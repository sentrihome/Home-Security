#include "driver/uart.h"
#include "string.h"

extern void uart_init();
extern void uart_receive();
extern void uart_send(char transmission[200]);
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

void uart_s::init()
{
    // uart_driver_install(uart_port_t uart_num, int rx_buffer_size, int tx_buffer_size, int queue_size, QueueHandle_t *uart_queue, int intr_alloc_flags);
    uart_driver_install(UART_NUM_1, 1024, 1024, 0, NULL, ESP_INTR_FLAG_LEVEL1);

    // uart_param_config(uart_port_t uart_num, const uart_config_t *uart_config);
    uart_config_t uartconf = {};
    uartconf.baud_rate = 230120;
    uartconf.data_bits = UART_DATA_8_BITS;
    uartconf.parity = UART_PARITY_ODD;
    uartconf.stop_bits = UART_STOP_BITS_1;
    uartconf.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
    uart_param_config(UART_NUM_1, &uartconf);

    // uart_set_pin(uart_port_t uart_num, int tx_io_num, int rx_io_num, int rts_io_num, int cts_io_num);
    uart_set_pin(UART_NUM_1, 17, 18, 4, 5);
    printf("Uart initialized, UART baud rate: ");
    uint32_t baudrate_print = 0;
    uart_get_baudrate(UART_NUM_1, &baudrate_print);
    printf("%lu\n", baudrate_print);
}

/*
The locked frame format is
SYNC(2B) | CMD(1B) | LEN(2B) | PAYLOAD | CRC(1-2B), bidirectional, plaintext
*/

std::string uart_s::receive()
{
    char pair_receive[200];
    int length = uart_read_bytes(UART_NUM_1, pair_receive, sizeof(pair_receive) - 1, 100);
    if (length <= 0)
    {
        return "";
    }
    pair_receive[length] = '\0';

    printf("Received_UART: %d bytes raw: ", length);
    for (int i = 0; i < length; i++)
    {
        printf("%02x ", (uint8_t)pair_receive[i]);
    }
    printf("\n");

    // parse sync and note position
    bool sync_rec = false;
    int message_pos = 0;
    for (int i = 0; i < length - 1; i++)
    {
        if ((pair_receive[i] == 0xAA) && !sync_rec)
        {
            if (pair_receive[i + 1] == 0x55)
            {
                printf("  Sync found at index %d (0x%02x 0x%02x)\n", i, (uint8_t)pair_receive[i], (uint8_t)pair_receive[i + 1]);
                message_pos = i + 1;
                sync_rec = true;
            }
        }
    }
    if (!sync_rec)
    {
        printf("  No sync received\n");
        return "";
    }
    printf("  Sync verified, message_pos=%d\n", message_pos);

    // find the command and update the position
    int cmd_byte = (uint8_t)pair_receive[message_pos + 1];
    uint8_t cmd_rec = (uint8_t)pair_receive[message_pos + 1];
    message_pos += 1;
    printf("  CMD: 0x%02x ('%c'), message_pos=%d\n", cmd_byte, cmd_rec, message_pos);

    // find the length and update the position
    char length_rec[2];
    length_rec[0] = pair_receive[message_pos + 1];
    message_pos += 1;
    length_rec[1] = pair_receive[message_pos + 1];
    message_pos += 1;
    printf("  LEN bytes: 0x%02x 0x%02x\n", (uint8_t)length_rec[0], (uint8_t)length_rec[1]);
    uint16_t payload_len = ((uint8_t)length_rec[0] << 8) | (uint8_t)length_rec[1];
    printf("  Payload length: %u, message_pos=%d\n", payload_len, message_pos);

    // bounds check: ensure there are enough bytes for payload + 2 CRC bytes
    if (message_pos + payload_len + 2 > length)
    {
        printf("  Frame too small for declared payload: need %d, have %d\n",
               message_pos + payload_len + 2, length);
        return "";
    }

    // extract the payload and update the position
    if (payload_len == 0)
    {
        printf("  Empty payload\n");
    }
    message_pos += 1;
    char payload_rec[200];
    for (int i = 0; i < payload_len; i++)
    {
        payload_rec[i] = pair_receive[message_pos];
        printf("  payload[%d] = 0x%02x\n", i, (uint8_t)payload_rec[i]);
        message_pos += 1;
    }
    printf("  message_pos after payload: %d\n", message_pos);

    // parse crc and update the position
    char crc_rec[2];
    crc_rec[0] = pair_receive[message_pos];
    printf("  CRC byte 0: 0x%02x\n", (uint8_t)crc_rec[0]);
    message_pos += 1;
    crc_rec[1] = pair_receive[message_pos];
    printf("  CRC byte 1: 0x%02x\n", (uint8_t)crc_rec[1]);
    message_pos += 1;
    uint16_t crc_received = ((uint8_t)crc_rec[0] << 8) | (uint8_t)crc_rec[1];
    printf("  CRC received: 0x%04x\n", crc_received);

    // validate
    int cmd_rec_int = cmd_rec;
    int validation_score = cmd_rec_int + 2 * payload_len;

    printf("  Validation: cmd(0x%02x) + 2*len(%u) = %d, CRC=0x%04x\n", (uint8_t)cmd_rec, payload_len, validation_score, crc_received);

    if (validation_score != crc_received)
    {
        printf("  CRC mismatch: got 0x%04x, expected 0x%04x\n", crc_received, validation_score);
        return "";
    }
    printf("  CRC OK\n");

    std::string payload(payload_rec, payload_len);
    printf("Payload: %s\n", payload.c_str());
    switch (static_cast<cmd_s>(cmd_byte))
    {
    case cmd_s::MOBILE_PAIRING:
    {
        std::string *p = new std::string(payload);
        if (xQueueSend(waitfors3, &p, 0) != pdPASS)
        {
            delete p;
        }
        break;
    }
    default:
        break;
    }
    return payload;
}

void uart_s::send(std::string transmission, cmd_s cmd)
{

    int length_val = transmission.length();
    // extract first and last byte
    int length_firstbyte = (length_val >> 8) & 0xFF;
    int length_lastbyte = length_val & 0xFF;

    int crc_calc = static_cast<int>(cmd) + 2 * length_val;
    int crc_firstbyte = (crc_calc >> 8) & 0xFF;
    int crc_lastbyte = crc_calc & 0xFF;

    std::string length;
    length.push_back(static_cast<char>(length_firstbyte));
    length.push_back(static_cast<char>(length_lastbyte));
    std::string crc;
    crc.push_back(static_cast<char>(crc_firstbyte));
    crc.push_back(static_cast<char>(crc_lastbyte));
    std::string cmd_str;
    cmd_str.push_back(static_cast<char>(cmd));
    std::string full_frame = sync0 + sync1 + cmd_str + length + transmission + crc;
    printf("Full Frame (%zu bytes): ", full_frame.length());
    for (size_t i = 0; i < full_frame.length(); i++)
    {
        printf("%02x ", (uint8_t)full_frame[i]);
    }
    printf("\n");
    uart_write_bytes(UART_NUM_1, full_frame.c_str(), full_frame.length());
    printf("Transmitted: %s\n", transmission.c_str());
}
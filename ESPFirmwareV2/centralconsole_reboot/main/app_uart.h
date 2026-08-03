#include "driver/uart.h"
#include "string.h"
#include "jsonhandler.h"


struct uart_s
{
    public:
    void init();
};

struct pair_s
{
    public:
        void send(char* transmission);
        std::string receive();
};

extern pair_s pair;
extern uart_s uart;
#pragma once
#include <string>
#include "storage.h"
#include "connectivity.h"
#include "freertos/queue.h"
#include "jsonhandler.h"
#include "display.h"

struct pair_s
{
    public:
        void process(std::string payload);
};

extern pair_s pair;

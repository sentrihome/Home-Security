#include "keypad.h"

keypad_s keypad;
QueueHandle_t what_gpio_to_debounce;
QueueHandle_t keydebounce;

void debounce_task(void *arg) {
    for (;;) {
        keypad.debounce();   
    }
}

void keypad_s::init(){
    //GPIO ROW Config
    gpio_config_t row1;
    row1.pin_bit_mask = (1ULL << 42);
    row1.mode = GPIO_MODE_OUTPUT;
    row1.pull_up_en = GPIO_PULLUP_DISABLE;
    row1.pull_down_en = GPIO_PULLDOWN_DISABLE;
    row1.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&row1);

    //GPIO ROW Config
    gpio_config_t row2;
    row2.pin_bit_mask = (1ULL << 41);
    row2.mode = GPIO_MODE_OUTPUT;
    row2.pull_up_en = GPIO_PULLUP_DISABLE;
    row2.pull_down_en = GPIO_PULLDOWN_DISABLE;
    row2.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&row2);

    //GPIO ROW Config
    gpio_config_t row3;
    row3.pin_bit_mask = (1ULL << 40);
    row3.mode = GPIO_MODE_OUTPUT;
    row3.pull_up_en = GPIO_PULLUP_DISABLE;
    row3.pull_down_en = GPIO_PULLDOWN_DISABLE;
    row3.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&row3);

    //GPIO ROW Config
    gpio_config_t row4;
    row4.pin_bit_mask = (1ULL << 39);
    row4.mode = GPIO_MODE_OUTPUT;
    row4.pull_up_en = GPIO_PULLUP_DISABLE;
    row4.pull_down_en = GPIO_PULLDOWN_DISABLE;
    row4.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&row4);

    //GPIO Column Config
    gpio_config_t col1;
    col1.pin_bit_mask = (1ULL << 38);
    col1.mode = GPIO_MODE_INPUT;
    col1.pull_up_en = GPIO_PULLUP_ENABLE;
    col1.pull_down_en = GPIO_PULLDOWN_DISABLE;
    col1.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&col1);

    //GPIO Column Config
    gpio_config_t col2;
    col2.pin_bit_mask = (1ULL << 37);
    col2.mode = GPIO_MODE_INPUT;
    col2.pull_up_en = GPIO_PULLUP_ENABLE;
    col2.pull_down_en = GPIO_PULLDOWN_DISABLE;
    col2.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&col2);

    //GPIO Column Config
    gpio_config_t col3;
    col3.pin_bit_mask = (1ULL << 36);
    col3.mode = GPIO_MODE_INPUT;
    col3.pull_up_en = GPIO_PULLUP_ENABLE;
    col3.pull_down_en = GPIO_PULLDOWN_DISABLE;
    col3.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&col3);

    //GPIO Column Config
    gpio_config_t col4;
    col4.pin_bit_mask = (1ULL << 35);
    col4.mode = GPIO_MODE_INPUT;
    col4.pull_up_en = GPIO_PULLUP_ENABLE;
    col4.pull_down_en = GPIO_PULLDOWN_DISABLE;
    col4.intr_type = GPIO_INTR_DISABLE;
    gpio_config(&col4);

    // Initialise all rows HIGH (inactive)
    gpio_set_level(GPIO_NUM_42, 1);
    gpio_set_level(GPIO_NUM_41, 1);
    gpio_set_level(GPIO_NUM_40, 1);
    gpio_set_level(GPIO_NUM_39, 1);

    // Create debounce queue (max 16 pending key events)
    what_gpio_to_debounce = xQueueCreate(1, sizeof(char));
    keydebounce = xQueueCreate(1, sizeof(bool));

    xTaskCreate(debounce_task, "debounce_task", 4096, NULL, 2, NULL);
}


void keypad_s::debounce(){
    char col;
    xQueueReceive(what_gpio_to_debounce, &col, pdMS_TO_TICKS(25));
    switch (col){
        case ('1'):
            vTaskDelay(pdMS_TO_TICKS(20)); 
            if (gpio_get_level(GPIO_NUM_38) == 0){
                bool debounced = true;
                xQueueSend(keydebounce, &debounced, pdMS_TO_TICKS(190));
            }
            break;
        case ('2'):
            vTaskDelay(pdMS_TO_TICKS(20));  
            if (gpio_get_level(GPIO_NUM_37) == 0){
                    bool debounced = true;
                    xQueueSend(keydebounce, &debounced, pdMS_TO_TICKS(190));
                }
            break;
        case ('3'):
            vTaskDelay(pdMS_TO_TICKS(20)); 
            if (gpio_get_level(GPIO_NUM_36) == 0){
                    bool debounced = true;
                    xQueueSend(keydebounce, &debounced, pdMS_TO_TICKS(190));
                }
            break;
        case ('4'):
            vTaskDelay(pdMS_TO_TICKS(20)); 
            if (gpio_get_level(GPIO_NUM_35) == 0){
                    bool debounced = true;
                    xQueueSend(keydebounce, &debounced, pdMS_TO_TICKS(190));
                }
            break;
    }
}

void keypad_s::process(){
    static bool key1_pressed = false, key2_pressed = false, key3_pressed = false, key4_pressed = false;
    static bool key5_pressed = false, key6_pressed = false, key7_pressed = false, key8_pressed = false;
    static bool key9_pressed = false, key10_pressed = false, key11_pressed = false, key12_pressed = false;
    static bool key13_pressed = false, key14_pressed = false, key15_pressed = false, key16_pressed = false;

    bool row1pulled;
    gpio_set_level(GPIO_NUM_42, 0);
    row1pulled = true;

    if (gpio_get_level(GPIO_NUM_38) == 0 && !key1_pressed){
        key1_pressed = true;
        char gpio_to_debounce = '1';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("1\n");
    }
    else if (gpio_get_level(GPIO_NUM_37) == 0 && !key2_pressed){
        key2_pressed = true;
        char gpio_to_debounce = '2';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("2\n");
    }
    else if (gpio_get_level(GPIO_NUM_36) == 0 && !key3_pressed){
        key3_pressed = true;
        char gpio_to_debounce = '3';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("3\n");
    }
    else if (gpio_get_level(GPIO_NUM_35) == 0 && !key4_pressed){
        key4_pressed = true;
        char gpio_to_debounce = '4';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("A\n");
    }
    while ((row1pulled) && (key1_pressed || key2_pressed || key3_pressed || key4_pressed))
    {
        vTaskDelay(10);
        if (row1pulled && key1_pressed && gpio_get_level(GPIO_NUM_38) != 0) key1_pressed = false;
        if (row1pulled && key2_pressed && gpio_get_level(GPIO_NUM_37) != 0) key2_pressed = false;
        if (row1pulled && key3_pressed && gpio_get_level(GPIO_NUM_36) != 0) key3_pressed = false;
        if (row1pulled && key4_pressed && gpio_get_level(GPIO_NUM_35) != 0) key4_pressed = false;
    }
    
    gpio_set_level(GPIO_NUM_42, 1);

    bool row2pulled;
    gpio_set_level(GPIO_NUM_41, 0);
    row2pulled = true;

    if (gpio_get_level(GPIO_NUM_38) == 0 && !key5_pressed){
        key5_pressed = true;
        char gpio_to_debounce = '1';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("4\n");
    }
    else if (gpio_get_level(GPIO_NUM_37) == 0 && !key6_pressed){
        key6_pressed = true;
        char gpio_to_debounce = '2';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("5\n");
    }
    else if (gpio_get_level(GPIO_NUM_36) == 0 && !key7_pressed){
        key7_pressed = true;
        char gpio_to_debounce = '3';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("6\n");
    }
    else if (gpio_get_level(GPIO_NUM_35) == 0 && !key8_pressed){
        key8_pressed = true;
        char gpio_to_debounce = '4';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("B\n");
    }
    while ((row2pulled) && (key5_pressed || key6_pressed || key7_pressed || key8_pressed))
    {
        vTaskDelay(10);
        if (row2pulled && key5_pressed && gpio_get_level(GPIO_NUM_38) != 0) key5_pressed = false;
        if (row2pulled && key6_pressed && gpio_get_level(GPIO_NUM_37) != 0) key6_pressed = false;
        if (row2pulled && key7_pressed && gpio_get_level(GPIO_NUM_36) != 0) key7_pressed = false;
        if (row2pulled && key8_pressed && gpio_get_level(GPIO_NUM_35) != 0) key8_pressed = false;
    }
    gpio_set_level(GPIO_NUM_41, 1);

    bool row3pulled;
    gpio_set_level(GPIO_NUM_40, 0);
    row3pulled = true;

    if (gpio_get_level(GPIO_NUM_38) == 0 && !key9_pressed){
        key9_pressed = true;
        char gpio_to_debounce = '1';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("7\n");
    }
    else if (gpio_get_level(GPIO_NUM_37) == 0 && !key10_pressed){
        key10_pressed = true;
        char gpio_to_debounce = '2';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("8\n");
    }
    else if (gpio_get_level(GPIO_NUM_36) == 0 && !key11_pressed){
        key11_pressed = true;
        char gpio_to_debounce = '3';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("9\n");
    }
    else if (gpio_get_level(GPIO_NUM_35) == 0 && !key12_pressed){
        key12_pressed = true;
        char gpio_to_debounce = '4';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("C\n");
    }
    while ((row3pulled) && (key9_pressed || key10_pressed || key11_pressed || key12_pressed))
    {
        vTaskDelay(10);
        if (row3pulled && key9_pressed && gpio_get_level(GPIO_NUM_38) != 0) key9_pressed = false;
        if (row3pulled && key10_pressed && gpio_get_level(GPIO_NUM_37) != 0) key10_pressed = false;
        if (row3pulled && key11_pressed && gpio_get_level(GPIO_NUM_36) != 0) key11_pressed = false;
        if (row3pulled && key12_pressed && gpio_get_level(GPIO_NUM_35) != 0) key12_pressed = false;
    }
    gpio_set_level(GPIO_NUM_40, 1);

    bool row4pulled;
    gpio_set_level(GPIO_NUM_39, 0);
    row4pulled = true;

    if (gpio_get_level(GPIO_NUM_38) == 0 && !key13_pressed){
        key13_pressed = true;
        char gpio_to_debounce = '1';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("*\n");
    }
    else if (gpio_get_level(GPIO_NUM_37) == 0 && !key14_pressed){
        key14_pressed = true;
        char gpio_to_debounce = '2';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("0\n");
    }
    else if (gpio_get_level(GPIO_NUM_36) == 0 && !key15_pressed){
        key15_pressed = true;
        char gpio_to_debounce = '3';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("#\n");
    }
    else if (gpio_get_level(GPIO_NUM_35) == 0 && !key16_pressed){
        key16_pressed = true;
        char gpio_to_debounce = '4';
        xQueueSend(what_gpio_to_debounce, &gpio_to_debounce, pdMS_TO_TICKS(20));
        bool debounced = false;
        xQueueReceive(keydebounce, &debounced, pdMS_TO_TICKS(200));
        if (debounced) printf("D\n");
    }
    while ((row4pulled) && (key13_pressed || key14_pressed || key15_pressed || key16_pressed))
    {
        vTaskDelay(10);
        if (row4pulled && key13_pressed && gpio_get_level(GPIO_NUM_38) != 0) key13_pressed = false;
        if (row4pulled && key14_pressed && gpio_get_level(GPIO_NUM_37) != 0) key14_pressed = false;
        if (row4pulled && key15_pressed && gpio_get_level(GPIO_NUM_36) != 0) key15_pressed = false;
        if (row4pulled && key16_pressed && gpio_get_level(GPIO_NUM_35) != 0) key16_pressed = false;
    }
    gpio_set_level(GPIO_NUM_39, 1);
}
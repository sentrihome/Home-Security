#include "driver/gptimer.h"
#include "driver/gpio.h"
#include <stdbool.h>

#define ECHO 2
#define TRIG 42

uint64_t value = 0;
volatile unsigned int echo_time = 0;
volatile bool measurementFlag = false;
float distance = 0;

float lastDistance = 0;
float nowDistance = 0;


/////////////////////////////// TIMER INIT. /////////////////////////////////////////////
gptimer_handle_t gptimer = nullptr;

void init_timer(){
  gptimer_config_t config = {
      .clk_src = GPTIMER_CLK_SRC_DEFAULT,
      .direction = GPTIMER_COUNT_UP,
      .resolution_hz = 1000000,
  }; 

  ESP_ERROR_CHECK(gptimer_new_timer(&config, &gptimer));
  ESP_ERROR_CHECK(gptimer_enable(gptimer));
}
/////////////////////////////////////////////////////////////////////////////////////////
void timer_start(){
  gptimer_set_raw_count(gptimer, 0);
  gptimer_start(gptimer);
}
void timer_stop(){
  gptimer_get_raw_count(gptimer, &value);
  echo_time = (unsigned int)value;
  gptimer_stop(gptimer);
}

////////////////////////////////  INTERRUPT. ////////////////////////////////////////////
void IRAM_ATTR echo()
{
  if (digitalRead(ECHO) == HIGH){
    timer_start();
    measurementFlag = false;
  }
  if (digitalRead(ECHO) == LOW){
    timer_stop();
    measurementFlag = true;
  }
}

void setup() {
  Serial.begin(115200);
  init_timer();
  //////////////////////////////// SETTING ECHO GPIO ////////////////////////////////////////////
  pinMode(ECHO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ECHO),
                  echo,
                  CHANGE); //DETECT BOTH EDGES
  ///////////////////////////////////////////////////////////////////////////////////////////////
  pinMode(TRIG, OUTPUT);
}

void loop() {
  //measurementFlag = false;
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  while (measurementFlag == false){

  }
  distance = echo_time * 0.0343 / 2;
  
  lastDistance = nowDistance;
  nowDistance = distance;

  if(lastDistance - nowDistance > 10){
    int count = 0;
    while(count < 5000){
      Serial.printf("FUCK U FUCK U FUCK U\n");
      count++;
    }
  }
 
  Serial.printf("Distance: %.3f   Last: %.3f   Now: %.3f\n", distance, lastDistance, nowDistance);
  delay(200);
}

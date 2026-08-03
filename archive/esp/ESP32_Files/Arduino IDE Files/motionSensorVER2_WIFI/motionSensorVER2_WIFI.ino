#include "driver/gptimer.h"
#include "driver/gpio.h"
#include <stdbool.h>
//////////////////////////////////////////////////////////////////////
#include <WiFi.h>
#include <WiFiUdp.h>
//////////////////////////////////////////////////////////////////////

#define ECHO 16
#define TRIG 17

//////////////////////////////////wifisetup/////////////////////////////////////
const char* ssid = "vvlowspeed";
const char* password = "10022024";

const char* DEVICE_NAME = "ESP_MOTIONSENSOR";   // <-- change to ESP_B on the other board
const char* targetIP   = "192.168.1.72"; // <-- put the OTHER ESP's IP here
const int   udpPort    = 5005;

WiFiUDP udp;
unsigned long lastSend = 0;
//////////////////////////////////wifisetup/////////////////////////////////////

uint64_t value = 0;
volatile unsigned int echo_time = 0;
volatile bool measurementFlag = false;
float distance = 0;

float lastDistance = 0;
float nowDistance = 0;
int motiononflag = 0;


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
  //////////////////////////////////wifisetup////////////////////////////////////////////////////
  WiFi.begin(ssid, password);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(400);
  }

  Serial.println("\nConnected!");
  Serial.print("My IP: ");
  Serial.println(WiFi.localIP());

  udp.begin(udpPort);
  Serial.println("UDP listening...");
  //////////////////////////////////wifisetup////////////////////////////////////////////////////
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

  
 
  Serial.printf("Distance: %.3f   Last: %.3f   Now: %.3f\n", distance, lastDistance, nowDistance);
  delay(200);
  /////////////////////////////wifisetup////////////////////////////////////////////
  // ---- RECEIVE ----
  char buf[128];
  int packetSize = udp.parsePacket();
  if (packetSize) {
    
    int len = udp.read(buf, sizeof(buf) - 1);
    buf[len] = 0;
    Serial.print("Received: ");
    Serial.println(buf);
  }

  // ---- SEND ----
  if (millis() - lastSend > 1000) {
    lastSend = millis();

    udp.beginPacket(targetIP, udpPort);
    udp.printf("Distance: %.3f from ", distance);
    udp.print(DEVICE_NAME);
    udp.endPacket();

    Serial.println("Sent message");
  }
  /////////////////////////////wifisetup////////////////////////////////////////////
  
  /////////////////////////////TURN ON MOTION DETECTOR////////////////////////////////////////////
  if (motiononflag == 1){
    if(lastDistance - nowDistance > 10){
      int count = 0;
      while(count < 10){
        Serial.printf("FUCK U FUCK U FUCK U\n");
        count++;
        udp.beginPacket(targetIP, udpPort);
        udp.printf("INTRUDER INTRUDER ", distance);
        udp.endPacket();
        delay(10);
      }
    }
  }
  /////////////////////////////TURN ON MOTION DETECTOR////////////////////////////////////////////
  
  /////////////////////////////mode select////////////////////////////////////////////
  if (strcmp(buf, "turnonmotiondetectorespmotion") == 0) {
    motiononflag = 1;
    Serial.println("Motion detector turned ON");
    udp.beginPacket(targetIP, udpPort);
    udp.printf("MOTION DETECTOR ON");
    udp.endPacket();
  }
  else if (strcmp(buf, "turnoffmotiondetectorespmotion") == 0) {
    motiononflag = 0;
    Serial.println("Motion detector turned OFF");
    udp.beginPacket(targetIP, udpPort);
    udp.printf("MOTION DETECTOR OFF");
    udp.endPacket();
  }
  /////////////////////////////mode select////////////////////////////////////////////

}

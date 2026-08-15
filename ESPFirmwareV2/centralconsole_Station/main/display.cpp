#include "display.h"
#include "uielements.h"

#include <SPI.h>
#include <TFT_eSPI.h>

TFT_eSPI tft;
Touch touch;

bool app_wifi_station_start = false;

static bool startup_phase_1 = false; // Display
static bool startup_phase_2 = false; // Wifi

static bool display_wifi_station_start = false;
static bool init_done = false;

void Display::init()
{
    if (!startup_phase_1)
    {
        tft.init();
        printf("Display Initialized\n");
        printf("Setting Background to black\n");
        tft.fillScreen(0x0000);
        printf("Rotation to landscape\n");
        tft.setRotation(1);
        tft.setCursor(0, 0);
        tft.setTextSize(1);
        tft.print("Display setup, rotation landscape");
        startup_phase_1 = true;
    }
    if (!startup_phase_2)
    {
        if (app_wifi_station_start)
        {
            tft.setCursor(0, 10);
            tft.setTextSize(1);
            tft.print("Wifi station mode started");
            display_wifi_station_start = true;
            startup_phase_2 = true;
            init_done = true;
        }
    }
    if (init_done)
    {
        tft.setSwapBytes(true);
        state = UNARMED;
        tft.pushImage(0, 0, 480, 320, (const uint16_t *)uiidle);
        init_done = false;
    }
}

void Display::unarmed()
{
    printf("State unarmed, sending ui\n");
    tft.pushImage(17, 8, 113, 16, (const uint16_t *)uisysdisarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *)uisysdisarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *)uisysdisarmed3);
    state = UNARMED;
    printf("Screening uiunarmed, state unarmed\n");
}

void Display::armed()
{
    printf("State armed, sending ui\n");
    tft.pushImage(17, 8, 113, 16, (const uint16_t *)uisysarmed);
    tft.pushImage(30, 124, 36, 36, (const uint16_t *)uisysarmed2);
    tft.pushImage(402, 129, 48, 28, (const uint16_t *)uisysarmed3);
    state = ARMED;
    printf("Screening uiarmed, state armed\n");
}

void Display::settings()
{
    printf("State settings\n");
    tft.pushImage(1, 35, 478, 250, (const uint16_t *)uisettingspage_map);
    state = SETTINGS;
    printf("Screening uisettings, state settings\n");
}

void Display::setupInstructions()
{
    printf("State setup instructions\n");
    tft.pushImage(1, 35, 478, 250, (const uint16_t *)uisetupinstructions_map);
    state = SETUP_INSTRUCTIONS;
    printf("Screening uisetupinstructions, state setup_instructions\n");
}

void Touch::read()
{
    tft.getTouchRaw(&x, &y);
}

void Touch::debug()
{
    printf("x: %i     ", x);
    printf("y: %i     ", y);
    printf("z: %i \n", tft.getTouchRawZ());
    delay(250);
}

void Display::process()
{
    touch.read();
    touch.debug();
    if ((touch.x >= 1982) && (touch.x <= 2432) && (touch.y >= 350) && (touch.y <= 803))
    {
        if (state == UNARMED)
        {
            armed();
            delay(80);
        }
        else if (state == ARMED)
        {
            unarmed();
            delay(80);
        }
    }
    if ((touch.x >= 1023) && (touch.x <= 1695) && (touch.y >= 380) && (touch.y <= 3775))
    {
        if (state == UNARMED || state == ARMED)
        {
            settings();
            delay(80);
        }
    }
    if (state == SETTINGS)
    {
        if ((touch.x >= 2800) && (touch.x <= 3600) && (touch.y >= 3500) && (touch.y <= 3900))
        {
            state = UNARMED;
            tft.setSwapBytes(true);
            tft.pushImage(1, 35, 478, 250, (const uint16_t *)uihomepageUNarmed_map);
            delay(80);
        }
        if ((touch.x >= 1984) && (touch.x <= 2687) && (touch.y >= 519) && (touch.y <= 3711))
        {
            setupInstructions();
            delay(80);
        }
    }
    if (state == SETUP_INSTRUCTIONS)
    {
        if ((touch.x >= 2800) && (touch.x <= 3600) && (touch.y >= 3500) && (touch.y <= 3900))
        {
            state = SETTINGS;
            tft.setSwapBytes(true);
            tft.pushImage(1, 35, 478, 250, (const uint16_t *)uisettingspage_map);
            delay(80);
        }
    }
}

// x: 2432     y: 803     z: 2254
// x: 2432     y: 368     z: 2295
// x: 1982     y: 350     z: 2231
// x: 1984     y: 800     z: 2351
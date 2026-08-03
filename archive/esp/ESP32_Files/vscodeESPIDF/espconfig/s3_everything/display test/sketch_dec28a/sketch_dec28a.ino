/*
 * ILI9488 JPG Display Example - ESP32-S3
 * Fixed color order for JPEG decoder
 */

 #include <TFT_eSPI.h>
 #include <TJpg_Decoder.h>
 #include <FS.h>
 #include <LittleFS.h>
 
 TFT_eSPI tft = TFT_eSPI();
 
 // Callback function - fix color byte order
 bool tft_output(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
   if (y >= tft.height()) return 0;
   
   // Fix byte order - swap high and low bytes
   // JPEG decoder outputs colors in wrong byte order for ILI9488
   for (int i = 0; i < w * h; i++) {
     bitmap[i] = (bitmap[i] >> 8) | (bitmap[i] << 8);
   }
   
   tft.pushImage(x, y, w, h, bitmap);
   return 1;
 }
 
 void setup() {
   Serial.begin(115200);
   delay(1000);
   
   Serial.println("ILI9488 JPG Display Test");
   
   if (!LittleFS.begin(true)) {
     Serial.println("LittleFS Mount Failed");
     return;
   }
   Serial.println("LittleFS Mounted Successfully");
   
   pinMode(15, OUTPUT);
   digitalWrite(15, HIGH);
   delay(100);
   
   tft.init();
   delay(200);
   tft.setRotation(1);
   tft.fillScreen(TFT_BLACK);
   
   TJpgDec.setJpgScale(1);
   TJpgDec.setCallback(tft_output);
   
   // Read file into buffer and display
   fs::File jpgFile = LittleFS.open("/test1.jpg", "r");
   if (jpgFile) {
     size_t fileSize = jpgFile.size();
     uint8_t* jpgBuffer = (uint8_t*)malloc(fileSize);
     if (jpgBuffer) {
       jpgFile.readBytes((char*)jpgBuffer, fileSize);
       jpgFile.close();
       
       TJpgDec.drawJpg(0, 0, jpgBuffer, fileSize);
       free(jpgBuffer);
       Serial.println("JPG displayed!");
     }
   }
 }
 
 void loop() {
   delay(1000);
 }
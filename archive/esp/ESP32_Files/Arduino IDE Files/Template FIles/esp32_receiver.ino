/*
 * ESP32-S3 Wireless Receiver
 * Receives an integer value and a string from another ESP32
 * Board: ESP32-S3 (ESP32 Arduino Core 2.0.14)
 * 
 * Configuration:
 * - SSID: Your WiFi network name
 * - PASSWORD: Your WiFi password
 * - PORT: UDP port for communication (must match transmitter, default: 12345)
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// WiFi credentials - CHANGE THESE
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// UDP settings
WiFiUDP udp;
const int udpPort = 12345;

// Connection status
bool wifiConnected = false;

// Buffer for receiving packets
char packetBuffer[255];

/*
 * Function to parse received packet and extract value and string
 * Packet format: "VALUE:STRING"
 * Example: "42:Hello World"
 * 
 * Parameters:
 *   packet: Received packet string
 *   received_value: Pointer to store the received integer value
 *   received_string: Buffer to store the received string (max 200 chars)
 * Returns:
 *   true if parsing successful, false otherwise
 */
bool parsePacket(const char* packet, int* received_value, char* received_string) {
  // Find the colon separator
  const char* colon = strchr(packet, ':');
  if (colon == NULL) {
    Serial.println("Error: Invalid packet format (no colon found)");
    return false;
  }
  
  // Extract value (before colon)
  *received_value = atoi(packet);
  
  // Extract string (after colon)
  strncpy(received_string, colon + 1, 200);
  received_string[200] = '\0';  // Ensure null termination
  
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("ESP32-S3 Wireless Receiver");
  Serial.println("===========================");
  
  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("UDP Port: ");
    Serial.println(udpPort);
    Serial.println("Waiting for data...");
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    Serial.println("Please check your SSID and password.");
  }
  
  // Initialize UDP
  udp.begin(udpPort);
}

void loop() {
  // Check for incoming packets
  int packetSize = udp.parsePacket();
  
  if (packetSize) {
    // Read the packet
    int len = udp.read(packetBuffer, 255);
    if (len > 0) {
      packetBuffer[len] = '\0';  // Null terminate the string
    }
    
    // Parse the packet
    int received_value;
    char received_string[201];
    
    if (parsePacket(packetBuffer, &received_value, received_string)) {
      // Print received data
      Serial.print("Received from ");
      Serial.print(udp.remoteIP());
      Serial.print(":");
      Serial.print(udp.remotePort());
      Serial.print(" - Value: ");
      Serial.print(received_value);
      Serial.print(", String: \"");
      Serial.print(received_string);
      Serial.println("\"");
      
      // Here you can process the received data
      // For example, display it, store it, or trigger actions
      processReceivedData(received_value, received_string);
    }
  }
  
  delay(10);
}

/*
 * Function to process received data
 * Customize this function based on your application needs
 */
void processReceivedData(int value, const char* str) {
  // Example: Print to serial
  // You can add your own processing here:
  // - Display on screen
  // - Control actuators
  // - Store in memory
  // - etc.
  
  // Example processing:
  if (value > 1000) {
    Serial.println("  -> High value detected!");
  }
  
  if (strstr(str, "alert") != NULL) {
    Serial.println("  -> Alert message received!");
  }
}


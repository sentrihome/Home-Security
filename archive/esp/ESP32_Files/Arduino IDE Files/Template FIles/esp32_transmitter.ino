/*
 * ESP32 Wireless Transmitter
 * Transmits an integer value and a string to another ESP32
 * 
 * Configuration:
 * - SSID: Your WiFi network name
 * - PASSWORD: Your WiFi password
 * - RECEIVER_IP: IP address of the receiving ESP32
 * - PORT: UDP port for communication (default: 12345)
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// WiFi credentials - CHANGE THESE
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Receiver ESP32 IP address - CHANGE THIS
IPAddress receiverIP(192, 168, 1, 100);  // Replace with your receiver ESP32's IP

// UDP settings
WiFiUDP udp;
const int udpPort = 12345;

// Connection status
bool wifiConnected = false;

/*
 * Modular function to transmit an integer value and a string
 * Parameters:
 *   transmit_value: Integer value to transmit
 *   transmit_string: String to transmit (max 200 characters)
 * Returns:
 *   true if transmission successful, false otherwise
 */
bool transmit(int transmit_value, const char* transmit_string) {
  // Check if WiFi is connected
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    Serial.println("Error: WiFi not connected. Cannot transmit.");
    return false;
  }
  
  // Validate string length (prevent buffer overflow)
  if (strlen(transmit_string) > 200) {
    Serial.println("Error: String too long (max 200 characters)");
    return false;
  }
  
  // Create packet: format is "VALUE:STRING"
  // Example: "42:Hello World"
  char packet[250];
  snprintf(packet, sizeof(packet), "%d:%s", transmit_value, transmit_string);
  
  // Send UDP packet
  udp.beginPacket(receiverIP, udpPort);
  udp.write((uint8_t*)packet, strlen(packet));
  
  if (udp.endPacket()) {
    Serial.print("Transmitted: Value=");
    Serial.print(transmit_value);
    Serial.print(", String=\"");
    Serial.print(transmit_string);
    Serial.println("\"");
    return true;
  } else {
    Serial.println("Error: Failed to send packet");
    return false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("ESP32 Wireless Transmitter");
  Serial.println("==========================");
  
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
    Serial.print("Receiver IP: ");
    Serial.println(receiverIP);
    Serial.print("UDP Port: ");
    Serial.println(udpPort);
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    Serial.println("Please check your SSID and password.");
  }
  
  // Initialize UDP
  udp.begin(udpPort);
}

void loop() {
  // Example usage of the transmit function
  static unsigned long lastTransmit = 0;
  static int counter = 0;
  
  // Transmit every 3 seconds
  if (millis() - lastTransmit > 3000) {
    counter++;
    
    // Example: Transmit a counter value with a message
    transmit(counter, "Counter update");
    
    lastTransmit = millis();
  }
  
  delay(100);
}


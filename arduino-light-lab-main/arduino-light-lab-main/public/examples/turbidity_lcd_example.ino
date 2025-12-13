/*
 * Turbidity Sensor with LCD Display
 * 
 * Hardware Setup:
 * - Turbidity Sensor Module → Arduino
 *   - VCC → 5V
 *   - GND → GND
 *   - AO → A0
 * 
 * - Turbidity Probe → Sensor Module
 *   - VCC/TR/IR → LED+/LED-/PH+
 * 
 * - Water Chamber → Probe
 *   - PROBE pin → GLASS pin
 * 
 * - LCD 16x2 → Arduino
 *   - VSS → GND
 *   - VDD → 5V
 *   - RS → Pin 7
 *   - E → Pin 8
 *   - D4 → Pin 9
 *   - D5 → Pin 10
 *   - D6 → Pin 11
 *   - D7 → Pin 12
 */

#include <LiquidCrystal.h>

// LCD pins: RS, E, D4, D5, D6, D7
LiquidCrystal lcd(7, 8, 9, 10, 11, 12);

// Turbidity sensor pin
const int TURBIDITY_PIN = A0;

// Calibration constants
const float MIN_VOLTAGE = 0.5;
const float MAX_VOLTAGE = 4.5;
const float ATTENUATION_COEFF = 0.005;

void setup() {
  // Initialize LCD (16 columns x 2 rows)
  lcd.begin(16, 2);
  
  // Display startup message
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Turbidity Sensor");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  delay(2000);
  
  // Initialize serial for debugging
  Serial.begin(9600);
  Serial.println("Turbidity Sensor with LCD - Ready");
}

void loop() {
  // Read turbidity sensor
  int sensorValue = analogRead(TURBIDITY_PIN);
  float voltage = sensorValue * (5.0 / 1023.0);
  float ntu = voltageToNTU(voltage);
  
  // Get water quality classification
  String quality = getWaterQuality(ntu);
  
  // Display on LCD
  lcd.clear();
  
  // Line 1: Turbidity value
  lcd.setCursor(0, 0);
  lcd.print("NTU: ");
  lcd.print(ntu, 1);  // 1 decimal place
  
  // Line 2: Water quality
  lcd.setCursor(0, 1);
  lcd.print(quality);
  
  // Also print to serial monitor
  Serial.print("Turbidity: ");
  Serial.print(ntu, 1);
  Serial.print(" NTU - ");
  Serial.println(quality);
  
  delay(1000);  // Update every second
}

/**
 * Convert voltage to NTU
 */
float voltageToNTU(float voltage) {
  // Handle boundary conditions
  if (voltage <= MIN_VOLTAGE) {
    return 1000.0;  // Maximum turbidity
  }
  if (voltage >= MAX_VOLTAGE) {
    return 0.0;     // Clean water
  }
  
  // Calculate NTU from voltage
  float attenuation = (voltage - MIN_VOLTAGE) / (MAX_VOLTAGE - MIN_VOLTAGE);
  float ntu = -log(attenuation) / ATTENUATION_COEFF;
  
  return constrain(ntu, 0.0, 1000.0);
}

/**
 * Get water quality description
 */
String getWaterQuality(float ntu) {
  if (ntu < 1.0) {
    return "Excellent";
  } else if (ntu < 5.0) {
    return "Good";
  } else if (ntu < 20.0) {
    return "Fair";
  } else if (ntu < 100.0) {
    return "Poor";
  } else {
    return "Unsafe";
  }
}

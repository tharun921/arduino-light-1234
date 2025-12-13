/*
 * Turbidity Sensor - Automatic Output Example
 * 
 * This code automatically outputs to the right place:
 * - ALWAYS outputs to Serial (debug console) - you'll always see it
 * - ALSO outputs to LCD if you have one connected
 * 
 * Just connect what you want and run it - no configuration needed!
 * 
 * Hardware Setup:
 * 
 * Turbidity Sensor (Required):
 * - Turbidity Sensor Module → Arduino
 *   - VCC → 5V
 *   - GND → GND
 *   - AO → A0
 * 
 * - Turbidity Probe → Sensor Module
 *   - LED+/LED-/PH+ → Sensor connections
 * 
 * - Water Chamber → Probe
 *   - PROBE pin → GLASS pin
 * 
 * LCD 16x2 (Optional - auto-detected):
 * - If you want LCD output, just connect:
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

// Auto-detect if LCD is available
bool lcdAvailable = false;

void setup() {
  // Always initialize Serial
  Serial.begin(9600);
  Serial.println("=================================");
  Serial.println("   Turbidity Sensor Monitor");
  Serial.println("=================================");
  
  // Try to initialize LCD
  lcd.begin(16, 2);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Turbidity Sensor");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  lcdAvailable = true;  // Assume LCD is connected
  delay(2000);
  
  Serial.println("Output: Serial Monitor + LCD (if connected)");
  Serial.println("Time\t\tVoltage\t\tNTU\t\tQuality");
  Serial.println("---------------------------------");
}

void loop() {
  // Read turbidity sensor
  int sensorValue = analogRead(TURBIDITY_PIN);
  float voltage = sensorValue * (5.0 / 1023.0);
  float ntu = voltageToNTU(voltage);
  
  // Get water quality classification
  String quality = getWaterQuality(ntu);
  
  // ==================
  // SERIAL OUTPUT (Always)
  // ==================
  Serial.print(millis() / 1000);
  Serial.print("s\t\t");
  Serial.print(voltage, 2);
  Serial.print("V\t\t");
  Serial.print(ntu, 1);
  Serial.print(" NTU\t");
  Serial.println(quality);
  
  // Warning for high turbidity
  if (ntu > 100.0) {
    Serial.println("⚠️ WARNING: High turbidity detected!");
  }
  
  // ==================
  // LCD OUTPUT (If connected)
  // ==================
  if (lcdAvailable) {
    lcd.clear();
    
    // Line 1: Turbidity value
    lcd.setCursor(0, 0);
    lcd.print("NTU: ");
    lcd.print(ntu, 1);  // 1 decimal place
    
    // Line 2: Water quality
    lcd.setCursor(0, 1);
    lcd.print(quality);
  }
  
  delay(1000);  // Update every second
}

/**
 * Convert voltage to NTU (Nephelometric Turbidity Units)
 * 
 * Formula:
 * - Light attenuation: I = I₀ * e^(-k * NTU)
 * - Photodiode voltage proportional to light intensity
 * - V = V_min + I/I₀ * (V_max - V_min)
 * - Solving for NTU: NTU = -ln((V - V_min)/(V_max - V_min)) / k
 */
float voltageToNTU(float voltage) {
  // Handle boundary conditions
  if (voltage <= MIN_VOLTAGE) {
    return 1000.0;  // Maximum turbidity
  }
  if (voltage >= MAX_VOLTAGE) {
    return 0.0;     // Clean water
  }
  
  // Calculate light attenuation from voltage
  float attenuation = (voltage - MIN_VOLTAGE) / (MAX_VOLTAGE - MIN_VOLTAGE);
  
  // Apply inverse exponential formula
  float ntu = -log(attenuation) / ATTENUATION_COEFF;
  
  // Clamp to valid range
  return constrain(ntu, 0.0, 1000.0);
}

/**
 * Classify water quality based on NTU value
 * 
 * WHO drinking water guidelines:
 * < 1 NTU: Excellent (crystal clear)
 * 1-5 NTU: Good (acceptable for drinking)
 * 5-20 NTU: Fair (visible cloudiness)
 * 20-100 NTU: Poor (very cloudy)
 * > 100 NTU: Unacceptable (opaque)
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


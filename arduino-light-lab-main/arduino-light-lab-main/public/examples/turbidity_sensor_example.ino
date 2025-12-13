/*
 * Turbidity Sensor - Complete Arduino Example
 * 
 * Hardware Setup:
 * - Turbidity Sensor Module connected to Arduino
 * - VCC → 5V
 * - GND → GND
 * - AO (Analog Out) → A0
 * - DO (Digital Out) → D2 (optional)
 * 
 * Turbidity Module connects to Turbidity Probe:
 * - LED+ / LED- → IR LED power
 * - PH+ / PH- → Photodiode signal
 * 
 * Probe GLASS pin connects to Water Chamber
 */

// Pin definitions
const int TURBIDITY_PIN = A0;    // Analog input from sensor
const int THRESHOLD_PIN = 2;      // Digital threshold output (optional)

// Calibration constants
const float MIN_VOLTAGE = 0.5;    // Voltage at maximum turbidity (1000 NTU)
const float MAX_VOLTAGE = 4.5;    // Voltage at minimum turbidity (0 NTU)
const float ATTENUATION_COEFF = 0.005;  // Light scattering coefficient

// Threshold for water quality alarm
const float TURBIDITY_THRESHOLD = 100.0;  // NTU

void setup() {
    Serial.begin(9600);
    pinMode(TURBIDITY_PIN, INPUT);
    pinMode(THRESHOLD_PIN, INPUT);
    
    Serial.println("=================================");
    Serial.println("   Turbidity Sensor Monitor");
    Serial.println("=================================");
    Serial.println("Time\t\tVoltage\t\tNTU\t\tQuality");
    Serial.println("---------------------------------");
}

void loop() {
    // Read analog value (0-1023 = 0-5V)
    int sensorValue = analogRead(TURBIDITY_PIN);
    
    // Convert to voltage
    float voltage = sensorValue * (5.0 / 1023.0);
    
    // Convert voltage to NTU using physics formula
    float turbidity = voltageToNTU(voltage);
    
    // Determine water quality
    String quality = getWaterQuality(turbidity);
    
    // Read digital threshold (if connected)
    //int threshold = digitalRead(THRESHOLD_PIN);
    
    // Display results
    Serial.print(millis() / 1000);
    Serial.print("s\t\t");
    Serial.print(voltage, 2);
    Serial.print("V\t\t");
    Serial.print(turbidity, 1);
    Serial.print(" NTU\t");
    Serial.println(quality);
    
    // Check if turbidity exceeds threshold
    if (turbidity > TURBIDITY_THRESHOLD) {
        Serial.println("⚠️ WARNING: High turbidity detected!");
    }
    
    delay(1000);  // Update every second
}

/**
 * Convert voltage reading to NTU (Nephelometric Turbidity Units)
 * 
 * Formula derivation:
 * 1. Light attenuation: I = I₀ * e^(-k * NTU)
 * 2. Photodiode voltage proportional to light intensity
 * 3. V = V_min + I/I₀ * (V_max - V_min)
 * 4. Solving for NTU: NTU = -ln((V - V_min)/(V_max - V_min)) / k
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
        return "Excellent ✓";
    } else if (ntu < 5.0) {
        return "Good ✓";
    } else if (ntu < 20.0) {
        return "Fair ○";
    } else if (ntu < 100.0) {
        return "Poor ⚠";
    } else {
        return "Unsafe ✗";
    }
}

/**
 * Alternative: Simple voltage-based threshold detection
 * (if your sensor has built-in comparator)
 */
void checkDigitalThreshold() {
    int threshold = digitalRead(THRESHOLD_PIN);
    
    if (threshold == LOW) {
        Serial.println("CLEAN: Water turbidity below threshold");
    } else {
        Serial.println("TURBID: Water turbidity above threshold");
    }
}

/**
 * Advanced: Running average filter to reduce noise
 */
const int SAMPLES = 10;
int readings[SAMPLES];
int readIndex = 0;
int total = 0;

float getFilteredReading() {
    // Subtract last reading
    total = total - readings[readIndex];
    
    // Get new reading
    readings[readIndex] = analogRead(TURBIDITY_PIN);
    
    // Add to total
    total = total + readings[readIndex];
    
    // Advance index
    readIndex = (readIndex + 1) % SAMPLES;
    
    // Calculate average
    float average = total / (float)SAMPLES;
    
    // Convert to voltage
    return average * (5.0 / 1023.0);
}

/**
 * Minimal Servo Test - Guaranteed to work
 * 
 * Connections:
 * - Servo Signal (Orange) → Pin 9
 * - Servo VCC (Red)      → 5V
 * - Servo GND (Brown)    → GND
 * 
 * Expected behavior:
 * - Servo sweeps from 0° to 180° and back
 * - Full sweep takes 3 seconds
 */

#include <Servo.h>

Servo myServo;  // Create servo object

void setup() {
  // Attach servo to pin 9 (uses Timer1 OC1A)
  myServo.attach(9);
  
  // Start at center position
  myServo.write(90);
  delay(500);
}

void loop() {
  // Sweep from 0° to 180°
  for (int angle = 0; angle <= 180; angle += 10) {
    myServo.write(angle);
    delay(100);  // 100ms per step = 1.8 seconds for full sweep
  }
  
  delay(500);  // Pause at 180°
  
  // Sweep back from 180° to 0°
  for (int angle = 180; angle >= 0; angle -= 10) {
    myServo.write(angle);
    delay(100);
  }
  
  delay(500);  // Pause at 0°
}

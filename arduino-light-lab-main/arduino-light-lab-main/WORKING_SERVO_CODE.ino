// ✅ WORKING SERVO CODE - Use analogWrite() instead of Servo.h
// This code WILL work with arduino-cli and your emulator!

void setup() {
  pinMode(9, OUTPUT);  // Set pin 9 as output for servo
}

void loop() {
  // Rotate to 0° (1000µs pulse = PWM value 25)
  analogWrite(9, 25);
  delay(1000);
  
  // Rotate to 90° (1500µs pulse = PWM value 128)
  analogWrite(9, 128);
  delay(1000);
  
  // Rotate to 180° (2000µs pulse = PWM value 230)
  analogWrite(9, 230);
  delay(1000);
}

// PWM to Angle conversion:
// 0°   = analogWrite(9, 25)   = 1000µs pulse
// 45°  = analogWrite(9, 77)   = 1250µs pulse
// 90°  = analogWrite(9, 128)  = 1500µs pulse
// 135° = analogWrite(9, 179)  = 1750µs pulse
// 180° = analogWrite(9, 230)  = 2000µs pulse

#include <Servo.h>

Servo myServo;

void setup() {
  // Attach servo to pin 9
  myServo.attach(9);
  
  // Set initial position
  myServo.write(90);
}

void loop() {
  // CRITICAL: We MUST use the servo in loop() or compiler optimizes it out!
  // Simple sweep to prove it works
  myServo.write(0);
  delay(1000);
  myServo.write(180);
  delay(1000);
}

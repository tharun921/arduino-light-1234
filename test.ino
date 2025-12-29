#include <Servo.h>

Servo myServo;

void setup() {
  // Initialize servo on pin 9
  myServo.attach(9);
  
  // Small delay to ensure initialization
  delay(100);
}

void loop() {
  // Move to 0 degrees
  myServo.write(0);
  delay(1000);
  
  // Move to 90 degrees (center)
  myServo.write(90);
  delay(1000);
  
  // Move to 180 degrees
  myServo.write(180);
  delay(1000);
}

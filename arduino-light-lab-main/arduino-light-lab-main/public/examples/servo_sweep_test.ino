#include <Servo.h>

Servo myServo;

void setup() {
  // Initialize servo on pin 9
  myServo.attach(9);
  
  // Start at 90 degrees (center position)
  myServo.write(90);
  delay(1000);
}

void loop() {
  // Sweep from 0° to 180°
  for (int angle = 0; angle <= 180; angle += 10) {
    myServo.write(angle);
    delay(100);
  }
  
  delay(500);
  
  // Sweep from 180° to 0°
  for (int angle = 180; angle >= 0; angle -= 10) {
    myServo.write(angle);
    delay(100);
  }
  
  delay(500);
}

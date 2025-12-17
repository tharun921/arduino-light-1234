#include <LiquidCrystal.h>

// LCD: RS=12, E=11, D4=5, D5=4, D6=3, D7=2
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

int turbidityPin = A2;  // CRITICAL: Must match A2!
int loopCount = 0;

void setup() {
  lcd.begin(16, 2);
  lcd.print("START");
  delay(1000);  // Test delay() blocking
  lcd.clear();
}

void loop() {
  // Read turbidity sensor analog value
  int value = analogRead(turbidityPin);
  
  // Display on LCD
  lcd.setCursor(0, 0);
  lcd.print("V:");
  lcd.print(value);
  lcd.print("    ");  // Clear extra chars
  
  lcd.setCursor(0, 1);
  lcd.print("L:");
  lcd.print(loopCount++);
  lcd.print("    ");  // Clear extra chars
  
  delay(500);  // Test delay() timing
}

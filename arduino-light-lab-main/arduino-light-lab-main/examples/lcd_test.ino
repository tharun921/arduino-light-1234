#include <LiquidCrystal.h>

// Initialize the LCD library with the pin numbers
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  // Set up the LCD's number of columns and rows
  lcd.begin(16, 2);
  
  // Print a message to the LCD
  lcd.print("Hello Tharun!");
}

void loop() {
  // Set the cursor to column 0, line 1
  lcd.setCursor(0, 1);
  
  // Print the message
  lcd.print("LCD working :)");
  
  delay(1000);
}

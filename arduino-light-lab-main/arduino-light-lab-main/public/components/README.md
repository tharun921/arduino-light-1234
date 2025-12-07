# Component Images/SVGs Directory

This folder contains all the visual assets (images/SVGs) for electronic components.

## 📁 File Structure

Place your component images in this directory with the exact filenames listed below:

### Sensors
- `dht11.svg` - DHT11 Temperature & Humidity Sensor
- `dht22.svg` - DHT22 High Precision Temp/Humidity Sensor
- `hc-sr04.svg` - HC-SR04 Ultrasonic Distance Sensor
- `pir.svg` - PIR Motion Detection Sensor
- `ldr.svg` - Light Dependent Resistor (LDR)
- `ir-sensor.svg` - IR Infrared Obstacle Detection Sensor
- `mq2.svg` - MQ-2 Gas & Smoke Sensor
- `sound-sensor.svg` - Sound Detection Module
- `rain-sensor.svg` - Rain Detection Module
- `soil-moisture.svg` - Soil Moisture Sensor
- `mpu6050.svg` - MPU6050 Gyroscope & Accelerometer
- `gps-neo6m.svg` - GPS NEO-6M Module

### Displays
- `lcd-16x2.svg` - LCD 16x2 Character Display
- `oled-128x64.svg` - OLED 128x64 I2C Display
- `7segment.svg` - 7-Segment Single Digit Display
- `led-matrix-8x8.svg` - LED Matrix 8x8 Display
- `tft-display.svg` - TFT LCD Display 2.4"

### Actuators (Motors & More)
- `servo-sg90.svg` - SG90 9g Micro Servo Motor
- `dc-motor.svg` - DC Motor with Driver
- `stepper-motor.svg` - 28BYJ-48 Stepper Motor
- `buzzer.svg` - Active/Passive Buzzer
- `relay.svg` - 5V Relay Module

### Communication Modules
- `hc05.svg` - HC-05 Bluetooth Module
- `esp8266.svg` - ESP8266 WiFi Module
- `nrf24l01.svg` - NRF24L01 RF Wireless Module
- `rfid-rc522.svg` - RFID RC522 Reader Module

### Basic Components
- `led-red.svg` - Red LED
- `led-green.svg` - Green LED
- `led-blue.svg` - Blue LED
- `rgb-led.svg` - RGB LED Common Cathode
- `push-button.svg` - Tactile Push Button
- `potentiometer.svg` - 10K Potentiometer
- `keypad-4x4.svg` - 4x4 Matrix Keypad
- `resistor-220.svg` - 220Ω Resistor
- `resistor-1k.svg` - 1KΩ Resistor
- `resistor-10k.svg` - 10KΩ Resistor
- `capacitor.svg` - Electrolytic Capacitor
- `transistor-npn.svg` - NPN Transistor (2N2222)

### Boards
- `arduino-uno.svg` - Arduino UNO Board (already exists in parent folder)

## 📝 File Format Guidelines

### Recommended Format: SVG
- **Best choice**: SVG (Scalable Vector Graphics)
- Scales perfectly at any size
- Small file size
- Easy to edit

### Alternative Formats
- PNG with transparent background
- Minimum resolution: 200x200px
- Keep file size under 100KB per image

## 🎨 Design Guidelines

1. **Background**: Transparent or white
2. **Orientation**: Component facing up/forward
3. **Pin Positions**: Clearly visible and accurate
4. **Colors**: Realistic component colors
5. **Size**: Proportional to real-world size ratios

## 🔧 How to Add a New Component

1. Add component image to this folder
2. Update `src/config/componentsData.ts`:
   - Add component configuration
   - Set `imagePath: '/components/your-file.svg'`
3. Component will automatically appear in the library!

## 📦 Current Status

**Total Components Defined**: 48
**Components with placeholder**: All (waiting for images)

Once you add the image files here, they will automatically load in the simulator!

## 💡 Where to Get Component Images

- Draw them yourself in Inkscape/Illustrator
- Use Fritzing component library (export as SVG)
- Download from electronics component websites
- Use Wokwi's open-source components as reference
- Create simple representations in Figma/Canva

---

**Note**: If an image file is missing, the component will display a colored placeholder box with the component name.


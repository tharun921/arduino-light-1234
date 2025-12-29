# 🎯 ARDUINO IDE - SERVO COMPILATION GUIDE

## 📋 Step-by-Step Instructions

### Step 1: Open Arduino IDE
1. Launch Arduino IDE (if not installed, download from https://www.arduino.cc/en/software)
2. Wait for it to fully load

### Step 2: Paste the Servo Code
Copy and paste this EXACT code into the Arduino IDE:

```cpp
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
  myServo.write(90);
}

void loop() {
  myServo.write(0);
  delay(1000);
  myServo.write(180);
  delay(1000);
}
```

### Step 3: Configure Board Settings
1. Click **Tools** → **Board** → **Arduino AVR Boards** → **Arduino Uno**
2. Verify the board is set to "Arduino Uno"

### Step 4: Verify the Code
1. Click the **✓ Verify** button (or press Ctrl+R)
2. Wait for compilation to complete
3. You should see "Done compiling" at the bottom
4. Check for any errors (there should be none)

### Step 5: Export Compiled Binary
1. Click **Sketch** → **Export compiled Binary** (or press Ctrl+Alt+S)
2. Wait for export to complete (you'll see "Done exporting binary")
3. The IDE will create a `.hex` file in your sketch folder

### Step 6: Find the HEX File
The HEX file will be in one of these locations:

**Option A: Temporary Sketch Folder**
```
C:\Users\tharu\AppData\Local\Temp\arduino_build_XXXXXX\sketch.ino.hex
```

**Option B: Documents Folder** (if you saved the sketch)
```
C:\Users\tharu\Documents\Arduino\ServoTest\ServoTest.ino.hex
```

**Easiest way to find it:**
1. In Arduino IDE, click **Sketch** → **Show Sketch Folder**
2. Look for a file named `ServoTest.ino.hex` or similar
3. There might be two files:
   - `ServoTest.ino.hex` ← **USE THIS ONE**
   - `ServoTest.ino.with_bootloader.hex` ← Don't use this

### Step 7: Verify the HEX Contains Servo Code
Open the `.hex` file in Notepad and search for `9C40`:
- ✅ If found → Perfect! This HEX has servo code
- ❌ If not found → Something went wrong, try again

### Step 8: Load HEX in Your Web UI

**Option A: Manual Upload**
1. Open your web UI at `http://localhost:5173`
2. Look for an "Upload HEX" or "Load HEX" button
3. Select the `.hex` file you exported
4. Click Upload

**Option B: Copy HEX Content**
1. Open the `.hex` file in Notepad
2. Copy ALL the content (Ctrl+A, Ctrl+C)
3. In your web UI, paste it into the HEX input field
4. Click Upload/Load

### Step 9: Verify Servo Works
After loading the HEX, check the browser console (F12):
- ✅ You should see: `🎛️ TIMER1: ICR1=40000`
- ✅ You should see: `🎛️ TIMER1: OCR1A=3000` (or similar)
- ✅ The servo should move in the simulation!

---

## 🆘 Troubleshooting

### "Arduino IDE not installed"
Download from: https://www.arduino.cc/en/software
Install the **Windows installer** version

### "Servo library not found"
1. In Arduino IDE, click **Sketch** → **Include Library** → **Manage Libraries**
2. Search for "Servo"
3. Install "Servo by Arduino"
4. Try compiling again

### "Can't find the HEX file"
1. In Arduino IDE, click **File** → **Preferences**
2. Check the "Sketchbook location"
3. The HEX will be in that folder

### "HEX doesn't contain 9C40"
- Make sure you selected **Arduino Uno** as the board
- Make sure the code includes `#include <Servo.h>`
- Try compiling again

---

## ✅ Expected Result

After following these steps:
1. ✅ You'll have a working servo HEX file
2. ✅ The emulator will load it successfully
3. ✅ Timer1 will initialize (ICR1=40000)
4. ✅ The servo will move between 0° and 180°
5. ✅ Your simulation will work perfectly!

---

**Next Step:** Follow the steps above and let me know when you have the HEX file ready!

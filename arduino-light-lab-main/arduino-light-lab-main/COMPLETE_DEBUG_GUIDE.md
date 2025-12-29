# 🔍 COMPLETE DEBUGGING GUIDE

## 📋 Step-by-Step Debugging

### **Step 1: Verify New Code is Loaded**

Open browser console and look for this **EXACT** message when page loads:

```
✅ Delay fast-forward enabled for user code (PC >= 0x200)
```

**If you DON'T see it:**
- ❌ New code NOT loaded
- ✅ Solution: Try incognito window (`Ctrl + Shift + N`)

**If you DO see it:**
- ✅ New code loaded
- ✅ Continue to Step 2

---

### **Step 2: Upload This EXACT Test Code**

```cpp
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
  myServo.write(90);  // Start at center
  delay(1000);
}

void loop() {
  myServo.write(0);    // Move to 0°
  delay(2000);         // Wait 2 seconds
  
  myServo.write(180);  // Move to 180°
  delay(2000);         // Wait 2 seconds
}
```

---

### **Step 3: Check Console Logs**

After uploading, you MUST see:

```
⏩ Delay loop detected! Only 3 unique PCs in last 100 steps
🎛️ Timer1 OVERFLOW! OCR1A=1000 → 500µs pulse on Pin 9
[SERVO] Target: 0.0°
✅ Exited delay loop (25 unique PCs now)

⏩ Delay loop detected! Only 3 unique PCs in last 100 steps
🎛️ Timer1 OVERFLOW! OCR1A=4000 → 2000µs pulse on Pin 9
[SERVO] Target: 180.0°
✅ Exited delay loop (25 unique PCs now)
```

**Check OCR1A values:**
- ✅ Should change: 1000 → 4000 → 1000 → 4000
- ❌ If stuck at one value: Delay not working

---

### **Step 4: Visual Check**

**Servo should:**
- ✅ Start at 90° (center)
- ✅ Move to 0° (left)
- ✅ Wait ~0.1s (fast-forwarded delay)
- ✅ Move to 180° (right)
- ✅ Wait ~0.1s
- ✅ Repeat

**If servo moves twice or wrong direction:**
- Check if you see duplicate "Target:" messages
- Check OCR1A values in console

---

## 🐛 Common Issues & Solutions

### **Issue 1: No Delay Detection Logs**

**Symptoms:**
- No "⏩ Delay loop detected" messages
- OCR1A stuck at one value
- Servo doesn't move

**Solution:**
```
1. Open incognito window (Ctrl + Shift + N)
2. Go to localhost:5173
3. Check for "✅ Delay fast-forward enabled" message
4. Upload code
```

---

### **Issue 2: Servo Moves Twice**

**Symptoms:**
- Servo rotates, then rotates again
- Two movements for one command

**Possible Causes:**
1. **Duplicate angle updates** - Check console for duplicate "Target:" logs
2. **Wrong Arduino code** - Using `myServo.write()` twice
3. **React re-rendering** - ServoComponent rendering twice

**Debug:**
```
Look in console for:
[SERVO] Target: 0.0°
[SERVO] Target: 0.0°  ← DUPLICATE!
```

If you see duplicates, there's a React rendering issue.

---

### **Issue 3: Wrong Direction**

**Symptoms:**
- Servo goes opposite direction
- 0° command → servo goes right instead of left

**Check:**
```
Rotation calculation in ServoComponent:
const rotation = angle - 90;

0° → -90° rotation (left) ✅
90° → 0° rotation (center) ✅
180° → +90° rotation (right) ✅
```

---

## 📊 Expected Console Output (COMPLETE)

```
🎮 AVR8js emulator initialized (Wokwi approach)
   Flash: 32768 bytes
✅ Delay fast-forward enabled for user code (PC >= 0x200)
   SRAM: 2048 bytes
   Clock: 16 MHz

[Upload code...]

⏩ Delay loop detected! Only 3 unique PCs in last 100 steps
🎛️ Timer1 OVERFLOW! OCR1A=1000 → 500µs pulse on Pin 9
🌊 PWM Router: Pin 9 → 500µs pulse
🔧 [servo-sg90-xxx] SIGNAL HIGH at ...
🔧 [servo-sg90-xxx] SIGNAL LOW - Pulse width: 500μs
🔧 [servo-sg90-xxx] Target: 0.0° (pulse: 500μs)
📢 Notifying 3 listener(s): servo-sg90-xxx → 0°
🎯 Servo angle changed: servo-sg90-xxx → 0°
🦾 UI updating servo servo-sg90-xxx → 0°
✅ Exited delay loop (25 unique PCs now)

⏩ Delay loop detected! Only 3 unique PCs in last 100 steps
🎛️ Timer1 OVERFLOW! OCR1A=4000 → 2000µs pulse on Pin 9
🌊 PWM Router: Pin 9 → 2000µs pulse
🔧 [servo-sg90-xxx] SIGNAL HIGH at ...
🔧 [servo-sg90-xxx] SIGNAL LOW - Pulse width: 2000μs
🔧 [servo-sg90-xxx] Target: 180.0° (pulse: 2000μs)
📢 Notifying 3 listener(s): servo-sg90-xxx → 180°
🎯 Servo angle changed: servo-sg90-xxx → 180°
🦾 UI updating servo servo-sg90-xxx → 180°
✅ Exited delay loop (25 unique PCs now)
```

---

## 🧪 Test Checklist

- [ ] See "✅ Delay fast-forward enabled" on page load
- [ ] Upload test code (exact code from Step 2)
- [ ] See "⏩ Delay loop detected" messages
- [ ] See OCR1A changing (1000 → 4000 → 1000)
- [ ] Servo moves smoothly 0° → 180° → 0°
- [ ] No duplicate movements
- [ ] Delays work (~0.1s, not 2s)

---

## 🚨 If Still Not Working

### **Nuclear Option: Delete Vite Cache**

1. **Stop dev server** (Ctrl+C in terminal)

2. **Delete cache:**
   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   ```

3. **Restart:**
   ```powershell
   npm run dev
   ```

4. **Open incognito window**

5. **Test again**

---

## 📝 Share These Logs

If still having issues, share:

1. **Startup logs** (first 10 lines in console)
2. **After upload logs** (next 50 lines)
3. **OCR1A values** (what numbers do you see?)
4. **Delay detection** (do you see "⏩" messages?)
5. **Arduino code** (what code did you upload?)

---

**Follow this guide step-by-step and report which step fails!** 🎯

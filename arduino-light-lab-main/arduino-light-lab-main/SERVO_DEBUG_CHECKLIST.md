# 🔍 SERVO DEBUGGING CHECKLIST

## **What to check in the browser console:**

### ✅ **1. Timer0 Interrupts (CRITICAL)**
Look for:
```
⚡ Timer0 overflow #1 - TOV0 flag set
⚡ Timer0 overflow #2 - TOV0 flag set
⚡ Timer0 overflow #3 - TOV0 flag set
```

**If you DON'T see this:**
- ❌ Timer0 is not working
- ❌ `delay()` will hang forever
- ❌ Sketch will be stuck

**If you DO see this:**
- ✅ Timer0 is working
- ✅ `delay()` should work
- ✅ Sketch should progress

---

### ✅ **2. Interrupt Status**
Look for:
```
🔍 Step 1000000: PC=0x2a4, INT=true, TIFR0=0x1
```

**Check these values:**
- `INT=true` → Interrupts enabled ✅
- `INT=false` → Interrupts disabled, stuck in init ❌
- `TIFR0=0x1` → Timer0 overflow flag set ✅
- `TIFR0=0x0` → No Timer0 activity ❌

---

### ✅ **3. Timer1 Initialization**
Look for:
```
⏱️ Timer1 ICR1 changed: 40000 (Expected 40000 for 50Hz servo mode)
```

**If you DON'T see this:**
- ❌ Servo library hasn't initialized Timer1
- ❌ Sketch is stuck before `myServo.attach(9)`

**If you DO see this:**
- ✅ Servo library initialized Timer1
- ✅ Servo is ready

---

### ✅ **4. Servo Commands**
Look for:
```
🦾 Timer1: OCR1A=3000 → 1500µs (Pin 9)
🦾 Servo angle changed: 90°
```

**If you DON'T see this:**
- ❌ Servo library hasn't sent commands
- ❌ Sketch is stuck before `myServo.write()`

**If you DO see this:**
- ✅ Servo is receiving commands
- ✅ Servo should be moving!

---

## **TROUBLESHOOTING:**

### **Problem: No Timer0 overflow messages**

**Cause:** Browser cache hasn't been cleared

**Fix:**
1. Press `Ctrl + Shift + R` (hard reload)
2. Or press `F12` → Network tab → Check "Disable cache"
3. Refresh page

---

### **Problem: Timer0 overflows but no Timer1 initialization**

**Cause:** Wrong sketch uploaded (blink sketch instead of servo sketch)

**Fix:**
1. Compile the servo sketch:
   ```bash
   cd "C:\Users\tharu\OneDrive\Desktop\arduino-light-lab-main"
   arduino-cli compile --fqbn arduino:avr:uno test.ino
   ```
2. Upload the `.hex` file from `test.ino\build\arduino.avr.uno\`
3. Restart simulation

---

### **Problem: Timer1 initialized but no servo commands**

**Cause:** Sketch stuck in `delay()` after `setup()`

**Fix:**
1. Check if `INT=true` in console
2. If `INT=false`, interrupts are disabled
3. This means the sketch is stuck in Arduino init code
4. Try uploading a simpler sketch

---

## **EXPECTED FULL CONSOLE OUTPUT:**

```
⚡ Timer0 overflow #1 - TOV0 flag set
⚡ Timer0 overflow #2 - TOV0 flag set
⚡ Timer0 overflow #3 - TOV0 flag set
⚡ Timer0 overflow #4 - TOV0 flag set
⚡ Timer0 overflow #5 - TOV0 flag set
🔍 Step 1000000: PC=0x2a4, INT=true, TIFR0=0x1
⏱️ Timer1 ICR1 changed: 40000 (Expected 40000 for 50Hz servo mode)
🦾 Timer1: OCR1A=3000 → 1500µs (Pin 9)
🦾 Servo angle changed: 90°
🦾 Timer1: OCR1A=6000 → 3000µs (Pin 9)
🦾 Servo angle changed: 180°
```

---

## **WHAT TO DO NOW:**

1. **Hard reload browser** (`Ctrl + Shift + R`)
2. **Check console** for the messages above
3. **Copy and paste** what you see in console
4. **Tell me** which messages you see and which you don't

This will help me identify exactly where the problem is! 🔍

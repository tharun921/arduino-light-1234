# 🧪 TESTING GUIDE - Timer0 + Interrupts

## ✅ QUICK TEST CHECKLIST

### 1. Start Development Server
```bash
npm run dev
```
**Expected:** Server starts on http://localhost:5173/

### 2. Open Browser Console
- Open http://localhost:5173/
- Press F12 to open DevTools
- Go to Console tab

### 3. Upload Servo Test Code

Use this test sketch:
```cpp
#include <Servo.h>

Servo myservo;

void setup() {
    Serial.begin(9600);
    Serial.println("Starting servo test...");
    
    myservo.attach(9);
    Serial.println("Servo attached!");
    
    myservo.write(90);
    Serial.println("Servo set to 90 degrees");
}

void loop() {
    delay(1000);
    Serial.println("Loop running...");
}
```

### 4. Check Console Logs

**Look for these SUCCESS indicators:**

✅ **Timer0 Initialization:**
```
🔥 Timer0Emulator: Initialized (THIS MAKES SERVO WORK!)
```

✅ **Interrupt Controller:**
```
🔥 InterruptController: Initialized
✅ Arduino ISRs registered (millis/delay support)
```

✅ **Global Interrupts Enabled:**
```
✅ Global interrupts ENABLED
```

✅ **Servo Initialization:**
```
🔧 TCCR1B changed: 0x0 → 0x2
🔧 ICR1 changed: 0 → 40000
🔧 OCR1A changed: 0 → 1500
```

✅ **PWM Generation:**
```
🎛️ Timer1 OCR1A changed: 1500 (ICR1=40000) → 1500μs PWM on Pin 9
```

### 5. Visual Verification

**Servo Component:**
- Should be visible on canvas
- Should rotate to 90° position
- Should NOT be stuck at 0°

## 🔍 DETAILED TESTS

### Test 1: delay() Function

**Code:**
```cpp
void setup() {
    Serial.begin(9600);
    Serial.println("Before delay");
    delay(1000);
    Serial.println("After delay");
}

void loop() {}
```

**Expected Console:**
```
Before delay
[1 second pause]
After delay
```

**FAIL if:** "After delay" never appears (delay() hung)

---

### Test 2: millis() Function

**Code:**
```cpp
void setup() {
    Serial.begin(9600);
}

void loop() {
    Serial.print("millis: ");
    Serial.println(millis());
    delay(1000);
}
```

**Expected Console:**
```
millis: 0
millis: 1000
millis: 2000
millis: 3000
...
```

**FAIL if:** millis() always returns 0

---

### Test 3: Servo Sweep

**Code:**
```cpp
#include <Servo.h>

Servo myservo;
int pos = 0;

void setup() {
    myservo.attach(9);
}

void loop() {
    for (pos = 0; pos <= 180; pos += 1) {
        myservo.write(pos);
        delay(15);
    }
    for (pos = 180; pos >= 0; pos -= 1) {
        myservo.write(pos);
        delay(15);
    }
}
```

**Expected:**
- Servo sweeps from 0° to 180°
- Smooth motion
- No stuttering
- Continuous loop

**FAIL if:** 
- Servo doesn't move
- Servo stuck at one position
- delay() hangs

---

### Test 4: Multiple Servos

**Code:**
```cpp
#include <Servo.h>

Servo servo1;
Servo servo2;

void setup() {
    servo1.attach(9);   // Pin 9 (OCR1A)
    servo2.attach(10);  // Pin 10 (OCR1B)
    
    servo1.write(45);
    servo2.write(135);
}

void loop() {
    delay(1000);
}
```

**Expected:**
- Both servos initialize
- servo1 at 45°
- servo2 at 135°
- Both hold position

**Console should show:**
```
🔧 OCR1A changed: 0 → 750
🔧 OCR1B changed: 0 → 2250
```

---

### Test 5: Timing Accuracy

**Code:**
```cpp
void setup() {
    Serial.begin(9600);
}

void loop() {
    unsigned long start = millis();
    delay(1000);
    unsigned long elapsed = millis() - start;
    
    Serial.print("Expected: 1000ms, Actual: ");
    Serial.print(elapsed);
    Serial.println("ms");
}
```

**Expected:**
```
Expected: 1000ms, Actual: 1000ms
Expected: 1000ms, Actual: 1000ms
Expected: 1000ms, Actual: 1000ms
```

**Acceptable:** ±10ms variance
**FAIL if:** Actual is 0ms or wildly different

---

## 🐛 TROUBLESHOOTING

### Issue: "delay() hangs forever"

**Check:**
1. Timer0Emulator initialized?
   ```
   🔥 Timer0Emulator: Initialized
   ```
2. Interrupts enabled?
   ```
   ✅ Global interrupts ENABLED
   ```
3. Timer0 ticking?
   - Add debug log in Timer0Emulator.tick()

**Fix:** Ensure syncTimer0Registers() is called in step()

---

### Issue: "millis() always returns 0"

**Check:**
1. Timer0 overflow interrupt registered?
   ```
   ✅ Arduino ISRs registered
   ```
2. ISR executing?
   - Add debug log in ISR handler

**Fix:** Ensure executePendingInterrupts() is called

---

### Issue: "Servo doesn't move"

**Check:**
1. Timer1 registers written?
   ```
   🔧 TCCR1B changed
   🔧 ICR1 changed
   🔧 OCR1A changed
   ```
2. delay(1) completed?
   - If not, Timer0 issue
3. PWM generated?
   ```
   🎛️ Timer1 OCR1A changed
   ```

**Fix:** 
- If Timer1 registers not written → Timer0/delay issue
- If registers written but no PWM → Timer1 issue

---

### Issue: "Compilation errors"

**Check:**
1. All imports present?
   ```typescript
   import { Timer0Emulator } from './Timer0Emulator';
   import { InterruptController } from './InterruptController';
   ```
2. TypeScript errors?
   - Run: `npm run build`

**Fix:** Check IMPLEMENTATION_SUMMARY.md for file list

---

## 📊 PERFORMANCE METRICS

### Expected Performance:

| Metric | Target | Acceptable |
|--------|--------|------------|
| delay(1000) accuracy | 1000ms | 990-1010ms |
| millis() increment | 1ms/ms | ±1% |
| Servo response time | <20ms | <50ms |
| CPU cycles/second | 16M | 15-17M |
| Frame rate | 60 FPS | >30 FPS |

### Measuring Performance:

```cpp
void setup() {
    Serial.begin(9600);
    unsigned long start = micros();
    
    // Do 1000 iterations
    for (int i = 0; i < 1000; i++) {
        delay(1);
    }
    
    unsigned long elapsed = micros() - start;
    Serial.print("1000 x delay(1) took: ");
    Serial.print(elapsed);
    Serial.println(" microseconds");
    Serial.print("Expected: ~1,000,000 us");
}

void loop() {}
```

**Expected output:**
```
1000 x delay(1) took: 1000000 microseconds
Expected: ~1,000,000 us
```

---

## ✅ SUCCESS CRITERIA

**ALL of these must pass:**

- [ ] Timer0Emulator initializes
- [ ] InterruptController initializes
- [ ] Global interrupts enabled
- [ ] delay() completes (not infinite loop)
- [ ] millis() increments correctly
- [ ] Servo.attach() completes
- [ ] Servo.write() generates PWM
- [ ] Servo visually moves on canvas
- [ ] No console errors
- [ ] No infinite loops

---

## 🎯 FINAL VERIFICATION

Run this comprehensive test:

```cpp
#include <Servo.h>

Servo myservo;
unsigned long lastPrint = 0;

void setup() {
    Serial.begin(9600);
    Serial.println("=== COMPREHENSIVE TEST ===");
    
    // Test 1: delay()
    Serial.println("Test 1: delay()");
    unsigned long start = millis();
    delay(100);
    unsigned long elapsed = millis() - start;
    Serial.print("  delay(100) took: ");
    Serial.print(elapsed);
    Serial.println("ms");
    
    // Test 2: millis()
    Serial.println("Test 2: millis()");
    Serial.print("  Current millis: ");
    Serial.println(millis());
    
    // Test 3: Servo
    Serial.println("Test 3: Servo");
    myservo.attach(9);
    Serial.println("  Servo attached");
    myservo.write(90);
    Serial.println("  Servo set to 90°");
    
    Serial.println("=== ALL TESTS COMPLETE ===");
}

void loop() {
    // Print millis every second
    if (millis() - lastPrint >= 1000) {
        lastPrint = millis();
        Serial.print("Loop running, millis: ");
        Serial.println(millis());
    }
}
```

**Expected output:**
```
=== COMPREHENSIVE TEST ===
Test 1: delay()
  delay(100) took: 100ms
Test 2: millis()
  Current millis: 100
Test 3: Servo
  Servo attached
  Servo set to 90°
=== ALL TESTS COMPLETE ===
Loop running, millis: 1100
Loop running, millis: 2100
Loop running, millis: 3100
...
```

---

## 🏆 RESULT

If all tests pass:
**✅ TIMER0 + INTERRUPTS WORKING PERFECTLY!**

If any test fails:
**❌ Check TROUBLESHOOTING section above**

---

**Testing Guide Version:** 1.0
**Date:** 2025-12-25
**Status:** Ready for testing

# 🧠 WOKWI SERVO PIPELINE - COMPLETE EXPLANATION

## 🎯 BIG IDEA (VERY IMPORTANT)

**Servo is NOT detected from PORTB / PORTD**  
**Servo is detected from TIMER1 REGISTERS**

That is the key difference.

---

## 🧩 STEP-BY-STEP: WOKWI SERVO PIPELINE

### 🟢 STEP 1: Arduino code runs

Example sketch:

```cpp
#include <Servo.h>
Servo s;

void setup() {
  s.attach(9);
  s.write(90);
}
```

---

### 🟢 STEP 2: Servo library configures Timer1

Inside Arduino Servo library (important):

- Uses **Timer1**
- Sets:
  - `ICR1 = 40000` → defines 50Hz (20ms period)
  - `OCR1A` or `OCR1B` → pulse width

Example:
```cpp
OCR1A = 3000;  // ≈ 1500µs → 90°
```

⚠️ **NO pin toggling**  
⚠️ **NO digitalWrite**  
⚠️ **NO PORT changes**

---

### 🟢 STEP 3: avr8js executes instructions

avr8js:
- Executes real AVR instructions
- Updates registers:
  - `ICR1`
  - `OCR1A`
  - `OCR1B`
- Nothing visual yet.

---

### 🟢 STEP 4: Wokwi OBSERVES Timer1 (IMPORTANT)

**Wokwi does NOT generate PWM**

Instead it **observes registers**:

```javascript
if (ICR1 === 40000) {
  pulseWidth = (OCR1 / ICR1) * 20000;
}
```

✔️ This is exactly what we are doing now 👍  
✔️ This part is **correct** in our wrapper.

---

### 🟢 STEP 5: Convert pulse → angle

Wokwi converts pulse width:

| Pulse (µs) | Angle |
|------------|-------|
| 1000       | 0°    |
| 1500       | 90°   |
| 2000       | 180°  |

Formula:
```javascript
angle = (pulseWidth - 1000) * 180 / 1000;
```

✔️ We already implemented this correctly.

---

### 🟢 STEP 6: ServoEngine stores angle

Wokwi keeps servo state:

```javascript
servo.angle = 90;
```

This value is **NOT electrical**  
It is **pure simulation data**

---

### 🟢 STEP 7: SVG animation reads angle

This is the **MOST IMPORTANT PART**.

---

## 🎨 HOW SERVO SVG ANIMATION WORKS

**SVG is not alive by itself**  
It moves only when JavaScript changes it

### 🟢 STEP 7A: SVG structure

Your SVG contains:
- Base body
- Rotating horn element (with ID)

### 🟢 STEP 7B: JavaScript rotates SVG

Wokwi does something like:

```javascript
const angle = servoEngine.getAngle("servo_pin9");

hornElement.setAttribute(
  "transform",
  `rotate(${angle} 60 47)`
);
```

📌 `60 47` = center of rotation (servo shaft)

### 🟢 STEP 7C: Browser redraws SVG

That's it.

✔️ No PWM  
✔️ No physics  
✔️ No interrupts

Just:
```
Timer1 → angle → SVG rotation
```

---

## 🔴 LCD CONFUSION (RESOLVED)

### ❓ Why LCD logs appear even without LCD code?

Because we were logging port states unconditionally:

```typescript
console.log(`📺 LCD: RS=${lcdRS} EN=${lcdEN} ...`);
```

**Reality:**
- Arduino did NOT touch LCD
- Pins stay LOW
- We are just printing them

So this log means:
> ✅ Pins are LOW

❌ NOT:
> LCD is active

---

## ✅ WHY WOKWI DOES NOT CONFUSE USERS

Wokwi:
- Logs LCD **only if LCD component exists**
- Otherwise stays silent

---

## ✅ WHAT WE DID (FINAL FIX)

### ✔️ Fix: Rename log (quick)

Changed:
```typescript
📺 LCD:
```

To:
```typescript
📊 PORT MONITOR (LCD pins):
```

This makes it clear we're just monitoring port states, not that LCD is actually being used.

---

## 🧠 FINAL MENTAL MODEL (REMEMBER THIS)

### SERVO:
```
Arduino → Timer1 → OCR → Angle → SVG rotate
```

### LCD:
```
Arduino → digitalWrite → PORT → LCD engine
```

**They are completely different paths.**

---

## 📝 IMPLEMENTATION CHECKLIST

- [x] Observe Timer1 registers (ICR1, OCR1A, OCR1B)
- [x] Detect servo initialization (ICR1 = 40000)
- [x] Convert OCR values to pulse width
- [x] Convert pulse width to angle
- [x] Store angle in ServoEngine
- [x] Update SVG rotation based on angle
- [x] Rename misleading LCD logs to PORT MONITOR

---

## 🎯 KEY TAKEAWAYS

1. **Servo detection**: Watch Timer1 registers, NOT port pins
2. **No PWM generation**: Just observe and calculate angles
3. **SVG animation**: Direct rotation via JavaScript, no physics
4. **Port monitoring**: Separate from component activity
5. **Wokwi approach**: Observe, don't manipulate

---

**Status**: ✅ Implementation complete and aligned with Wokwi approach

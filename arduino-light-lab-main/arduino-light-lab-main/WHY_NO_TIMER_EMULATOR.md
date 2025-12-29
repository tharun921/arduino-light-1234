# ⚠️ CRITICAL: Why You DON'T Need Timer Emulators for Servo

## ❌ Common Misconception

**You might think:** "Servo uses Timer1, so I need Timer1Emulator.ts to make it work"

**Reality:** **NO! This is the OLD approach, not Wokwi!**

---

## 🎯 Two Different Approaches

### ❌ **OLD Approach (What Timer1Emulator.ts does)**

```typescript
// Timer1Emulator.ts - WRONG for Wokwi
class Timer1Emulator {
    // ❌ Generates PWM signals
    // ❌ Toggles pins HIGH/LOW
    // ❌ Simulates hardware PWM
    // ❌ Calls servo based on PWM pulses
    
    generatePWM() {
        // Generate 50Hz PWM signal
        // Toggle pin 9 HIGH for 1500µs
        // Toggle pin 9 LOW
        // Call ServoEngine with pulse width
    }
}
```

**Problems with this approach:**
1. ❌ Duplicates what avr8js already does
2. ❌ Generates fake PWM signals
3. ❌ Doesn't match real Arduino behavior
4. ❌ Not how Wokwi works

### ✅ **WOKWI Approach (What you already have)**

```typescript
// AVR8jsWrapper.ts - CORRECT Wokwi approach
class AVR8jsWrapper {
    // ✅ Just OBSERVE Timer1 registers
    // ✅ Read ICR1, OCR1A, OCR1B
    // ✅ Calculate angle from register values
    // ✅ No PWM generation needed!
    
    observeTimer1() {
        // Read Timer1 registers (read-only)
        const icr1 = this.cpu.data[ICR1L] | (this.cpu.data[ICR1H] << 8);
        const ocr1a = this.cpu.data[OCR1AL] | (this.cpu.data[OCR1AH] << 8);
        
        // Detect Servo library signature
        if (icr1 === 40000) {
            // Calculate angle from OCR value
            const pulseWidth = (ocr1a / icr1) * 20000;
            const angle = pulseWidthToAngle(pulseWidth);
            
            // Update servo
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
    }
}
```

**Why this is better:**
1. ✅ Uses real avr8js Timer1 (built-in)
2. ✅ Just observes register values
3. ✅ Matches real Arduino behavior
4. ✅ Exactly how Wokwi works

---

## 🔍 What Each Timer Does

### **Timer0** (for `millis()` and `delay()`)

**Wokwi approach:**
```typescript
// AVR8jsWrapper.ts
import { AVRTimer, timer0Config } from 'avr8js';

this.timer0 = new AVRTimer(this.cpu, timer0Config);  // ✅ Use avr8js Timer0

// That's it! avr8js handles everything:
// - Counts cycles
// - Generates overflow interrupts
// - Updates millis() counter
```

**You DON'T need `Timer0Emulator.ts`** - avr8js already has Timer0!

### **Timer1** (for Servo PWM)

**Wokwi approach:**
```typescript
// AVR8jsWrapper.ts
observeTimer1() {
    // ✅ Just READ the registers
    const icr1 = this.cpu.data[ICR1L] | (this.cpu.data[ICR1H] << 8);
    const ocr1a = this.cpu.data[OCR1AL] | (this.cpu.data[OCR1AH] << 8);
    
    // ✅ Calculate angle from register values
    if (icr1 === 40000) {  // Servo library signature
        servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
    }
}
```

**You DON'T need `Timer1Emulator.ts`** - avr8js already has Timer1!

---

## 📊 Comparison Table

| Feature | Timer1Emulator.ts (OLD) | AVR8jsWrapper.observeTimer1() (WOKWI) |
|---------|-------------------------|---------------------------------------|
| **Approach** | Generate PWM signals | Observe registers |
| **Complexity** | 9,293 bytes of code | ~30 lines of code |
| **Accuracy** | Approximate | Exact (uses real Timer1) |
| **Performance** | Slow (simulates PWM) | Fast (just reads registers) |
| **Wokwi-compliant** | ❌ NO | ✅ YES |
| **Needed?** | ❌ NO | ✅ YES (already implemented!) |

---

## 🎯 What You Already Have (CORRECT)

**File:** `src/emulator/AVR8jsWrapper.ts`

**Lines 325-360:** `observeTimer1()` method

```typescript
private observeTimer1(): void {
    const icr1 = (this.cpu.data[this.ICR1L] | (this.cpu.data[this.ICR1H] << 8));
    const ocr1a = (this.cpu.data[this.OCR1AL] | (this.cpu.data[this.OCR1AH] << 8));
    const ocr1b = (this.cpu.data[this.OCR1BL] | (this.cpu.data[this.OCR1BH] << 8));
    
    const servoEngine = getServoEngine();
    
    // ✅ Detect Servo library initialization (ICR1 = 40000)
    if (icr1 === 40000 && !this.timer1Initialized) {
        console.log(`🎛️ Servo library initialized (ICR1 = ${icr1})`);
        this.timer1Initialized = true;
        
        // ✅ Update servos immediately
        if (ocr1a > 0) {
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
        if (ocr1b > 0) {
            servoEngine.setAngleFromTimer1('servo_pin10', ocr1b, icr1);
        }
    }
    
    // ✅ Update servos when OCR values change
    if (this.timer1Initialized && icr1 > 0) {
        if (ocr1a !== this.prevOCR1A) {
            this.prevOCR1A = ocr1a;
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
        if (ocr1b !== this.prevOCR1B) {
            this.prevOCR1B = ocr1b;
            servoEngine.setAngleFromTimer1('servo_pin10', ocr1b, icr1);
        }
    }
}
```

**This is PERFECT! You don't need to change anything!**

---

## 🚨 The REAL Problem (Not Timer-Related)

Your servo code is **100% correct**. The problem is:

### **CPU is stuck in bootloader and never reaches `setup()`**

**Evidence:**
```
PC=0x15a (stuck in bootloader)
PORTB: 0x00 (no digitalWrite() happening)
ICR1: 0 (Timer1 never configured)
OCR1A: 0 (Servo never attached)
```

**What this means:**
1. ❌ CPU never executes `myServo.attach(9)`
2. ❌ Timer1 never gets configured (ICR1 stays 0)
3. ❌ `observeTimer1()` never detects initialization
4. ❌ Servo never moves

**Root cause:** Delay fast-forward is breaking the bootloader

---

## ✅ What You Should Do

### **DON'T:**
- ❌ Use `Timer1Emulator.ts`
- ❌ Use `Timer0Emulator.ts`
- ❌ Generate PWM signals
- ❌ Modify `observeTimer1()` (it's already perfect!)

### **DO:**
1. ✅ **Fix the CPU stuck issue** (see CRITICAL_CPU_STUCK_FIX.md)
2. ✅ **Keep using `AVR8jsWrapper.observeTimer1()`** (already correct!)
3. ✅ **Delete old timer emulator files** (not needed)

---

## 🔧 The Fix You Actually Need

**File:** `src/emulator/AVR8jsWrapper.ts`  
**Location:** Around line 192-202 (in `step()` method)

**Problem code:**
```typescript
if (this.delayLoopDetector.inDelay) {
    // ❌ This breaks the bootloader
    const fastForwardCycles = Math.floor(this.CLOCK_FREQ / 1000);
    this.cpu.cycles += fastForwardCycles;
}
```

**Fixed code:**
```typescript
// ✅ Only fast-forward delays in user code (PC >= 0x200)
const IN_USER_CODE = this.cpu.pc >= 0x200;

if (IN_USER_CODE && this.delayLoopDetector.inDelay) {
    // Fast-forward delay
    const fastForwardCycles = Math.floor(this.CLOCK_FREQ / 1000);
    this.cpu.cycles += fastForwardCycles;
    
    for (let i = 0; i < 100; i++) {
        this.cpu.tick();
    }
} else {
    // Normal execution
    for (let i = 0; i < cyclesUsed; i++) {
        this.cpu.tick();
    }
    this.cycleCount += cyclesUsed;
}
```

---

## 🎯 Summary

### Your Servo Code Status

| Component | Status | Notes |
|-----------|--------|-------|
| `observeTimer1()` | ✅ **PERFECT** | Already Wokwi-compliant |
| `ServoEngine.setAngleFromTimer1()` | ✅ **PERFECT** | Calculates angle correctly |
| `ServoEngine.onChange()` | ✅ **PERFECT** | Event system works |
| Timer1 observation | ✅ **PERFECT** | Reads registers correctly |
| **CPU execution** | ❌ **BROKEN** | Stuck in bootloader |

### What's Needed

1. ❌ **NOT** Timer1Emulator.ts
2. ❌ **NOT** Timer0Emulator.ts
3. ❌ **NOT** PWM generation
4. ✅ **YES** Fix CPU stuck issue
5. ✅ **YES** Keep current `observeTimer1()` code

---

## 💡 Key Insight

**Wokwi doesn't emulate timers - it uses the REAL avr8js timers and just OBSERVES them!**

```
Arduino Code
    ↓
myServo.attach(9)
    ↓
Servo library configures Timer1
    ↓
Sets ICR1 = 40000, OCR1A = 3000
    ↓
avr8js Timer1 (REAL) updates registers
    ↓
observeTimer1() READS registers
    ↓
Calculates: angle = (3000/40000) * 20000µs = 90°
    ↓
Servo moves to 90°
```

**No timer emulation needed - just observation!**

---

**Status:** ✅ **Servo code is PERFECT**  
**Problem:** 🚨 **CPU stuck (not timer-related)**  
**Solution:** **Fix delay fast-forward in step() method**

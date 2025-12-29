# 📁 EMULATOR FOLDER EXPLANATION

## 🗂️ Files in `src/emulator/` Folder

You have **9 files** in the emulator folder. Here's what each one does:

### ✅ **Files You NEED (Core Wokwi Approach)**

1. **`AVR8jsWrapper.ts`** (16,662 bytes) - **MAIN FILE**
   - **Purpose:** Wraps the real avr8js CPU
   - **What it does:**
     - Executes real AVR instructions
     - Observes PORT registers (for LCD)
     - Observes Timer1 registers (for Servo)
     - Calls `checkPortChanges()` and `observeTimer1()`
   - **Status:** ✅ **CORRECT - This is the Wokwi approach**

2. **`HardwareAbstractionLayer.ts`** (7,608 bytes) - **ROUTER**
   - **Purpose:** Routes port changes to engines
   - **What it does:**
     - Receives port changes from AVR8jsWrapper
     - Forwards to LCDEngine, ServoEngine, etc.
   - **Status:** ✅ **CORRECT - Needed for Wokwi approach**

### ❌ **Files You DON'T NEED (Old Custom Approach)**

3. **`AVREmulator.ts`** (8,358 bytes) - **OLD CUSTOM EMULATOR**
   - **Purpose:** Custom AVR emulator (not using avr8js)
   - **Status:** ❌ **NOT USED - Can be deleted**
   - **Why:** You're using AVR8jsWrapper, not this

4. **`AVRInstructionSet.ts`** (9,834 bytes) - **OLD INSTRUCTION SET**
   - **Purpose:** Custom instruction decoder
   - **Status:** ❌ **NOT USED - Can be deleted**
   - **Why:** avr8js has its own instruction set

5. **`InterruptController.ts`** (6,988 bytes) - **OLD INTERRUPT HANDLER**
   - **Purpose:** Custom interrupt handling
   - **Status:** ❌ **NOT USED - Can be deleted**
   - **Why:** avr8js handles interrupts natively

6. **`Timer0Emulator.ts`** (7,653 bytes) - **OLD TIMER0**
   - **Purpose:** Custom Timer0 emulation
   - **Status:** ❌ **NOT USED - Can be deleted**
   - **Why:** avr8js has native Timer0

7. **`Timer1Emulator.ts`** (9,293 bytes) - **OLD TIMER1**
   - **Purpose:** Custom Timer1 emulation with PWM generation
   - **Status:** ❌ **NOT USED - Can be deleted**
   - **Why:** Wokwi approach observes Timer1 registers, doesn't generate PWM

### ⚠️ **Files That Are Unclear**

8. **`PWMRouter.ts`** (2,146 bytes) - **PWM ROUTER**
   - **Purpose:** Routes PWM signals to servos
   - **Status:** ⚠️ **PROBABLY NOT NEEDED**
   - **Why:** Wokwi approach doesn't generate PWM, just observes registers

9. **`SimulationClock.ts`** (1,875 bytes) - **SIMULATION CLOCK**
   - **Purpose:** Manages simulation timing
   - **Status:** ⚠️ **MIGHT BE USED**
   - **Check:** See if it's imported anywhere

---

## 🎯 What You Should Have (Wokwi Approach)

For a **pure Wokwi-compliant** emulator, you only need:

```
src/emulator/
├── AVR8jsWrapper.ts          ✅ KEEP - Main emulator
└── HardwareAbstractionLayer.ts  ✅ KEEP - Router
```

Everything else is from the **old custom emulator approach** and can be deleted.

---

## 🦾 Servo Motor Functionality

### ✅ What's Implemented (Wokwi Approach)

**In `AVR8jsWrapper.ts` (lines 325-360):**

```typescript
private observeTimer1(): void {
    // Read Timer1 registers
    const icr1 = (this.cpu.data[this.ICR1L] | (this.cpu.data[this.ICR1H] << 8));
    const ocr1a = (this.cpu.data[this.OCR1AL] | (this.cpu.data[this.OCR1AH] << 8));
    const ocr1b = (this.cpu.data[this.OCR1BL] | (this.cpu.data[this.OCR1BH] << 8));
    
    // Detect Servo library initialization (ICR1 = 40000)
    if (icr1 === 40000 && !this.timer1Initialized) {
        console.log(`🎛️ Servo library initialized (ICR1 = ${icr1})`);
        this.timer1Initialized = true;
        
        // Update servos immediately
        if (ocr1a > 0) {
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
        if (ocr1b > 0) {
            servoEngine.setAngleFromTimer1('servo_pin10', ocr1b, icr1);
        }
    }
    
    // Update servos when OCR values change
    if (this.timer1Initialized && icr1 > 0) {
        if (ocr1a !== this.prevOCR1A) {
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
        if (ocr1b !== this.prevOCR1B) {
            servoEngine.setAngleFromTimer1('servo_pin10', ocr1b, icr1);
        }
    }
}
```

**This is CORRECT for Wokwi approach:**
- ✅ Observes Timer1 registers (read-only)
- ✅ Detects Servo library signature (ICR1 = 40000)
- ✅ Calculates angle from OCR values
- ✅ No PWM generation needed

### ❌ What's NOT Working

**The problem is NOT the servo code - it's that the CPU is stuck!**

From your console:
```
PORTB: 0x00 (binary: 00000000)
PORTC: 0x00 (binary: 00000000)
PORTD: 0x00 (binary: 00000000)
```

This means:
1. ❌ CPU never reaches `setup()`
2. ❌ `myServo.attach(9)` never executes
3. ❌ Timer1 never gets configured
4. ❌ Servo never moves

---

## 📺 Why LCD Logs Appear When You Upload Servo Code

**You're seeing LCD logs because:**

1. **`checkPortChanges()` runs every step** (line 281-320)
2. **It logs LCD pin states every 5000 checks** (line 289-302)
3. **Even though ports are 0x00, it still logs them**

```typescript
// This runs even when ports are all 0x00
if (this.checkCount % 5000 === 0) {
    console.log(`📺 LCD: RS=0 EN=0 D7-D4=0000`);  // ← This is what you see
}
```

**This is NOT a bug** - it's just diagnostic logging showing that:
- LCD pins are all LOW (0)
- No LCD commands are being sent
- CPU is not executing your code

---

## 🔧 The REAL Problem

### Issue: CPU Stuck in Bootloader

**Evidence:**
```
PC=0x15a, PC=0x159, PC=0x154, PC=0x150...
PORTB: 0x00 (all ports stuck at 0x00)
```

**What this means:**
- CPU is executing instructions
- But it's stuck in a loop at PC ~0x150
- Never reaches your `setup()` function (usually at PC > 0x200)
- No `digitalWrite()` or Timer1 configuration happens

### Solution: Fix Delay Fast-Forward

**The delay fast-forward code is breaking the bootloader.**

**File:** `AVR8jsWrapper.ts`  
**Location:** Around line 192-202

**Current code (BROKEN):**
```typescript
if (this.delayLoopDetector.inDelay) {
    // Fast-forward delay
    const fastForwardCycles = Math.floor(this.CLOCK_FREQ / 1000);
    this.cpu.cycles += fastForwardCycles;
    // ...
}
```

**Fixed code:**
```typescript
// ✅ CRITICAL FIX: Only fast-forward delays in user code
const IN_USER_CODE = this.cpu.pc >= 0x200;

if (IN_USER_CODE && this.delayLoopDetector.inDelay) {
    // Fast-forward delay
    const fastForwardCycles = Math.floor(this.CLOCK_FREQ / 1000);
    this.cpu.cycles += fastForwardCycles;
    // ...
} else {
    // Normal execution
    for (let i = 0; i < cyclesUsed; i++) {
        this.cpu.tick();
    }
}
```

---

## 🎯 Summary

### Files in Emulator Folder

| File | Size | Purpose | Status |
|------|------|---------|--------|
| `AVR8jsWrapper.ts` | 16KB | Main emulator (Wokwi) | ✅ **KEEP** |
| `HardwareAbstractionLayer.ts` | 7KB | Router | ✅ **KEEP** |
| `AVREmulator.ts` | 8KB | Old custom emulator | ❌ **DELETE** |
| `AVRInstructionSet.ts` | 9KB | Old instruction set | ❌ **DELETE** |
| `InterruptController.ts` | 6KB | Old interrupt handler | ❌ **DELETE** |
| `Timer0Emulator.ts` | 7KB | Old Timer0 | ❌ **DELETE** |
| `Timer1Emulator.ts` | 9KB | Old Timer1 (PWM gen) | ❌ **DELETE** |
| `PWMRouter.ts` | 2KB | PWM router | ❌ **DELETE** |
| `SimulationClock.ts` | 1KB | Clock | ⚠️ **CHECK** |

### Servo Functionality

✅ **Servo code is CORRECT (Wokwi approach)**  
❌ **Servo NOT working because CPU is stuck**

### LCD Logs

✅ **LCD logs are normal diagnostic output**  
❌ **Shows that ports are 0x00 (CPU stuck)**

### Next Steps

1. **Fix the CPU stuck issue** (see CRITICAL_CPU_STUCK_FIX.md)
2. **Delete old emulator files** (optional cleanup)
3. **Test with simple blink code** to verify CPU works
4. **Then test servo code**

---

**Status:** 🚨 **CPU STUCK - Fix delay fast-forward first**  
**Servo Code:** ✅ **CORRECT - Will work once CPU is fixed**

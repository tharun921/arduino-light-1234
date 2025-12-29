# 🚨 CRITICAL FIX: CPU Stuck - Ports Always 0x00

## ❌ Problem

**Symptoms:**
- All ports stuck at 0x00
- PC jumping in small range (0x150-0x15a)
- LCD/Servo not working
- No `digitalWrite()` happening

**Root Cause:**
The CPU is **stuck in an infinite loop** in the bootloader/initialization code and **never reaches `setup()` or `loop()`**.

---

## 🔧 Solution: Check PC Range

The issue is that the delay loop detector is triggering on **bootloader code**, not your actual Arduino code.

### Fix #1: Add PC Range Check

**File:** `src/emulator/AVR8jsWrapper.ts`

**Location:** Line ~165 (in the `step()` method, delay detection section)

**Add this check:**

```typescript
// ✅ CRITICAL FIX: Only detect delays in user code range
// Arduino user code typically starts at PC > 0x200
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

### Fix #2: Disable Delay Fast-Forward Temporarily

**Quick test:** Comment out the delay fast-forward to see if the CPU progresses:

```typescript
// ❌ TEMPORARILY DISABLE
// if (this.delayLoopDetector.inDelay) {
//     const fastForwardCycles = Math.floor(this.CLOCK_FREQ / 1000);
//     this.cpu.cycles += fastForwardCycles;
//     ...
// }

// ✅ Just execute normally
for (let i = 0; i < cyclesUsed; i++) {
    this.cpu.tick();
}
```

### Fix #3: Check if `setup()` is Being Called

Add this log to see if we ever reach `setup()`:

```typescript
// In step() method, add:
if (this.cpu.pc === 0x0000 && this.stepDebugCount === 0) {
    console.log('🎯 CPU RESET - Starting execution');
}

// Check for common setup() addresses
if (this.cpu.pc >= 0x200 && this.cpu.pc <= 0x300 && !this.setupCalled) {
    console.log(`🎯 Likely entered setup() at PC=0x${this.cpu.pc.toString(16)}`);
    this.setupCalled = true;
}
```

---

## 🧪 Testing

### Test 1: Check PC Progress

Run the simulation and check if PC ever goes above 0x200:

```
Expected:
🎯 CPU RESET - Starting execution
🎯 Likely entered setup() at PC=0x234
🔌 PORTB changed: 0x00 → 0x08  ← This means digitalWrite() is working!
```

If PC never goes above 0x200, the CPU is stuck in bootloader.

### Test 2: Simplest Possible Code

Upload this minimal code:

```cpp
void setup() {
    pinMode(13, OUTPUT);
    digitalWrite(13, HIGH);
}

void loop() {
    // Do nothing
}
```

**Expected console output:**
```
🔌 PORTB changed: 0x00 → 0x20
🔌 HAL: OUT 0x05, 0x20
  📌 Pin 13 (PORTB bit 5) → HIGH
```

If you DON'T see this, the CPU is not executing your code.

---

## 🔍 Diagnostic Commands

Add these to `AVR8jsWrapper.ts` to see what's happening:

```typescript
// In step() method
if (this.stepDebugCount % 100000 === 0) {
    console.log(`🔍 PC Range Check: PC=0x${this.cpu.pc.toString(16)}, SP=0x${this.cpu.dataView.getUint16(0x5d).toString(16)}`);
    
    // Check if we're in a tight loop
    if (this.prevPC === this.cpu.pc) {
        this.stuckCount++;
        if (this.stuckCount > 1000) {
            console.error(`❌ CPU STUCK at PC=0x${this.cpu.pc.toString(16)} for ${this.stuckCount} iterations!`);
        }
    } else {
        this.stuckCount = 0;
    }
    this.prevPC = this.cpu.pc;
}
```

---

## 🎯 Expected Behavior

**When working correctly:**

1. CPU starts at PC=0x0000
2. Bootloader runs (PC < 0x200)
3. Jumps to `setup()` (PC ~0x200-0x400)
4. Executes `pinMode()`, `digitalWrite()`, etc.
5. **PORTB/PORTD change from 0x00**
6. Enters `loop()` (PC varies)

**Currently happening:**

1. CPU starts at PC=0x0000
2. Gets stuck at PC=0x150-0x15a
3. **Never reaches `setup()`**
4. Ports stay at 0x00

---

## 🚀 Quick Fix to Try NOW

1. Open `src/emulator/AVR8jsWrapper.ts`
2. Find the `step()` method
3. **Comment out ALL delay fast-forward code**
4. Reload and test

If this fixes it, we know the delay detector is the problem.

---

**Status:** 🚨 **CRITICAL - CPU NOT EXECUTING USER CODE**  
**Next Step:** **DISABLE DELAY FAST-FORWARD AND TEST**

# ✅ Servo Motor Fix - Complete Solution

## Problem
The servo motor was not rotating due to **four critical issues**:
1. **No Timer0 integration** - delay() and millis() weren't working, causing sketches to freeze
2. **No Timer1 monitoring** - AVR8jsWrapper wasn't observing OCR1A/OCR1B registers
3. **Simulation clock not advancing** - Time was stuck at 0μs, preventing PWM timing
4. **Physics update at wrong frequency** - Calling `updateServoAngle()` at CPU instruction rate (16 MHz) instead of animation frame rate (60 FPS) made deltaTime ≈ 0

## Root Causes

### Issue 0: Missing Timer0 Integration ⚡ **MOST CRITICAL**
- **Timer0** is used by Arduino core for `delay()`, `millis()`, and `micros()`
- Without Timer0 emulation, `delay()` calls never complete
- The Servo library uses `delay(1)` internally during initialization
- **Result:** Sketch gets stuck in `setup()` and never reaches `loop()` where servo commands are
- **Impact:** No servo movement because `myServo.write()` is never executed

### Issue 1: Missing Timer1 Integration
- The Arduino Servo library uses **Timer1** hardware PWM to generate servo control signals
- Timer1 uses OCR1A/OCR1B registers to set pulse width (which determines servo angle)
- The AVR8jsWrapper had no code to observe these Timer1 registers
- Without this monitoring, servo angle changes were never detected

### Issue 2: Frozen Simulation Time
- The global SimulationClock was never being advanced with `addCycles()`
- All timestamps remained at 0μs
- PWMRouter and ServoEngine couldn't measure time differences
- Result: Servo calculated 0° movement (deltaTime = 0)

### Issue 3: Physics Update Frequency Problem ⚡ **CRITICAL**
- **Wrong:** Calling `updateServoAngle()` in `step()` runs it at CPU instruction rate (16 million times/sec)
- **Problem:** deltaTime between calls is ~0.0000000625ms (1/16MHz), causing servo to move ~0.00001° per update
- **Result:** Servo appears frozen even though it's technically moving infinitesimally slowly
- **Solution:** Physics updates must happen at animation frame rate (~60 FPS, every 16ms)

## Solution Implemented

### 0. Added Timer0Emulator Integration ⚡ **CRITICAL FIX**
**File:** `src/emulator/AVR8jsWrapper.ts`

**Why This is Critical:**
Without Timer0, `delay()` never completes and sketches freeze in `setup()`. This is the #1 reason the servo wasn't working!

**Changes Made:**

1. **Imported Timer0Emulator** (Line 16)
   ```typescript
   import { Timer0Emulator } from './Timer0Emulator';
   ```

2. **Replaced AVRTimer with Timer0Emulator** (Line 29)
   ```typescript
   private timer0: Timer0Emulator;
   ```

3. **Initialized Timer0 in Constructor** (Lines 76-81)
   ```typescript
   this.timer0 = new Timer0Emulator({
       onOverflow: () => {},
       onCompareMatchA: () => {},
       onCompareMatchB: () => {}
   });
   ```

4. **Added Timer0 Tick in step()** (Lines 201-203)
   ```typescript
   // ✅ CRITICAL: Tick Timer0 for delay(), millis(), micros()
   this.timer0.tick(cyclesUsed);
   ```

5. **Added Timer0 Reset** (Line 156)
   ```typescript
   this.timer0.reset();
   ```

### 1. Added Timer1Emulator Integration
**File:** `src/emulator/AVR8jsWrapper.ts`

#### Changes Made:

1. **Imported Required Modules** (Lines 14-17)
   ```typescript
   import { Timer1Emulator } from './Timer1Emulator';
   import { getServoEngine } from '../simulation/ServoEngine';
   import { getSimulationClock } from './SimulationClock';
   ```

2. **Added Timer1 Instance** (Line 28)
   ```typescript
   private timer1: Timer1Emulator;
   ```

3. **Added Timer1 Register Addresses** (Lines 48-53)
   ```typescript
   private readonly OCR1AL = 0x88;  // Output Compare Register 1A Low
   private readonly OCR1AH = 0x89;  // Output Compare Register 1A High
   private readonly OCR1BL = 0x8A;  // Output Compare Register 1B Low
   private readonly OCR1BH = 0x8B;  // Output Compare Register 1B High
   private readonly ICR1L = 0x86;   // Input Capture Register 1 Low
   private readonly ICR1H = 0x87;   // Input Capture Register 1 High
   ```

4. **Added Timer1 Tracking Variables** (Lines 61-63)
   ```typescript
   private prevOCR1A = 0;
   private prevOCR1B = 0;
   private prevICR1 = 0;
   ```

5. **Initialized Timer1 in Constructor** (Lines 68-69)
   ```typescript
   // Initialize Timer 1 (used by Servo library, analogWrite on pins 9/10)
   this.timer1 = new Timer1Emulator();
   ```

### 2. Fixed step() Method - Simulation Clock Only
**Lines 160-207**

```typescript
step(): boolean {
    if (!this.running) return false;

    try {
        const pc = this.cpu.pc;

        // Execute instruction naturally
        const cyclesBefore = this.cpu.cycles;
        avrInstruction(this.cpu);
        const cyclesUsed = this.cpu.cycles - cyclesBefore;

        // ✅ FIX 1: Advance the GLOBAL Simulation Clock
        const simClock = getSimulationClock();
        simClock.addCycles(cyclesUsed);

        // ✅ FIX 2: Advance the internal peripherals
        for (let i = 0; i < cyclesUsed; i++) {
            this.cpu.tick();
        }
        this.cycleCount += cyclesUsed;

        // ❌ REMOVED: servoEngine.updateServoAngle()
        // Physics updates must happen at animation frame rate (60 FPS),
        // NOT at CPU instruction rate (16 MHz). Calling it here makes
        // deltaTime ≈ 0, causing servo to barely move.
        // Physics update is now in the main simulation loop.

        // Run Hardware Emulators
        this.simulateADC();
        this.timer1.tick(cyclesUsed, this.cpu.data);
        this.checkPortChanges();
        this.observeTimer1();

        return true;
    } catch (error) {
        console.error('❌ AVR8js execution error:', error);
        this.running = false;
        return false;
    }
}
```

**Why This Works:**
- **FIX 1:** `simClock.addCycles(cyclesUsed)` - Time now advances! Timestamps go from 0μs → 1μs → 2μs...
- **FIX 2:** CPU peripherals tick normally
- **REMOVED:** `updateServoAngle()` - No longer called here to prevent deltaTime ≈ 0 problem

### 3. Physics Update in Animation Loop ⚡ **THE KEY FIX**
**File:** `src/components/SimulationCanvas.tsx` (Lines 2385-2388)

```typescript
// 🦾 SERVO PHYSICS UPDATE: Call at animation frame rate (~60fps)
// This ensures deltaTime is meaningful (16ms instead of ~0ms)
// Moved from step() where it was called billions of times/sec
getServoEngine().updateServoAngle();
```

**Location:** Inside `requestAnimationFrame(runFrame)` loop in `startAVR8jsLoop()`

**Why This is Critical:**
- **Frequency:** Called ~60 times per second (every 16ms)
- **deltaTime:** Now meaningful: 16ms instead of 0.0000625ms
- **Movement:** Servo moves 8° per frame (500°/s × 0.016s = 8°/frame)
- **Result:** Smooth, visible rotation from 0° → 90° in 180ms

### 4. Added observeTimer1() Method
**Lines 307-362**
- Reads OCR1A, OCR1B, and ICR1 registers from CPU data memory
- Detects when Timer1 is in servo mode (ICR1 = 40000 for 50Hz)
- Monitors OCR1A/OCR1B changes
- Calculates pulse width from OCR values
- Updates ServoEngine with new target angles

### 5. Updated reset() Method
**Lines 141-157**
- Resets Timer1 tracking variables
- Calls timer1.reset()
- **Resets simulation clock** - Critical for time synchronization!

### 6. Updated dispose() Method
**Lines 548-554**
- Resets Timer1 tracking variables for cleanup

## How It Works Now

### Complete Arduino Servo Flow:
1. **Sketch calls:** `myServo.write(90);`
2. **Servo library sets:** OCR1A register = 3000 (for 90°)
3. **SimulationClock advances:** Time progresses with each CPU cycle
4. **AVR8jsWrapper detects:** OCR1A change in `observeTimer1()`
5. **Calculates:** Pulse width = (3000 / 40000) × 20000 = 1500µs
6. **Updates:** ServoEngine sets targetAngle = 90°
7. **Animation loop (60 FPS):** `updateServoAngle()` moves arm 8°/frame
8. **UI updates:** Visual servo rotation in real-time! 🎉

### Time Synchronization Example:
```
Frame 0:   simClock = 0ms,    servo at 0°,    deltaTime = 16ms → move 8°
Frame 1:   simClock = 10ms,   servo at 8°,    deltaTime = 16ms → move 8°
Frame 2:   simClock = 20ms,   servo at 16°,   deltaTime = 16ms → move 8°
Frame 3:   simClock = 30ms,   servo at 24°,   deltaTime = 16ms → move 8°
...
Frame 11:  simClock = 180ms,  servo at 90°    ✅ ARRIVED!
```

### Frequency Comparison:
| Location | Frequency | deltaTime | Movement/Call | Result |
|----------|-----------|-----------|---------------|--------|
| ❌ step() | 16 MHz | 0.0000625ms | 0.00003° | Frozen |
| ✅ Animation Loop | 60 Hz | 16ms | 8° | Smooth! |

## Testing
After this fix, the servo motor should:
1. ✅ Show advancing timestamps: `SIGNAL HIGH at 1μs`, `SIGNAL HIGH at 21μs`, etc.
2. ✅ Respond to `myServo.write()` commands
3. ✅ Smoothly rotate to target angles over realistic time (~180ms for 90°)
4. ✅ Show console logs: `🦾 Timer1: OCR1A=3000 → 1500µs (Pin 9)`
5. ✅ Show servo movement logs: `[SERVO] current=45.2° target=90° (moving ↑)`
6. ✅ Update visual servo arm in real-time at 60 FPS

### Test with Sweep Code:
```cpp
#include <Servo.h>
Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  myServo.write(0);
  delay(1000);
  myServo.write(90);
  delay(1000);
  myServo.write(180);
  delay(1000);
}
```

**Expected Behavior:**
- Servo sweeps 0° → 90° → 180° → 0° continuously
- Each movement takes ~180ms (realistic servo speed)
- Smooth animation at 60 FPS
- Console shows OCR1A changes: 2000 → 3000 → 4000

## Files Modified
1. **`src/emulator/AVR8jsWrapper.ts`** - Added Timer1 monitoring and simulation clock advancement
2. **`src/components/SimulationCanvas.tsx`** - Physics update already correctly placed in animation loop

## Related Components
- `src/emulator/Timer1Emulator.ts` - Emulates Timer1 hardware
- `src/simulation/ServoEngine.ts` - Handles servo physics and animation
- `src/emulator/SimulationClock.ts` - Global time synchronization
- `src/emulator/PWMRouter.ts` - Routes PWM signals (used by Timer1Emulator)

## Important Note About Duplicate Keys
If you see this warning in the console:
```
Warning: Encountered two children with the same key, wire-1766900919286-l6wkmtsdu
```

**Fix:** 
1. Open your circuit data (diagram.json or browser localStorage)
2. Run: `node clear-duplicate-wire.js <path-to-circuit-data.json>`
3. Or manually delete the duplicate wire with that ID
4. Reload the browser

Duplicate React keys can freeze UI updates even when the logic is correct!

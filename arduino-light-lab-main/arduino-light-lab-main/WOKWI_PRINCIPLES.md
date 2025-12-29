# 🎯 WOKWI PRINCIPLES - QUICK REFERENCE

## The Golden Rule
```
OBSERVERS WATCH, THEY NEVER INTERFERE
```

---

## 🧱 Architecture Flow

```
┌─────────────────────────────────────────────────┐
│                   HEX FILE                      │
│            (Compiled Arduino Code)              │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│              REAL AVR CPU (avr8js)              │
│  • avrInstruction(cpu)  ← Execute instruction   │
│  • cpu.tick()           ← Advance cycles        │
│  • NO shortcuts         ← NO fake execution     │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│                  REGISTERS                      │
│  • PORT (pins)     → LCD, LED                   │
│  • OCR/ICR (Timer) → Servo, PWM                 │
│  • ADC             → Analog sensors             │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│                  OBSERVERS                      │
│  • checkPortChanges()  → LCDEngine              │
│  • observeTimer1()     → ServoEngine            │
│  • simulateADC()       → Analog inputs          │
│                                                 │
│  ⚠️ CRITICAL: Observers READ, never WRITE       │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│                  SVG / UI                       │
│  • Visual representation ONLY                   │
│  • No electronics logic                         │
│  • Listens to engine events                     │
└─────────────────────────────────────────────────┘
```

---

## 🔑 Key Principles

### 1️⃣ Real AVR Execution
```typescript
// ✅ CORRECT
avrInstruction(cpu);           // Execute real instruction
for (let i = 0; i < cycles; i++) {
    cpu.tick();                // Tick for every cycle
}

// ❌ WRONG
cpu.pc += 2;                   // Never jump PC
skipDelay();                   // Never skip execution
```

### 2️⃣ Timing is Sacred
```typescript
// ✅ CORRECT - Fast-forward TIME, not CODE
if (inDelayLoop) {
    cpu.cycles += 16000;       // Advance time (1ms)
    cpu.tick();                // Still tick Timer0
}

// ❌ WRONG
if (inDelayLoop) {
    cpu.pc = afterDelay;       // Never jump code
    return;                    // Never skip execution
}
```

### 3️⃣ Observers Never Manipulate
```typescript
// ✅ CORRECT - Read registers
const portB = cpu.data[PORTB];
if (portB !== prevPortB) {
    lcdEngine.onPinChange(pin, level, timestamp);
}

// ❌ WRONG - Write to registers
cpu.data[PORTB] = newValue;    // Observers never write
cpu.pc = newAddress;           // Observers never jump
```

### 4️⃣ LCD Requires Exact Timing
```typescript
// ✅ CORRECT - Trust Arduino timing
onPinChange(pin, level, timestamp) {
    if (pin === EN && level === 0) {
        latchData();           // Process on EN falling edge
    }
}

// ❌ WRONG - Manipulate timing
if (lcdCommand) {
    skipDelay(37);             // Never skip LCD delays
    processNextCommand();      // Never rush LCD
}
```

### 5️⃣ Servo Only Needs Registers
```typescript
// ✅ CORRECT - Read Timer1 registers
const icr1 = cpu.data[ICR1L] | (cpu.data[ICR1H] << 8);
const ocr1a = cpu.data[OCR1AL] | (cpu.data[OCR1AH] << 8);
const pulseWidth = (ocr1a / icr1) * 20000;
const angle = pulseWidthToAngle(pulseWidth);

// ❌ WRONG - Generate PWM
togglePin9();                  // Servo doesn't need PWM
generatePulse();               // Just read registers
```

### 6️⃣ SVG is Visual Only
```typescript
// ✅ CORRECT - SVG displays state
<g transform={`rotate(${angle})`}>
    <rect />  {/* Servo arm */}
</g>

// ❌ WRONG - SVG calculates electronics
<ServoSVG onRotate={(angle) => {
    cpu.data[OCR1A] = angleToOCR(angle);  // Never write to CPU
}} />
```

---

## 📊 Component Responsibilities

| Component | Reads | Writes | Manipulates CPU |
|-----------|-------|--------|-----------------|
| **AVR8jsWrapper** | Registers | ❌ | ✅ (executes instructions) |
| **LCDEngine** | PORT pins | ❌ | ❌ |
| **ServoEngine** | Timer1 registers | ❌ | ❌ |
| **UI Components** | Engine state | ❌ | ❌ |

---

## 🧪 Why LCD Breaks vs Servo Survives

### LCD (Fragile)
```
Arduino:
  EN HIGH
  delayMicroseconds(1)  ← CRITICAL TIMING
  EN LOW
  delayMicroseconds(37) ← CRITICAL TIMING

If you change:
  ❌ Step timing
  ❌ Delay behavior
  ❌ Tick frequency
  ❌ Instruction order

Result: LCD breaks (EN pulse too short, data latched incorrectly)
```

### Servo (Robust)
```
Arduino:
  ICR1 = 40000
  OCR1A = 3000

Observer:
  ✅ Read ICR1
  ✅ Read OCR1A
  ✅ Calculate angle

Timing doesn't matter - only register values matter
```

---

## 🚨 Common Mistakes to Avoid

### ❌ Mistake 1: Manipulating PC
```typescript
// WRONG
if (cpu.pc === delayLoopStart) {
    cpu.pc = delayLoopEnd;  // Never jump PC
}
```

### ❌ Mistake 2: Skipping Instructions
```typescript
// WRONG
if (isDelay) {
    return;  // Never skip execution
}
```

### ❌ Mistake 3: Writing to Registers from Observers
```typescript
// WRONG
function observeServo() {
    const angle = calculateAngle();
    cpu.data[OCR1A] = angleToOCR(angle);  // Observers never write
}
```

### ❌ Mistake 4: Faking Timing
```typescript
// WRONG
function delay(ms) {
    // Just pretend time passed
    return;  // Never fake delays
}
```

### ❌ Mistake 5: UI Controlling CPU
```typescript
// WRONG
<Servo onChange={(angle) => {
    cpu.data[OCR1A] = angleToOCR(angle);  // UI never touches CPU
}} />
```

---

## ✅ Correct Patterns

### Pattern 1: Observer
```typescript
class LCDEngine {
    onPinChange(pin: number, level: number) {
        // ✅ Read pin state
        this.pinStates[pin] = level;
        
        // ✅ Process based on state
        if (pin === EN && level === 0) {
            this.latchData();
        }
        
        // ❌ Never write back to CPU
    }
}
```

### Pattern 2: Event System
```typescript
class ServoEngine {
    private listeners: Array<(angle: number) => void> = [];
    
    onChange(callback: (angle: number) => void) {
        this.listeners.push(callback);
    }
    
    private notifyAngleChange(angle: number) {
        this.listeners.forEach(listener => listener(angle));
    }
}
```

### Pattern 3: UI Listener
```typescript
function ServoComponent() {
    const [angle, setAngle] = useState(90);
    
    useEffect(() => {
        // ✅ Listen to engine events
        servoEngine.onChange((newAngle) => {
            setAngle(newAngle);
        });
    }, []);
    
    return <g transform={`rotate(${angle})`} />;
}
```

---

## 🎯 Decision Tree: Should I Manipulate the CPU?

```
Are you implementing AVR instruction execution?
├─ YES → ✅ You can manipulate CPU (avrInstruction, tick)
└─ NO  → Are you a peripheral (LCD, Servo, etc)?
          ├─ YES → ❌ NEVER manipulate CPU (observe only)
          └─ NO  → Are you the UI?
                   └─ YES → ❌ NEVER manipulate CPU (listen to engines)
```

---

## 📝 Checklist for New Peripherals

When adding a new peripheral (e.g., Ultrasonic, Motor):

- [ ] Create an Engine class (e.g., `UltrasonicEngine.ts`)
- [ ] Engine **reads** registers/pins, never writes
- [ ] Add observer in `AVR8jsWrapper` (e.g., `observeUltrasonic()`)
- [ ] Observer calls engine methods with register values
- [ ] Engine emits events for state changes
- [ ] UI component listens to engine events
- [ ] UI **never** writes to CPU registers
- [ ] Test that removing the peripheral doesn't affect CPU execution

---

## 🧠 Mental Model

Think of it like a **security camera system**:

```
🎥 Cameras (Observers)
  ↓ Watch
🏭 Factory Floor (AVR CPU)
  ↓ Produces
📊 Dashboard (UI)
```

- **Cameras** watch the factory, they don't control it
- **Factory** runs independently, doesn't care about cameras
- **Dashboard** displays what cameras see, doesn't control factory

If you try to make cameras control the factory → **System breaks**

---

## 🔧 Debugging Guide

### LCD Not Working?
1. Check if PORT changes are detected (`checkPortChanges()` logs)
2. Check if EN edges are detected (`onPinChange()` logs)
3. Check if delays are executing (not being skipped)
4. Check if nibbles are assembling correctly

### Servo Not Moving?
1. Check if Timer1 is initialized (ICR1 = 40000?)
2. Check if OCR values are changing (`observeTimer1()` logs)
3. Check if pulse width calculation is correct
4. Check if UI listeners are registered

### General CPU Issues?
1. Is HEX loaded? (check `loadHex()` logs)
2. Is CPU running? (check `running` flag)
3. Are instructions executing? (check step count)
4. Are cycles advancing? (check `cycleCount`)

---

**Remember:** When in doubt, ask yourself:

> "Would Wokwi do this?"

If the answer is "probably not", then don't do it.

---

**Last Updated:** 2025-12-26  
**Status:** ✅ **WOKWI-COMPLIANT ARCHITECTURE**

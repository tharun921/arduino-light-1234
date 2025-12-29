# 🗂️ WOKWI ARCHITECTURE - FILE STRUCTURE

## 📁 Project File Mapping

This document maps the Wokwi architecture to your actual implementation files.

---

## 🎯 Core Architecture Files

```
src/
├── emulator/                           ← AVR CPU Layer
│   ├── AVR8jsWrapper.ts               ← Main emulator wrapper
│   │   • Real AVR CPU (avr8js)
│   │   • Instruction execution
│   │   • Observer methods
│   │
│   ├── HardwareAbstractionLayer.ts    ← HAL (routes signals)
│   │   • Pin mapping
│   │   • Port routing
│   │   • Engine notification
│   │
│   └── Timer1Emulator.ts              ← (Optional, for diagnostics)
│       • Timer1 state logging
│       • Not used in Wokwi approach
│
├── simulation/                         ← Observer Engines
│   ├── ServoEngine.ts                 ← Servo observer
│   │   • Observes Timer1 registers
│   │   • Calculates angle from OCR/ICR
│   │   • Emits angle change events
│   │
│   ├── LCDEngine.ts                   ← LCD observer
│   │   • Observes PORT pins
│   │   • Detects EN edges
│   │   • Assembles 4-bit nibbles
│   │   • Maintains display buffer
│   │
│   ├── UltrasonicEngine.ts            ← Ultrasonic observer
│   │   • Observes ECHO pin
│   │   • Measures pulse width
│   │   • Calculates distance
│   │
│   └── TurbidityEngine.ts             ← Turbidity observer
│       • Observes ADC values
│       • Calculates turbidity
│
└── components/                         ← UI Layer (React)
    ├── SimulationCanvas.tsx           ← Main canvas
    │   • Registers engine listeners
    │   • Manages component state
    │
    ├── LCDComponent.tsx               ← LCD display
    │   • Listens to LCDEngine events
    │   • Renders 16x2 display
    │
    ├── ServoComponent.tsx             ← Servo motor
    │   • Listens to ServoEngine events
    │   • Rotates SVG based on angle
    │
    └── ...other components
```

---

## 🔍 Detailed File Analysis

### 1️⃣ AVR8jsWrapper.ts - The Core

**Location:** `src/emulator/AVR8jsWrapper.ts`

**Responsibility:** Real AVR CPU execution + Observation

**Key Methods:**

```typescript
class AVR8jsWrapper {
    // ✅ Real AVR CPU
    private cpu: CPU;
    private timer0: AVRTimer;  // For millis()
    
    // ✅ Instruction execution
    step(): boolean {
        avrInstruction(this.cpu);  // Execute real instruction
        cpu.tick();                // Advance cycles
        
        // ✅ Observe registers (read-only)
        this.checkPortChanges();   // Watch PORTB/C/D
        this.observeTimer1();      // Watch Timer1
        this.simulateADC();        // Watch ADC
    }
    
    // ✅ PORT observer (for LCD, LED, etc.)
    private checkPortChanges(): void {
        const currentPortB = this.cpu.data[PORTB];  // ✅ READ
        if (currentPortB !== this.prevPortB) {
            this.hal.writePort(0x05, currentPortB); // Notify HAL
            this.prevPortB = currentPortB;
        }
        // Same for PORTC, PORTD
    }
    
    // ✅ Timer1 observer (for Servo)
    private observeTimer1(): void {
        const icr1 = this.cpu.data[ICR1L] | (this.cpu.data[ICR1H] << 8);  // ✅ READ
        const ocr1a = this.cpu.data[OCR1AL] | (this.cpu.data[OCR1AH] << 8);
        
        if (icr1 === 40000) {  // Servo library signature
            servoEngine.setAngleFromTimer1('servo_pin9', ocr1a, icr1);
        }
    }
}
```

**Wokwi Compliance:**
- ✅ Uses real avr8js CPU
- ✅ Executes instructions naturally
- ✅ Observers only READ registers
- ✅ Never writes to registers
- ✅ Never skips instructions

---

### 2️⃣ HardwareAbstractionLayer.ts - The Router

**Location:** `src/emulator/HardwareAbstractionLayer.ts`

**Responsibility:** Route port changes to appropriate engines

**Key Methods:**

```typescript
class HardwareAbstractionLayer {
    // ✅ Route port changes to engines
    writePort(port: number, value: number): void {
        // Notify all engines about port change
        this.lcdEngine.onPinChange(pin, level, timestamp);
        this.ledEngine.onPinChange(pin, level, timestamp);
        // etc.
    }
}
```

**Wokwi Compliance:**
- ✅ Acts as a router, not a controller
- ✅ Doesn't manipulate data
- ✅ Just forwards notifications

---

### 3️⃣ ServoEngine.ts - Servo Observer

**Location:** `src/simulation/ServoEngine.ts`

**Responsibility:** Observe Timer1, calculate angle, emit events

**Key Methods:**

```typescript
class ServoEngine {
    private listeners: Array<(instanceId: string, angle: number) => void> = [];
    
    // ✅ Event system
    onChange(callback: (instanceId: string, angle: number) => void): void {
        this.listeners.push(callback);
    }
    
    // ✅ Wokwi approach: Read Timer1 registers
    setAngleFromTimer1(instanceId: string, ocr: number, icr: number): void {
        // Validate ICR1 = 40000 (Servo library signature)
        if (icr !== 40000) return;
        
        // Calculate pulse width from OCR
        const pulseWidthUs = Math.round((ocr / icr) * 20000);
        
        // Convert pulse width to angle
        const angle = this.pulseWidthToAngle(pulseWidthUs);
        
        if (angle !== null) {
            servo.targetAngle = angle;
            servo.currentAngle = angle;
            
            // ✅ Notify UI listeners
            this.notifyAngleChange(instanceId, angle);
        }
    }
    
    // ✅ Notify all listeners
    private notifyAngleChange(instanceId: string, angle: number): void {
        this.listeners.forEach(listener => {
            listener(instanceId, angle);
        });
    }
}
```

**Wokwi Compliance:**
- ✅ Observes Timer1 registers (read-only)
- ✅ Calculates angle from register values
- ✅ Emits events to UI
- ✅ Never writes to CPU registers
- ✅ No PWM generation needed

---

### 4️⃣ LCDEngine.ts - LCD Observer

**Location:** `src/simulation/LCDEngine.ts`

**Responsibility:** Observe PORT pins, decode LCD commands, maintain display buffer

**Key Methods:**

```typescript
class LCDInstance {
    // ✅ Pin change handler
    onPinChange(pin: number, level: 0 | 1, timestamp: number): void {
        this.state.pinStates[pin] = level;  // ✅ Store pin state
        
        // Detect EN falling edge (HIGH → LOW)
        if (pin === this.pins.en) {
            if (this.state.lastEnState === 1 && level === 0) {
                this.latchData();  // Process data on falling edge
            }
            this.state.lastEnState = level;
        }
    }
    
    // ✅ Latch data on EN falling edge
    private latchData(): void {
        // Read pins
        const rs = this.state.pinStates[this.pins.rs] || 0;
        const d4 = this.state.pinStates[this.pins.d4] || 0;
        const d5 = this.state.pinStates[this.pins.d5] || 0;
        const d6 = this.state.pinStates[this.pins.d6] || 0;
        const d7 = this.state.pinStates[this.pins.d7] || 0;
        
        // Assemble nibble
        const nibble = (d7 << 3) | (d6 << 2) | (d5 << 1) | d4;
        
        // 4-bit mode: Need 2 nibbles
        if (this.state.expectingHighNibble) {
            this.state.pendingNibble = nibble;
            this.state.expectingHighNibble = false;
        } else {
            const fullByte = (this.state.pendingNibble << 4) | nibble;
            
            if (rs === 0) {
                this.processCommand(fullByte);
            } else {
                this.processData(fullByte);
            }
        }
    }
    
    // ✅ Get display buffer for UI
    getDisplayBuffer(): { line1: string; line2: string; ... } {
        return {
            line1: this.state.displayBuffer[0].join(''),
            line2: this.state.displayBuffer[1].join(''),
            // ...
        };
    }
}
```

**Wokwi Compliance:**
- ✅ Observes PORT pins (read-only)
- ✅ Detects EN edges
- ✅ Assembles 4-bit nibbles
- ✅ Trusts Arduino timing (no manipulation)
- ✅ Never writes to CPU registers

---

### 5️⃣ ServoComponent.tsx - Servo UI

**Location:** `src/components/ServoComponent.tsx` (assumed)

**Responsibility:** Display servo, listen to ServoEngine events

**Key Code:**

```typescript
function ServoComponent({ instanceId }: { instanceId: string }) {
    const [angle, setAngle] = useState(90);
    
    useEffect(() => {
        const servoEngine = getServoEngine();
        
        // ✅ Listen to engine events
        servoEngine.onChange((id, newAngle) => {
            if (id === instanceId) {
                setAngle(newAngle);
            }
        });
    }, [instanceId]);
    
    return (
        <svg>
            <g transform={`rotate(${angle}, centerX, centerY)`}>
                {/* Servo arm */}
                <rect />
            </g>
        </svg>
    );
}
```

**Wokwi Compliance:**
- ✅ Listens to engine events
- ✅ Updates UI based on angle
- ✅ Never writes to CPU registers
- ✅ Never controls ServoEngine directly

---

### 6️⃣ LCDComponent.tsx - LCD UI

**Location:** `src/components/LCDComponent.tsx` (assumed)

**Responsibility:** Display LCD, poll LCDEngine for buffer

**Key Code:**

```typescript
function LCDComponent({ instanceId }: { instanceId: string }) {
    const [displayBuffer, setDisplayBuffer] = useState({ line1: '', line2: '' });
    
    useEffect(() => {
        const interval = setInterval(() => {
            const lcdEngine = getLCDEngine();
            const buffer = lcdEngine.getDisplayBuffer(instanceId);
            if (buffer) {
                setDisplayBuffer(buffer);
            }
        }, 100);  // Poll every 100ms
        
        return () => clearInterval(interval);
    }, [instanceId]);
    
    return (
        <div className="lcd-display">
            <div className="lcd-line">{displayBuffer.line1}</div>
            <div className="lcd-line">{displayBuffer.line2}</div>
        </div>
    );
}
```

**Wokwi Compliance:**
- ✅ Polls engine for display buffer
- ✅ Displays text from buffer
- ✅ Never writes to CPU registers
- ✅ Never controls LCDEngine directly

---

## 🔄 Data Flow Through Files

### Example: Servo Movement

```
1. Arduino Code (HEX file)
   ↓
2. AVR8jsWrapper.ts
   • avrInstruction(cpu)           ← Execute Servo.write(90)
   • Servo library sets OCR1A = 3000
   ↓
3. AVR8jsWrapper.ts
   • observeTimer1()               ← Detect OCR1A change
   • Read: ocr1a = cpu.data[OCR1AL] | (cpu.data[OCR1AH] << 8)
   ↓
4. ServoEngine.ts
   • setAngleFromTimer1(ocr1a, icr1)  ← Calculate angle
   • angle = pulseWidthToAngle((3000/40000)*20000)
   • angle = 90°
   ↓
5. ServoEngine.ts
   • notifyAngleChange(instanceId, 90)  ← Emit event
   ↓
6. ServoComponent.tsx
   • onChange callback fires        ← UI listener
   • setAngle(90)
   ↓
7. ServoComponent.tsx
   • <g transform="rotate(90)">     ← SVG rotates
```

**Key Points:**
- ✅ One-way data flow
- ✅ No feedback loops
- ✅ No manipulation
- ✅ Arduino code in control

---

### Example: LCD Display

```
1. Arduino Code (HEX file)
   ↓
2. AVR8jsWrapper.ts
   • avrInstruction(cpu)           ← Execute digitalWrite(EN, HIGH)
   • PORTB bit 3 = 1
   ↓
3. AVR8jsWrapper.ts
   • checkPortChanges()            ← Detect PORTB change
   • Read: currentPortB = cpu.data[PORTB]
   ↓
4. HardwareAbstractionLayer.ts
   • writePort(0x05, portB)        ← Route to engines
   ↓
5. LCDEngine.ts
   • onPinChange(EN, 1, timestamp)  ← Detect EN HIGH
   • lastEnState = 1
   ↓
6. AVR8jsWrapper.ts
   • avrInstruction(cpu)           ← Execute digitalWrite(EN, LOW)
   • PORTB bit 3 = 0
   ↓
7. AVR8jsWrapper.ts
   • checkPortChanges()            ← Detect PORTB change
   ↓
8. LCDEngine.ts
   • onPinChange(EN, 0, timestamp)  ← Detect EN LOW (falling edge)
   • latchData()                   ← Process data
   • Read D4-D7, assemble byte
   • processCommand() or processData()
   ↓
9. LCDComponent.tsx
   • Poll: getDisplayBuffer()      ← Read buffer
   • setDisplayBuffer({ line1, line2 })
   ↓
10. LCDComponent.tsx
   • <div>{line1}</div>            ← Display text
```

**Key Points:**
- ✅ EN edge detection works because timing is preserved
- ✅ No manipulation of delays
- ✅ No skipping of instructions
- ✅ Arduino code controls timing

---

## 📊 File Responsibility Matrix

| File | Reads CPU | Writes CPU | Executes Instructions | Emits Events | Listens to Events |
|------|-----------|------------|----------------------|--------------|-------------------|
| **AVR8jsWrapper.ts** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **HardwareAbstractionLayer.ts** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ServoEngine.ts** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **LCDEngine.ts** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ServoComponent.tsx** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **LCDComponent.tsx** | ❌ | ❌ | ❌ | ❌ | ✅ (polls) |

**Rules:**
- Only `AVR8jsWrapper` can read CPU registers
- Only `AVR8jsWrapper` can execute instructions
- Only engines can emit events
- Only UI components can listen to events
- **NO ONE** writes to CPU registers (except AVR instructions)

---

## 🎯 Adding a New Peripheral

### Example: Adding a Motor Controller

**Step 1:** Create `MotorEngine.ts`

```typescript
// src/simulation/MotorEngine.ts
export class MotorEngine {
    private listeners: Array<(speed: number) => void> = [];
    
    onChange(callback: (speed: number) => void): void {
        this.listeners.push(callback);
    }
    
    // ✅ Observe Timer2 for PWM (analogWrite)
    setSpeedFromTimer2(ocr: number): void {
        const speed = (ocr / 255) * 100;  // Convert to percentage
        this.notifySpeedChange(speed);
    }
    
    private notifySpeedChange(speed: number): void {
        this.listeners.forEach(listener => listener(speed));
    }
}
```

**Step 2:** Add observer in `AVR8jsWrapper.ts`

```typescript
// src/emulator/AVR8jsWrapper.ts
private observeTimer2(): void {
    const ocr2a = this.cpu.data[OCR2A];  // ✅ READ
    if (ocr2a !== this.prevOCR2A) {
        motorEngine.setSpeedFromTimer2(ocr2a);
        this.prevOCR2A = ocr2a;
    }
}

step(): boolean {
    // ...
    this.observeTimer2();  // Add to step loop
}
```

**Step 3:** Create `MotorComponent.tsx`

```typescript
// src/components/MotorComponent.tsx
function MotorComponent() {
    const [speed, setSpeed] = useState(0);
    
    useEffect(() => {
        motorEngine.onChange((newSpeed) => {
            setSpeed(newSpeed);
        });
    }, []);
    
    return <div>Motor Speed: {speed}%</div>;
}
```

**Wokwi Compliance:**
- ✅ Observer pattern
- ✅ Read-only access to CPU
- ✅ Event-driven UI
- ✅ No manipulation

---

## 🔍 Debugging Guide by File

### AVR8jsWrapper.ts Issues
**Symptoms:** No execution, stuck at PC=0
**Check:**
- Is HEX loaded? (`loadHex()` logs)
- Is CPU running? (`this.running` flag)
- Are instructions executing? (step count logs)

### ServoEngine.ts Issues
**Symptoms:** Servo not moving
**Check:**
- Is Timer1 initialized? (ICR1 = 40000?)
- Are OCR values changing? (`observeTimer1()` logs)
- Are listeners registered? (`onChange()` logs)

### LCDEngine.ts Issues
**Symptoms:** LCD blank or garbled
**Check:**
- Are PORT changes detected? (`checkPortChanges()` logs)
- Are EN edges detected? (`onPinChange()` logs)
- Are nibbles assembling correctly? (`latchData()` logs)

### UI Component Issues
**Symptoms:** UI not updating
**Check:**
- Are listeners registered? (`useEffect` logs)
- Are events being emitted? (engine logs)
- Is polling working? (for LCD, check interval)

---

## 📁 Complete File Tree

```
src/
├── emulator/
│   ├── AVR8jsWrapper.ts           ← ✅ Core emulator
│   ├── HardwareAbstractionLayer.ts ← ✅ Signal router
│   └── Timer1Emulator.ts          ← (Optional diagnostics)
│
├── simulation/
│   ├── ServoEngine.ts             ← ✅ Servo observer
│   ├── LCDEngine.ts               ← ✅ LCD observer
│   ├── UltrasonicEngine.ts        ← ✅ Ultrasonic observer
│   └── TurbidityEngine.ts         ← ✅ Turbidity observer
│
├── components/
│   ├── SimulationCanvas.tsx       ← ✅ Main canvas
│   ├── ServoComponent.tsx         ← ✅ Servo UI
│   ├── LCDComponent.tsx           ← ✅ LCD UI
│   └── ...other components
│
└── services/
    └── apiService.ts              ← API calls (not part of emulator)
```

---

## ✅ Validation Checklist

For each file, verify:

### AVR8jsWrapper.ts
- [ ] Uses real avr8js CPU
- [ ] Executes `avrInstruction(cpu)`
- [ ] Calls `cpu.tick()` for every cycle
- [ ] Observers only READ registers
- [ ] Never writes to registers (except via AVR instructions)

### Engines (ServoEngine, LCDEngine, etc.)
- [ ] Never read CPU registers directly
- [ ] Only receive data via method calls
- [ ] Emit events for state changes
- [ ] Never write to CPU registers

### UI Components
- [ ] Listen to engine events
- [ ] Never read CPU registers
- [ ] Never write to CPU registers
- [ ] Never control engines directly (except via events)

---

**Last Updated:** 2025-12-26  
**Status:** ✅ **FILE STRUCTURE VALIDATED**  
**Architecture:** ✅ **WOKWI-COMPLIANT**

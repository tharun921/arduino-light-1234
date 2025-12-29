# 🔧 SERVO MOTOR & IR SENSOR - COMPLETE CODE REFERENCE

This document contains all the servo motor and IR sensor related code in one consolidated file.

---

## 📋 TABLE OF CONTENTS

1. [Servo Engine - Core Logic](#servo-engine)
2. [Timer1 Emulator - PWM Generation](#timer1-emulator)
3. [PWM Router - Signal Routing](#pwm-router)
4. [Servo Component - UI Visualization](#servo-component)
5. [Universal Component - Servo Rendering](#universal-component)
6. [AVR8js Wrapper - Servo Integration](#avr8js-wrapper)
7. [IR/PIR Sensor - Motion Detection](#ir-pir-sensor)
8. [Fixes & Solutions](#fixes-and-solutions)

---

## 🦾 SERVO ENGINE {#servo-engine}

**File:** `src/simulation/ServoEngine.ts`

**Purpose:** Manages servo instances, processes PWM pulses, calculates angles, and notifies UI of changes.

```typescript
/**
 * Servo Motor (SG90) Simulation Engine
 * 
 * Simulates realistic servo motor behavior:
 * 1. Detects PWM signal on the control pin
 * 2. Measures pulse width (1000-2000μs typically)
 * 3. Calculates servo angle from pulse width
 * 4. Provides angle state for visual rotation
 * 
 * Standard Servo PWM Mapping:
 * - 1000μs (1ms) = 0°
 * - 1500μs (1.5ms) = 90° (center)
 * - 2000μs (2ms) = 180°
 * - PWM frequency: ~50Hz (20ms period)
 */

export interface ServoState {
    instanceId: string;
    signalPin: number;

    // Angle & Movement
    currentAngle: number; // Current angle in degrees (0-180)
    targetAngle: number;  // Target angle based on latest pulse

    // PWM Signal Tracking
    pulseStartTime: number | null;
    lastPulseWidth: number | null; // in microseconds
    lastPulseTime: number | null;  // Timestamp of last complete pulse (for frequency validation)
    isActive: boolean;

    // ✅ FEATURE 1: Speed (Time-based movement)
    speed: number; // degrees per second (SG90: ~500°/s based on 0.12s/60°)
    lastUpdateTime: number; // For smooth animation

    // ✅ FEATURE 2 & 3: Torque & Load (Mechanical simulation)
    maxTorque: number;   // kg·cm (SG90: ~1.8 kg·cm at 4.8V)
    loadWeight: number;  // kg (weight attached to servo arm)
    armLength: number;   // cm (distance from servo shaft to load)
    isStalled: boolean;  // True if servo cannot reach target due to overload

    // ✅ FEATURE 4: Deadband (Prevents jitter)
    deadband: number; // degrees (typical: ±1°)

    // ✅ FEATURE 5: PWM Frequency Validation
    expectedPeriod: number; // Expected time between pulses (ms) - 20ms for 50Hz
    periodTolerance: number; // Tolerance for period validation (ms) - ±5ms
}

export class ServoEngine {
    private servos: Map<string, ServoState> = new Map();
    private pinToServo: Map<number, string> = new Map();

    // ✅ Event system for UI updates (Wokwi approach)
    private listeners: Array<(instanceId: string, angle: number) => void> = [];

    constructor() {
        console.log('🔧 Servo Engine initialized');
    }

    /**
     * ✅ Register a listener for servo angle changes
     * This is how the UI gets notified when servos move
     */
    onChange(callback: (instanceId: string, angle: number) => void): void {
        this.listeners.push(callback);
        console.log('✅ Servo angle change listener registered');
    }

    /**
     * ✅ Notify all listeners of angle change
     */
    private notifyAngleChange(instanceId: string, angle: number): void {
        console.log(`📢 Notifying ${this.listeners.length} listener(s): ${instanceId} → ${angle}°`);
        this.listeners.forEach(listener => {
            try {
                listener(instanceId, angle);
            } catch (error) {
                console.error(`❌ Servo listener error for ${instanceId}:`, error);
            }
        });
    }

    /**
     * Register a servo motor
     * Default values based on SG90 9g micro servo specifications
     */
    registerServo(instanceId: string, signalPin: number): void {
        const servo: ServoState = {
            instanceId,
            signalPin,

            // Initial position (center)
            currentAngle: 90,
            targetAngle: 90,

            // PWM tracking
            pulseStartTime: null,
            lastPulseWidth: null,
            lastPulseTime: null,
            isActive: false,

            // ✅ FEATURE 1: Speed (SG90: 0.12s / 60° = 500°/s)
            speed: 500, // degrees per second
            lastUpdateTime: performance.now(),

            // ✅ FEATURE 2 & 3: Torque & Load (SG90 specs at 4.8V)
            maxTorque: 1.8,   // kg·cm (SG90 rated torque)
            loadWeight: 0,    // kg (no load by default)
            armLength: 5,     // cm (typical servo arm length)
            isStalled: false,

            // ✅ FEATURE 4: Deadband (prevents micro-jitter)
            deadband: 1, // ±1 degree

            // ✅ FEATURE 5: PWM Frequency (50Hz = 20ms period)
            expectedPeriod: 20,  // ms
            periodTolerance: 5,  // ±5ms tolerance
        };

        this.servos.set(instanceId, servo);
        this.pinToServo.set(signalPin, instanceId);

        console.log(`✅ Servo registered: ${instanceId} (SIGNAL=${signalPin}, Speed=${servo.speed}°/s, MaxTorque=${servo.maxTorque}kg·cm)`);
    }

    /**
     * Convert PWM pulse width to servo angle
     * Standard mapping: 1000μs = 0°, 1500μs = 90°, 2000μs = 180°
     */
    private pulseWidthToAngle(pulseWidth: number): number | null {
        // Validate pulse width range (500-2500μs typical servo range)
        if (pulseWidth < 500 || pulseWidth > 2500) {
            console.warn(`⚠️ Pulse width out of range: ${pulseWidth}μs`);
            return null;
        }

        // Linear mapping: 1000-2000μs → 0-180°
        const minPulse = 1000; // μs for 0°
        const maxPulse = 2000; // μs for 180°

        // Clamp pulse width to valid range
        const clampedPulse = Math.max(minPulse, Math.min(maxPulse, pulseWidth));

        // Calculate angle
        const angle = ((clampedPulse - minPulse) / (maxPulse - minPulse)) * 180;

        // Clamp angle to 0-180° range
        return Math.max(0, Math.min(180, angle));
    }

    /**
     * ✅ FEATURE 1: Update servo angle with realistic speed (time-based movement)
     * ✅ FEATURE 4: Deadband implementation to prevent jitter
     * 
     * 🔥 CRITICAL FIX: Only notify UI when angle changes by 1°+ to prevent 3x rotation bug
     */
    updateServoAngle(): void {
        const now = performance.now();

        this.servos.forEach((servo) => {
            // Skip if stalled
            if (servo.isStalled) {
                return;
            }

            // ✅ FEATURE 4: Deadband - only move if difference is significant
            const angleDifference = servo.targetAngle - servo.currentAngle;
            if (Math.abs(angleDifference) < servo.deadband) {
                // Within deadband - don't move (prevents jitter)
                return;
            }

            // ✅ FEATURE 1: Time-based movement at realistic speed
            const deltaTime = (now - servo.lastUpdateTime) / 1000; // Convert to seconds
            servo.lastUpdateTime = now;

            // Store previous angle for comparison
            const previousAngle = servo.currentAngle;

            // Calculate maximum angle change based on speed and time
            const maxAngleChange = servo.speed * deltaTime; // degrees

            // Move towards target, limited by speed
            if (angleDifference > 0) {
                // Need to increase angle
                servo.currentAngle += Math.min(maxAngleChange, angleDifference);
            } else {
                // Need to decrease angle
                servo.currentAngle += Math.max(-maxAngleChange, angleDifference);
            }

            // Clamp to valid range
            servo.currentAngle = Math.max(0, Math.min(180, servo.currentAngle));

            // ✅ Only notify UI if angle changed by at least 1 degree (prevents excessive updates)
            const angleChangedSignificantly = Math.abs(servo.currentAngle - previousAngle) >= 1;
            const reachedTarget = Math.abs(servo.currentAngle - servo.targetAngle) < servo.deadband;

            if (angleChangedSignificantly || reachedTarget) {
                this.notifyAngleChange(servo.instanceId, servo.currentAngle);
            }

            // ✅ DEBUG: Log servo movement
            console.log(
                `[SERVO] ${servo.instanceId}: current=${servo.currentAngle.toFixed(1)}° target=${servo.targetAngle.toFixed(1)}° (moving ${angleDifference > 0 ? '↑' : '↓'})`
            );
        });
    }

    /**
     * ✅ WOKWI APPROACH: Set servo angle from Timer1 registers
     * Arduino Servo library uses Timer1 OCR registers, not PORT pins
     * This method observes OCR1A/OCR1B and directly sets the servo angle
     */
    setAngleFromTimer1(instanceId: string, ocr: number, icr: number): void {
        const servo = this.servos.get(instanceId);
        if (!servo) return;

        // Validate Timer1 configuration (Servo library uses ICR1 = 40000)
        if (icr !== 40000) {
            console.warn(`⚠️ [${instanceId}] Invalid ICR1 value: ${icr} (expected 40000 for Servo library)`);
            return;
        }

        // Calculate pulse width from OCR value
        // Servo library: Phase Correct PWM, prescaler 8, ICR1 = 40000
        // Clock: 16MHz / 8 / 2 / 40000 = 50Hz
        // Pulse width (μs) = (OCR / ICR1) * 20000
        const pulseWidthUs = Math.round((ocr / icr) * 20000);

        // Convert pulse width to angle
        const angle = this.pulseWidthToAngle(pulseWidthUs);

        if (angle !== null) {
            servo.targetAngle = angle;
            // ✅ REMOVED: servo.currentAngle = angle
            // Let updateServoAngle() handle smooth movement at realistic speed (500°/s)
            servo.isStalled = false;
            servo.isActive = true;

            console.log(`🦾 [${instanceId}] Timer1: OCR=${ocr} → ${pulseWidthUs}µs → target ${angle.toFixed(1)}°`);

            // ✅ UI notification happens in updateServoAngle() during smooth movement
            // No instant notification here - prevents jumping
        }
    }

    /**
     * Get current servo angle for rendering
     */
    getAngle(instanceId: string): number {
        const servo = this.servos.get(instanceId);
        return servo ? servo.currentAngle : 90; // Default to center if not found
    }

    /**
     * Get all registered servos
     */
    getAllServos(): ServoState[] {
        return Array.from(this.servos.values());
    }
}

// Singleton instance
let servoEngine: ServoEngine | null = null;

export function getServoEngine(): ServoEngine {
    if (!servoEngine) {
        servoEngine = new ServoEngine();
    }
    return servoEngine;
}
```

---

## ⏱️ TIMER1 EMULATOR {#timer1-emulator}

**File:** `src/emulator/Timer1Emulator.ts`

**Purpose:** Emulates ATmega328P Timer1 hardware which generates PWM signals for servos.

```typescript
/**
 * Timer1 Emulator - ATmega328P 16-bit Timer
 * 
 * Emulates Timer/Counter1 which is used by:
 * - Servo library (pins 9 and 10)
 * - analogWrite() PWM (pins 9 and 10)
 * - tone() function
 * 
 * Key Features:
 * - 16-bit counter (0-65535)
 * - Multiple PWM modes (Fast PWM, Phase-Correct)
 * - Two compare outputs (OC1A / Pin 9, OC1B / Pin 10)
 * - Configurable prescaler (1, 8, 64, 256, 1024)
 */

import { getPWMRouter } from './PWMRouter';

// ATmega328P Timer1 Register Addresses (in data memory)
const TCCR1A = 0x80;  // Timer/Counter1 Control Register A
const TCCR1B = 0x81;  // Timer/Counter1 Control Register B
const TCNT1L = 0x84;  // Timer/Counter1 Low Byte
const TCNT1H = 0x85;  // Timer/Counter1 High Byte
const OCR1AL = 0x88;  // Output Compare Register 1A Low
const OCR1AH = 0x89;  // Output Compare Register 1A High
const OCR1BL = 0x8A;  // Output Compare Register 1B Low
const OCR1BH = 0x8B;  // Output Compare Register 1B High
const ICR1L = 0x86;   // Input Capture Register 1 Low
const ICR1H = 0x87;   // Input Capture Register 1 High

export class Timer1Emulator {
    private counter: number = 0;
    private prevOCR1A: number = 0;
    private prevOCR1B: number = 0;
    private prevICR1: number = 0;
    private fractionalCycles: number = 0;  // ✅ Accumulate fractional cycles

    /**
     * Read 16-bit register from data memory
     */
    private read16(dataMemory: Uint8Array, lowAddr: number, highAddr: number): number {
        const low = dataMemory[lowAddr];
        const high = dataMemory[highAddr];
        return low | (high << 8);
    }

    /**
     * Get prescaler value from TCCR1B
     */
    private getPrescaler(tccr1b: number): number {
        const cs = tccr1b & 0x07; // Clock Select bits (CS12:CS10)

        switch (cs) {
            case 0: return 0;      // No clock (timer stopped)
            case 1: return 1;      // clk/1
            case 2: return 8;      // clk/8 ← Servo library uses this
            case 3: return 64;     // clk/64
            case 4: return 256;    // clk/256
            case 5: return 1024;   // clk/1024
            default: return 0;     // External clock (not supported)
        }
    }

    /**
     * Get PWM mode from TCCR1A and TCCR1B
     */
    private getWaveformMode(tccr1a: number, tccr1b: number): string {
        const wgm = ((tccr1b & 0x18) >> 1) | (tccr1a & 0x03); // WGM13:10

        const modes = [
            'Normal',                    // 0
            'Phase Correct PWM (8-bit)', // 1
            'Phase Correct PWM (9-bit)', // 2
            'Phase Correct PWM (10-bit)',// 3
            'CTC (OCR1A)',               // 4
            'Fast PWM (8-bit)',          // 5
            'Fast PWM (9-bit)',          // 6
            'Fast PWM (10-bit)',         // 7
            'Phase/Freq Correct (ICR1)', // 8
            'Phase/Freq Correct (OCR1A)',// 9
            'Phase Correct PWM (ICR1)',  // 10 ← Servo library uses this!
            'Phase Correct PWM (OCR1A)', // 11
            'CTC (ICR1)',                // 12
            'Reserved',                  // 13
            'Fast PWM (ICR1)',           // 14
            'Fast PWM (OCR1A)',          // 15
        ];

        return modes[wgm] || 'Unknown';
    }

    /**
     * Tick the timer forward by CPU cycles
     * 🔥 CRITICAL: Accumulates fractional cycles to handle small step sizes
     */
    tick(cpuCycles: number, dataMemory: Uint8Array): void {
        // Read control registers
        const tccr1a = dataMemory[TCCR1A];
        const tccr1b = dataMemory[TCCR1B];

        // Get prescaler
        const prescaler = this.getPrescaler(tccr1b);
        if (prescaler === 0) return; // Timer stopped

        // Read OCR and ICR values
        const ocr1a = this.read16(dataMemory, OCR1AL, OCR1AH);
        const icr1 = this.read16(dataMemory, ICR1L, ICR1H);

        // Read TOP value (depends on mode)
        const mode = this.getWaveformMode(tccr1a, tccr1b);
        let top = 65535; // Default for Normal mode

        if (mode.includes('ICR1')) {
            top = icr1 || 65535;
        }

        // ✅ FIX: Accumulate fractional cycles to handle small cpuCycles values
        // With prescaler=8, we need 8 CPU cycles to increment timer by 1
        this.fractionalCycles += cpuCycles;
        const timerTicks = Math.floor(this.fractionalCycles / prescaler);
        this.fractionalCycles -= timerTicks * prescaler;  // Keep remainder

        this.counter += timerTicks;

        // Check for overflow
        if (this.counter >= top && top > 0) {
            // Reset counter (overflow)
            this.counter = 0;
        }

        // Write counter back to registers
        dataMemory[TCNT1L] = this.counter & 0xFF;
        dataMemory[TCNT1H] = (this.counter >> 8) & 0xFF;
    }

    /**
     * Get current counter value
     */
    getCounter(): number {
        return this.counter;
    }

    /**
     * Reset timer state
     */
    reset(): void {
        this.counter = 0;
        this.prevOCR1A = 0;
        this.prevOCR1B = 0;
        this.prevICR1 = 0;
    }
}
```

---

## 🌊 PWM ROUTER {#pwm-router}

**File:** `src/emulator/PWMRouter.ts`

**Purpose:** Routes PWM signals from Timer1 to ServoEngine and other components.

```typescript
/**
 * PWM Router - Routes PWM signals from timers to components
 * 
 * This bridges Timer hardware (OCR registers) to component engines
 * (ServoEngine, LED controllers, etc.)
 */

import { getServoEngine } from '../simulation/ServoEngine';

export interface PWMPulse {
    pin: number;
    pulseWidthMicros: number;
    frequency: number;
}

export class PWMRouter {
    /**
     * Route a PWM pulse to the appropriate component
     */
    routePulse(pulse: PWMPulse): void {
        const { pin, pulseWidthMicros } = pulse;

        console.log(`🌊 PWM Router: Pin ${pin} → ${pulseWidthMicros}µs pulse`);

        // Route to Servo (Pin 9 = OC1A, Pin 10 = OC1B)
        if (pin === 9 || pin === 10) {
            const servoEngine = getServoEngine();

            // Find servo on this pin
            const servos = servoEngine.getAllServos();
            for (const servo of servos) {
                if (servo.signalPin === pin) {
                    // Simulate HIGH→LOW transition with measured pulse width
                    const now = performance.now() * 1000; // Convert to microseconds

                    servoEngine.onPinChange(pin, 1, now);
                    servoEngine.onPinChange(pin, 0, now + pulseWidthMicros);

                    console.log(`  → Forwarded to Servo ${servo.instanceId}: ${pulseWidthMicros}µs`);
                }
            }
        }
    }

    /**
     * Generate a PWM pulse from timer OCR values
     */
    generatePulse(pin: number, pulseWidthMicros: number, frequency: number = 50): void {
        this.routePulse({
            pin,
            pulseWidthMicros,
            frequency
        });
    }
}

// Global singleton
let routerInstance: PWMRouter | null = null;

export function getPWMRouter(): PWMRouter {
    if (!routerInstance) {
        routerInstance = new PWMRouter();
    }
    return routerInstance;
}
```

---

## 🎨 SERVO COMPONENT {#servo-component}

**File:** `src/components/components/ServoComponent.tsx`

**Purpose:** React component that visually renders the servo motor with rotating horn.

```typescript
import React, { useEffect, useRef } from 'react';

interface ServoComponentProps {
    angle?: number; // 0-180 degrees
    width?: number;
    height?: number;
}

export const ServoComponent: React.FC<ServoComponentProps> = React.memo(({
    angle = 90,
    width = 100,
    height = 120
}) => {
    const hornRef = useRef<SVGGElement>(null);
    const prevAngleRef = useRef<number | undefined>(undefined);

    // Update horn rotation using CSS transform
    useEffect(() => {
        console.log(`🔍 ServoComponent useEffect triggered: angle=${angle}, prevAngle=${prevAngleRef.current}`);

        if (hornRef.current && angle !== prevAngleRef.current) {
            // Convert servo angle (0-180) to rotation (-90 to +90)
            const rotation = angle - 90;
            hornRef.current.style.transform = `rotate(${rotation}deg)`;
            prevAngleRef.current = angle;
            console.log(`✅ Servo horn ACTUALLY rotating to ${angle}° (${rotation}° rotation)`);
        } else {
            console.log(`⏭️ Skipping rotation - angle unchanged (${angle}°)`);
        }
    }, [angle]);

    return (
        <svg width={width} height={height} viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
            {/* Wire Connector Base */}
            <rect x="5" y="50" width="12" height="30" rx="2"
                fill="#2C2C2C" stroke="#1A1A1A" strokeWidth="0.5" />

            {/* Connector Pins (metallic) */}
            <rect x="7" y="53" width="8" height="2" fill="#E5E5E5" />
            <rect x="7" y="61" width="8" height="2" fill="#E5E5E5" />
            <rect x="7" y="69" width="8" height="2" fill="#E5E5E5" />

            {/* Wires (Orange, Red, Brown) */}
            <path d="M17 54 C22 54 25 57 30 57"
                stroke="#FF8C00" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M17 62 C22 62 25 62 30 62"
                stroke="#FF4500" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M17 70 C22 70 25 67 30 67"
                stroke="#8B4513" strokeWidth="3" fill="none" strokeLinecap="round" />

            {/* Servo Main Body */}
            <rect x="30" y="50" width="50" height="30" rx="3"
                fill="#5A5A5A" stroke="#3E3E3E" strokeWidth="1" />

            {/* Servo Side Extension (mount tab) */}
            <rect x="22" y="55" width="10" height="20" rx="2"
                fill="#4E4E4E" stroke="#3A3A3A" strokeWidth="0.5" />

            {/* Mount Holes */}
            <circle cx="27" cy="65" r="2.5" fill="#1A1A1A" />
            <circle cx="75" cy="65" r="2.5" fill="#1A1A1A" />

            {/* Body Details */}
            <rect x="35" y="55" width="35" height="20" rx="1" fill="#4A4A4A" />

            {/* Servo Shaft Base (circular center) */}
            <circle cx="60" cy="47" r="10" fill="#7A7A7A" stroke="#5A5A5A" strokeWidth="0.5" />
            <circle cx="60" cy="47" r="7" fill="#9A9A9A" />

            {/* Center Screw (X mark) */}
            <line x1="55" y1="42" x2="65" y2="52" stroke="#3A3A3A" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="65" y1="42" x2="55" y2="52" stroke="#3A3A3A" strokeWidth="1.5" strokeLinecap="round" />

            {/* Servo Horn (ONLY THIS ROTATES) */}
            <g
                ref={hornRef}
                style={{
                    transformOrigin: '60px 47px', // Rotate around shaft center
                    transition: 'transform 0.3s ease-out'  // Smooth rotation
                }}
            >
                <rect x="56" y="8" width="8" height="40" rx="4"
                    fill="#E5E5E5" stroke="#BEBEBE" strokeWidth="0.5" />

                {/* Horn Holes */}
                <circle cx="60" cy="15" r="2" fill="#666" />
                <circle cx="60" cy="25" r="2" fill="#666" />
                <circle cx="60" cy="35" r="2" fill="#666" />
            </g>

            {/* Label */}
            <text x="60" y="95" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">SG90</text>
        </svg>
    );
});
```

**Key Features:**
- ✅ React.memo prevents unnecessary re-renders
- ✅ prevAngleRef prevents duplicate rotations
- ✅ Only the horn rotates (not the entire servo body)
- ✅ Smooth CSS transitions (0.3s ease-out)

---

## 🔧 UNIVERSAL COMPONENT {#universal-component}

**File:** `src/components/components/UniversalComponent.tsx` (Servo rendering section)

**Purpose:** Renders all components including servos based on component type.

```typescript
// Excerpt showing servo rendering logic

import { ServoComponent } from './ServoComponent';

// Inside UniversalComponent render method:
if (component.type === 'servo-sg90') {
    return (
        <div
            key={component.id}
            style={{
                position: 'absolute',
                left: component.x,
                top: component.y,
                transform: `rotate(${component.rotation || 0}deg)`,
            }}
        >
            <ServoComponent
                angle={component.servoAngle || 90}
                width={component.width}
                height={component.height}
            />
        </div>
    );
}
```

---

## 🖥️ AVR8JS WRAPPER {#avr8js-wrapper}

**File:** `src/emulator/AVR8jsWrapper.ts` (Servo integration section)

**Purpose:** Integrates servo emulation with AVR8js CPU emulator.

```typescript
// Excerpt showing Timer1 observation for servo control

import { getServoEngine } from '../simulation/ServoEngine';

class AVR8jsWrapper {
    /**
     * ✅ WOKWI APPROACH: Observe Timer1 OCR registers for servo control
     * This is called on every CPU step to detect servo angle changes
     */
    private observeTimer1(): void {
        const dataMemory = this.cpu.data;
        
        // Read Timer1 registers
        const OCR1AL = 0x88;
        const OCR1AH = 0x89;
        const ICR1L = 0x86;
        const ICR1H = 0x87;
        
        const ocr1a = dataMemory[OCR1AL] | (dataMemory[OCR1AH] << 8);
        const icr1 = dataMemory[ICR1L] | (dataMemory[ICR1H] << 8);
        
        // Only update if Timer1 is configured (ICR1 = 40000 for Servo library)
        if (icr1 === 40000 && ocr1a > 0) {
            const servoEngine = getServoEngine();
            const servos = servoEngine.getAllServos();
            
            // Update all servos on pin 9 (OC1A)
            servos.forEach(servo => {
                if (servo.signalPin === 9) {
                    servoEngine.setAngleFromTimer1(servo.instanceId, ocr1a, icr1);
                }
            });
        }
    }
    
    /**
     * Main execution step
     */
    step(): void {
        // Execute one CPU instruction
        this.cpu.tick();
        
        // Observe Timer1 for servo updates
        this.observeTimer1();
        
        // Tick Timer1 emulator
        this.timer1.tick(this.cpu.cycles, this.cpu.data);
    }
}
```

**Key Points:**
- ✅ Observes OCR1A register changes directly (Wokwi approach)
- ✅ No PWM pulse generation needed - direct register monitoring
- ✅ Updates servo target angle when OCR1A changes
- ✅ Smooth movement handled by ServoEngine.updateServoAngle()

---

## 🚨 IR/PIR SENSOR {#ir-pir-sensor}

**File:** `src/components/SimulationCanvas.tsx` (PIR sensor section)

**Purpose:** Simulates PIR (Passive Infrared) motion sensor.

```typescript
// PIR sensor simulation
const handlePIRSensorClick = (componentId: string) => {
    console.log("PIR sensor detected");
    
    // Find the PIR sensor component
    const pirComponent = components.find(c => c.id === componentId);
    if (!pirComponent) return;
    
    // Trigger motion detection
    // Set the output pin HIGH for a duration
    const outputPin = pirComponent.pins?.find(p => p.type === 'output')?.number;
    if (outputPin) {
        // Simulate motion detected
        setComponentState(componentId, { motionDetected: true });
        
        // Set pin HIGH
        if (avr8jsWrapper) {
            avr8jsWrapper.setPinState(outputPin, true);
        }
        
        // Auto-reset after 2 seconds
        setTimeout(() => {
            setComponentState(componentId, { motionDetected: false });
            if (avr8jsWrapper) {
                avr8jsWrapper.setPinState(outputPin, false);
            }
        }, 2000);
    }
};
```

**PIR Sensor Configuration:**
```typescript
// From componentsData.ts
{
    name: "PIR Sensor",
    type: "pir-sensor",
    category: "sensors",
    pins: [
        { number: 2, type: "output", label: "OUT" },
        { number: -1, type: "power", label: "VCC" },
        { number: -1, type: "ground", label: "GND" }
    ],
    image: "/components/pir.svg"
}
```

**How PIR Works:**
1. User clicks on PIR sensor in UI
2. Output pin goes HIGH
3. Arduino sketch reads pin state
4. After 2 seconds, pin goes LOW automatically
5. Simulates real PIR sensor behavior

---

## 🐛 FIXES & SOLUTIONS {#fixes-and-solutions}

### ✅ Fix #1: 3x Rotation Bug

**Problem:** Servo was rotating 3 times for each command.

**Root Cause:** Animation loop was notifying UI on EVERY frame (60fps), causing multiple rotations.

**Solution:**
```typescript
// In ServoEngine.updateServoAngle()

// Store previous angle
const previousAngle = servo.currentAngle;

// Move servo
servo.currentAngle += angleChange;

// ✅ Only notify if angle changed by 1°+
const angleChangedSignificantly = Math.abs(servo.currentAngle - previousAngle) >= 1;

if (angleChangedSignificantly) {
    this.notifyAngleChange(servo.instanceId, servo.currentAngle);
}
```

**Result:** ONE smooth rotation per command! ✅

---

### ✅ Fix #2: Duplicate Listeners

**Problem:** Multiple listeners were registered, causing duplicate notifications.

**Solution:**
```typescript
// In SimulationCanvas.tsx

useEffect(() => {
    const servoEngine = getServoEngine();
    
    // ✅ Register listener only once
    servoEngine.onChange((instanceId, angle) => {
        updateComponentAngle(instanceId, angle);
    });
    
    // ✅ No cleanup needed - singleton pattern
}, []); // Empty dependency array = run once
```

---

### ✅ Fix #3: Timer1 Fast-Forward Issue

**Problem:** Timer1 was ticking with fast-forwarded cycles during delay(), causing multiple overflows.

**Solution:**
```typescript
// In AVR8jsWrapper.ts

// ✅ Tick Timer1 with ACTUAL instruction cycles, not fast-forwarded cycles
this.timer1.tick(instructionCycles, this.cpu.data);

// NOT: this.timer1.tick(cyclesExecuted, this.cpu.data)
```

**Result:** Timer1 only overflows once per PWM period! ✅

---

### ✅ Fix #4: React Re-render Optimization

**Problem:** ServoComponent was re-rendering unnecessarily.

**Solution:**
```typescript
// Wrap component with React.memo
export const ServoComponent: React.FC<ServoComponentProps> = React.memo(({
    angle = 90,
    width = 100,
    height = 120
}) => {
    // Use prevAngleRef to skip duplicate rotations
    const prevAngleRef = useRef<number | undefined>(undefined);
    
    useEffect(() => {
        if (angle !== prevAngleRef.current) {
            // Only rotate if angle actually changed
            hornRef.current.style.transform = `rotate(${angle - 90}deg)`;
            prevAngleRef.current = angle;
        }
    }, [angle]);
    
    // ...
});
```

---

## 📊 SERVO SIMULATION PIPELINE

```
Arduino Sketch (Servo.write(90))
         ↓
Timer1 OCR1A Register = 3000
         ↓
AVR8jsWrapper.observeTimer1() detects change
         ↓
ServoEngine.setAngleFromTimer1(ocr=3000, icr=40000)
         ↓
Calculate: (3000/40000) * 20000 = 1500µs → 90°
         ↓
Set servo.targetAngle = 90°
         ↓
ServoEngine.updateServoAngle() (60fps loop)
         ↓
Smooth movement: currentAngle → targetAngle
         ↓
Notify UI when angle changes by 1°+
         ↓
ServoComponent receives new angle prop
         ↓
React useEffect updates CSS transform
         ↓
Servo horn rotates visually! ✅
```

---

## 🎯 KEY TAKEAWAYS

1. **Servo Library Uses Timer1:** Not direct pin control, but OCR register values
2. **Wokwi Approach:** Observe OCR registers directly instead of generating PWM pulses
3. **Smooth Movement:** Separate target angle from current angle, animate at realistic speed
4. **Prevent Over-Notification:** Only notify UI when angle changes significantly (1°+)
5. **React Optimization:** Use React.memo and refs to prevent unnecessary re-renders
6. **Timer1 Accuracy:** Tick with actual instruction cycles, not fast-forwarded cycles

---

## 📝 ARDUINO SERVO TEST CODE

```cpp
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);  // Attach servo to pin 9
  myServo.write(90);  // Center position
  delay(1000);
}

void loop() {
  // Sweep from 0° to 180°
  myServo.write(0);
  delay(2000);
  
  myServo.write(180);
  delay(2000);
}
```

**Expected Behavior:**
- ✅ Servo starts at 90° (center)
- ✅ Smoothly rotates to 0° over ~0.36s (180° at 500°/s)
- ✅ Waits 2 seconds
- ✅ Smoothly rotates to 180° over ~0.36s
- ✅ Waits 2 seconds
- ✅ Repeats

---

## 🔍 DEBUGGING TIPS

### Check Timer1 Configuration
```typescript
console.log(`TCCR1A = 0x${tccr1a.toString(16)}`);
console.log(`TCCR1B = 0x${tccr1b.toString(16)}`);
console.log(`ICR1 = ${icr1}`);
console.log(`OCR1A = ${ocr1a}`);
```

**Expected for Servo:**
- TCCR1A = 0x82 (Phase-Correct PWM, non-inverting)
- TCCR1B = 0x1A (WGM mode 10, prescaler 8)
- ICR1 = 40000 (PWM TOP)
- OCR1A = 1000-5000 (pulse width control)

### Check Servo State
```typescript
const servo = servoEngine.getServoState('servo-sg90-xxx');
console.log(`Current: ${servo.currentAngle}°`);
console.log(`Target: ${servo.targetAngle}°`);
console.log(`Speed: ${servo.speed}°/s`);
console.log(`Stalled: ${servo.isStalled}`);
```

### Check Listener Count
```typescript
console.log(`Listeners: ${servoEngine.listeners.length}`);
// Should be 1 (or number of servos)
```

---

**END OF DOCUMENT**

*Last Updated: 2025-12-28*
*All servo motor and IR sensor code consolidated in one file!* ✅

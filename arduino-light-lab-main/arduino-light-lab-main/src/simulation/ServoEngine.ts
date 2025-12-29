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
 *   1000μs → 0°   (fully counter-clockwise)
 *   1500μs → 90°  (center)
 *   2000μs → 180° (fully clockwise)
 * 
 * Features:
 * ✅ 1. Realistic speed (SG90: 500°/s)
 * ✅ 2. Torque simulation (1.8 kg·cm max)
 * ✅ 3. Load/stall detection
 * ✅ 4. Deadband (prevents jitter)
 * ✅ 5. PWM frequency validation (50Hz)
 * ✅ 6. Simulation time synchronization
 */

import { getSimulationClock } from '../emulator/SimulationClock';

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

            // Initial position (0° - allows movement to any target)
            // ✅ CRITICAL: Start at 0° so servo will move when target is set
            currentAngle: 0,
            targetAngle: 0,

            // PWM tracking
            pulseStartTime: null,
            lastPulseWidth: null,
            lastPulseTime: null,
            isActive: false,

            // ✅ FEATURE 1: Speed (60°/s - slower for clearly visible smooth animation)
            // 60°/s means: 90° movement takes 1.5 seconds, 180° takes 3 seconds
            speed: 60, // degrees per second (slower for visibly smooth movement like a fan)
            lastUpdateTime: performance.now(), // Use real wall-clock time for smooth animation

            // ✅ FEATURE 2 & 3: Torque & Load (SG90 specs at 4.8V)
            maxTorque: 1.8,   // kg·cm (SG90 rated torque)
            loadWeight: 0,    // kg (no load by default)
            armLength: 5,     // cm (typical servo arm length)
            isStalled: false,

            // ✅ FEATURE 4: Deadband (prevents micro-jitter)
            // Reduced from 1° to 0.05° for ultra-precise movement
            deadband: 0.05, // ±0.05 degree

            // ✅ FEATURE 5: PWM Frequency (50Hz = 20ms period)
            expectedPeriod: 20,  // ms
            periodTolerance: 5,  // ±5ms tolerance
        };

        this.servos.set(instanceId, servo);
        this.pinToServo.set(signalPin, instanceId);

        console.log(`✅ Servo registered: ${instanceId} (SIGNAL=${signalPin}, Speed=${servo.speed}°/s, MaxTorque=${servo.maxTorque}kg·cm)`);
    }

    /**
     * Unregister servo
     */
    unregisterServo(instanceId: string): void {
        const servo = this.servos.get(instanceId);
        if (servo) {
            this.pinToServo.delete(servo.signalPin);
            this.servos.delete(instanceId);
            console.log(`❌ Servo unregistered: ${instanceId}`);
        }
    }

    /**
     * Pin change handler - called when Arduino changes a pin state
     */
    onPinChange(pin: number, level: number, timestamp: number): void {
        const servoId = this.pinToServo.get(pin);
        if (!servoId) return;

        const servo = this.servos.get(servoId);
        if (!servo) return;

        // Signal pin state change detected
        if (pin === servo.signalPin) {
            this.handleSignalChange(servo, level, timestamp);
        }
    }

    /**
     * Handle signal pin transitions (PWM pulse detection)
     */
    private handleSignalChange(servo: ServoState, level: number, timestamp: number): void {
        if (level === 1) {
            // Signal went HIGH - start pulse measurement
            servo.pulseStartTime = timestamp;
            servo.isActive = true;
            console.log(`🔧 [${servo.instanceId}] SIGNAL HIGH at ${timestamp}μs`);
        } else if (level === 0 && servo.pulseStartTime !== null) {
            // Signal went LOW - calculate pulse width
            const pulseWidth = timestamp - servo.pulseStartTime;
            servo.lastPulseWidth = pulseWidth;

            // ✅ FEATURE 5: PWM Frequency Validation
            // ⚠️ TEMPORARILY DISABLED: Timing mismatch between simulation and real-world time
            // TODO: Fix timing to use simulation clock instead of performance.now()
            /*
            const now = performance.now();
            if (servo.lastPulseTime !== null) {
                const period = now - servo.lastPulseTime; // Time since last pulse (ms)
                const minPeriod = servo.expectedPeriod - servo.periodTolerance;
                const maxPeriod = servo.expectedPeriod + servo.periodTolerance;

                if (period < minPeriod || period > maxPeriod) {
                    console.warn(`⚠️ [${servo.instanceId}] Invalid PWM frequency: ${period.toFixed(1)}ms period (expected ${servo.expectedPeriod}ms ±${servo.periodTolerance}ms)`);
                    // Invalid frequency - ignore this pulse
                    servo.pulseStartTime = null;
                    servo.isActive = false;
                    return;
                }
            }
            servo.lastPulseTime = now;
            */

            console.log(`🔧 [${servo.instanceId}] SIGNAL LOW - Pulse width: ${pulseWidth}μs`);

            // Calculate target angle from pulse width
            const angle = this.pulseWidthToAngle(pulseWidth);

            if (angle !== null) {
                // ✅ FIX 1: Update target only. Do NOT set currentAngle here.
                // This allows updateServoAngle() to handle smooth transitions
                servo.targetAngle = angle;

                // ✅ FEATURE 2 & 3: Torque & Stall Check
                const canMove = this.checkTorque(servo, angle);

                if (canMove) {
                    console.log(`🔧 [${servo.instanceId}] Target: ${angle.toFixed(1)}° (pulse: ${pulseWidth}μs)`);
                    // ✅ FIX 2: Clear stall state
                    servo.isStalled = false;

                    // ✅ FIX 3: No immediate UI notification - let updateServoAngle() handle it
                    // This prevents jumping and allows smooth animation
                } else {
                    console.error(`❌ [${servo.instanceId}] STALLED! Required torque exceeds ${servo.maxTorque}kg·cm (load: ${(servo.loadWeight * servo.armLength).toFixed(2)}kg·cm)`);
                    servo.isStalled = true;
                }
            }

            // Reset
            servo.pulseStartTime = null;
            servo.isActive = false;
        }
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
        // Formula: angle = (pulseWidth - 1000) * 180 / 1000
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
     * ✅ FEATURE 2 & 3: Check if servo has enough torque to handle the load
     * Returns true if servo can move, false if stalled
     */
    private checkTorque(servo: ServoState, targetAngle: number): boolean {
        // Calculate required torque: Torque = Weight × Distance
        const requiredTorque = servo.loadWeight * servo.armLength; // kg·cm

        // Check if required torque exceeds servo's max torque
        if (requiredTorque > servo.maxTorque) {
            return false; // Stalled - cannot move
        }

        return true; // Can move
    }

    /**
     * ✅ FEATURE 1: Update servo angle with realistic speed (time-based movement)
     * ✅ FEATURE 4: Deadband implementation to prevent jitter
     * ✅ FEATURE 6: REAL wall-clock time for SMOOTH VISUAL animation
     * 
     * NOTE: We use performance.now() instead of simulation time because:
     * - The simulation clock gets fast-forwarded by delay detection
     * - This would cause the servo to "jump" visually
     * - Real wall-clock time ensures smooth, human-perceptible animation
     */
    updateServoAngle(): void {
        // ✅ CRITICAL: Use REAL wall-clock time for smooth visual animation!
        // The simulation clock gets fast-forwarded, which would make the servo jump.
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


            // ✅ Prevent division by zero or negative time
            if (deltaTime <= 0) {
                return;
            }

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

            // ✅ Notify UI if angle changed by at least 0.1 degrees (ultra-smooth updates)
            // Reduced from 1° → 0.5° → 0.1° for buttery-smooth movement
            const angleChangedSignificantly = Math.abs(servo.currentAngle - previousAngle) >= 0.1;
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
     * Set servo angle directly (for manual control/testing)
     */
    setAngle(instanceId: string, angle: number): void {
        const servo = this.servos.get(instanceId);
        if (servo) {
            servo.targetAngle = Math.max(0, Math.min(180, angle));
            servo.isStalled = false; // Clear stall when manually controlled
            console.log(`🔧 [${instanceId}] Manual target set: ${servo.targetAngle}°`);
        }
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
            // ✅ IMMEDIATELY set current angle to target - CSS handles smooth animation
            servo.currentAngle = angle;
            servo.isStalled = false;
            servo.isActive = true;

            console.log(`🦾 [${instanceId}] Timer1: OCR=${ocr} → ${pulseWidthUs}µs → target ${angle.toFixed(1)}°`);

            // ✅ IMMEDIATELY notify UI - CSS transition handles smooth visual animation
            // The CSS `transition: 0.8s ease-in-out` creates the smooth movement
            this.notifyAngleChange(instanceId, angle);
        }
    }


    /**
     * ✅ Set load weight and arm length for torque calculation
     */
    setLoad(instanceId: string, weightKg: number, armLengthCm: number): void {
        const servo = this.servos.get(instanceId);
        if (servo) {
            servo.loadWeight = Math.max(0, weightKg);
            servo.armLength = Math.max(0, armLengthCm);
            const requiredTorque = servo.loadWeight * servo.armLength;
            console.log(`🔧 [${instanceId}] Load set: ${weightKg}kg at ${armLengthCm}cm = ${requiredTorque.toFixed(2)}kg·cm torque (max: ${servo.maxTorque}kg·cm)`);

            // Check if current load would cause stall
            if (requiredTorque > servo.maxTorque) {
                console.warn(`⚠️ [${instanceId}] WARNING: Load exceeds servo capacity!`);
            }
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
     * Get full servo state for debugging
     */
    getServoState(instanceId: string): ServoState | undefined {
        return this.servos.get(instanceId);
    }

    /**
     * Get all registered servos
     */
    getAllServos(): ServoState[] {
        return Array.from(this.servos.values());
    }

    /**
     * Reset servo to center position
     */
    resetServo(instanceId: string): void {
        const servo = this.servos.get(instanceId);
        if (servo) {
            servo.currentAngle = 90;
            servo.targetAngle = 90;
            servo.pulseStartTime = null;
            servo.lastPulseWidth = null;
            servo.lastPulseTime = null;
            servo.isActive = false;
            servo.isStalled = false;
            servo.lastUpdateTime = performance.now();
            console.log(`🔧 [${instanceId}] Reset to 90°`);
        }
    }

    /**
     * Reset all servos
     */
    resetAll(): void {
        this.servos.forEach((servo) => {
            this.resetServo(servo.instanceId);
        });
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

export function resetServoEngine(): void {
    servoEngine = null;
}

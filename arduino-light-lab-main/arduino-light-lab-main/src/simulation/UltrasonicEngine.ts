/**
 * HC-SR04 Ultrasonic Sensor Backend Engine
 * 
 * Simulates realistic ultrasonic sensor behavior:
 * 1. Detects TRIG pin HIGH/LOW transitions
 * 2. Validates 10μs minimum pulse width
 * 3. Generates ECHO pulse based on distance
 * 4. Returns pulse to Arduino via ECHO pin
 * 
 * Formula: ECHO pulse width (μs) = distance (cm) × 58
 */

export interface UltrasonicSensorState {
    instanceId: string;
    trigPin: number;
    echoPin: number;
    distance: number; // Simulated distance in cm
    trigStartTime: number | null;
    trigPulseWidth: number | null; // in microseconds
    isActive: boolean;
}

export class UltrasonicSensorEngine {
    private sensors: Map<string, UltrasonicSensorState> = new Map();
    private pinToSensor: Map<number, string> = new Map();
    private onEchoPulse?: (pin: number, pulseWidth: number) => void;

    constructor(onEchoPulse?: (pin: number, pulseWidth: number) => void) {
        this.onEchoPulse = onEchoPulse;
    }

    /**
     * Register an HC-SR04 sensor
     */
    registerSensor(instanceId: string, trigPin: number, echoPin: number): void {
        const sensor: UltrasonicSensorState = {
            instanceId,
            trigPin,
            echoPin,
            distance: 20, // Default 20cm
            trigStartTime: null,
            trigPulseWidth: null,
            isActive: false,
        };

        this.sensors.set(instanceId, sensor);
        this.pinToSensor.set(trigPin, instanceId);

        console.log(`✅ HC-SR04 registered: ${instanceId} (TRIG=${trigPin}, ECHO=${echoPin})`);
    }

    /**
     * Unregister sensor
     */
    unregisterSensor(instanceId: string): void {
        const sensor = this.sensors.get(instanceId);
        if (sensor) {
            this.pinToSensor.delete(sensor.trigPin);
            this.sensors.delete(instanceId);
        }
    }

    /**
     * Update simulated distance for a sensor
     */
    setDistance(instanceId: string, distance: number): void {
        const sensor = this.sensors.get(instanceId);
        if (sensor) {
            sensor.distance = Math.max(2, Math.min(400, distance)); // 2-400cm range
        }
    }

    /**
     * Pin change handler - called when Arduino changes a pin state
     * This is the critical integration point with the CPU emulator
     */
    onPinChange(pin: number, level: number, timestamp: number): void {
        const sensorId = this.pinToSensor.get(pin);
        if (!sensorId) return;

        const sensor = this.sensors.get(sensorId);
        if (!sensor) return;

        // TRIG pin state change detected
        if (pin === sensor.trigPin) {
            this.handleTrigChange(sensor, level, timestamp);
        }
    }

    /**
     * Handle TRIG pin transitions
     */
    private handleTrigChange(sensor: UltrasonicSensorState, level: number, timestamp: number): void {
        if (level === 1) {
            // TRIG went HIGH - record start time
            sensor.trigStartTime = timestamp;
            sensor.isActive = true;
            console.log(`📡 [${sensor.instanceId}] TRIG HIGH at ${timestamp}μs`);
        } else if (level === 0 && sensor.trigStartTime !== null) {
            // TRIG went LOW - calculate pulse width
            const pulseWidth = timestamp - sensor.trigStartTime;
            sensor.trigPulseWidth = pulseWidth;

            console.log(`📡 [${sensor.instanceId}] TRIG LOW - Pulse width: ${pulseWidth}μs`);

            // Validate minimum 10μs pulse
            if (pulseWidth >= 10) {
                // Valid TRIG pulse - generate ECHO response
                this.generateEchoPulse(sensor, timestamp);
            } else {
                console.warn(`⚠️ [${sensor.instanceId}] TRIG pulse too short: ${pulseWidth}μs (min 10μs)`);
            }

            // Reset
            sensor.trigStartTime = null;
            sensor.isActive = false;
        }
    }

    /**
     * Generate ECHO pulse based on simulated distance
     */
    private generateEchoPulse(sensor: UltrasonicSensorState, timestamp: number): void {
        // Calculate ECHO pulse width from distance
        // Formula: pulse (μs) = distance (cm) × 58
        const echoPulseWidth = Math.round(sensor.distance * 58);

        console.log(`📡 [${sensor.instanceId}] Distance: ${sensor.distance}cm → ECHO pulse: ${echoPulseWidth}μs`);

        // Notify emulator to set ECHO pin HIGH
        if (this.onEchoPulse) {
            this.onEchoPulse(sensor.echoPin, echoPulseWidth);
        }

        // Alternative: Direct pin manipulation (if available)
        // this.setPinLevel(sensor.echoPin, 1);
        // setTimeout(() => this.setPinLevel(sensor.echoPin, 0), echoPulseWidth / 1000);
    }

    /**
     * Get sensor state for debugging
     */
    getSensorState(instanceId: string): UltrasonicSensorState | undefined {
        return this.sensors.get(instanceId);
    }

    /**
     * Get all registered sensors
     */
    getAllSensors(): UltrasonicSensorState[] {
        return Array.from(this.sensors.values());
    }
}

// Singleton instance
let ultrasonicEngine: UltrasonicSensorEngine | null = null;

export function getUltrasonicEngine(
    onEchoPulse?: (pin: number, pulseWidth: number) => void
): UltrasonicSensorEngine {
    if (!ultrasonicEngine) {
        ultrasonicEngine = new UltrasonicSensorEngine(onEchoPulse);
    }
    return ultrasonicEngine;
}

export function resetUltrasonicEngine(): void {
    ultrasonicEngine = null;
}

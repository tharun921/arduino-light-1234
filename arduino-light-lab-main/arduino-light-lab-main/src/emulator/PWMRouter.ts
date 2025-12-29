/**
 * PWM Router - Routes PWM signals from timers to components
 * 
 * This bridges Timer hardware (OCR registers) to component engines
 * (ServoEngine, LED controllers, etc.)
 */

import { getServoEngine } from '../simulation/ServoEngine';
import { getSimulationClock } from './SimulationClock';  // ✅ CRITICAL FIX: Use simulation time!

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
                    // ✅ CRITICAL FIX: Use simulation time, NOT real-world browser time!
                    // The ServoEngine expects timestamps in simulation microseconds,
                    // not performance.now() which is browser uptime.
                    const simClock = getSimulationClock();
                    const now = simClock.getMicros();  // ✅ Correct method name

                    // Simulate HIGH→LOW transition with measured pulse width
                    servoEngine.onPinChange(pin, 1, now);
                    servoEngine.onPinChange(pin, 0, now + pulseWidthMicros);

                    console.log(`  → Forwarded to Servo ${servo.instanceId}: ${pulseWidthMicros}µs (sim time: ${now}µs)`);
                }
            }
        }

        // Route to LED PWM (Pins 3, 5, 6, 9, 10, 11)
        // TODO: Implement LED brightness control

        // Route to Motor Controllers
        // TODO: Implement motor speed control
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

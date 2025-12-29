/**
 * Simulation Clock - The master timekeeper for the simulator
 * 
 * ✅ SINGLE SOURCE OF TRUTH for all timing in the simulation
 * 
 * Synchronizes CPU cycles with real-world time units (microseconds/milliseconds).
 * This ensures that Servo physics, PWM measurement, and all timing-critical
 * components use the same timebase.
 * 
 * Key Principle: CPU cycles are discrete integers, but physics needs continuous time.
 * This class bridges that gap by converting cycles → microseconds with high precision.
 */

const CPU_FREQUENCY = 16_000_000; // 16 MHz (Arduino Uno)

export class SimulationClock {
    private cpuCycles: number = 0;

    constructor() {
        console.log('🕒 Simulation Clock initialized at 16MHz');
    }

    /**
     * Advance the simulation clock by CPU cycles
     * This is the PRIMARY method for updating time
     */
    tick(cycles: number): void {
        if (cycles > 0) {
            this.cpuCycles += cycles;
        }
    }

    /**
     * Alias for tick() - adds CPU cycles to the clock
     * Used by AVR8jsWrapper for clarity
     */
    addCycles(cycles: number): void {
        this.tick(cycles);
    }

    /**
     * Reset the clock (used on CPU reset)
     */
    reset(): void {
        this.cpuCycles = 0;
        console.log('🕒 Simulation Clock reset to 0');
    }

    /**
     * Get total CPU cycles executed
     */
    getCycles(): number {
        return this.cpuCycles;
    }

    /**
     * Get simulation time in milliseconds
     * Useful for smooth UI animations and deltaTime calculations
     */
    getMillis(): number {
        return (this.cpuCycles / CPU_FREQUENCY) * 1000;
    }

    /**
     * Get simulation time in microseconds
     * This is the EXACT value ServoEngine needs to measure PWM pulse width
     * 
     * Formula: (Cycles / ClockSpeed) * 1,000,000
     * Example: 16 cycles → (16 / 16,000,000) * 1,000,000 = 1µs
     */
    getMicros(): number {
        return (this.cpuCycles / CPU_FREQUENCY) * 1_000_000;
    }

    /**
     * Alias for getMicros() - for compatibility with different naming conventions
     */
    getTimeMicroseconds(): number {
        return this.getMicros();
    }

    /**
     * Alias for getMillis() - for compatibility with different naming conventions
     */
    getTimeMilliseconds(): number {
        return this.getMillis();
    }

    /**
     * Get simulation time in seconds
     */
    getSeconds(): number {
        return this.cpuCycles / CPU_FREQUENCY;
    }

    /**
     * Convert microseconds to CPU cycles
     */
    microsToCycles(micros: number): number {
        return Math.round((micros / 1_000_000) * CPU_FREQUENCY);
    }

    /**
     * Convert milliseconds to CPU cycles
     */
    millisToCycles(millis: number): number {
        return Math.round((millis / 1000) * CPU_FREQUENCY);
    }
}

// Global singleton instance
let clockInstance: SimulationClock | null = null;

export function getSimulationClock(): SimulationClock {
    if (!clockInstance) {
        clockInstance = new SimulationClock();
    }
    return clockInstance;
}

export function resetSimulationClock(): void {
    if (clockInstance) {
        clockInstance.reset();
    }
}

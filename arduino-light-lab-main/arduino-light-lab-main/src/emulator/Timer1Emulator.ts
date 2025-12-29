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
import { getSimulationClock } from './SimulationClock';

console.log('🔧 Timer1Emulator.ts module loaded!');

// ATmega328P Timer1 Register Addresses (in data memory)
const TCCR1A = 0x80;  // Timer/Counter1 Control Register A
const TCCR1B = 0x81;  // Timer/Counter1 Control Register B
const TCCR1C = 0x82;  // Timer/Counter1 Control Register C
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
    private lastCycleCount: number = 0;
    private fractionalCycles: number = 0;  // ✅ Accumulate fractional cycles
    private overflowCount: number = 0;     // ✅ Track overflows for logging

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
            case 2: return 8;      // clk/8
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
     * 🔥 CRITICAL FIX: Now generates PWM pulses on EVERY overflow (not just OCR changes)
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
        const ocr1b = this.read16(dataMemory, OCR1BL, OCR1BH);
        const icr1 = this.read16(dataMemory, ICR1L, ICR1H);

        // Read TOP value (depends on mode)
        const mode = this.getWaveformMode(tccr1a, tccr1b);
        let top = 65535; // Default for Normal mode

        if (mode.includes('ICR1')) {
            top = icr1 || 65535;
        } else if (mode.includes('OCR1A')) {
            top = ocr1a || 65535;
        } else if (mode.includes('8-bit')) {
            top = 255;
        } else if (mode.includes('9-bit')) {
            top = 511;
        } else if (mode.includes('10-bit')) {
            top = 1023;
        }

        // Save old counter to detect overflow
        const oldCounter = this.counter;

        // ✅ FIX: Accumulate fractional cycles to handle small cpuCycles values
        // With prescaler=8, we need 8 CPU cycles to increment timer by 1
        // But step() might only pass 1-2 cycles at a time
        this.fractionalCycles += cpuCycles;
        const timerTicks = Math.floor(this.fractionalCycles / prescaler);
        this.fractionalCycles -= timerTicks * prescaler;  // Keep remainder

        this.counter += timerTicks;

        // DEBUG: Disabled to reduce console spam
        // if (this.counter > 0 && this.counter % 10000 === 0) {
        //     console.log(`⏱️ Timer1 Counter: ${this.counter} / ${top} (${Math.round(this.counter / top * 100)}%)`);
        // }

        // ✅ RE-ENABLED: Generate PWM pulses on overflow (needed for servo refresh!)
        // Servo position is controlled by TWO mechanisms working together:
        // 1. AVR8jsWrapper.observeTimer1() - Detects OCR changes and sets initial position
        // 2. This overflow logic - Provides continuous 50Hz PWM refresh (servos need this!)
        if (this.counter >= top && top > 0) {
            // Reset counter first
            this.counter = 0;

            // ✅ Only generate pulses if we're in Servo mode (ICR1 = 40000 for 50Hz)
            // This prevents pulse generation in other Timer1 modes
            if (icr1 === 40000 && (ocr1a > 0 || ocr1b > 0)) {
                const router = getPWMRouter();

                // Generate pulse for Pin 9 (OC1A) if OCR1A is set
                if (ocr1a > 0) {
                    // Calculate pulse width for Servo library
                    // Pulse width (µs) = (OCR1A / ICR1) * 20000
                    // Example: OCR1A=3000, ICR1=40000 → (3000/40000)*20000 = 1500µs (90°)
                    const pulseWidthMicros = Math.round((ocr1a / icr1) * 20000);

                    // Only log occasionally to avoid spam
                    if (this.overflowCount % 50 === 0) {
                        console.log(`🎛️ Timer1 PWM: OCR1A=${ocr1a} → ${pulseWidthMicros}µs pulse on Pin 9`);
                    }

                    router.generatePulse(9, pulseWidthMicros, 50);
                }

                // Generate pulse for Pin 10 (OC1B) if OCR1B is set
                if (ocr1b > 0) {
                    const pulseWidthMicros = Math.round((ocr1b / icr1) * 20000);
                    router.generatePulse(10, pulseWidthMicros, 50);
                }

                this.overflowCount++;
            }
        }

        // Write counter back to registers
        dataMemory[TCNT1L] = this.counter & 0xFF;
        dataMemory[TCNT1H] = (this.counter >> 8) & 0xFF;
    }

    private diagnosticCounter = 0;

    /**
     * Check for OCR register changes and generate PWM pulses
     */
    checkOCRChanges(dataMemory: Uint8Array): void {
        // Read current OCR values
        const ocr1a = this.read16(dataMemory, OCR1AL, OCR1AH);
        const ocr1b = this.read16(dataMemory, OCR1BL, OCR1BH);
        const icr1 = this.read16(dataMemory, ICR1L, ICR1H);
        const tccr1a = dataMemory[TCCR1A];
        const tccr1b = dataMemory[TCCR1B];

        // 🔍 DIAGNOSTIC: Log Timer1 state every 10000 checks
        this.diagnosticCounter++;
        if (this.diagnosticCounter % 10000 === 0) {
            console.log(`🔍 [Timer1 Diagnostic #${this.diagnosticCounter}]`);
            console.log(`   TCCR1A = 0x${tccr1a.toString(16).padStart(2, '0')} | TCCR1B = 0x${tccr1b.toString(16).padStart(2, '0')}`);
            console.log(`   ICR1   = ${icr1} (0x${icr1.toString(16)})`);
            console.log(`   OCR1A  = ${ocr1a} (0x${ocr1a.toString(16)})`);
            console.log(`   OCR1B  = ${ocr1b} (0x${ocr1b.toString(16)})`);
            console.log(`   Counter = ${this.counter}`);

            if (icr1 === 0 && ocr1a === 0 && tccr1a === 0) {
                console.log(`   ⚠️ Timer1 appears UNINITIALIZED - Servo library not used or failed to initialize`);
            }
        }

        // Track ICR1 changes (PWM TOP value)
        if (icr1 !== this.prevICR1 && icr1 > 0) {
            this.prevICR1 = icr1;
            console.log(`⏱️ Timer1: ICR1 = ${icr1} (PWM TOP)`);
        }

        // ❌ DISABLED: PWM pulse generation on OCR changes
        // Servo updates now come from AVR8jsWrapper.observeTimer1()
        // which directly monitors OCR registers (simpler, cleaner approach)
        /*
        // Check OCR1A changes (Pin 9)
        if (ocr1a !== this.prevOCR1A && icr1 > 0) {
            this.prevOCR1A = ocr1a;

            // Calculate pulse width for Servo
            // Servo library uses Phase-Correct PWM mode 10:
            // Frequency = F_CPU / (2 * Prescaler * ICR1)
            // 16MHz / (2 * 8 * 40000) = 50Hz
            // Pulse width = (OCR1A / ICR1) * Period / 2
            // Period / 2 = 10ms = 10000μs  
            const pulseWidthMicros = Math.round((ocr1a / icr1) * 20000);

            console.log(`⏱️ Timer1: OCR1A = ${ocr1a} → ${pulseWidthMicros}µs pulse on Pin 9`);

            // Route to PWM Router → ServoEngine
            const router = getPWMRouter();
            router.generatePulse(9, pulseWidthMicros, 50);
        }

        // Check OCR1B changes (Pin 10)
        if (ocr1b !== this.prevOCR1B && icr1 > 0) {
            this.prevOCR1B = ocr1b;

            const pulseWidthMicros = Math.round((ocr1b / icr1) * 20000);

            console.log(`⏱️ Timer1: OCR1B = ${ocr1b} → ${pulseWidthMicros}µs pulse on Pin 10`);

            const router = getPWMRouter();
            router.generatePulse(10, pulseWidthMicros, 50);
        }
        */
    }

    /**
     * Reset timer state
     */
    reset(): void {
        this.counter = 0;
        this.prevOCR1A = 0;
        this.prevOCR1B = 0;
        this.prevICR1 = 0;
        this.lastCycleCount = 0;
    }

    /**
     * Get current counter value
     */
    getCounter(): number {
        return this.counter;
    }
}

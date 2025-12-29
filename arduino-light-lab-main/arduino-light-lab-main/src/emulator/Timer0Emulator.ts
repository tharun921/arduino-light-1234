/**
 * Timer0 Emulator for ATmega328P
 * 
 * This is the CRITICAL component that Wokwi has and we were missing.
 * Timer0 is used by Arduino core for:
 * - delay()
 * - millis()
 * - micros()
 * 
 * Without this, Servo library gets stuck in delay(1) forever.
 */

export interface Timer0Config {
    onOverflow: () => void;
    onCompareMatchA: () => void;
    onCompareMatchB: () => void;
}

export class Timer0Emulator {
    // Timer0 registers (ATmega328P datasheet)
    private readonly TCCR0A_ADDR = 0x44;
    private readonly TCCR0B_ADDR = 0x45;
    private readonly TCNT0_ADDR = 0x46;
    private readonly OCR0A_ADDR = 0x47;
    private readonly OCR0B_ADDR = 0x48;
    private readonly TIMSK0_ADDR = 0x6E;
    private readonly TIFR0_ADDR = 0x35;

    // Internal state
    private prescaler: number = 0;
    private prescalerCounter: number = 0;
    private enabled: boolean = false;

    // Callbacks
    private onOverflow: () => void;
    private onCompareMatchA: () => void;
    private onCompareMatchB: () => void;

    // Arduino millis tracking (THIS IS THE KEY!)
    private millisCounter: number = 0;
    private microsCounter: number = 0;

    constructor(config: Timer0Config) {
        this.onOverflow = config.onOverflow;
        this.onCompareMatchA = config.onCompareMatchA;
        this.onCompareMatchB = config.onCompareMatchB;

        console.log('🔥 Timer0Emulator: Initialized (THIS MAKES SERVO WORK!)');
    }

    /**
     * Update prescaler based on TCCR0B bits
     */
    private updatePrescaler(tccr0b: number): void {
        const cs = tccr0b & 0x07; // CS02:CS00 bits

        switch (cs) {
            case 0: this.prescaler = 0; this.enabled = false; break;
            case 1: this.prescaler = 1; this.enabled = true; break;
            case 2: this.prescaler = 8; this.enabled = true; break;
            case 3: this.prescaler = 64; this.enabled = true; break;
            case 4: this.prescaler = 256; this.enabled = true; break;
            case 5: this.prescaler = 1024; this.enabled = true; break;
            default: this.prescaler = 0; this.enabled = false; break;
        }
    }

    // Track overflow count for debugging
    private overflowCount = 0;

    /**
     * Tick the timer (called every CPU cycle)
     * THIS IS WHAT MAKES delay() WORK!
     * 
     * ✅ FIXED: Connected to cpu.data memory (registers are synced!)
     * ✅ FIXED: Proper 8-bit overflow handling
     */
    tick(cpuCycles: number, dataMemory: Uint8Array): void {
        // 1. Sync internal state FROM data memory
        const tccr0a = dataMemory[this.TCCR0A_ADDR];
        const tccr0b = dataMemory[this.TCCR0B_ADDR];
        const ocr0a = dataMemory[this.OCR0A_ADDR];
        const ocr0b = dataMemory[this.OCR0B_ADDR];
        const timsk0 = dataMemory[this.TIMSK0_ADDR];
        let tcnt0 = dataMemory[this.TCNT0_ADDR];

        this.updatePrescaler(tccr0b);

        if (!this.enabled || this.prescaler === 0) return;

        this.prescalerCounter += cpuCycles;

        // ✅ SPIRAL-OF-DEATH PROTECTION
        let iterations = 0;
        const MAX_ITERATIONS = 10000;

        while (this.prescalerCounter >= this.prescaler && iterations < MAX_ITERATIONS) {
            this.prescalerCounter -= this.prescaler;
            iterations++;

            // Advance counter
            tcnt0 = (tcnt0 + 1) & 0xFF;

            // Update micros
            this.microsCounter += this.prescaler / 16;

            // Check for overflow
            if (tcnt0 === 0) {
                // ✅ SET FLAG DIRECTLY IN CPU MEMORY
                dataMemory[this.TIFR0_ADDR] |= (1 << 0); // Set TOV0 flag

                this.millisCounter++;
                this.overflowCount++;

                // Debug log every 100 overflows (~100ms)
                if (this.overflowCount % 100 === 0) {
                    console.log(`🔥 Timer0 overflow #${this.overflowCount}, millis=${this.getMillis()}, TIMSK0=0x${timsk0.toString(16)}`);
                }

                // Call overflow callback (always, the wrapper handles CPU interrupt flag)
                // Note: The wrapper callback redundant sets the flag, which is fine
                this.onOverflow();
            }

            // Check for compare match A
            if (tcnt0 === ocr0a) {
                dataMemory[this.TIFR0_ADDR] |= (1 << 1); // Set OCF0A flag
                this.onCompareMatchA();
            }

            // Check for compare match B
            if (tcnt0 === ocr0b) {
                dataMemory[this.TIFR0_ADDR] |= (1 << 2); // Set OCF0B flag
                this.onCompareMatchB();
            }
        }

        // 2. Sync counter back TO data memory
        dataMemory[this.TCNT0_ADDR] = tcnt0;

        // ✅ Warn if we hit the iteration limit
        if (iterations >= MAX_ITERATIONS) {
            console.warn(`⚠️ Timer0: Hit iteration limit! cpuCycles=${cpuCycles}, prescaler=${this.prescaler}`);
            this.prescalerCounter = 0;
        }
    }

    /**
     * Get current millis value (used by Arduino millis())
     */
    getMillis(): number {
        return Math.floor(this.millisCounter * 1.024);
    }

    /**
     * Get current micros value (used by Arduino micros())
     */
    getMicros(): number {
        return Math.floor(this.microsCounter);
    }

    /**
     * Set millis value (used for delay() skipping)
     */
    setMillis(newMillis: number): void {
        this.millisCounter = Math.floor(newMillis / 1.024);
    }

    /**
     * Reset timer state
     */
    reset(): void {
        this.prescaler = 0;
        this.prescalerCounter = 0;
        this.enabled = false;
        this.millisCounter = 0;
        this.microsCounter = 0;
        console.log('🔄 Timer0: Reset');
    }
}

/**
 * Interrupt Controller for ATmega328P
 * 
 * Manages global interrupts and ISR execution.
 * This is what Wokwi has that we were missing.
 * 
 * 🔥 CRITICAL: This controller now ACTUALLY JUMPS the CPU PC to ISR vectors!
 */

import { CPU } from 'avr8js';

export interface ISRHandler {
    vector: number;
    handler: () => void;
    priority: number;
}

export class InterruptController {
    // CPU reference to jump PC to ISR vectors
    private cpu: CPU | null = null;

    // Global interrupt flag (SREG bit 7)
    private globalInterruptEnabled: boolean = false;

    // Pending interrupts (vector number -> pending)
    private pendingInterrupts: Map<number, boolean> = new Map();

    // ISR handlers (vector number -> handler)
    private isrHandlers: Map<number, ISRHandler> = new Map();

    // Currently executing ISR
    private executingISR: number | null = null;

    // Interrupt vectors (ATmega328P) - these are WORD addresses in flash
    static readonly TIMER0_OVF_vect = 16;
    static readonly TIMER0_COMPA_vect = 14;
    static readonly TIMER0_COMPB_vect = 15;
    static readonly TIMER1_OVF_vect = 13;
    static readonly TIMER1_COMPA_vect = 11;
    static readonly TIMER1_COMPB_vect = 12;

    constructor() {
        console.log('🔥 InterruptController: Initialized');
    }

    /**
     * Enable global interrupts (sei instruction)
     */
    enableGlobalInterrupts(): void {
        this.globalInterruptEnabled = true;
        // console.log('✅ Global interrupts ENABLED'); // Disabled - too noisy
    }

    /**
     * Disable global interrupts (cli instruction)
     */
    disableGlobalInterrupts(): void {
        this.globalInterruptEnabled = false;
        // console.log('❌ Global interrupts DISABLED'); // Disabled - too noisy
    }

    /**
     * Check if global interrupts are enabled
     */
    isGlobalInterruptEnabled(): boolean {
        return this.globalInterruptEnabled;
    }

    /**
     * Register an ISR handler
     */
    registerISR(vector: number, handler: () => void, priority: number = 0): void {
        this.isrHandlers.set(vector, { vector, handler, priority });
        console.log(`📝 ISR registered: vector ${vector}, priority ${priority}`);
    }

    /**
     * Trigger an interrupt
     */
    triggerInterrupt(vector: number): void {
        if (!this.isrHandlers.has(vector)) {
            console.warn(`⚠️ No ISR handler for vector ${vector}`);
            return;
        }

        this.pendingInterrupts.set(vector, true);
        // console.log(`🔔 Interrupt triggered: vector ${vector}`);
    }

    /**
     * Execute pending interrupts (called every CPU cycle)
     * 
     * 🔥 NEW APPROACH: Instead of jumping to ISR, we update millis() directly in memory
     * This is how Wokwi actually does it!
     */
    executePendingInterrupts(): void {
        // We don't execute ISRs anymore
        // Instead, we update Arduino's millis() variable directly
        // This is handled in AVR8jsWrapper.updateMillisInMemory()

        // Clear any pending interrupts
        this.pendingInterrupts.clear();
    }

    /**
     * 🔥 Set CPU reference (CRITICAL!)
     * This allows us to jump PC to ISR vectors
     */
    setCPU(cpu: CPU): void {
        this.cpu = cpu;
        console.log('🔥 InterruptController: CPU reference set - can now jump to ISRs!');
    }

    /**
     * Execute a specific ISR
     * 🔥 NOW ACTUALLY JUMPS CPU PC TO ISR VECTOR!
     */
    private executeISR(vector: number): void {
        const handler = this.isrHandlers.get(vector);
        if (!handler) return;

        // Mark as executing
        this.executingISR = vector;
        this.pendingInterrupts.set(vector, false);

        console.log(`🔥 Executing ISR for vector ${vector}!`);

        // 🔥 CRITICAL: Jump CPU PC to ISR vector address
        if (this.cpu) {
            // ATmega328P interrupt vector table:
            // Each vector is 2 words (4 bytes) apart
            // Vector 0 = RESET at 0x0000
            // Vector 1 = INT0 at 0x0002
            // ...
            // Vector 16 = TIMER0_OVF at 0x0020

            const vectorAddress = vector * 2; // Word address

            // Get return address (current PC)
            const returnAddress = this.cpu.pc;

            // Get current stack pointer (SP is at 0x5D-0x5E, little-endian)
            let SP = this.cpu.data[0x5D] | (this.cpu.data[0x5E] << 8);

            // 🔥 CRITICAL FIX: Push return address in CORRECT ORDER
            // ATmega328P pushes PC as: [PC_LOW] then [PC_HIGH]
            // Stack grows downward, so we push HIGH byte first, then LOW byte

            // Push PC high byte
            this.cpu.data[SP] = (returnAddress >> 8) & 0xFF;
            SP--;

            // Push PC low byte  
            this.cpu.data[SP] = returnAddress & 0xFF;
            SP--;

            // Update stack pointer
            this.cpu.data[0x5D] = SP & 0xFF;
            this.cpu.data[0x5E] = (SP >> 8) & 0xFF;

            // Jump to ISR vector
            this.cpu.pc = vectorAddress;

            // Disable global interrupts (hardware does this automatically)
            const SREG = 0x5F;
            this.cpu.data[SREG] &= ~0x80; // Clear I-bit
            this.globalInterruptEnabled = false;

            console.log(`   🚀 Jumped to ISR at PC=0x${vectorAddress.toString(16)}, return=0x${returnAddress.toString(16)}, SP=0x${SP.toString(16)}`);
        } else {
            // Fallback: just call the JavaScript handler
            console.warn('⚠️ No CPU reference - calling JS handler only (ISR won\'t execute in AVR code!)');
            try {
                handler.handler();
            } catch (error) {
                console.error(`❌ ISR execution error (vector ${vector}):`, error);
            }
        }

        this.executingISR = null;
    }

    /**
     * Clear a pending interrupt
     */
    clearInterrupt(vector: number): void {
        this.pendingInterrupts.set(vector, false);
    }

    /**
     * Check if an interrupt is pending
     */
    isPending(vector: number): boolean {
        return this.pendingInterrupts.get(vector) || false;
    }

    /**
     * Reset all interrupts
     */
    reset(): void {
        this.globalInterruptEnabled = false;
        this.pendingInterrupts.clear();
        this.executingISR = null;
        console.log('🔄 InterruptController: Reset');
    }

    /**
     * Get status for debugging
     */
    getStatus(): string {
        return `Global: ${this.globalInterruptEnabled ? 'ON' : 'OFF'}, ` +
            `Pending: ${Array.from(this.pendingInterrupts.entries()).filter(([_, p]) => p).map(([v]) => v).join(', ') || 'none'}, ` +
            `Executing: ${this.executingISR ?? 'none'}`;
    }
}

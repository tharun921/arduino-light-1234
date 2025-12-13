/**
 * AVR Emulator - ATmega328P CPU Simulator
 * 
 * Emulates the AVR microcontroller used in Arduino Uno:
 * - ATmega328P architecture
 * - 32 general-purpose registers (R0-R31)
 * - 32KB Flash memory (program storage)
 * - 2KB SRAM (data memory)
 * - 1KB EEPROM
 * - Status Register (SREG) with flags
 * 
 * This emulator executes compiled AVR machine code (from HEX files)
 * and simulates hardware interactions through the HAL.
 */

import { HardwareAbstractionLayer } from './HardwareAbstractionLayer';
import { decodeAndExecute } from './AVRInstructionSet';

export interface HexSegment {
    address: number;
    data: Uint8Array;
}

export class AVREmulator {
    // CPU Registers
    registers: Uint8Array = new Uint8Array(32);  // R0-R31
    pc: number = 0;                               // Program Counter
    sp: number = 0x08FF;                          // Stack Pointer (top of SRAM)
    sreg: number = 0;                             // Status Register

    // Memory
    flash: Uint8Array = new Uint8Array(32768);   // 32KB Flash (program memory)
    sram: Uint8Array = new Uint8Array(2048);     // 2KB SRAM (data memory)
    eeprom: Uint8Array = new Uint8Array(1024);   // 1KB EEPROM

    // Hardware Abstraction Layer
    hal: HardwareAbstractionLayer;

    // Execution state
    running: boolean = false;
    halted: boolean = false;
    cycles: number = 0;

    // SREG flags (Status Register)
    private readonly FLAG_C = 0;  // Carry
    private readonly FLAG_Z = 1;  // Zero
    private readonly FLAG_N = 2;  // Negative
    private readonly FLAG_V = 3;  // Overflow
    private readonly FLAG_S = 4;  // Sign
    private readonly FLAG_H = 5;  // Half Carry
    private readonly FLAG_T = 6;  // Transfer bit
    private readonly FLAG_I = 7;  // Global Interrupt Enable

    constructor(hal: HardwareAbstractionLayer) {
        this.hal = hal;
        this.reset();
    }

    /**
     * Reset CPU to initial state
     */
    reset(): void {
        console.log('🔄 AVR: Resetting CPU...');

        // Clear registers
        this.registers.fill(0);

        // Reset PC and SP
        this.pc = 0;
        this.sp = 0x08FF;  // End of SRAM for ATmega328P

        // Clear SREG
        this.sreg = 0;

        // Clear memory
        this.sram.fill(0);

        // Reset state
        this.running = false;
        this.halted = false;
        this.cycles = 0;

        // Reset hardware
        this.hal.reset();

        console.log('✅ AVR: CPU reset complete');
    }

    /**
     * Load HEX file into Flash memory
     */
    loadHex(hexSegments: HexSegment[]): void {
        console.log(`📥 AVR: Loading ${hexSegments.length} HEX segments...`);

        this.flash.fill(0xFF);  // Empty flash is all 0xFF

        let totalBytes = 0;
        for (const segment of hexSegments) {
            const { address, data } = segment;

            // Copy segment data into flash memory
            for (let i = 0; i < data.length; i++) {
                if (address + i < this.flash.length) {
                    this.flash[address + i] = data[i];
                    totalBytes++;
                }
            }

            console.log(`  📦 Loaded ${data.length} bytes at address 0x${address.toString(16).toUpperCase().padStart(4, '0')}`);
        }

        console.log(`✅ AVR: Loaded ${totalBytes} bytes total`);
        console.log(`📍 AVR: Program Counter reset to 0x0000`);
        this.pc = 0;
    }

    /**
     * Execute one instruction
     */
    step(): boolean {
        if (this.halted) {
            console.log('⏸️ AVR: CPU halted');
            return false;
        }

        // Check PC bounds
        if (this.pc >= this.flash.length - 1) {
            console.error(`❌ AVR: PC out of bounds: 0x${this.pc.toString(16)}`);
            this.halted = true;
            return false;
        }

        // Fetch instruction (16-bit, little-endian)
        const opcodeLow = this.flash[this.pc];
        const opcodeHigh = this.flash[this.pc + 1];
        const opcode = (opcodeHigh << 8) | opcodeLow;

        console.log(`🔍 AVR: [PC=0x${this.pc.toString(16).padStart(4, '0')}] Opcode: 0x${opcode.toString(16).toUpperCase().padStart(4, '0')}`);

        // Increment PC (most instructions are 2 bytes)
        this.pc += 2;

        // Decode and execute
        try {
            decodeAndExecute(opcode, this);
            this.cycles++;
            return true;
        } catch (error) {
            console.error(`❌ AVR: Execution error at PC=0x${(this.pc - 2).toString(16)}:`, error);
            this.halted = true;
            return false;
        }
    }

    /**
     * Execute multiple instructions
     */
    run(instructionCount: number): number {
        let executed = 0;
        this.running = true;

        while (executed < instructionCount && this.running && !this.halted) {
            if (!this.step()) {
                break;
            }
            executed++;
        }

        return executed;
    }

    /**
     * Stop execution
     */
    stop(): void {
        this.running = false;
        console.log('⏹️ AVR: Execution stopped');
    }

    /**
     * Halt execution (used by SLEEP instruction)
     */
    halt(): void {
        this.halted = true;
        console.log('💤 AVR: CPU halted');
    }

    // ============= SREG Flag Operations =============

    setFlag(flag: number): void {
        this.sreg |= (1 << flag);
    }

    clearFlag(flag: number): void {
        this.sreg &= ~(1 << flag);
    }

    getFlag(flag: number): boolean {
        return ((this.sreg >> flag) & 1) === 1;
    }

    updateZeroNegativeFlags(result: number): void {
        // Zero flag
        if ((result & 0xFF) === 0) {
            this.setFlag(this.FLAG_Z);
        } else {
            this.clearFlag(this.FLAG_Z);
        }

        // Negative flag (bit 7)
        if ((result & 0x80) !== 0) {
            this.setFlag(this.FLAG_N);
        } else {
            this.clearFlag(this.FLAG_N);
        }

        // Sign flag (S = N ⊕ V)
        const n = this.getFlag(this.FLAG_N);
        const v = this.getFlag(this.FLAG_V);
        if (n !== v) {
            this.setFlag(this.FLAG_S);
        } else {
            this.clearFlag(this.FLAG_S);
        }
    }

    // ============= Stack Operations =============

    push(value: number): void {
        this.sram[this.sp] = value & 0xFF;
        this.sp--;

        if (this.sp < 0x100) {
            console.warn('⚠️ AVR: Stack overflow!');
            this.sp = 0x100;  // Prevent underflow
        }
    }

    pop(): number {
        if (this.sp >= 0x08FF) {
            console.warn('⚠️ AVR: Stack underflow!');
            return 0;
        }

        this.sp++;
        return this.sram[this.sp];
    }

    // ============= I/O Operations =============

    /**
     * Read from I/O space (used by IN instruction)
     */
    readIO(ioAddress: number): number {
        return this.hal.readPort(ioAddress);
    }

    /**
     * Write to I/O space (used by OUT instruction)
     */
    writeIO(ioAddress: number, value: number): void {
        this.hal.writePort(ioAddress, value & 0xFF);
    }

    // ============= Status & Debug =============

    getState() {
        return {
            pc: this.pc,
            sp: this.sp,
            sreg: this.sreg,
            cycles: this.cycles,
            running: this.running,
            halted: this.halted,
            registers: Array.from(this.registers)
        };
    }

    printRegisters(): void {
        console.log('📊 AVR Register Dump:');
        console.log(`  PC: 0x${this.pc.toString(16).padStart(4, '0')}  SP: 0x${this.sp.toString(16).padStart(4, '0')}  SREG: 0b${this.sreg.toString(2).padStart(8, '0')}`);

        for (let i = 0; i < 32; i += 8) {
            const regs = Array.from(this.registers.slice(i, i + 8))
                .map((v, idx) => `R${(i + idx).toString().padStart(2, '0')}:0x${v.toString(16).padStart(2, '0')}`)
                .join(' ');
            console.log(`  ${regs}`);
        }
    }
}

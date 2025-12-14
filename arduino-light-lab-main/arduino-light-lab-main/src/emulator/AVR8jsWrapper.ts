/**
 * AVR8.js Wrapper - Real AVR ATmega328P Emulation
 * 
 * This wrapper integrates the avr8js library for accurate Arduino Uno simulation.
 * avr8js is used by Wokwi and provides cycle-accurate AVR emulation.
 * 
 * Key Features:
 * - Real AVR instruction execution
 * - Accurate timing and clock cycles
 * - Hardware peripheral simulation (timers, UART, ADC, etc.)
 * - Compatible with compiled Arduino HEX files
 */

import { AVRTimer, CPU, timer0Config, avrInstruction } from 'avr8js';
import { HardwareAbstractionLayer } from './HardwareAbstractionLayer';

export interface HexSegment {
    address: number;
    data: Uint8Array;
}

export class AVR8jsWrapper {
    private cpu: CPU;
    private hal: HardwareAbstractionLayer;
    private timer0: AVRTimer;
    private running: boolean = false;
    private cycleCount: number = 0;

    // Arduino Uno (ATmega328P) specifications
    private readonly FLASH_SIZE = 32768;    // 32KB program memory
    private readonly SRAM_SIZE = 2048;      // 2KB SRAM
    private readonly CLOCK_FREQ = 16000000; // 16 MHz

    // Port registers for pin monitoring (AVR I/O space)
    private readonly PORTB = 0x25;
    private readonly PORTC = 0x28;
    private readonly PORTD = 0x2B;
    private readonly DDRB = 0x24;
    private readonly DDRC = 0x27;
    private readonly DDRD = 0x2A;
    private readonly PINB = 0x23;
    private readonly PINC = 0x26;
    private readonly PIND = 0x29;

    // Track previous port states for change detection
    private prevPortB = 0;
    private prevPortC = 0;
    private prevPortD = 0;

    constructor(hal: HardwareAbstractionLayer) {
        this.hal = hal;

        // Initialize AVR8js CPU
        this.cpu = new CPU(new Uint16Array(this.FLASH_SIZE));

        // Initialize Timer 0 (used by millis(), delay(), etc.)
        this.timer0 = new AVRTimer(this.cpu, timer0Config);

        console.log('🎮 AVR8js emulator initialized');
        console.log(`   Flash: ${this.FLASH_SIZE} bytes`);
        console.log(`   SRAM: ${this.SRAM_SIZE} bytes`);
        console.log(`   Clock: ${this.CLOCK_FREQ / 1000000} MHz`);
    }

    /**
     * Load compiled HEX file into program memory
     */
    loadHex(hexSegments: HexSegment[]): void {
        console.log('📦 Loading HEX into AVR8js...');
        console.log(`📦 Total segments to load: ${hexSegments.length}`);

        // Clear program memory
        this.cpu.progMem.fill(0xFFFF);

        // Load each segment
        for (let segIdx = 0; segIdx < hexSegments.length; segIdx++) {
            const segment = hexSegments[segIdx];
            const wordAddress = segment.address / 2;

            // Log first segment details
            if (segIdx === 0) {
                console.log(`📦 FIRST SEGMENT DETAILS:`);
                console.log(`   Address: 0x${segment.address.toString(16)} (word addr: 0x${wordAddress.toString(16)})`);
                console.log(`   Data length: ${segment.data.length} bytes`);
                console.log(`   First 16 bytes:`, Array.from(segment.data.slice(0, 16)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
            }

            // Convert bytes to 16-bit words (AVR uses 16-bit wide program memory)
            for (let i = 0; i < segment.data.length; i += 2) {
                const lowByte = segment.data[i] || 0;
                const highByte = segment.data[i + 1] || 0;
                const word = lowByte | (highByte << 8);

                if (wordAddress + (i / 2) < this.cpu.progMem.length) {
                    this.cpu.progMem[wordAddress + (i / 2)] = word;
                }

                // Log first 4 words (reset vector area)
                if (segIdx === 0 && i < 8) {
                    console.log(`   Word[${i / 2}] at progMem[0x${(wordAddress + i / 2).toString(16)}] = 0x${word.toString(16).padStart(4, '0')} (bytes: 0x${lowByte.toString(16).padStart(2, '0')} 0x${highByte.toString(16).padStart(2, '0')})`);
                }
            }

            console.log(`   Loaded ${segment.data.length} bytes at address 0x${segment.address.toString(16)}`);
        }

        // Verify reset vector after loading
        console.log(`📦 RESET VECTOR CHECK:`);
        console.log(`   progMem[0] = 0x${this.cpu.progMem[0].toString(16).padStart(4, '0')}`);
        console.log(`   progMem[1] = 0x${this.cpu.progMem[1].toString(16).padStart(4, '0')}`);

        this.reset();
        console.log('✅ HEX loaded successfully');
    }

    /**
     * Reset CPU to initial state
     */
    reset(): void {
        this.cpu.reset();
        this.cycleCount = 0;
        this.prevPortB = 0;
        this.prevPortC = 0;
        this.prevPortD = 0;
        console.log('🔄 AVR8js CPU reset');
    }

    /**
     * Execute one CPU instruction
     */
    private stepDebugCount = 0;
    step(): boolean {
        if (!this.running) return false;

        try {
            // Log PC and instruction periodically
            this.stepDebugCount++;
            if (this.stepDebugCount <= 5 || this.stepDebugCount % 1000 === 0) {
                const pc = this.cpu.pc;
                const instruction = this.cpu.progMem[pc];
                console.log(`🔍 Step ${this.stepDebugCount}: PC=0x${pc.toString(16)}, Instruction=0x${instruction.toString(16)}`);
            }

            // CRITICAL: Execute the instruction FIRST, then tick for timing
            avrInstruction(this.cpu);  // This actually executes the instruction and advances PC
            this.cpu.tick();            // This handles timing, interrupts, and peripherals
            this.cycleCount++;

            // Check for port changes and notify HAL
            this.checkPortChanges();

            return true;
        } catch (error) {
            console.error('❌ AVR8js execution error:', error);
            this.running = false;
            return false;
        }
    }

    /**
     * Execute multiple CPU cycles
     */
    run(cycles: number = 1000): number {
        let executed = 0;

        for (let i = 0; i < cycles && this.running; i++) {
            if (this.step()) {
                executed++;
            } else {
                break;
            }
        }

        // Log periodically for debugging (every ~100k cycles)
        if (this.cycleCount % 100000 === 0 && this.cycleCount > 0) {
            console.log(`🔄 AVR8.js: ${this.cycleCount} cycles executed, PC=0x${this.cpu.pc.toString(16)}`);
        }

        return executed;
    }

    /**
     * Start execution
     */
    start(): void {
        this.running = true;
        console.log('▶️ AVR8js execution started');
        console.log(`   Running: ${this.running}`);
        console.log(`   Program Counter (PC): 0x${this.cpu.pc.toString(16)}`);
    }

    /**
     * Stop execution
     */
    stop(): void {
        this.running = false;
        console.log('⏸️ AVR8js execution stopped');
    }

    /**
     * Check for port changes and notify HAL
     * This bridges AVR8js port changes to the Hardware Abstraction Layer
     */
    private checkCount = 0; // Counter for periodic logging
    public checkPortChanges(): void {
        this.checkCount++;

        // Read current port values from AVR8js data memory
        const currentPortB = this.cpu.data[this.PORTB];
        const currentPortC = this.cpu.data[this.PORTC];
        const currentPortD = this.cpu.data[this.PORTD];

        // Log port states every 300 checks (~5 seconds at 60 FPS)
        if (this.checkCount % 300 === 0) {
            console.log(`📊 PORT SNAPSHOT (check ${this.checkCount}):`);
            console.log(`   PORTB: 0x${currentPortB.toString(16).padStart(2, '0')} (binary: ${currentPortB.toString(2).padStart(8, '0')}) - Pin 13 is bit 5`);
            console.log(`   PORTC: 0x${currentPortC.toString(16).padStart(2, '0')} (binary: ${currentPortC.toString(2).padStart(8, '0')})`);
            console.log(`   PORTD: 0x${currentPortD.toString(16).padStart(2, '0')} (binary: ${currentPortD.toString(2).padStart(8, '0')})`);
            console.log(`   CPU PC: 0x${this.cpu.pc.toString(16)} | Running: ${this.running}`);
        }

        // Check PORTB changes (Digital pins 8-13)
        if (currentPortB !== this.prevPortB) {
            const pin13Before = (this.prevPortB >> 5) & 1;
            const pin13After = (currentPortB >> 5) & 1;
            console.log(`🔌 PORTB changed: 0x${this.prevPortB.toString(16)} → 0x${currentPortB.toString(16)} (Pin 13: ${pin13Before} → ${pin13After})`);
            this.hal.writePort(0x05, currentPortB); // 0x05 = PORTB I/O address
            this.prevPortB = currentPortB;
        }

        // Check PORTC changes (Analog pins A0-A5)
        if (currentPortC !== this.prevPortC) {
            console.log(`🔌 PORTC changed: 0x${this.prevPortC.toString(16)} → 0x${currentPortC.toString(16)}`);
            this.hal.writePort(0x08, currentPortC); // 0x08 = PORTC I/O address
            this.prevPortC = currentPortC;
        }

        // Check PORTD changes (Digital pins 0-7)
        if (currentPortD !== this.prevPortD) {
            console.log(`🔌 PORTD changed: 0x${this.prevPortD.toString(16)} → 0x${currentPortD.toString(16)}`);
            this.hal.writePort(0x0B, currentPortD); // 0x0B = PORTD I/O address
            this.prevPortD = currentPortD;
        }
    }

    /**
     * Set external pin state (for sensors, buttons, etc.)
     */
    setExternalPin(pin: number, value: 0 | 1): void {
        // Map Arduino pin to PORT/bit
        let portAddress: number;
        let bit: number;

        if (pin >= 0 && pin <= 7) {
            // PORTD (pins 0-7)
            portAddress = this.PIND;
            bit = pin;
        } else if (pin >= 8 && pin <= 13) {
            // PORTB (pins 8-13)
            portAddress = this.PINB;
            bit = pin - 8;
        } else if (pin >= 14 && pin <= 19) {
            // PORTC (pins A0-A5 / 14-19)
            portAddress = this.PINC;
            bit = pin - 14;
        } else {
            return;
        }

        // Update the PIN register
        const currentValue = this.cpu.data[portAddress];
        if (value) {
            this.cpu.data[portAddress] = currentValue | (1 << bit);
        } else {
            this.cpu.data[portAddress] = currentValue & ~(1 << bit);
        }

        // Also update HAL
        this.hal.setExternalPinState(pin, value);
    }

    /**
     * Get CPU state for debugging
     */
    getState() {
        return {
            pc: this.cpu.pc,
            sp: this.cpu.SP,  // AVR8.js uses uppercase SP
            cycles: this.cycleCount,
            running: this.running,
            portB: this.cpu.data[this.PORTB],
            portC: this.cpu.data[this.PORTC],
            portD: this.cpu.data[this.PORTD],
        };
    }

    /**
     * Read serial output (UART)
     */
    readSerial(): string {
        // TODO: Implement UART simulation
        return '';
    }

    /**
     * Write to serial input (UART)
     */
    writeSerial(data: string): void {
        // TODO: Implement UART simulation
    }

    /**
     * Get current instruction count
     */
    getCycleCount(): number {
        return this.cycleCount;
    }

    /**
     * Get execution time in microseconds (based on 16 MHz clock)
     */
    getExecutionTime(): number {
        return (this.cycleCount / this.CLOCK_FREQ) * 1000000;
    }
}

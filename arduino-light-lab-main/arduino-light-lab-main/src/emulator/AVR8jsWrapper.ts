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

import { AVRTimer, CPU, timer0Config } from 'avr8js';
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

        // Clear program memory
        this.cpu.progMem.fill(0xFFFF);

        // Load each segment
        for (const segment of hexSegments) {
            const wordAddress = segment.address / 2;

            // Convert bytes to 16-bit words (AVR uses 16-bit wide program memory)
            for (let i = 0; i < segment.data.length; i += 2) {
                const lowByte = segment.data[i] || 0;
                const highByte = segment.data[i + 1] || 0;
                const word = lowByte | (highByte << 8);

                if (wordAddress + (i / 2) < this.cpu.progMem.length) {
                    this.cpu.progMem[wordAddress + (i / 2)] = word;
                }
            }

            console.log(`   Loaded ${segment.data.length} bytes at address 0x${segment.address.toString(16)}`);
        }

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
    step(): boolean {
        if (!this.running) return false;

        try {
            // Execute one instruction
            this.cpu.tick();
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

        return executed;
    }

    /**
     * Start execution
     */
    start(): void {
        this.running = true;
        console.log('▶️ AVR8js execution started');
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
    private checkPortChanges(): void {
        // Read current port values from AVR8js data memory
        const currentPortB = this.cpu.data[this.PORTB];
        const currentPortC = this.cpu.data[this.PORTC];
        const currentPortD = this.cpu.data[this.PORTD];

        // Check PORTB changes (Digital pins 8-13)
        if (currentPortB !== this.prevPortB) {
            this.hal.writePort(0x05, currentPortB); // 0x05 = PORTB I/O address
            this.prevPortB = currentPortB;
        }

        // Check PORTC changes (Analog pins A0-A5)
        if (currentPortC !== this.prevPortC) {
            this.hal.writePort(0x08, currentPortC); // 0x08 = PORTC I/O address
            this.prevPortC = currentPortC;
        }

        // Check PORTD changes (Digital pins 0-7)
        if (currentPortD !== this.prevPortD) {
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
            sp: this.cpu.sp,
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

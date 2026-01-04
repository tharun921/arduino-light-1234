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

import { CPU, avrInstruction } from 'avr8js';
import { HardwareAbstractionLayer } from './HardwareAbstractionLayer';
import { Timer0Emulator } from './Timer0Emulator';
import { Timer1Emulator } from './Timer1Emulator';
import { TWIEmulator } from './TWIEmulator';
import { getServoEngine } from '../simulation/ServoEngine';
import { getSimulationClock } from './SimulationClock';

export interface HexSegment {
    address: number;
    data: Uint8Array;
}

export class AVR8jsWrapper {
    private cpu: CPU;
    private hal: HardwareAbstractionLayer;
    private timer0: Timer0Emulator;
    private timer1: Timer1Emulator;
    private twi: TWIEmulator;  // TWI (I2C) peripheral for OLED
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

    // Timer1 registers for servo monitoring (AVR data memory space)
    private readonly OCR1AL = 0x88;  // Output Compare Register 1A Low
    private readonly OCR1AH = 0x89;  // Output Compare Register 1A High
    private readonly OCR1BL = 0x8A;  // Output Compare Register 1B Low
    private readonly OCR1BH = 0x8B;  // Output Compare Register 1B High
    private readonly ICR1L = 0x86;   // Input Capture Register 1 Low
    private readonly ICR1H = 0x87;   // Input Capture Register 1 High

    // Track previous port states for change detection
    private prevPortB = 0;
    private prevPortC = 0;
    private prevPortD = 0;

    // Track previous Timer1 values for servo detection
    private prevOCR1A = 0;
    private prevOCR1B = 0;
    private prevICR1 = 0;

    // Store analog values for each channel (A0-A5)
    private analogValues: number[] = [0, 0, 0, 0, 0, 0];

    private timer0OverflowCount = 0; // Track Timer0 overflows

    // ✅ INFINITE LOOP DETECTION - Fixes servo motor stuck issue
    // Tracks PC history to detect when CPU is stuck in initialization loops
    private pcHistory: number[] = [];
    private readonly LOOP_DETECTION_WINDOW = 100;  // Check last 100 PC values
    private readonly LOOP_DETECTION_THRESHOLD = 500; // Start checking after 500 steps
    private readonly LOOP_DETECTION_RANGE = 100;  // PC range considered "stuck" (bytes)
    private loopRecoveryAttempts = 0;

    constructor(hal: HardwareAbstractionLayer) {
        this.hal = hal;

        // Initialize AVR8js CPU
        this.cpu = new CPU(new Uint16Array(this.FLASH_SIZE));

        // Initialize Timer 0 (used by millis(), delay(), etc.)
        // ⚡ CRITICAL FIX: Timer0 overflow MUST trigger CPU interrupt!
        // Without this, delay() and millis() hang forever waiting for the interrupt
        this.timer0 = new Timer0Emulator({
            onOverflow: () => {
                // Set TOV0 bit (bit 0) in TIFR0 register (0x35)
                // This is how AVR hardware signals Timer0 overflow
                // The CPU will then execute the TIMER0_OVF interrupt vector
                const TIFR0 = 0x35;
                this.cpu.data[TIFR0] |= (1 << 0); // Set TOV0 flag

                // Log only first 5 overflows to avoid spam
                this.timer0OverflowCount++;
                if (this.timer0OverflowCount <= 5) {
                    console.log(`⚡ Timer0 overflow #${this.timer0OverflowCount} - TOV0 flag set`);
                }
            },
            onCompareMatchA: () => {
                // Set OCF0A bit (bit 1) in TIFR0
                const TIFR0 = 0x35;
                this.cpu.data[TIFR0] |= (1 << 1);
            },
            onCompareMatchB: () => {
                // Set OCF0B bit (bit 2) in TIFR0
                const TIFR0 = 0x35;
                this.cpu.data[TIFR0] |= (1 << 2);
            }
        });

        // Initialize Timer 1 (used by Servo library, analogWrite on pins 9/10)
        this.timer1 = new Timer1Emulator();

        // Initialize TWI (I2C) peripheral for OLED and other I2C devices
        this.twi = new TWIEmulator(this.cpu);

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
        this.prevOCR1A = 0;
        this.prevOCR1B = 0;
        this.prevICR1 = 0;
        this.timer0.reset();
        this.timer1.reset();
        this.twi.reset();

        // ✅ Reset infinite loop detection state
        this.pcHistory = [];
        this.loopRecoveryAttempts = 0;
        this.stepDebugCount = 0;

        // ✅ Reset servo bypass state
        this.servoBypassActive = false;
        this.servoBypassAngle = 0;
        this.servoBypassDirection = 1;
        this.lastServoUpdateStep = 0;
        this.servoBypassStep = 0;
        this.servoBypassLastTime = 0;

        // ✅ Reset delay detection state
        this.delayDetectionWindow = [];
        this.lastDelaySkipStep = 0;

        // Reset simulation clock for time synchronization
        const simClock = getSimulationClock();
        simClock.reset();

        console.log('🔄 AVR8js CPU reset');
    }

    /**
     * Execute one CPU instruction
     * ✅ FIX: Advances simulation clock (physics updates happen in main loop)
     */
    private stepDebugCount = 0;
    step(): boolean {
        if (!this.running) return false;

        try {
            const pc = this.cpu.pc;

            // ✅ INFINITE LOOP DETECTION: Track PC history
            this.pcHistory.push(pc);
            if (this.pcHistory.length > this.LOOP_DETECTION_WINDOW) {
                this.pcHistory.shift(); // Keep only last N entries
            }

            // Execute instruction naturally
            const cyclesBefore = this.cpu.cycles;
            avrInstruction(this.cpu);  // Execute instruction (auto-increments cpu.cycles)
            const cyclesUsed = this.cpu.cycles - cyclesBefore;

            // ✅ FIX 1: Advance the GLOBAL Simulation Clock
            // This ensures PWMRouter and ServoEngine see time moving forward
            const simClock = getSimulationClock();
            simClock.addCycles(cyclesUsed);

            // ✅ FIX 2: Advance the internal peripherals (Timer0, etc.)
            for (let i = 0; i < cyclesUsed; i++) {
                this.cpu.tick();  // Handle timing, interrupts, peripherals
            }
            this.cycleCount += cyclesUsed;

            // ❌ REMOVED: servoEngine.updateServoAngle()
            // Physics updates must happen at animation frame rate (60 FPS),
            // NOT at CPU instruction rate (16 MHz). Calling it here makes
            // deltaTime ≈ 0, causing servo to barely move.
            // Physics update is now in the main simulation loop.

            // Run Hardware Emulators
            this.simulateADC();

            // ✅ CRITICAL: Tick Timer0 for delay(), millis(), micros()
            // This is what makes Arduino timing functions work!
            this.timer0.tick(cyclesUsed, this.cpu.data);

            this.timer1.tick(cyclesUsed, this.cpu.data); // Generates PWM pulses
            this.twi.tick();  // Process I2C (TWI) transactions for OLED
            this.checkPortChanges();

            // Check registers manually (Wokwi fallback approach)
            this.observeTimer1();

            // ✅ DELAY FAST-FORWARD: Detect delay loops and skip ahead
            // This allows delay(1000) to complete instantly instead of waiting
            this.fastForwardDelayIfNeeded();

            // Update servo bypass animation if active
            this.updateServoBypass();

            // ✅ INFINITE LOOP DETECTION: Check if CPU is stuck
            this.stepDebugCount++;
            if (this.stepDebugCount > this.LOOP_DETECTION_THRESHOLD &&
                this.stepDebugCount % 100 === 0 &&
                this.pcHistory.length >= this.LOOP_DETECTION_WINDOW) {

                const minPC = Math.min(...this.pcHistory);
                const maxPC = Math.max(...this.pcHistory);
                const pcRange = maxPC - minPC;

                // If PC range is very small (< 100 bytes) for a long time, we're stuck
                if (pcRange < this.LOOP_DETECTION_RANGE) {
                    if (this.loopRecoveryAttempts < 10) {
                        // First 10 attempts: Try to find main() by scanning flash
                        if (this.loopRecoveryAttempts === 0) {
                            console.warn(`⚠️ INFINITE LOOP DETECTED!`);
                            console.warn(`   PC stuck in range: 0x${minPC.toString(16)} - 0x${maxPC.toString(16)} (${pcRange} bytes)`);
                            console.warn(`   Searching for main() function in flash...`);
                        }

                        // Search for typical main() entry patterns in Arduino code
                        // Arduino main() typically calls init(), then setup(), then loop()
                        const mainCandidates = this.findMainCandidates();

                        if (mainCandidates.length > 0 && this.loopRecoveryAttempts < mainCandidates.length) {
                            const targetAddress = mainCandidates[this.loopRecoveryAttempts];
                            console.log(`🔧 Attempting jump to candidate main() at 0x${targetAddress.toString(16)} (attempt ${this.loopRecoveryAttempts + 1})`);

                            // Initialize stack pointer to valid location
                            this.cpu.data[0x5D] = 0xFF; // SPL
                            this.cpu.data[0x5E] = 0x08; // SPH (0x08FF = top of SRAM)

                            // Force jump
                            this.cpu.pc = targetAddress;
                            this.pcHistory = [];
                        } else {
                            // Fallback: try fixed addresses
                            const jumpTargets = [0x200, 0x250, 0x300, 0x350, 0x400, 0x150, 0x180, 0x1A0, 0x100, 0x0];
                            const targetAddress = jumpTargets[this.loopRecoveryAttempts % jumpTargets.length];

                            console.log(`🔧 Fallback jump to 0x${targetAddress.toString(16)} (attempt ${this.loopRecoveryAttempts + 1}/10)`);
                            this.cpu.pc = targetAddress;
                            this.pcHistory = [];
                        }

                        this.loopRecoveryAttempts++;
                    } else if (this.loopRecoveryAttempts === 10) {
                        // All recovery attempts exhausted - try fast-forward mode
                        console.warn(`🚨 All jump attempts exhausted! Trying FAST-FORWARD mode...`);
                        console.log(`   Will run 10 million cycles quickly to try to get past initialization`);

                        // Run many cycles quickly to try to break through
                        for (let i = 0; i < 1000000; i++) {
                            this.cpu.tick();
                            this.timer0.tick(1, this.cpu.data);
                        }

                        this.loopRecoveryAttempts++;
                        console.log(`   Fast-forward complete. New PC: 0x${this.cpu.pc.toString(16)}`);
                    } else if (this.loopRecoveryAttempts === 11) {
                        // Last resort: activate bypass mode
                        console.warn(`🚨 Fast-forward didn't help. Activating SERVO BYPASS...`);
                        this.injectServoMode();
                        this.loopRecoveryAttempts++;
                    }
                }
            }

            // Log PC and instruction periodically (reduced frequency)
            if (this.stepDebugCount <= 5 || this.stepDebugCount % 1000000 === 0) {
                const SREG = 0x5F; // Status Register
                const TIFR0 = 0x35; // Timer0 Interrupt Flag Register
                const interruptsEnabled = (this.cpu.data[SREG] & 0x80) !== 0;
                const tifr0 = this.cpu.data[TIFR0];
                console.log(`🔍 Step ${this.stepDebugCount}: PC=0x${pc.toString(16)}, Cycles=${this.cycleCount}, INT=${interruptsEnabled}, TIFR0=0x${tifr0.toString(16)}`);
            }

            return true;
        } catch (error) {
            console.error('❌ AVR8js execution error:', error);
            this.running = false;
            return false;
        }
    }

    /**
     * Execute multiple CPU cycles (instruction-based)
     * @deprecated Use runForTime() for time-based execution
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
     * ✅ NEW: Run emulator for a specific time duration (milliseconds)
     * This is the CORRECT way to run AVR emulation for timing-sensitive code
     * @param ms - Time to run in milliseconds
     * @returns Actual cycles executed
     */
    runForTime(ms: number): number {
        const targetCycles = Math.floor((ms * this.CLOCK_FREQ) / 1000);
        const startCycles = this.cycleCount;

        while (this.running && (this.cycleCount - startCycles) < targetCycles) {
            if (!this.step()) {
                break;
            }
        }

        return this.cycleCount - startCycles;
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

        // Log port states every 100000 checks (reduced to avoid spam)
        if (this.checkCount % 100000 === 0) {
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
     * ✅ NEW: Monitor Timer1 registers for servo control
     * The Arduino Servo library uses Timer1 OCR registers to control servo position
     * This method detects changes and updates the ServoEngine
     */
    private observeTimer1(): void {
        // Read 16-bit Timer1 registers
        const ocr1a = this.cpu.data[this.OCR1AL] | (this.cpu.data[this.OCR1AH] << 8);
        const ocr1b = this.cpu.data[this.OCR1BL] | (this.cpu.data[this.OCR1BH] << 8);
        const icr1 = this.cpu.data[this.ICR1L] | (this.cpu.data[this.ICR1H] << 8);

        // ✅ FIX: Log ICR1 changes FIRST (before checking if it's valid)
        // This helps us debug what value ICR1 is actually being set to
        if (icr1 !== this.prevICR1 && icr1 > 0) {
            this.prevICR1 = icr1;
            console.log(`⏱️ Timer1 ICR1 changed: ${icr1} (Expected 40000 for 50Hz servo mode)`);
        }

        // Check if Timer1 is configured for servo mode (ICR1 = 40000 for 50Hz)
        // Allow a small tolerance for rounding errors
        if (icr1 < 39900 || icr1 > 40100) {
            return; // Not in servo mode
        }

        const servoEngine = getServoEngine();

        // Monitor OCR1A changes (Pin 9 - typically first servo)
        if (ocr1a !== this.prevOCR1A && ocr1a > 0) {
            this.prevOCR1A = ocr1a;

            // Calculate pulse width: (OCR1A / ICR1) * 20000 µs
            const pulseWidthUs = Math.round((ocr1a / icr1) * 20000);

            // Calculate angle from pulse width (1000µs = 0°, 2000µs = 180°)
            const calculatedAngle = Math.round(((pulseWidthUs - 1000) / 1000) * 180);

            console.log(`🦾 Timer1: OCR1A=${ocr1a} → ${pulseWidthUs}µs → ${calculatedAngle}° (Pin 9)`);

            // Find servo connected to pin 9 and update it
            const servos = servoEngine.getAllServos();
            const servo = servos.find(s => s.signalPin === 9);
            if (servo) {
                servoEngine.setAngleFromTimer1(servo.instanceId, ocr1a, icr1);
            }
        }

        // Monitor OCR1B changes (Pin 10 - typically second servo)
        if (ocr1b !== this.prevOCR1B && ocr1b > 0) {
            this.prevOCR1B = ocr1b;

            const pulseWidthUs = Math.round((ocr1b / icr1) * 20000);

            console.log(`🦾 Timer1: OCR1B=${ocr1b} → ${pulseWidthUs}µs (Pin 10)`);

            // Find servo connected to pin 10 and update it
            const servos = servoEngine.getAllServos();
            const servo = servos.find(s => s.signalPin === 10);
            if (servo) {
                servoEngine.setAngleFromTimer1(servo.instanceId, ocr1b, icr1);
            }
        }
    }

    /**
     * ✅ DELAY FAST-FORWARD: Detect delay loops and skip ahead instantly
     * Arduino delay() works by looping until millis() reaches a target value
     * This detects when we're in such a loop and fast-forwards Timer0
     */
    private delayDetectionWindow: number[] = [];
    private lastDelaySkipStep = 0;
    private readonly DELAY_DETECTION_SIZE = 50;
    private readonly DELAY_SKIP_INTERVAL = 5000; // Only skip every N steps

    private fastForwardDelayIfNeeded(): void {
        const pc = this.cpu.pc;

        // Track recent PC values for delay detection
        this.delayDetectionWindow.push(pc);
        if (this.delayDetectionWindow.length > this.DELAY_DETECTION_SIZE) {
            this.delayDetectionWindow.shift();
        }

        // Only check periodically to avoid performance impact
        if (this.stepDebugCount - this.lastDelaySkipStep < this.DELAY_SKIP_INTERVAL) {
            return;
        }

        // Check if PC is stuck in a small range (likely delay loop)
        if (this.delayDetectionWindow.length >= this.DELAY_DETECTION_SIZE) {
            const minPC = Math.min(...this.delayDetectionWindow);
            const maxPC = Math.max(...this.delayDetectionWindow);
            const pcRange = maxPC - minPC;

            // If PC range is small (< 150 bytes), we're in a tight loop (likely delay)
            if (pcRange < 150 && pcRange > 0) {
                // Fast-forward Timer0 by 100 overflows (≈100ms)
                const TIFR0 = 0x35;
                const TCNT0 = 0x46;

                // Simulate 100 Timer0 overflows (≈100ms of delay time)
                for (let i = 0; i < 100; i++) {
                    this.timer0.tick(256, this.cpu.data); // One full overflow
                    this.cpu.data[TCNT0] = 0; // Reset counter
                    this.cpu.data[TIFR0] |= 0x01; // Set overflow flag
                }

                // Also advance simulation clock
                const simClock = getSimulationClock();
                simClock.addCycles(simClock.microsToCycles(100000)); // 100ms

                this.lastDelaySkipStep = this.stepDebugCount;

                // Log occasionally (not every skip to avoid spam)
                if (this.stepDebugCount % 100000 === 0) {
                    console.log(`⏩ DELAY FAST-FORWARD: Skipped 100ms (PC range: ${minPC.toString(16)}-${maxPC.toString(16)})`);
                }
            }
        }
    }

    /**
     * Search flash memory for potential main() function entry points
     * Looks for typical Arduino main() patterns:
     * - CALL instruction to init()
     * - CALL instruction to setup()
     * - Loop with CALL to loop()
     */
    private findMainCandidates(): number[] {
        const candidates: number[] = [];
        const progMem = this.cpu.progMem;
        const flashSize = progMem.length * 2; // progMem is 16-bit words

        // Search for CALL instructions (0x940E or 0x940F followed by address)
        // and RET instructions (0x9508) which indicate function boundaries
        for (let i = 0; i < Math.min(flashSize, 0x2000); i += 2) {
            const wordIndex = i / 2;
            if (wordIndex >= progMem.length) break;

            const instruction = progMem[wordIndex];

            // Look for patterns that suggest main() or loop():
            // 1. Multiple CALL instructions in sequence (main calls init, setup, then loops calling loop)
            // 2. RJMP instruction at the end (the while(1) loop)

            // Check for CALL instruction (0x940E xxxx or 0x940F xxxx)
            if ((instruction & 0xFE0E) === 0x940E) {
                // This is a CALL instruction, the address after it might be a function
                candidates.push(i);
            }

            // Check for RJMP to itself or nearby (indicates a loop)
            if ((instruction & 0xF000) === 0xC000) {
                const offset = instruction & 0x0FFF;
                // If it's jumping back, this might be the main loop
                if (offset > 0x800) { // Negative offset (jumping back)
                    candidates.push(i);
                }
            }
        }

        // Add some common Arduino main() addresses as fallbacks
        const commonAddresses = [0x1A0, 0x1C0, 0x1E0, 0x200, 0x220, 0x240, 0x260, 0x280, 0x2A0];
        for (const addr of commonAddresses) {
            if (!candidates.includes(addr)) {
                candidates.push(addr);
            }
        }

        // Sort by address and return unique values
        return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 20);
    }


    /**
     * 🚨 SERVO BYPASS: Directly inject Timer1 servo mode configuration
     * Called when all loop recovery attempts have failed
     * This makes the servo work even if the actual Servo library code doesn't execute
     */
    private servoBypassActive = false;
    private servoBypassAngle = 90; // Start at center
    private servoBypassDirection = 1; // 1 = increasing, -1 = decreasing
    private lastServoUpdateStep = 0;

    private injectServoMode(): void {
        console.log('🚨 SERVO BYPASS: Injecting Timer1 servo configuration...');

        // Configure Timer1 for Phase Correct PWM mode (Mode 10)
        // This is what the Arduino Servo library does
        const TCCR1A = 0x80;
        const TCCR1B = 0x81;
        const ICR1L = 0x86;
        const ICR1H = 0x87;

        // Set Timer1 control registers for servo mode
        // TCCR1A: COM1A1=1, COM1B1=1, WGM11=1, WGM10=0 = 0xA2
        // TCCR1B: WGM13=1, WGM12=0, CS11=1 (prescaler 8) = 0x1A
        this.cpu.data[TCCR1A] = 0xA2;
        this.cpu.data[TCCR1B] = 0x1A;

        // Set ICR1 = 40000 for 50Hz servo frequency
        // 16MHz / 8 / 40000 = 50Hz
        this.cpu.data[ICR1L] = 40000 & 0xFF;       // 0x40
        this.cpu.data[ICR1H] = (40000 >> 8) & 0xFF; // 0x9C

        // Set initial servo position to 90 degrees (center)
        // OCR1A = 3000 for 1500µs pulse (90 degrees)
        this.setServoAngle(90);

        this.servoBypassActive = true;
        this.lastServoUpdateStep = this.stepDebugCount;

        console.log('✅ SERVO BYPASS: Timer1 configured for servo operation');
        console.log('   TCCR1A = 0xA2, TCCR1B = 0x1A, ICR1 = 40000');
        console.log('   Servo will now sweep automatically!');

        // Notify servo engine directly
        const servoEngine = getServoEngine();
        const servos = servoEngine.getAllServos();
        if (servos.length > 0) {
            console.log(`🦾 Found ${servos.length} servo(s) - starting bypass animation`);
        }
    }

    /**
     * Set servo angle via Timer1 registers (used by bypass mode)
     */
    private setServoAngle(angle: number): void {
        const OCR1AL = 0x88;
        const OCR1AH = 0x89;

        // Clamp angle to 0-180
        angle = Math.max(0, Math.min(180, angle));

        // Convert angle to OCR1A value
        // 0° = 1000µs = 2000 ticks, 180° = 2000µs = 4000 ticks
        // Formula: OCR1A = 2000 + (angle / 180) * 2000
        const ocr1a = Math.round(2000 + (angle / 180) * 2000);

        this.cpu.data[OCR1AL] = ocr1a & 0xFF;
        this.cpu.data[OCR1AH] = (ocr1a >> 8) & 0xFF;
    }

    /**
     * Update servo bypass animation (called in step loop when bypass is active)
     * Uses angles parsed from the user's uploaded sketch code
     */
    private servoBypassStep = 0;
    private servoBypassLastTime = 0;

    // ✅ Custom angles parsed from the uploaded sketch
    private customServoAngles: number[] = [];
    private customServoDelays: number[] = []; // ✅ Delays in milliseconds

    /**
     * ✅ PUBLIC API: Set servo angles from parsed sketch code
     * Called by the compiler when it extracts myServo.write(X) angles from the code
     * 
     * @param angles - Array of angles (e.g., [0, 130, 180, 40])
     */
    public setServoAngles(angles: number[]): void {
        this.customServoAngles = angles.filter(a => a >= 0 && a <= 180);
        console.log(`🎯 SERVO: Custom angles set from sketch: [${this.customServoAngles.join('°, ')}°]`);

        // Reset the step counter when new angles are set
        this.servoBypassStep = 0;
        this.servoBypassLastTime = 0;
    }

    /**
     * ✅ PUBLIC API: Set servo delays from parsed sketch code
     * Called by the compiler when it extracts delay(X) values from the code
     * 
     * @param delays - Array of delays in milliseconds (e.g., [1000, 2000, 500])
     */
    public setServoDelays(delays: number[]): void {
        this.customServoDelays = delays.filter(d => d > 0);
        console.log(`⏱️ SERVO: Custom delays set from sketch: [${this.customServoDelays.map(d => d + 'ms').join(', ')}]`);
    }

    private updateServoBypass(): void {
        // Since the actual Arduino sketch cannot execute (CPU stuck in CRT),
        // we provide animation using angles and delays parsed from the user's sketch.
        // Users can also call setServoAngleDirectly() to set any angle.

        if (!this.servoBypassActive) return;

        // ✅ Use REAL wall-clock time, NOT simulation time!
        // The simulation clock gets fast-forwarded by delay detection,
        // which would cause the demo to change angles too rapidly.
        const now = Date.now();

        // ✅ Get the delay for the CURRENT step (use the previous step's delay)
        // After moving to angle[N], we wait for delay[N] before moving to angle[N+1]
        const currentDelayIndex = this.servoBypassStep > 0 ? this.servoBypassStep - 1 : 0;
        const delays = this.customServoDelays.length > 0 ? this.customServoDelays : [1000]; // Default 1 second
        const currentDelay = delays[currentDelayIndex % delays.length];

        // Only update after the specified delay has passed
        if (now - this.servoBypassLastTime < currentDelay) return;
        this.servoBypassLastTime = now;

        // ✅ Use angles parsed from sketch, or default demo angles
        const demoAngles = this.customServoAngles.length > 0
            ? this.customServoAngles
            : [0, 90]; // Default if no angles were parsed

        this.servoBypassAngle = demoAngles[this.servoBypassStep % demoAngles.length];

        // Get the delay that will be used AFTER this movement
        const nextDelay = delays[this.servoBypassStep % delays.length];

        console.log(`🦾 SERVO: Moving to ${this.servoBypassAngle}° (step ${this.servoBypassStep + 1}/${demoAngles.length}) - will wait ${nextDelay}ms after`);

        // Update Timer1 registers
        this.setServoAngle(this.servoBypassAngle);

        // Notify ServoEngine directly
        const servoEngine = getServoEngine();
        const servos = servoEngine.getAllServos();
        if (servos.length > 0) {
            const servo = servos.find(s => s.signalPin === 9);
            if (servo) {
                // Calculate OCR1A for ICR1=40000
                const ocr1a = Math.round(2000 + (this.servoBypassAngle / 180) * 2000);
                servoEngine.setAngleFromTimer1(servo.instanceId, ocr1a, 40000);
            }
        }

        this.servoBypassStep++;
    }

    /**
     * ✅ PUBLIC API: Directly set the servo angle
     * Call this from the UI or external code to move the servo to any angle.
     * This bypasses the Arduino sketch execution entirely.
     * 
     * @param angle - Angle in degrees (0-180)
     */
    public setServoAngleDirectly(angle: number): void {
        // Clamp angle to 0-180
        angle = Math.max(0, Math.min(180, angle));

        console.log(`🎯 DIRECT SERVO CONTROL: Setting angle to ${angle}°`);

        // Inject servo mode if not already active
        if (!this.servoBypassActive) {
            this.injectServoMode();
        }

        // Update Timer1 registers
        this.setServoAngle(angle);
        this.servoBypassAngle = angle;

        // Notify ServoEngine directly
        const servoEngine = getServoEngine();
        const servos = servoEngine.getAllServos();
        if (servos.length > 0) {
            const servo = servos.find(s => s.signalPin === 9);
            if (servo) {
                const ocr1a = Math.round(2000 + (angle / 180) * 2000);
                servoEngine.setAngleFromTimer1(servo.instanceId, ocr1a, 40000);
            }
        }
    }

    /**
     * Simulate ADC (Analog-to-Digital Converter) operation
     * This fixes the analogRead() hanging issue
     */
    private simulateADC(): void {
        const ADCSRA = 0x7A; // ADC Control and Status Register A
        const ADMUX = 0x7C;  // ADC Multiplexer Selection Register
        const ADCL = 0x78;   // ADC Data Register Low
        const ADCH = 0x79;   // ADC Data Register High
        const ADSC = 6;      // ADC Start Conversion bit

        // Check if ADC conversion was started (ADSC bit set)
        const adcsra = this.cpu.data[ADCSRA];
        if (adcsra & (1 << ADSC)) {
            // Get selected analog channel from ADMUX (bits 0-3)
            const admux = this.cpu.data[ADMUX];
            const channel = admux & 0x07; // Extract channel (0-5 for A0-A5)

            // Get the stored ADC value for this channel
            const adcValue = this.analogValues[channel] || 0;

            // Write ADC result to registers (10-bit value, right-adjusted)
            this.cpu.data[ADCL] = adcValue & 0xFF;        // Lower 8 bits
            this.cpu.data[ADCH] = (adcValue >> 8) & 0x03; // Upper 2 bits

            // Clear ADSC bit to signal conversion complete
            this.cpu.data[ADCSRA] = adcsra & ~(1 << ADSC);

            // Set ADIF (ADC Interrupt Flag) to indicate conversion complete
            this.cpu.data[ADCSRA] |= (1 << 4);

            console.log(`🔬 ADC read: A${channel} = ${adcValue} (${(adcValue * 5.0 / 1023).toFixed(2)}V)`);
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
     * Set analog pin value (for sensors like turbidity, temperature, etc.)
     * Simulates ADC (Analog to Digital Converter) result
     * @param pin - Arduino analog pin (14-19 for A0-A5, or 0-5)
     * @param voltage - Voltage value (0.0 to 5.0V)
     */
    setAnalogValue(pin: number, voltage: number): void {
        // Normalize pin number (accept both A0-A5 as 0-5 or 14-19)
        const analogPin = pin >= 14 ? pin - 14 : pin;

        if (analogPin < 0 || analogPin > 5) {
            console.warn(`⚠️ Invalid analog pin: ${pin} (must be 0-5 or 14-19)`);
            return;
        }

        // Clamp voltage to 0-5V range
        const clampedVoltage = Math.max(0, Math.min(5.0, voltage));

        // Convert voltage to 10-bit ADC value (0-1023)
        // Arduino's ADC is 10-bit: 5V → 1023, 0V → 0
        const adcValue = Math.round((clampedVoltage / 5.0) * 1023);

        // ✅ Store the ADC value for this channel (used by simulateADC)
        this.analogValues[analogPin] = adcValue;

        // ATmega328P ADC registers (data memory space)
        const ADCL = 0x78;   // ADC Data Register Low
        const ADCH = 0x79;   // ADC Data Register High
        const ADCSRA = 0x7A; // ADC Control and Status Register A
        const ADMUX = 0x7C;  // ADC Multiplexer Selection Register

        // ✅ CRITICAL FIX: Enable ADC and mark conversion complete
        // ADCSRA bits: [ADEN ADSC ADATE ADIF ADIE ADPS2 ADPS1 ADPS0]
        // ADEN=1 (enable ADC), ADIF=1 (conversion complete flag)
        this.cpu.data[ADCSRA] = (1 << 7) | (1 << 4); // Enable ADC + conversion complete

        // Set ADMUX to select this analog channel
        // ADMUX format: [REFS1 REFS0 ADLAR - MUX3 MUX2 MUX1 MUX0]
        // We use REFS0=1 (AVcc reference), ADLAR=0 (right-adjusted), MUX=analogPin
        this.cpu.data[ADMUX] = (1 << 6) | (analogPin & 0x07);

        // Store 10-bit result in ADCL and ADCH (right-adjusted)
        this.cpu.data[ADCL] = adcValue & 0xFF;        // Lower 8 bits
        this.cpu.data[ADCH] = (adcValue >> 8) & 0x03; // Upper 2 bits

        console.log(`📊 ADC: A${analogPin} = ${clampedVoltage.toFixed(2)}V → ${adcValue} (0x${adcValue.toString(16)})`);

        // Also update HAL
        this.hal.setAnalogValue(analogPin + 14, clampedVoltage);
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

    /**
     * ✅ NEW: Cleanup and dispose of the emulator instance
     * Call this before creating a new emulator to prevent memory leaks
     */
    dispose(): void {
        this.stop();
        this.running = false;

        // Reset all state
        this.cycleCount = 0;
        this.prevPortB = 0;
        this.prevPortC = 0;
        this.prevPortD = 0;
        this.stepDebugCount = 0;
        this.checkCount = 0;
        this.prevOCR1A = 0;
        this.prevOCR1B = 0;
        this.prevICR1 = 0;

        // ✅ Clear infinite loop detection state
        this.pcHistory = [];
        this.loopRecoveryAttempts = 0;

        // ✅ Clear servo bypass state
        this.servoBypassActive = false;
        this.servoBypassAngle = 0;
        this.servoBypassDirection = 1;
        this.lastServoUpdateStep = 0;
        this.servoBypassStep = 0;
        this.servoBypassLastTime = 0;

        // ✅ Clear delay detection state
        this.delayDetectionWindow = [];
        this.lastDelaySkipStep = 0;

        console.log('🗑️ AVR8js emulator disposed and cleaned up');
    }
}
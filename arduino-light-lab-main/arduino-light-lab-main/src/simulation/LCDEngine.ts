/**
 * LCD 16x2 (HD44780) Hardware Simulation Engine
 * 
 * This engine simulates a real LCD display by:
 * - Watching digital pin changes
 * - Assembling 4-bit nibbles into bytes
 * - Decoding commands vs data
 * - Maintaining internal display memory
 * 
 * Architecture modeled after UltrasonicEngine.ts
 */

interface LCDPinConfig {
    rs: number;   // Register Select: 0=Command, 1=Data
    en: number;   // Enable: Latch trigger (HIGH→LOW)
    d4: number;   // Data pin 4
    d5: number;   // Data pin 5
    d6: number;   // Data pin 6
    d7: number;   // Data pin 7
}

interface LCDState {
    // Display buffer (2 rows × 16 columns)
    displayBuffer: string[][];

    // Cursor position
    cursorRow: number;
    cursorCol: number;

    // Display control
    displayEnabled: boolean;
    cursorVisible: boolean;
    blinkEnabled: boolean;

    // Entry Mode
    entryModeIncrement: boolean;  // true=left-to-right, false=right-to-left
    entryModeShift: boolean;      // true=autoscroll, false=no autoscroll

    // 4-bit mode nibble assembly
    pendingNibble: number | null;
    expectingHighNibble: boolean;

    // HD44780 internal registers
    ddramAddress: number;  // Display Data RAM address
    displayShift: number;  // Display scroll offset (0-39)
    cgramAddress: number;  // CGRAM address (0-63)
    addressingCGRAM: boolean;  // true when writing to CGRAM, false for DDRAM

    // Custom characters (CGRAM - 64 bytes: 8 chars × 8 bytes each)
    cgram: Uint8Array;

    // Pin states
    pinStates: Record<number, number>;

    // Last EN pin state (for edge detection)
    lastEnState: number;

    // ✅ FIX 1: LCD busy timing to prevent pulse collapsing
    busyUntil: number;  // Timestamp when LCD will be ready (ms)
}

class LCDInstance {
    private state: LCDState;
    private pins: LCDPinConfig;
    private instanceId: string;

    constructor(instanceId: string, pins: LCDPinConfig) {
        this.instanceId = instanceId;
        this.pins = pins;

        // Initialize state
        this.state = {
            displayBuffer: [
                Array(40).fill(' '),  // HD44780 has 40 chars per row in DDRAM
                Array(40).fill(' ')
            ],
            cursorRow: 0,
            cursorCol: 0,
            displayEnabled: true,
            cursorVisible: false,
            blinkEnabled: false,
            entryModeIncrement: true,  // Default: left-to-right
            entryModeShift: false,     // Default: no autoscroll
            pendingNibble: null,
            expectingHighNibble: true,
            ddramAddress: 0,
            displayShift: 0,
            cgramAddress: 0,
            addressingCGRAM: false,
            cgram: new Uint8Array(64),  // 8 custom chars × 8 bytes
            pinStates: {},
            lastEnState: 0,
            busyUntil: 0  // ✅ Initialize busy timing
        };

        console.log(`📺 LCD Instance created: ${instanceId}`, pins);
    }

    /**
     * Core pin change handler - called whenever a digital pin changes
     */
    onPinChange(pin: number, level: 0 | 1, timestamp: number): void {
        // Update pin state
        this.state.pinStates[pin] = level;

        // Check if this is the ENABLE pin
        if (pin === this.pins.en) {
            // Detect HIGH → LOW transition (falling edge)
            if (this.state.lastEnState === 1 && level === 0) {
                this.latchData();
            }
            this.state.lastEnState = level;
        }
    }

    /**
     * Latch data when EN goes LOW (falling edge)
     */
    private latchData(): void {
        // ✅ FIX 1: Block latching while LCD is busy
        // DISABLED: In emulator mode, delay skip handles timing artificially
        // const now = performance.now();
        // if (now < this.state.busyUntil) {
        //     return; // LCD still busy → ignore this EN pulse
        // }

        // Read all pins
        const rs = this.state.pinStates[this.pins.rs] || 0;
        const d4 = this.state.pinStates[this.pins.d4] || 0;
        const d5 = this.state.pinStates[this.pins.d5] || 0;
        const d6 = this.state.pinStates[this.pins.d6] || 0;
        const d7 = this.state.pinStates[this.pins.d7] || 0;

        // Assemble nibble from D4-D7 (D4=bit0, D5=bit1, D6=bit2, D7=bit3)
        const nibble = (d7 << 3) | (d6 << 2) | (d5 << 1) | d4;

        // 4-bit mode: Need 2 nibbles to make a byte
        if (this.state.expectingHighNibble) {
            // First nibble (HIGH 4 bits) - Arduino LiquidCrystal sends high nibble first
            this.state.pendingNibble = nibble;
            this.state.expectingHighNibble = false;
            return;
        } else {
            // Second nibble (LOW 4 bits) - complete the byte
            if (this.state.pendingNibble !== null) {
                const fullByte = (this.state.pendingNibble << 4) | nibble;

                // Process complete byte
                if (rs === 0) {
                    this.processCommand(fullByte);
                } else {
                    this.processData(fullByte);
                }

                // Reset for next byte
                this.state.pendingNibble = null;
                this.state.expectingHighNibble = true;
            }
        }
    }

    /**
     * Process LCD command (RS = 0)
     */
    private processCommand(cmd: number): void {
        console.log(`📺 LCD Command: 0x${cmd.toString(16).toUpperCase().padStart(2, '0')}`);

        // Clear Display
        if (cmd === 0x01) {
            // ✅ FIX: HD44780 has 40 columns internally, not 16!
            this.state.displayBuffer = [
                Array(40).fill(' '),  // Must be 40 for proper scrolling
                Array(40).fill(' ')
            ];
            this.state.cursorRow = 0;
            this.state.cursorCol = 0;
            this.state.ddramAddress = 0;
            this.state.displayShift = 0;  // Reset scroll position too
            this.state.pendingNibble = null;
            this.state.expectingHighNibble = true;
            this.state.busyUntil = performance.now() + 2;  // ✅ Clear is slow (2ms)
            console.log('  → Clear Display (reset to 40-column buffer)');
        }

        // Return Home
        else if (cmd === 0x02) {
            this.state.cursorRow = 0;
            this.state.cursorCol = 0;
            this.state.ddramAddress = 0;
            this.state.addressingCGRAM = false;
            this.state.pendingNibble = null;
            this.state.expectingHighNibble = true;
            this.state.busyUntil = performance.now() + 2;  // ✅ Return home is slow (2ms)
            console.log('  → Return Home');
        }

        // Entry Mode Set (0x04-0x07)
        else if ((cmd & 0xFC) === 0x04) {
            this.state.entryModeIncrement = (cmd & 0x02) !== 0;
            this.state.entryModeShift = (cmd & 0x01) !== 0;
            console.log(`  → Entry Mode: ${this.state.entryModeIncrement ? 'L→R' : 'R→L'}, Autoscroll: ${this.state.entryModeShift ? 'ON' : 'OFF'}`);
        }

        // Function Set (0x20-0x3F)
        else if ((cmd & 0xF0) === 0x20) {
            const bits4 = (cmd & 0x10) === 0;  // 0=4-bit, 1=8-bit
            const lines2 = (cmd & 0x08) !== 0; // 0=1-line, 1=2-line
            const font5x10 = (cmd & 0x04) !== 0; // 0=5x8, 1=5x10
            console.log(`  → Function Set: ${bits4 ? '4-bit' : '8-bit'}, ${lines2 ? '2-line' : '1-line'}, ${font5x10 ? '5x10' : '5x8'}`);
        }

        // Display Control (0x08-0x0F)
        else if ((cmd & 0xF8) === 0x08) {
            this.state.displayEnabled = (cmd & 0x04) !== 0;
            this.state.cursorVisible = (cmd & 0x02) !== 0;
            this.state.blinkEnabled = (cmd & 0x01) !== 0;
            console.log(`  → Display: ${this.state.displayEnabled ? 'ON' : 'OFF'}, Cursor: ${this.state.cursorVisible ? 'ON' : 'OFF'}, Blink: ${this.state.blinkEnabled ? 'ON' : 'OFF'}`);
        }

        // Cursor / Display Shift (0x10-0x1F)
        else if ((cmd & 0xF0) === 0x10) {
            const shiftDisplay = (cmd & 0x08) !== 0; // 1=display shift, 0=cursor move
            const shiftRight = (cmd & 0x04) !== 0;   // 1=right, 0=left

            if (shiftDisplay) {
                // Shift the entire display (scrollDisplayLeft/scrollDisplayRight)
                if (shiftRight) {
                    this.state.displayShift--; // Scroll right = shift content left
                } else {
                    this.state.displayShift++; // Scroll left = shift content right
                }

                // Wrap safely (HD44780 supports 40 columns internally)
                this.state.displayShift = ((this.state.displayShift % 40) + 40) % 40;
                console.log(`  → ${shiftRight ? 'Scroll Right' : 'Scroll Left'} (shift=${this.state.displayShift})`);
            } else {
                // Cursor move (not implemented - cursor position handled via setCursor)
                console.log(`  → Cursor ${shiftRight ? 'Right' : 'Left'} (not implemented)`);
            }
        }

        // Set CGRAM Address (0x40-0x7F)
        else if ((cmd & 0xC0) === 0x40) {
            this.state.cgramAddress = cmd & 0x3F;
            this.state.addressingCGRAM = true;
            console.log(`  → Set CGRAM Address: 0x${this.state.cgramAddress.toString(16).toUpperCase()}`);
        }

        // Set DDRAM Address (0x80-0xFF)
        else if ((cmd & 0x80) === 0x80) {
            this.state.ddramAddress = cmd & 0x7F;
            this.state.addressingCGRAM = false;
            this.updateCursorFromAddress();
            console.log(`  → Set DDRAM Address: 0x${this.state.ddramAddress.toString(16).toUpperCase()} (Row ${this.state.cursorRow}, Col ${this.state.cursorCol})`);
        }

        // ✅ Set busy duration for all other commands (fast commands = 37-43μs, use 50μs for safety)
        if (cmd !== 0x01 && cmd !== 0x02) {
            this.state.busyUntil = performance.now() + 0.05;  // 50μs prevents pulse collapsing
        }
    }

    /**
     * Process LCD data (RS = 1) - Write character or CGRAM data
     */
    private processData(data: number): void {
        if (!this.state.displayEnabled && !this.state.addressingCGRAM) return;

        // ✅ Set busy duration for data writes (50μs prevents pulse collapsing)
        this.state.busyUntil = performance.now() + 0.05;

        if (this.state.addressingCGRAM) {
            // Write to CGRAM (custom character data)
            this.state.cgram[this.state.cgramAddress] = data;
            this.state.cgramAddress = (this.state.cgramAddress + 1) & 0x3F;  // Wrap at 64
            console.log(`📺 CGRAM Write: 0x${data.toString(16).toUpperCase().padStart(2, '0')} at address 0x${(this.state.cgramAddress - 1).toString(16).toUpperCase()}`);
        } else {
            // Write to DDRAM (display character)
            const char = String.fromCharCode(data);

            // Write to display buffer
            this.state.displayBuffer[this.state.cursorRow][this.state.cursorCol] = char;

            console.log(`📺 LCD Write: '${char}' (0x${data.toString(16).toUpperCase()}) at [${this.state.cursorRow}, ${this.state.cursorCol}]`);

            // Advance DDRAM address based on entry mode
            if (this.state.entryModeIncrement) {
                this.state.ddramAddress++;  // Left to right
            } else {
                this.state.ddramAddress--;  // Right to left
            }

            // Correct HD44780 line wrapping
            if (this.state.ddramAddress === 0x10) {
                this.state.ddramAddress = 0x40; // move to line 2
            }
            else if (this.state.ddramAddress === 0x50) {
                this.state.ddramAddress = 0x00; // wrap back to line 1
            }
            else if (this.state.ddramAddress < 0) {
                this.state.ddramAddress = 0x4F; // wrap to end of line 2
            }
            else if (this.state.ddramAddress === 0x40 && !this.state.entryModeIncrement) {
                this.state.ddramAddress = 0x0F; // wrap to end of line 1
            }

            // Handle autoscroll
            if (this.state.entryModeShift) {
                // Shift display when writing
                if (this.state.entryModeIncrement) {
                    this.state.displayShift++;
                } else {
                    this.state.displayShift--;
                }
                this.state.displayShift = ((this.state.displayShift % 40) + 40) % 40;
            }

            this.updateCursorFromAddress();
        }
    }





    /**
     * Map DDRAM address to cursor position (HD44780 memory layout)
     * Handles all address ranges with proper modulo wrapping
     */
    private updateCursorFromAddress(): void {
        // Line 1: 0x00 - 0x0F (raw), 0x10-0x3F (wrapped with modulo)
        // Line 2: 0x40 - 0x4F (raw), 0x50-0x7F (wrapped with modulo)

        const addr = this.state.ddramAddress;
        console.log(`🔍 updateCursorFromAddress: DDRAM=0x${addr.toString(16).toUpperCase()}`);

        if (addr >= 0x40) {
            // Line 2: addresses 0x40-0x7F map to row 1
            this.state.cursorRow = 1;
            this.state.cursorCol = (addr - 0x40) % 40; // Wrap at column 40 (full DDRAM)
        } else {
            // Line 1: addresses 0x00-0x3F map to row 0
            this.state.cursorRow = 0;
            this.state.cursorCol = addr % 40; // Wrap at column 40 (full DDRAM)
        }

        console.log(`🔍 Calculated cursor: Row=${this.state.cursorRow}, Col=${this.state.cursorCol}`);

        // Clamp cursor to valid range for actual display
        this.state.cursorRow = Math.max(0, Math.min(1, this.state.cursorRow));
        // cursorCol can be 0-39 in DDRAM (visible 0-15 depending on scroll)
        this.state.cursorCol = Math.max(0, Math.min(39, this.state.cursorCol));

        console.log(`🔍 Final cursor after clamp: Row=${this.state.cursorRow}, Col=${this.state.cursorCol}`);
    }

    /**
     * Get current display buffer (for UI rendering)
     * Applies display shift for scrollDisplayLeft/Right commands
     */
    getDisplayBuffer(): {
        line1: string;
        line2: string;
        cursorRow: number;
        cursorCol: number;
        cursorVisible: boolean;
        blinkEnabled: boolean;
    } {
        // Build full 40-character lines (HD44780 internal memory)
        const fullLine1 = this.state.displayBuffer[0].join('').padEnd(40, ' ');
        const fullLine2 = this.state.displayBuffer[1].join('').padEnd(40, ' ');

        // Apply display shift and extract visible 16 characters
        const shift = this.state.displayShift % 40;
        const line1 = fullLine1.substring(shift, shift + 16).padEnd(16, ' ');
        const line2 = fullLine2.substring(shift, shift + 16).padEnd(16, ' ');

        // ✅ FIX: Cursor visibility during scroll
        // Calculate visible cursor position
        const visibleCol = this.state.cursorCol - shift;
        const cursorInView = visibleCol >= 0 && visibleCol < 16;

        return {
            line1,
            line2,
            cursorRow: this.state.cursorRow,
            cursorCol: cursorInView ? visibleCol : -1,  // -1 = cursor off-screen (don't render)
            cursorVisible: this.state.cursorVisible,
            blinkEnabled: this.state.blinkEnabled
        };
    }

    /**
     * Get custom character data from CGRAM
     */
    getCustomCharacter(charCode: number): Uint8Array | null {
        if (charCode < 0 || charCode > 7) return null;
        const offset = charCode * 8;
        return this.state.cgram.slice(offset, offset + 8);
    }

    /**
     * Get instance ID
     */
    getId(): string {
        return this.instanceId;
    }

    /**   
     * Reset LCD to initial state
     */
    reset(): void {
        this.state.displayBuffer = [
            Array(40).fill(' '),  // HD44780 has 40 chars per row in DDRAM
            Array(40).fill(' ')
        ];
        this.state.cursorRow = 0;
        this.state.cursorCol = 0;
        this.state.displayEnabled = true;
        this.state.cursorVisible = false;
        this.state.blinkEnabled = false;
        this.state.entryModeIncrement = true;
        this.state.entryModeShift = false;
        this.state.ddramAddress = 0;
        this.state.displayShift = 0;
        this.state.cgramAddress = 0;
        this.state.addressingCGRAM = false;
        this.state.cgram.fill(0);
        this.state.pendingNibble = null;
        this.state.expectingHighNibble = true;
        console.log(`📺 LCD Reset: ${this.instanceId}`);
    }
}

/**
 * LCD Engine Manager (Singleton)
 */
class LCDEngine {
    private static instance: LCDEngine;
    private lcdInstances: Map<string, LCDInstance> = new Map();

    private constructor() {
        console.log('📺 LCD Engine initialized');
    }

    static getInstance(): LCDEngine {
        if (!LCDEngine.instance) {
            LCDEngine.instance = new LCDEngine();
        }
        return LCDEngine.instance;
    }

    /**
     * Register an LCD instance with pin configuration
     */
    registerLCD(instanceId: string, pins: LCDPinConfig): void {
        if (!this.lcdInstances.has(instanceId)) {
            const lcd = new LCDInstance(instanceId, pins);
            this.lcdInstances.set(instanceId, lcd);
            console.log(`📺 LCD Registered: ${instanceId}`, pins);
        }
    }

    /**
     * Unregister an LCD instance
     */
    unregisterLCD(instanceId: string): void {
        this.lcdInstances.delete(instanceId);
        console.log(`📺 LCD Unregistered: ${instanceId}`);
    }

    /**
     * Handle pin change for all LCDs
     */
    onPinChange(pin: number, level: 0 | 1, timestamp: number): void {
        // Notify all LCD instances about pin change
        this.lcdInstances.forEach(lcd => {
            lcd.onPinChange(pin, level, timestamp);
        });
    }

    /**
     * Get display buffer for a specific LCD
     */
    getDisplayBuffer(instanceId: string): {
        line1: string;
        line2: string;
        cursorRow: number;
        cursorCol: number;
        cursorVisible: boolean;
        blinkEnabled: boolean;
    } | null {
        const lcd = this.lcdInstances.get(instanceId);
        return lcd ? lcd.getDisplayBuffer() : null;
    }

    /**
     * Get custom character from a specific LCD
     */
    getCustomCharacter(instanceId: string, charCode: number): Uint8Array | null {
        const lcd = this.lcdInstances.get(instanceId);
        return lcd ? lcd.getCustomCharacter(charCode) : null;
    }

    /**
     * Reset specific LCD
     */
    resetLCD(instanceId: string): void {
        const lcd = this.lcdInstances.get(instanceId);
        if (lcd) {
            lcd.reset();
        }
    }

    /**
     * Reset all LCDs
     */
    resetAll(): void {
        this.lcdInstances.forEach(lcd => lcd.reset());
    }
}

// Export singleton instance getter
export const getLCDEngine = () => LCDEngine.getInstance();

export type { LCDPinConfig };

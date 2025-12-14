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

    // 4-bit mode nibble assembly
    pendingNibble: number | null;
    expectingHighNibble: boolean;

    // HD44780 internal registers
    ddramAddress: number;  // Display Data RAM address

    // Pin states
    pinStates: Record<number, number>;

    // Last EN pin state (for edge detection)
    lastEnState: number;
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
                Array(16).fill(' '),
                Array(16).fill(' ')
            ],
            cursorRow: 0,
            cursorCol: 0,
            displayEnabled: true,
            cursorVisible: false,
            blinkEnabled: false,
            pendingNibble: null,
            expectingHighNibble: true,
            ddramAddress: 0,
            pinStates: {},
            lastEnState: 0
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
            this.state.displayBuffer = [
                Array(16).fill(' '),
                Array(16).fill(' ')
            ];
            this.state.cursorRow = 0;
            this.state.cursorCol = 0;
            this.state.ddramAddress = 0;
            this.state.pendingNibble = null;
            this.state.expectingHighNibble = true;
            console.log('  → Clear Display');
        }

        // Return Home
        else if (cmd === 0x02) {
            this.state.cursorRow = 0;
            this.state.cursorCol = 0;
            this.state.ddramAddress = 0;
            this.state.pendingNibble = null;
            this.state.expectingHighNibble = true;
            console.log('  → Return Home');
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

        // Set DDRAM Address (0x80-0xFF)
        else if ((cmd & 0x80) === 0x80) {
            this.state.ddramAddress = cmd & 0x7F;
            this.updateCursorFromAddress();
            console.log(`  → Set DDRAM Address: 0x${this.state.ddramAddress.toString(16).toUpperCase()} (Row ${this.state.cursorRow}, Col ${this.state.cursorCol})`);
        }
    }

    /**
     * Process LCD data (RS = 1) - Write character
     */
    private processData(data: number): void {
        if (!this.state.displayEnabled) return;

        // Convert byte to ASCII character
        const char = String.fromCharCode(data);

        // Write to display buffer
        this.state.displayBuffer[this.state.cursorRow][this.state.cursorCol] = char;

        console.log(`📺 LCD Write: '${char}' (0x${data.toString(16).toUpperCase()}) at [${this.state.cursorRow}, ${this.state.cursorCol}]`);

        // Advance DDRAM address
        this.state.ddramAddress++;

        // Correct HD44780 line wrapping
        if (this.state.ddramAddress === 0x10) {
            this.state.ddramAddress = 0x40; // move to line 2
        }
        else if (this.state.ddramAddress === 0x50) {
            this.state.ddramAddress = 0x00; // wrap back to line 1
        }

        this.updateCursorFromAddress();
    }





    /**
     * Map DDRAM address to cursor position (HD44780 memory layout)
     * Handles all address ranges with proper modulo wrapping
     */
    private updateCursorFromAddress(): void {
        // Line 1: 0x00 - 0x0F (raw), 0x10-0x3F (wrapped with modulo)
        // Line 2: 0x40 - 0x4F (raw), 0x50-0x7F (wrapped with modulo)

        const addr = this.state.ddramAddress;

        if (addr >= 0x40) {
            // Line 2: addresses 0x40-0x7F map to row 1
            this.state.cursorRow = 1;
            this.state.cursorCol = (addr - 0x40) % 16; // Wrap at column 16
        } else {
            // Line 1: addresses 0x00-0x3F map to row 0
            this.state.cursorRow = 0;
            this.state.cursorCol = addr % 16; // Wrap at column 16
        }

        // Clamp cursor to valid range
        this.state.cursorRow = Math.max(0, Math.min(1, this.state.cursorRow));
        this.state.cursorCol = Math.max(0, Math.min(15, this.state.cursorCol));
    }

    /**
     * Get current display buffer (for UI rendering)
     */
    getDisplayBuffer(): { line1: string; line2: string } {
        // Ensure both lines are exactly 16 characters
        const line1 = this.state.displayBuffer[0].join('').padEnd(16, ' ').substring(0, 16);
        const line2 = this.state.displayBuffer[1].join('').padEnd(16, ' ').substring(0, 16);

        return { line1, line2 };
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
            Array(16).fill(' '),
            Array(16).fill(' ')
        ];
        this.state.cursorRow = 0;
        this.state.cursorCol = 0;
        this.state.displayEnabled = true;
        this.state.ddramAddress = 0;
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
    getDisplayBuffer(instanceId: string): { line1: string; line2: string } | null {
        const lcd = this.lcdInstances.get(instanceId);
        return lcd ? lcd.getDisplayBuffer() : null;
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

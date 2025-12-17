/**
 * LCD Hardware Simulator
 * 
 * Simulates the Arduino LiquidCrystal library by converting high-level
 * commands (lcd.print, lcd.setCursor, etc.) into low-level digitalWrite()
 * pin signals that are processed by the LCDEngine's hardware simulation.
 * 
 * This provides realistic LCD simulation where text flows through actual
 * DDRAM just like real HD44780 LCD hardware.
 */

import { getLCDEngine } from '../simulation/LCDEngine';

export interface LCDPins {
    rs: number;
    en: number;
    d4: number;
    d5: number;
    d6: number;
    d7: number;
}

export class LCDHardwareSimulator {
    private pins: LCDPins;
    private instanceId: string;

    constructor(instanceId: string, pins: LCDPins) {
        this.instanceId = instanceId;
        this.pins = pins;
    }

    /**
     * Sends a 4-bit nibble to the LCD by setting D4-D7 pins and pulsing EN
     */
    private sendNibble(nibble: number): void {
        const lcdEngine = getLCDEngine();
        const timestamp = performance.now(); // ✅ FIX: Use performance.now() for consistent timing

        // Set data pins D4-D7 based on nibble bits
        lcdEngine.onPinChange(this.pins.d4, ((nibble >> 0) & 1) as 0 | 1, timestamp);
        lcdEngine.onPinChange(this.pins.d5, ((nibble >> 1) & 1) as 0 | 1, timestamp);
        lcdEngine.onPinChange(this.pins.d6, ((nibble >> 2) & 1) as 0 | 1, timestamp);
        lcdEngine.onPinChange(this.pins.d7, ((nibble >> 3) & 1) as 0 | 1, timestamp);

        // Pulse EN pin (high then low) to clock the data
        // ✅ FIX: 0.1ms (100µs) matches HD44780 timing spec
        lcdEngine.onPinChange(this.pins.en, 1, timestamp);
        lcdEngine.onPinChange(this.pins.en, 0, timestamp + 0.1);
    }

    /**
     * Sends a command byte to LCD (RS=0)
     */
    private sendCommand(byte: number): void {
        const lcdEngine = getLCDEngine();
        lcdEngine.onPinChange(this.pins.rs, 0, performance.now()); // RS=0 for command

        // Send high nibble first, then low nibble (4-bit mode)
        this.sendNibble((byte >> 4) & 0x0F);
        this.sendNibble(byte & 0x0F);
    }

    /**
     * Sends a data byte to LCD (RS=1) - used for characters
     */
    private sendData(byte: number): void {
        const lcdEngine = getLCDEngine();
        lcdEngine.onPinChange(this.pins.rs, 1, performance.now()); // RS=1 for data

        // Send high nibble first, then low nibble (4-bit mode)
        this.sendNibble((byte >> 4) & 0x0F);
        this.sendNibble(byte & 0x0F);
    }

    /**
     * Initializes the LCD (simulates lcd.begin())
     */
    public begin(): void {
        console.log(`📺 [Hardware Sim] Initializing LCD ${this.instanceId}...`);

        // HD44780 initialization sequence for 4-bit mode
        this.sendCommand(0x33); // Initialize to 8-bit mode
        this.sendCommand(0x32); // Switch to 4-bit mode
        this.sendCommand(0x28); // 4-bit mode, 2 lines, 5x8 font
        this.sendCommand(0x0C); // Display ON, cursor OFF, blink OFF
        this.sendCommand(0x01); // Clear display
        this.sendCommand(0x06); // Entry mode: increment cursor, no display shift

        console.log(`📺 [Hardware Sim] LCD initialized`);
    }

    /**
     * Clears the LCD display (simulates lcd.clear())
     */
    public clear(): void {
        console.log(`📺 [Hardware Sim] clear()`);
        this.sendCommand(0x01); // ✅ FIX: Clear display (already includes return home)
        // Removed 0x02 - clear command already returns home
    }

    /**
     * Sets cursor position (simulates lcd.setCursor(col, row))
     */
    public setCursor(col: number, row: number): void {
        console.log(`📺 [Hardware Sim] setCursor(${col}, ${row})`);

        // Calculate DDRAM address
        // Line 0: 0x00-0x0F, Line 1: 0x40-0x4F
        const address = (row === 0 ? 0x00 : 0x40) + col;

        // Send set DDRAM address command (0x80 | address)
        this.sendCommand(0x80 | address);
    }

    /**
     * Prints text to LCD (simulates lcd.print(text))
     */
    public print(text: string): void {
        console.log(`📺 [Hardware Sim] print("${text}")`);

        // Send each character as data
        for (const char of text) {
            this.sendData(char.charCodeAt(0));
        }
    }

    /**
     * Prints text and moves to next line (simulates lcd.println(text))
     */
    public println(text: string): void {
        console.log(`📺 [Hardware Sim] println("${text}")`);

        // Print the text
        this.print(text);

        // Move to start of next line (line 1, col 0)
        this.setCursor(0, 1);
    }
}

/**
 * Parses Arduino code and simulates LCD library calls using hardware signals
 */
export function simulateLCDFromCode(code: string, instanceId: string, pins: LCDPins): void {
    console.log('📺 Starting hardware LCD simulation from code...');

    const simulator = new LCDHardwareSimulator(instanceId, pins);

    // Initialize LCD
    simulator.begin();

    // Parse and execute LCD commands from code
    const lcdCommandRegex = /lcd\.(print|println|setCursor|clear|begin)\s*\((.*?)\)/gi;
    let match;

    while ((match = lcdCommandRegex.exec(code)) !== null) {
        const command = match[1].toLowerCase();
        const args = match[2];

        if (command === 'begin') {
            // Already initialized above, skip
            continue;
        }
        else if (command === 'clear') {
            simulator.clear();
        }
        else if (command === 'setcursor') {
            // Parse setCursor(col, row)
            const setCursorArgs = args.split(',').map(a => a.trim());
            if (setCursorArgs.length >= 2) {
                const col = parseInt(setCursorArgs[0]) || 0;
                const row = parseInt(setCursorArgs[1]) || 0;
                simulator.setCursor(col, row);
            }
        }
        else if (command === 'print') {
            // Extract text from quotes
            const textMatch = args.match(/["']([^"']*)["']/);
            if (textMatch) {
                simulator.print(textMatch[1]);
            }
        }
        else if (command === 'println') {
            // Extract text from quotes
            const textMatch = args.match(/["']([^"']*)["']/);
            if (textMatch) {
                simulator.println(textMatch[1]);
            }
        }
    }

    console.log('📺 Hardware LCD simulation complete - text stored in DDRAM');
}

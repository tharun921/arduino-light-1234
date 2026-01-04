/**
 * OLED 128x64 (SSD1306) Hardware Simulation Engine
 * 
 * This engine simulates a real OLED display with SSD1306 controller by:
 * - Watching I2C pin changes (SDA/SCL)
 * - Decoding I2C protocol (START, STOP, ACK, data bytes)
 * - Implementing GDDRAM (1024 bytes for 128x64 pixels)
 * - Processing SSD1306 commands
 * - Maintaining page-based display memory (8 pages × 128 columns)
 * 
 * Memory Organization:
 *   - 8 pages (Page 0-7), each page is 8 rows of pixels
 *   - Each page has 128 bytes (one byte per column)
 *   - Each byte controls 8 vertical pixels (LSB = top pixel)
 *   
 * Total: 8 pages × 128 bytes = 1024 bytes = 8192 pixels
 * 
 * Reference: SSD1306 datasheet and user's research notes
 */

// ============================================
// Types and Interfaces
// ============================================

interface OLEDPinConfig {
    sda: number;  // I2C Data pin (A4 on Arduino Uno = pin 18)
    scl: number;  // I2C Clock pin (A5 on Arduino Uno = pin 19)
}

interface I2CState {
    sdaLevel: number;       // Current SDA level
    sclLevel: number;       // Current SCL level
    prevSdaLevel: number;   // Previous SDA level
    prevSclLevel: number;   // Previous SCL level
    inTransaction: boolean; // Currently in I2C transaction
    bitIndex: number;       // Current bit being received (0-7)
    currentByte: number;    // Byte being assembled
    byteCount: number;      // Number of bytes received in transaction
    isCommand: boolean;     // Control byte indicates command (0x00) vs data (0x40)
    receivedBytes: number[]; // Buffer of received bytes
    awaitingAck: boolean;   // Waiting for ACK bit
}

// SSD1306 Addressing Modes
enum AddressingMode {
    HORIZONTAL = 0x00,
    VERTICAL = 0x01,
    PAGE = 0x02,
}

interface SSD1306State {
    // Display RAM (GDDRAM): 8 pages × 128 columns = 1024 bytes
    gddram: Uint8Array;

    // Addressing
    addressingMode: AddressingMode;
    pageAddress: number;      // Current page (0-7)
    columnAddress: number;    // Current column (0-127)
    pageStartAddress: number; // Page addressing mode start
    pageEndAddress: number;   // Page addressing mode end
    columnStartAddress: number; // Horizontal/Vertical mode start
    columnEndAddress: number;   // Horizontal/Vertical mode end

    // Display settings
    displayEnabled: boolean;
    displayInverted: boolean;  // Normal (0) or Inverted (1) display
    contrast: number;          // Contrast level (0-255)
    displayStartLine: number;  // Display start line (0-63)
    segmentRemap: boolean;     // Column address 0 mapped to SEG0 or SEG127
    comOutputScanDirection: boolean; // COM output scan direction
    multiplex: number;         // Multiplex ratio (1-64)
    displayOffset: number;     // Display offset (0-63)

    // Scrolling (simplified)
    scrollEnabled: boolean;

    // Command parsing state
    pendingCommand: number | null;
    commandArgsExpected: number;
    commandArgs: number[];

    // Initialization status
    initialized: boolean;

    // Text rendering settings (for simulation)
    textColor: string;         // WHITE, YELLOW, BLUE, etc.
    textSize: number;          // Text scale (1, 2, 3, etc.)
    cursorX: number;           // Cursor X position
    cursorY: number;           // Cursor Y position
    rotation: number;          // Display rotation: 0=0°, 1=90°, 2=180°, 3=270°
}

interface OLEDDisplayBuffer {
    pixels: boolean[][];      // 128 columns × 64 rows, true = pixel ON
    isOn: boolean;
    isInverted: boolean;
    contrast: number;
    textColor: string;        // Color name from Arduino code (WHITE, YELLOW, BLUE, etc.)
    rotation: number;         // Display rotation: 0, 1, 2, or 3
}

// Event emitter for UI updates
type OLEDEventCallback = (instanceId: string, buffer: OLEDDisplayBuffer) => void;

// ============================================
// OLED Instance Class
// ============================================

class OLEDInstance {
    private state: SSD1306State;
    private i2cState: I2CState;
    private pins: OLEDPinConfig;
    private instanceId: string;
    private i2cAddress: number = 0x3C; // Default OLED I2C address
    private addressMatched: boolean = false;

    constructor(instanceId: string, pins: OLEDPinConfig, address: number = 0x3C) {
        this.instanceId = instanceId;
        this.pins = pins;
        this.i2cAddress = address;

        // Initialize I2C state
        this.i2cState = {
            sdaLevel: 1,
            sclLevel: 1,
            prevSdaLevel: 1,
            prevSclLevel: 1,
            inTransaction: false,
            bitIndex: 0,
            currentByte: 0,
            byteCount: 0,
            isCommand: true,
            receivedBytes: [],
            awaitingAck: false,
        };

        // Initialize SSD1306 state (power-on reset state)
        this.state = {
            gddram: new Uint8Array(1024), // All pixels OFF initially

            addressingMode: AddressingMode.PAGE, // Default: page addressing
            pageAddress: 0,
            columnAddress: 0,
            pageStartAddress: 0,
            pageEndAddress: 7,
            columnStartAddress: 0,
            columnEndAddress: 127,

            displayEnabled: false,  // Display OFF after power-on
            displayInverted: false,
            contrast: 0x7F,         // Default contrast
            displayStartLine: 0,
            segmentRemap: false,
            comOutputScanDirection: false,
            multiplex: 64,
            displayOffset: 0,

            scrollEnabled: false,

            pendingCommand: null,
            commandArgsExpected: 0,
            commandArgs: [],

            initialized: false,

            // Text rendering defaults
            textColor: 'WHITE',
            textSize: 1,
            cursorX: 0,
            cursorY: 0,
            rotation: 0,  // Default: no rotation
        };

        console.log(`🖥️ OLED Instance created: ${instanceId}, I2C Address: 0x${address.toString(16)}`);
        console.log(`   SDA pin: ${pins.sda}, SCL pin: ${pins.scl}`);
    }

    // ============================================
    // I2C Protocol Handling
    // ============================================

    /**
     * Core pin change handler - called whenever SDA or SCL changes
     */
    onPinChange(pin: number, level: 0 | 1): void {
        const prevSda = this.i2cState.sdaLevel;
        const prevScl = this.i2cState.sclLevel;

        // Update current levels
        if (pin === this.pins.sda) {
            this.i2cState.prevSdaLevel = prevSda;
            this.i2cState.sdaLevel = level;
        } else if (pin === this.pins.scl) {
            this.i2cState.prevSclLevel = prevScl;
            this.i2cState.sclLevel = level;
        } else {
            return; // Not our pin
        }

        const sda = this.i2cState.sdaLevel;
        const scl = this.i2cState.sclLevel;

        // Detect I2C START condition: SDA falls while SCL is HIGH
        if (pin === this.pins.sda && prevSda === 1 && sda === 0 && scl === 1) {
            this.onI2CStart();
            return;
        }

        // Detect I2C STOP condition: SDA rises while SCL is HIGH
        if (pin === this.pins.sda && prevSda === 0 && sda === 1 && scl === 1) {
            this.onI2CStop();
            return;
        }

        // Sample data on rising edge of SCL (only if in transaction)
        if (pin === this.pins.scl && prevScl === 0 && scl === 1 && this.i2cState.inTransaction) {
            this.onI2CClockRise();
        }
    }

    /**
     * I2C START condition detected
     */
    private onI2CStart(): void {
        this.i2cState.inTransaction = true;
        this.i2cState.bitIndex = 0;
        this.i2cState.currentByte = 0;
        this.i2cState.byteCount = 0;
        this.i2cState.receivedBytes = [];
        this.i2cState.awaitingAck = false;
        this.addressMatched = false;
        // console.log('🔵 I2C START');
    }

    /**
     * I2C STOP condition detected
     */
    private onI2CStop(): void {
        if (this.i2cState.inTransaction && this.addressMatched) {
            // Process all received data bytes
            this.processReceivedData();
        }
        this.i2cState.inTransaction = false;
        this.addressMatched = false;
        // console.log('🔴 I2C STOP');
    }

    /**
     * Rising edge of SCL - sample SDA bit
     */
    private onI2CClockRise(): void {
        if (this.i2cState.awaitingAck) {
            // This is the ACK bit, ignore it (we're a slave, we'd normally drive this)
            this.i2cState.awaitingAck = false;
            return;
        }

        // Sample the data bit
        const bit = this.i2cState.sdaLevel;
        this.i2cState.currentByte = (this.i2cState.currentByte << 1) | bit;
        this.i2cState.bitIndex++;

        if (this.i2cState.bitIndex === 8) {
            // Complete byte received
            const byte = this.i2cState.currentByte & 0xFF;
            this.onByteReceived(byte);

            // Reset for next byte
            this.i2cState.bitIndex = 0;
            this.i2cState.currentByte = 0;
            this.i2cState.awaitingAck = true; // Next clock is ACK
        }
    }

    /**
     * Complete byte received over I2C
     */
    private onByteReceived(byte: number): void {
        this.i2cState.byteCount++;

        if (this.i2cState.byteCount === 1) {
            // First byte is address + R/W bit
            const address = byte >> 1;
            const isRead = byte & 0x01;

            if (address === this.i2cAddress && isRead === 0) {
                this.addressMatched = true;
                // console.log(`📬 OLED Address matched: 0x${address.toString(16)}`);
            }
        } else if (this.addressMatched) {
            if (this.i2cState.byteCount === 2) {
                // Second byte is control byte (determines command vs data)
                // 0x00 = command, 0x40 = data, 0x80 = single command byte follows
                this.i2cState.isCommand = (byte & 0x40) === 0;
                // console.log(`📝 Control byte: 0x${byte.toString(16)}, isCommand: ${this.i2cState.isCommand}`);
            } else {
                // Subsequent bytes are command or data
                this.i2cState.receivedBytes.push(byte);
            }
        }
    }

    // ============================================
    // Data Processing
    // ============================================

    /**
     * Process all received bytes after I2C STOP
     */
    private processReceivedData(): void {
        const bytes = this.i2cState.receivedBytes;

        if (bytes.length === 0) return;

        if (this.i2cState.isCommand) {
            // Process as commands
            this.processCommands(bytes);
        } else {
            // Process as display data
            this.processDisplayData(bytes);
        }
    }

    /**
     * Process SSD1306 commands
     * Reference: SSD1306 datasheet Table 9-1
     */
    private processCommands(bytes: number[]): void {
        let i = 0;

        while (i < bytes.length) {
            const cmd = bytes[i];

            // Handle multi-byte commands with pending args
            if (this.state.pendingCommand !== null) {
                this.state.commandArgs.push(cmd);
                if (this.state.commandArgs.length >= this.state.commandArgsExpected) {
                    this.executeMultiByteCommand(this.state.pendingCommand, this.state.commandArgs);
                    this.state.pendingCommand = null;
                    this.state.commandArgs = [];
                }
                i++;
                continue;
            }

            // Single-byte commands
            if (cmd >= 0x00 && cmd <= 0x0F) {
                // Set lower column start address (PAGE mode)
                this.state.columnAddress = (this.state.columnAddress & 0xF0) | (cmd & 0x0F);
            } else if (cmd >= 0x10 && cmd <= 0x1F) {
                // Set higher column start address (PAGE mode)
                this.state.columnAddress = (this.state.columnAddress & 0x0F) | ((cmd & 0x0F) << 4);
            } else if (cmd >= 0xB0 && cmd <= 0xB7) {
                // Set page start address (PAGE mode)
                this.state.pageAddress = cmd & 0x07;
            } else if (cmd >= 0x40 && cmd <= 0x7F) {
                // Set display start line
                this.state.displayStartLine = cmd & 0x3F;
            }

            // Multi-byte commands
            else {
                switch (cmd) {
                    // Fundamental Commands
                    case 0x81: // Set contrast
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0xA4: // Resume from entire display ON
                        break;

                    case 0xA5: // Entire display ON
                        break;

                    case 0xA6: // Normal display (not inverted)
                        this.state.displayInverted = false;
                        break;

                    case 0xA7: // Inverse display
                        this.state.displayInverted = true;
                        break;

                    case 0xAE: // Display OFF
                        this.state.displayEnabled = false;
                        console.log('🖥️ OLED: Display OFF');
                        break;

                    case 0xAF: // Display ON
                        this.state.displayEnabled = true;
                        this.state.initialized = true;
                        console.log('🖥️ OLED: Display ON');
                        break;

                    // Addressing Commands
                    case 0x20: // Set Memory Addressing Mode
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0x21: // Set Column Address (for H/V mode)
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 2;
                        break;

                    case 0x22: // Set Page Address (for H/V mode)
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 2;
                        break;

                    // Hardware Configuration
                    case 0xA0: // Segment remap SEG0
                        this.state.segmentRemap = false;
                        break;

                    case 0xA1: // Segment remap SEG127
                        this.state.segmentRemap = true;
                        break;

                    case 0xA8: // Set multiplex ratio
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0xC0: // COM output scan direction normal
                        this.state.comOutputScanDirection = false;
                        break;

                    case 0xC8: // COM output scan direction remapped
                        this.state.comOutputScanDirection = true;
                        break;

                    case 0xD3: // Set display offset
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0xDA: // Set COM pins hardware configuration
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    // Timing & Driving
                    case 0xD5: // Set display clock divide ratio/frequency
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0xD9: // Set pre-charge period
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0xDB: // Set Vcomh deselect level
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    case 0x8D: // Charge pump setting
                        this.state.pendingCommand = cmd;
                        this.state.commandArgsExpected = 1;
                        break;

                    // Scrolling (simplified - just store enabled state)
                    case 0x2E: // Deactivate scroll
                        this.state.scrollEnabled = false;
                        break;

                    case 0x2F: // Activate scroll
                        this.state.scrollEnabled = true;
                        break;

                    default:
                        // Unknown command, log for debugging
                        // console.log(`❓ Unknown OLED command: 0x${cmd.toString(16)}`);
                        break;
                }
            }

            i++;
        }
    }

    /**
     * Execute multi-byte command with all arguments received
     */
    private executeMultiByteCommand(cmd: number, args: number[]): void {
        switch (cmd) {
            case 0x81: // Set contrast
                this.state.contrast = args[0];
                break;

            case 0x20: // Set addressing mode
                this.state.addressingMode = args[0] & 0x03;
                console.log(`🖥️ OLED: Addressing mode = ${['Horizontal', 'Vertical', 'Page'][this.state.addressingMode]}`);
                break;

            case 0x21: // Set column address range
                this.state.columnStartAddress = args[0] & 0x7F;
                this.state.columnEndAddress = args[1] & 0x7F;
                this.state.columnAddress = this.state.columnStartAddress;
                break;

            case 0x22: // Set page address range
                this.state.pageStartAddress = args[0] & 0x07;
                this.state.pageEndAddress = args[1] & 0x07;
                this.state.pageAddress = this.state.pageStartAddress;
                break;

            case 0xA8: // Set multiplex ratio
                this.state.multiplex = (args[0] & 0x3F) + 1;
                break;

            case 0xD3: // Set display offset
                this.state.displayOffset = args[0] & 0x3F;
                break;

            case 0xDA: // COM pins configuration
                // Just acknowledge, hardware-specific
                break;

            case 0xD5: // Clock divide ratio
            case 0xD9: // Pre-charge period
            case 0xDB: // Vcomh deselect level
            case 0x8D: // Charge pump
                // Acknowledge but don't need to simulate these
                break;
        }
    }

    /**
     * Process display data (writes to GDDRAM)
     */
    private processDisplayData(bytes: number[]): void {
        for (const byte of bytes) {
            this.writeToGDDRAM(byte);
        }

        // Emit update event after processing all data
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Write a byte to GDDRAM at current address
     * Each byte controls 8 vertical pixels (1 page = 8 rows)
     */
    private writeToGDDRAM(byte: number): void {
        const address = this.state.pageAddress * 128 + this.state.columnAddress;

        if (address < 1024) {
            this.state.gddram[address] = byte;
        }

        // Advance address based on addressing mode
        this.advanceAddress();
    }

    /**
     * Advance GDDRAM address based on addressing mode
     */
    private advanceAddress(): void {
        switch (this.state.addressingMode) {
            case AddressingMode.HORIZONTAL:
                // Column++, then wrap to next page
                this.state.columnAddress++;
                if (this.state.columnAddress > this.state.columnEndAddress) {
                    this.state.columnAddress = this.state.columnStartAddress;
                    this.state.pageAddress++;
                    if (this.state.pageAddress > this.state.pageEndAddress) {
                        this.state.pageAddress = this.state.pageStartAddress;
                    }
                }
                break;

            case AddressingMode.VERTICAL:
                // Page++, then wrap to next column
                this.state.pageAddress++;
                if (this.state.pageAddress > this.state.pageEndAddress) {
                    this.state.pageAddress = this.state.pageStartAddress;
                    this.state.columnAddress++;
                    if (this.state.columnAddress > this.state.columnEndAddress) {
                        this.state.columnAddress = this.state.columnStartAddress;
                    }
                }
                break;

            case AddressingMode.PAGE:
            default:
                // Column++ only within current page
                this.state.columnAddress++;
                if (this.state.columnAddress > 127) {
                    this.state.columnAddress = 0;
                }
                break;
        }
    }

    // ============================================
    // Display Buffer for UI
    // ============================================

    /**
     * Get the current display buffer as a 2D boolean array
     * This is what the UI should render
     */
    getDisplayBuffer(): OLEDDisplayBuffer {
        const pixels: boolean[][] = [];

        // Initialize 128x64 pixel array
        for (let x = 0; x < 128; x++) {
            pixels[x] = new Array(64).fill(false);
        }

        // Convert GDDRAM to pixels
        // GDDRAM is organized as 8 pages, each with 128 bytes
        // Each byte represents 8 vertical pixels (LSB = top)
        for (let page = 0; page < 8; page++) {
            for (let col = 0; col < 128; col++) {
                const byte = this.state.gddram[page * 128 + col];

                for (let bit = 0; bit < 8; bit++) {
                    const row = page * 8 + bit;
                    const isOn = (byte & (1 << bit)) !== 0;

                    // Apply segment remap if enabled
                    const x = this.state.segmentRemap ? (127 - col) : col;

                    // Apply COM scan direction
                    const y = this.state.comOutputScanDirection ? (63 - row) : row;

                    if (x >= 0 && x < 128 && y >= 0 && y < 64) {
                        // Apply inversion if set
                        pixels[x][y] = this.state.displayInverted ? !isOn : isOn;
                    }
                }
            }
        }

        return {
            pixels,
            isOn: this.state.displayEnabled,
            isInverted: this.state.displayInverted,
            contrast: this.state.contrast,
            textColor: this.state.textColor,
            rotation: this.state.rotation,
        };
    }

    /**
     * Draw a single pixel (for testing)
     */
    setPixel(x: number, y: number, on: boolean): void {
        if (x < 0 || x >= 128 || y < 0 || y >= 64) return;

        const page = Math.floor(y / 8);
        const bit = y % 8;
        const address = page * 128 + x;

        if (on) {
            this.state.gddram[address] |= (1 << bit);
        } else {
            this.state.gddram[address] &= ~(1 << bit);
        }
    }

    /**
     * Clear the entire display
     */
    clear(): void {
        this.state.gddram.fill(0);
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Fill the entire display
     */
    fill(): void {
        this.state.gddram.fill(0xFF);
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    // ============================================
    // Text Settings Methods
    // ============================================

    /**
     * Set text color (for simulation visualization)
     */
    setTextColor(color: string): void {
        this.state.textColor = color.toUpperCase();
        console.log(`🖥️ OLED ${this.instanceId}: Text color set to ${color}`);
    }

    /**
     * Set text size/scale
     */
    setTextSize(size: number): void {
        this.state.textSize = Math.max(1, Math.min(4, size));
        console.log(`🖥️ OLED ${this.instanceId}: Text size set to ${size}`);
    }

    /**
     * Set display rotation
     * 0 = 0° (normal), 1 = 90°, 2 = 180°, 3 = 270°
     */
    setRotation(rotation: number): void {
        this.state.rotation = rotation % 4;
        console.log(`🖥️ OLED ${this.instanceId}: Rotation set to ${rotation * 90}°`);
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Set cursor position
     */
    setCursor(x: number, y: number): void {
        this.state.cursorX = x;
        this.state.cursorY = y;
    }

    // ============================================
    // Graphics Drawing Methods
    // ============================================

    /**
     * Draw a line between two points (Bresenham's algorithm)
     */
    drawLine(x0: number, y0: number, x1: number, y1: number, on: boolean = true): void {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            this.setPixel(x0, y0, on);

            if (x0 === x1 && y0 === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    /**
     * Draw a rectangle outline
     */
    drawRect(x: number, y: number, w: number, h: number, on: boolean = true): void {
        this.drawLine(x, y, x + w - 1, y, on);           // Top
        this.drawLine(x, y + h - 1, x + w - 1, y + h - 1, on); // Bottom
        this.drawLine(x, y, x, y + h - 1, on);           // Left
        this.drawLine(x + w - 1, y, x + w - 1, y + h - 1, on); // Right
    }

    /**
     * Draw a filled rectangle
     */
    fillRect(x: number, y: number, w: number, h: number, on: boolean = true): void {
        for (let i = 0; i < h; i++) {
            this.drawLine(x, y + i, x + w - 1, y + i, on);
        }
    }

    /**
     * Draw a circle outline (Midpoint algorithm)
     */
    drawCircle(cx: number, cy: number, r: number, on: boolean = true): void {
        let x = r;
        let y = 0;
        let err = 0;

        while (x >= y) {
            this.setPixel(cx + x, cy + y, on);
            this.setPixel(cx + y, cy + x, on);
            this.setPixel(cx - y, cy + x, on);
            this.setPixel(cx - x, cy + y, on);
            this.setPixel(cx - x, cy - y, on);
            this.setPixel(cx - y, cy - x, on);
            this.setPixel(cx + y, cy - x, on);
            this.setPixel(cx + x, cy - y, on);

            y++;
            err += 1 + 2 * y;
            if (2 * (err - x) + 1 > 0) {
                x--;
                err += 1 - 2 * x;
            }
        }
    }

    /**
     * Draw a filled circle
     */
    fillCircle(cx: number, cy: number, r: number, on: boolean = true): void {
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r * r) {
                    this.setPixel(cx + x, cy + y, on);
                }
            }
        }
    }

    /**
     * Draw a triangle outline
     */
    drawTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, on: boolean = true): void {
        this.drawLine(x1, y1, x2, y2, on);
        this.drawLine(x2, y2, x3, y3, on);
        this.drawLine(x3, y3, x1, y1, on);
    }

    /**
     * Draw a bitmap image at the specified position
     * @param x - X position (left edge)
     * @param y - Y position (top edge)
     * @param bitmap - Array of bytes representing the bitmap
     * @param w - Width in pixels
     * @param h - Height in pixels
     * @param color - 1 for white, 0 for black
     */
    drawBitmap(x: number, y: number, bitmap: number[], w: number, h: number, color: number = 1): void {
        const on = color !== 0;

        // Horizontal byte layout (Adafruit style)
        // Each byte represents 8 horizontal pixels, MSB first
        const bytesPerRow = Math.ceil(w / 8);

        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const byteIndex = row * bytesPerRow + Math.floor(col / 8);
                const bitIndex = 7 - (col % 8); // MSB first

                if (byteIndex < bitmap.length) {
                    const bit = (bitmap[byteIndex] >> bitIndex) & 1;
                    if (bit) {
                        this.setPixel(x + col, y + row, on);
                    }
                }
            }
        }
    }

    /**
     * Draw a bitmap with XBM format (vertical bytes)
     * Used by some Arduino examples
     */
    drawXBitmap(x: number, y: number, bitmap: number[], w: number, h: number, color: number = 1): void {
        const on = color !== 0;
        const bytesPerColumn = Math.ceil(h / 8);

        for (let col = 0; col < w; col++) {
            for (let row = 0; row < h; row++) {
                const byteIndex = col * bytesPerColumn + Math.floor(row / 8);
                const bitIndex = row % 8; // LSB first for XBM

                if (byteIndex < bitmap.length) {
                    const bit = (bitmap[byteIndex] >> bitIndex) & 1;
                    if (bit) {
                        this.setPixel(x + col, y + row, on);
                    }
                }
            }
        }
    }

    /**
     * Get instance ID
     */
    getId(): string {
        return this.instanceId;
    }

    /**
     * Check if display is initialized
     */
    isInitialized(): boolean {
        return this.state.initialized;
    }

    /**
     * Reset to power-on state
     */
    reset(): void {
        this.state.gddram.fill(0);
        this.state.displayEnabled = false;
        this.state.displayInverted = false;
        this.state.contrast = 0x7F;
        this.state.initialized = false;
        this.state.pageAddress = 0;
        this.state.columnAddress = 0;
        this.state.addressingMode = AddressingMode.PAGE;
        console.log(`🖥️ OLED ${this.instanceId} reset`);
    }

    /**
     * Process I2C data directly (called from TWI emulator)
     * This bypasses the pin-level I2C simulation
     */
    processI2CData(isCommand: boolean, dataBytes: number[]): void {
        if (dataBytes.length === 0) return;

        console.log(`🖥️ OLED ${this.instanceId}: Processing ${dataBytes.length} bytes (${isCommand ? 'commands' : 'data'})`);

        if (isCommand) {
            // Process as commands
            this.processCommands(dataBytes);
        } else {
            // Process as display data
            this.processDisplayData(dataBytes);
        }
    }

    /**
     * Force enable the display (bypass I2C initialization)
     * Useful when I2C emulation isn't working but we want to show the OLED is active
     */
    forceEnable(): void {
        this.state.displayEnabled = true;
        this.state.initialized = true;
        // Note: Logging removed to reduce console spam during animation
    }
    /**
     * Simple 5x7 bitmap font for text rendering
     * Each character is represented as 5 bytes (columns), with 7 bits each (rows)
     */
    private static FONT_5X7: Record<string, number[]> = {
        ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
        '!': [0x00, 0x00, 0x5F, 0x00, 0x00],
        '"': [0x00, 0x07, 0x00, 0x07, 0x00],
        '#': [0x14, 0x7F, 0x14, 0x7F, 0x14],
        '$': [0x24, 0x2A, 0x7F, 0x2A, 0x12],
        '%': [0x23, 0x13, 0x08, 0x64, 0x62],
        '&': [0x36, 0x49, 0x55, 0x22, 0x50],
        "'": [0x00, 0x05, 0x03, 0x00, 0x00],
        '(': [0x00, 0x1C, 0x22, 0x41, 0x00],
        ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
        '*': [0x08, 0x2A, 0x1C, 0x2A, 0x08],
        '+': [0x08, 0x08, 0x3E, 0x08, 0x08],
        ',': [0x00, 0x50, 0x30, 0x00, 0x00],
        '-': [0x08, 0x08, 0x08, 0x08, 0x08],
        '.': [0x00, 0x60, 0x60, 0x00, 0x00],
        '/': [0x20, 0x10, 0x08, 0x04, 0x02],
        '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
        '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
        '2': [0x42, 0x61, 0x51, 0x49, 0x46],
        '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
        '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
        '5': [0x27, 0x45, 0x45, 0x45, 0x39],
        '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
        '7': [0x01, 0x71, 0x09, 0x05, 0x03],
        '8': [0x36, 0x49, 0x49, 0x49, 0x36],
        '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
        ':': [0x00, 0x36, 0x36, 0x00, 0x00],
        ';': [0x00, 0x56, 0x36, 0x00, 0x00],
        '<': [0x00, 0x08, 0x14, 0x22, 0x41],
        '=': [0x14, 0x14, 0x14, 0x14, 0x14],
        '>': [0x41, 0x22, 0x14, 0x08, 0x00],
        '?': [0x02, 0x01, 0x51, 0x09, 0x06],
        '@': [0x32, 0x49, 0x79, 0x41, 0x3E],
        'A': [0x7E, 0x11, 0x11, 0x11, 0x7E],
        'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
        'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
        'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
        'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
        'F': [0x7F, 0x09, 0x09, 0x01, 0x01],
        'G': [0x3E, 0x41, 0x41, 0x51, 0x32],
        'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
        'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
        'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
        'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
        'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
        'M': [0x7F, 0x02, 0x04, 0x02, 0x7F],
        'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
        'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
        'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
        'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
        'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
        'S': [0x46, 0x49, 0x49, 0x49, 0x31],
        'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
        'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
        'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
        'W': [0x7F, 0x20, 0x18, 0x20, 0x7F],
        'X': [0x63, 0x14, 0x08, 0x14, 0x63],
        'Y': [0x03, 0x04, 0x78, 0x04, 0x03],
        'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
        'a': [0x20, 0x54, 0x54, 0x54, 0x78],
        'b': [0x7F, 0x48, 0x44, 0x44, 0x38],
        'c': [0x38, 0x44, 0x44, 0x44, 0x20],
        'd': [0x38, 0x44, 0x44, 0x48, 0x7F],
        'e': [0x38, 0x54, 0x54, 0x54, 0x18],
        'f': [0x08, 0x7E, 0x09, 0x01, 0x02],
        'g': [0x08, 0x14, 0x54, 0x54, 0x3C],
        'h': [0x7F, 0x08, 0x04, 0x04, 0x78],
        'i': [0x00, 0x44, 0x7D, 0x40, 0x00],
        'j': [0x20, 0x40, 0x44, 0x3D, 0x00],
        'k': [0x00, 0x7F, 0x10, 0x28, 0x44],
        'l': [0x00, 0x41, 0x7F, 0x40, 0x00],
        'm': [0x7C, 0x04, 0x18, 0x04, 0x78],
        'n': [0x7C, 0x08, 0x04, 0x04, 0x78],
        'o': [0x38, 0x44, 0x44, 0x44, 0x38],
        'p': [0x7C, 0x14, 0x14, 0x14, 0x08],
        'q': [0x08, 0x14, 0x14, 0x18, 0x7C],
        'r': [0x7C, 0x08, 0x04, 0x04, 0x08],
        's': [0x48, 0x54, 0x54, 0x54, 0x20],
        't': [0x04, 0x3F, 0x44, 0x40, 0x20],
        'u': [0x3C, 0x40, 0x40, 0x20, 0x7C],
        'v': [0x1C, 0x20, 0x40, 0x20, 0x1C],
        'w': [0x3C, 0x40, 0x30, 0x40, 0x3C],
        'x': [0x44, 0x28, 0x10, 0x28, 0x44],
        'y': [0x0C, 0x50, 0x50, 0x50, 0x3C],
        'z': [0x44, 0x64, 0x54, 0x4C, 0x44],
    };

    /**
     * Draw a character at specified position
     */
    private drawChar(char: string, x: number, y: number, scale: number = 1): number {
        const charData = OLEDInstance.FONT_5X7[char] || OLEDInstance.FONT_5X7['?'];
        if (!charData) return 6 * scale; // Default character width

        for (let col = 0; col < 5; col++) {
            const colData = charData[col];
            for (let row = 0; row < 7; row++) {
                if ((colData >> row) & 1) {
                    // Draw scaled pixel
                    for (let sx = 0; sx < scale; sx++) {
                        for (let sy = 0; sy < scale; sy++) {
                            this.setPixel(x + col * scale + sx, y + row * scale + sy, true);
                        }
                    }
                }
            }
        }
        return 6 * scale; // Character width + spacing
    }

    /**
     * Draw text at specified position
     */
    drawText(text: string, x: number = 0, y: number = 0, scale: number = 1): void {
        let cursorX = x;
        for (const char of text) {
            if (char === '\n') {
                cursorX = x;
                y += 8 * scale;
                continue;
            }
            cursorX += this.drawChar(char, cursorX, y, scale);
        }
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Draw a test pattern to verify rendering works
     */
    drawTestPattern(): void {
        // Turn on display first
        this.forceEnable();

        // Clear display
        this.state.gddram.fill(0);

        // Draw border
        for (let x = 0; x < 128; x++) {
            this.setPixel(x, 0, true);
            this.setPixel(x, 63, true);
        }
        for (let y = 0; y < 64; y++) {
            this.setPixel(0, y, true);
            this.setPixel(127, y, true);
        }

        // Draw "OLED OK" text in center
        this.drawText("OLED OK", 30, 25, 2);

        console.log(`🖥️ OLED ${this.instanceId}: Test pattern drawn`);
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Display text from Arduino code
     * This is called when we parse display.print() from the sketch
     */
    displayParsedText(text: string, scale: number = 1): void {
        this.forceEnable();
        this.state.gddram.fill(0); // Clear display

        // Draw the text
        this.drawText(text, 4, 4, scale);

        console.log(`🖥️ OLED ${this.instanceId}: Displaying parsed text: "${text}"`);
        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Display a single frame of scrolling text at a specific X position
     * Used by the scroll animation in OLEDEngine
     */
    displayScrollingFrame(text: string, x: number, y: number, scale: number = 1): void {
        this.forceEnable();
        this.state.gddram.fill(0); // Clear display

        // Draw the text at the specified position
        this.drawText(text, x, y, scale);

        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Display a frame with mixed content: static text + scrolling text
     */
    displayMixedFrame(
        staticTexts: { text: string; row: number }[],
        scrollText: string,
        scrollX: number,
        scrollY: number,
        scale: number = 1
    ): void {
        this.forceEnable();
        this.state.gddram.fill(0); // Clear display

        // Draw static text rows
        for (const item of staticTexts) {
            const y = item.row * 8 * scale;
            this.drawText(item.text, 0, y, scale);
        }

        // Draw scrolling text
        this.drawText(scrollText, scrollX, scrollY, scale);

        OLEDEngine.getInstance().emitUpdate(this.instanceId);
    }

    /**
     * Check if display is enabled
     */
    isDisplayOn(): boolean {
        return this.state.displayEnabled;
    }
}

// ============================================
// OLED Engine Manager (Singleton)
// ============================================

class OLEDEngine {
    private static instance: OLEDEngine;
    private oledInstances: Map<string, OLEDInstance> = new Map();
    private eventCallbacks: OLEDEventCallback[] = [];

    private constructor() {
        console.log('🖥️ OLED Engine initialized');
    }

    static getInstance(): OLEDEngine {
        if (!OLEDEngine.instance) {
            OLEDEngine.instance = new OLEDEngine();
        }
        return OLEDEngine.instance;
    }

    /**
     * Register an OLED instance with pin configuration
     */
    registerOLED(instanceId: string, pins: OLEDPinConfig, address: number = 0x3C): void {
        if (this.oledInstances.has(instanceId)) {
            console.log(`🖥️ OLED already registered: ${instanceId}`);
            return;
        }

        const oled = new OLEDInstance(instanceId, pins, address);
        this.oledInstances.set(instanceId, oled);
        console.log(`🖥️ OLED registered: ${instanceId}, SDA: ${pins.sda}, SCL: ${pins.scl}`);
    }

    /**
     * Unregister an OLED instance
     */
    unregisterOLED(instanceId: string): void {
        if (this.oledInstances.delete(instanceId)) {
            console.log(`🖥️ OLED unregistered: ${instanceId}`);
        }
    }

    /**
     * Handle pin change for all OLED instances
     * Called by AVR8jsWrapper when I2C pins change
     */
    onPinChange(pin: number, level: 0 | 1): void {
        this.oledInstances.forEach((oled) => {
            oled.onPinChange(pin, level);
        });
    }

    /**
     * Get display buffer for a specific OLED
     */
    getDisplayBuffer(instanceId: string): OLEDDisplayBuffer | null {
        const oled = this.oledInstances.get(instanceId);
        return oled ? oled.getDisplayBuffer() : null;
    }

    /**
     * Register callback for display updates
     */
    onUpdate(callback: OLEDEventCallback): () => void {
        this.eventCallbacks.push(callback);
        // Return unsubscribe function
        return () => {
            const index = this.eventCallbacks.indexOf(callback);
            if (index > -1) {
                this.eventCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Emit update event to all listeners
     */
    emitUpdate(instanceId: string): void {
        const buffer = this.getDisplayBuffer(instanceId);
        if (buffer) {
            this.eventCallbacks.forEach((cb) => cb(instanceId, buffer));
        }
    }

    /**
     * Get OLED instance by ID
     */
    getOLED(instanceId: string): OLEDInstance | undefined {
        return this.oledInstances.get(instanceId);
    }

    /**
     * Reset specific OLED
     */
    resetOLED(instanceId: string): void {
        const oled = this.oledInstances.get(instanceId);
        if (oled) {
            oled.reset();
            this.emitUpdate(instanceId);
        }
    }

    /**
     * Reset all OLEDs
     */
    resetAll(): void {
        this.oledInstances.forEach((oled, id) => {
            oled.reset();
            this.emitUpdate(id);
        });
    }

    /**
     * Receive I2C data directly from TWI emulator
     * This bypasses pin-level simulation for better performance
     */
    receiveI2CData(address: number, controlByte: number, dataBytes: number[]): void {
        const isCommand = (controlByte & 0x40) === 0;

        console.log(`🖥️ OLED Engine: Received I2C data for address 0x${address.toString(16)}`);
        console.log(`   Control: 0x${controlByte.toString(16)} (${isCommand ? 'COMMAND' : 'DATA'})`);
        console.log(`   Data bytes: ${dataBytes.length}`);

        // Find OLED at this address and send data
        this.oledInstances.forEach((oled, instanceId) => {
            // All our OLEDs currently use 0x3C
            // We could add address tracking per instance if needed
            if (address === 0x3C) {
                // Process the data
                this.processOLEDData(oled, instanceId, isCommand, dataBytes);
            }
        });
    }

    /**
     * Process data for specific OLED instance
     */
    private processOLEDData(oled: OLEDInstance, instanceId: string, isCommand: boolean, dataBytes: number[]): void {
        // We need to call the OLED's internal methods
        // Since they're private, we'll expose a new method on OLEDInstance
        (oled as any).processI2CData?.(isCommand, dataBytes);

        // Emit update after processing
        this.emitUpdate(instanceId);
    }

    /**
     * Force enable all registered OLEDs (bypass I2C initialization)
     * Useful when I2C emulation isn't working but we want to show OLEDs are active
     */
    forceEnableAll(): void {
        console.log('🖥️ OLED Engine: Force enabling all displays');
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Show test pattern on all registered OLEDs
     * Useful for debugging OLED rendering when I2C emulation isn't working
     */
    showTestPatternAll(): void {
        console.log('🖥️ OLED Engine: Drawing test pattern on all displays');
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).drawTestPattern?.();
        });
    }

    /**
     * Check if any OLEDs are registered
     */
    hasOLEDs(): boolean {
        return this.oledInstances.size > 0;
    }

    /**
     * Get count of registered OLEDs
     */
    getOLEDCount(): number {
        return this.oledInstances.size;
    }

    /**
     * Display text on all registered OLEDs
     * Used when we parse display.print() from Arduino code
     */
    displayTextAll(text: string, scale: number = 1): void {
        console.log(`🖥️ OLED Engine: Displaying text on all displays: "${text}"`);
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).displayParsedText?.(text, scale);
        });
    }

    /**
     * Set text color on all registered OLEDs
     * Used when we parse display.setTextColor() from Arduino code
     */
    setColorAll(color: string): void {
        console.log(`🖥️ OLED Engine: Setting text color to "${color}" on all displays`);
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).setTextColor?.(color);
        });
    }

    /**
     * Draw a bitmap on all registered OLEDs
     * Used when we parse display.drawBitmap() from Arduino code
     */
    drawBitmapAll(x: number, y: number, bitmap: number[], w: number, h: number, color: number = 1): void {
        console.log(`🖥️ OLED Engine: Drawing bitmap at (${x}, ${y}), size ${w}x${h}, ${bitmap.length} bytes`);
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).drawBitmap?.(x, y, bitmap, w, h, color);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a line on all registered OLEDs
     */
    drawLineAll(x0: number, y0: number, x1: number, y1: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).drawLine?.(x0, y0, x1, y1, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a rectangle outline on all registered OLEDs
     */
    drawRectAll(x: number, y: number, w: number, h: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).drawRect?.(x, y, w, h, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a filled rectangle on all registered OLEDs
     */
    fillRectAll(x: number, y: number, w: number, h: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).fillRect?.(x, y, w, h, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a circle outline on all registered OLEDs
     */
    drawCircleAll(cx: number, cy: number, r: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).drawCircle?.(cx, cy, r, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a filled circle on all registered OLEDs
     */
    fillCircleAll(cx: number, cy: number, r: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).fillCircle?.(cx, cy, r, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Draw a triangle outline on all registered OLEDs
     */
    drawTriangleAll(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, on: boolean = true): void {
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).drawTriangle?.(x1, y1, x2, y2, x3, y3, on);
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Invert display on all registered OLEDs
     */
    invertDisplayAll(invert: boolean): void {
        console.log(`🖥️ OLED Engine: Inverting display = ${invert}`);
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).state.displayInverted = invert;
            this.emitUpdate(instanceId);
        });
    }

    /**
     * Set rotation on all registered OLEDs
     * 0 = 0° (normal), 1 = 90°, 2 = 180°, 3 = 270°
     */
    setRotationAll(rotation: number): void {
        console.log(`🖥️ OLED Engine: Setting rotation = ${rotation * 90}°`);
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).setRotation?.(rotation);
        });
    }

    /**
     * Display scrolling text on all registered OLEDs
     * This implements animated scrolling by periodically updating the display
     */
    private scrollAnimationId: number | null = null;
    private currentScrollText: string = '';

    displayScrollingText(text: string, scale: number = 1, direction: string = 'left', delay: number = 30): void {
        // Prevent restarting if already scrolling the same text
        if (this.scrollAnimationId && this.currentScrollText === text) {
            console.log(`🖥️ OLED Engine: Scroll already running for "${text}", skipping restart`);
            return;
        }

        console.log(`🖥️ OLED Engine: Starting scrolling text "${text}" direction=${direction} delay=${delay}ms`);

        // Clear any existing scroll animation
        if (this.scrollAnimationId) {
            clearInterval(this.scrollAnimationId);
            this.scrollAnimationId = null;
        }

        this.currentScrollText = text;

        // Text width estimation (5 pixels per char + 1 spacing, times scale)
        const textWidth = text.length * 6 * scale;

        // Start position: from right edge for left scroll, from left edge for right scroll
        let xPos = direction === 'left' ? 128 : -textWidth;

        // Center Y position on display (64 pixels tall, text is ~8*scale pixels tall)
        const yPos = Math.floor((64 - 8 * scale) / 2);

        // Calculate scroll speed based on delay
        const pixelsPerFrame = Math.max(1, Math.ceil(delay / 30));

        // Animation function
        const animateScroll = () => {
            // Update position based on direction (move multiple pixels for higher delays)
            if (direction === 'left') {
                xPos -= pixelsPerFrame;
                if (xPos < -textWidth) {
                    xPos = 128; // Reset to right side when fully scrolled out
                }
            } else {
                xPos += pixelsPerFrame;
                if (xPos > 128) {
                    xPos = -textWidth; // Reset to left side when fully scrolled out
                }
            }

            // Update all OLED instances with new position
            this.oledInstances.forEach((oled, instanceId) => {
                // Clear and redraw at new position
                (oled as any).displayScrollingFrame?.(text, Math.round(xPos), yPos, scale);
            });
        };

        // Start animation with fixed 30fps for smooth visuals
        const frameInterval = 30; // 30ms = ~33fps
        this.scrollAnimationId = window.setInterval(animateScroll, frameInterval) as unknown as number;

        // Also display initial frame immediately
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).displayScrollingFrame?.(text, Math.round(xPos), yPos, scale);
        });
    }

    /**
     * Display mixed content: static text lines + one scrolling line
     * Used for complex layouts like LCD-style rows
     */
    displayMixedContent(
        staticTexts: { text: string; row: number }[],
        scrollText: string,
        scale: number = 1,
        direction: string = 'left',
        delay: number = 30
    ): void {
        // Prevent restarting if already scrolling the same text
        if (this.scrollAnimationId && this.currentScrollText === scrollText) {
            // Already running this animation, don't restart
            return;
        }

        console.log(`🖥️ OLED Engine: Mixed content - ${staticTexts.length} static lines + scrolling "${scrollText}"`);

        // Clear any existing scroll animation
        if (this.scrollAnimationId) {
            clearInterval(this.scrollAnimationId);
            this.scrollAnimationId = null;
        }

        this.currentScrollText = scrollText;

        // Text width estimation
        const textWidth = scrollText.length * 6 * scale;

        // Start position: Begin visible on screen (x=0) for immediate visibility
        // Then scroll left until off-screen, then wrap around
        let xPos = 0; // Start visible!

        // Row 1 Y position (8 pixels per row for text size 1)
        const scrollRowY = 8 * scale; // Row 1

        // Calculate scroll speed based on delay
        // For delay=30ms: move 1 pixel per frame (fast)
        // For delay=100ms: move 3 pixels per frame (to compensate)
        // For delay=200ms: move 6 pixels per frame
        const pixelsPerFrame = Math.max(1, Math.ceil(delay / 30));
        console.log(`🖥️ OLED: Scroll animation - delay=${delay}ms, ${pixelsPerFrame} pixels/frame`);

        // Animation function
        const animateScroll = () => {
            // Update scroll position (move multiple pixels for higher delays)
            if (direction === 'left') {
                xPos -= pixelsPerFrame;
                if (xPos < -textWidth) xPos = 128;
            } else {
                xPos += pixelsPerFrame;
                if (xPos > 128) xPos = -textWidth;
            }

            // Update all OLED instances
            this.oledInstances.forEach((oled, instanceId) => {
                (oled as any).displayMixedFrame?.(staticTexts, scrollText, Math.round(xPos), scrollRowY, scale);
            });
        };

        // Start animation with fixed 30fps for smooth visuals
        const frameInterval = 30; // 30ms = ~33fps
        this.scrollAnimationId = window.setInterval(animateScroll, frameInterval) as unknown as number;

        // Display initial frame
        this.oledInstances.forEach((oled, instanceId) => {
            (oled as any).forceEnable?.();
            (oled as any).displayMixedFrame?.(staticTexts, scrollText, Math.round(xPos), scrollRowY, scale);
        });
    }

    /**
     * Stop any running scroll animation
     */
    stopScrolling(): void {
        if (this.scrollAnimationId) {
            clearInterval(this.scrollAnimationId);
            this.scrollAnimationId = null;
            console.log('🖥️ OLED Engine: Scrolling stopped');
        }
    }
}

// Export singleton instance getter
export const getOLEDEngine = () => OLEDEngine.getInstance();

export type { OLEDPinConfig, OLEDDisplayBuffer };

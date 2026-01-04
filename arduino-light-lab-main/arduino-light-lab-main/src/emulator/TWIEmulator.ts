/**
 * TWI (Two-Wire Interface / I2C) Peripheral Emulator
 * 
 * This emulates the ATmega328P's TWI hardware peripheral for I2C communication.
 * The Arduino Wire library uses these registers to communicate with I2C devices.
 * 
 * TWI Registers (ATmega328P):
 *   TWBR (0xB8): Bit Rate Register - controls I2C clock speed
 *   TWSR (0xB9): Status Register - indicates current bus state
 *   TWAR (0xBA): Address Register - slave address (we're master)
 *   TWDR (0xBB): Data Register - data to send/receive
 *   TWCR (0xBC): Control Register - controls TWI operations
 * 
 * I2C Master Transmit Sequence:
 *   1. Set TWSTA + TWEN in TWCR → START condition
 *   2. Hardware sets TWSR = 0x08 (START sent), sets TWINT
 *   3. Write slave address + W to TWDR, clear TWINT
 *   4. Hardware sets TWSR = 0x18 (ACK) or 0x20 (NACK), sets TWINT
 *   5. Write data byte to TWDR, clear TWINT
 *   6. Hardware sets TWSR = 0x28 (ACK) or 0x30 (NACK), sets TWINT
 *   7. Repeat step 5-6 for more data
 *   8. Set TWSTO in TWCR → STOP condition
 */

import { CPU } from 'avr8js';
import { getOLEDEngine } from '../simulation/OLEDEngine';

// ===========================================
// TWI Register Addresses (ATmega328P)
// ===========================================
const TWBR = 0xB8;  // TWI Bit Rate Register
const TWSR = 0xB9;  // TWI Status Register
const TWAR = 0xBA;  // TWI Address Register (slave)
const TWDR = 0xBB;  // TWI Data Register
const TWCR = 0xBC;  // TWI Control Register

// ===========================================
// TWCR Bit Masks
// ===========================================
const TWINT = 0x80;  // TWI Interrupt Flag (bit 7)
const TWEA = 0x40;  // TWI Enable Acknowledge (bit 6)
const TWSTA = 0x20;  // TWI Start Condition (bit 5)
const TWSTO = 0x10;  // TWI Stop Condition (bit 4)
const TWWC = 0x08;  // TWI Write Collision Flag (bit 3)
const TWEN = 0x04;  // TWI Enable (bit 2)
const TWIE = 0x01;  // TWI Interrupt Enable (bit 0)

// ===========================================
// TWI Status Codes (Master Transmitter Mode)
// ===========================================
const TW_START = 0x08;  // START condition transmitted
const TW_REP_START = 0x10;  // Repeated START transmitted
const TW_MT_SLA_ACK = 0x18;  // SLA+W transmitted, ACK received
const TW_MT_SLA_NACK = 0x20;  // SLA+W transmitted, NACK received
const TW_MT_DATA_ACK = 0x28;  // Data transmitted, ACK received
const TW_MT_DATA_NACK = 0x30;  // Data transmitted, NACK received
const TW_MT_ARB_LOST = 0x38;  // Arbitration lost

// ===========================================
// TWI State Machine States
// ===========================================
enum TWIState {
    IDLE,
    START_PENDING,
    ADDRESS_SENT,
    DATA_TRANSFER,
    STOP_PENDING,
}

// ===========================================
// I2C Transaction Buffer
// ===========================================
interface I2CTransaction {
    address: number;      // 7-bit I2C address
    isRead: boolean;      // true = read, false = write
    controlByte: number | null;  // Control byte (0x00 = command, 0x40 = data)
    dataBytes: number[];  // Data bytes collected
}

// ===========================================
// TWI Emulator Class
// ===========================================
export class TWIEmulator {
    private cpu: CPU;
    private state: TWIState = TWIState.IDLE;
    private currentTransaction: I2CTransaction | null = null;
    private byteCount: number = 0;

    // Mirror registers for tracking changes
    private lastTWCR: number = 0;
    private lastTWDR: number = 0;

    // Known I2C device addresses
    private readonly OLED_ADDRESS = 0x3C;  // SSD1306 default address

    // Debug logging
    private debugEnabled: boolean = true;

    constructor(cpu: CPU) {
        this.cpu = cpu;

        // Initialize TWI registers to default values
        cpu.data[TWBR] = 0x00;  // Bit rate = 0
        cpu.data[TWSR] = 0xF8;  // No prescaler, status = 0xF8 (no state)
        cpu.data[TWAR] = 0xFE;  // Slave address (unused in master mode)
        cpu.data[TWDR] = 0xFF;  // Data register
        cpu.data[TWCR] = 0x00;  // Control register (disabled)

        // Always log initialization (not conditional on debugEnabled)
        console.log('🔌 TWI (I2C) Emulator initialized for OLED support');
        console.log('   Monitoring TWI registers: TWBR=0xB8, TWSR=0xB9, TWDR=0xBB, TWCR=0xBC');
    }

    private log(message: string): void {
        if (this.debugEnabled) {
            console.log(message);
        }
    }

    // Tick counter for periodic debug logging
    private tickCount: number = 0;

    // Track if we're waiting for next data byte
    private waitingForData: boolean = false;

    /**
     * Called every CPU cycle to check for TWI register changes
     * This is the main tick function that should be called from AVR8jsWrapper
     */
    tick(): void {
        const twcr = this.cpu.data[TWCR];
        const twdr = this.cpu.data[TWDR];

        this.tickCount++;

        // Periodic debug: Log TWI register state every 1 million ticks
        if (this.tickCount % 1000000 === 0) {
            const twsr = this.cpu.data[TWSR];
            const twen = (twcr & TWEN) !== 0;
            console.log(`📡 TWI Status (tick ${this.tickCount}): TWCR=0x${twcr.toString(16)}, TWSR=0x${twsr.toString(16)}, TWEN=${twen}`);
        }

        // Check if TWI is enabled
        if (!(twcr & TWEN)) {
            return;
        }

        // ✅ FIX: Detect when software writes to TWCR with TWINT bit set
        // In AVR, writing 1 to TWINT CLEARS the interrupt flag and starts operation
        // So we detect when TWINT bit is written as 1 (which clears it)
        const twintWritten = (twcr & TWINT) && !(this.lastTWCR & TWINT);

        // Also detect TWSTA transition (0→1)
        const twstaRising = (twcr & TWSTA) && !(this.lastTWCR & TWSTA);

        // Detect TWDR change
        const twdrChanged = twdr !== this.lastTWDR;

        // Check for START condition request
        // START is requested when TWSTA is set and either TWINT is written or TWSTA just rose
        if ((twcr & TWSTA) && (twintWritten || twstaRising) && this.state === TWIState.IDLE) {
            this.handleStart();
        }
        // Check for STOP condition request
        else if ((twcr & TWSTO) && !(this.lastTWCR & TWSTO)) {
            this.handleStop();
        }
        // Check for data write - when TWDR changes and we're in a transaction
        else if (twdrChanged && this.currentTransaction && this.state !== TWIState.IDLE) {
            this.handleDataWrite(twdr);
        }
        // Check for TWINT written during data transfer (acknowledging previous byte, ready for next)
        else if (twintWritten && this.state === TWIState.DATA_TRANSFER) {
            // Ready for next byte, data is in TWDR
            this.handleDataWrite(twdr);
        }

        // Update last values
        this.lastTWCR = twcr;
        this.lastTWDR = twdr;
    }

    /**
     * Handle START condition
     */
    private handleStart(): void {
        this.log('📡 TWI: START condition');

        // Set status to START transmitted
        this.cpu.data[TWSR] = TW_START;

        // Set TWINT flag (operation complete)
        this.cpu.data[TWCR] |= TWINT;

        this.state = TWIState.START_PENDING;
        this.byteCount = 0;

        // Initialize new transaction
        this.currentTransaction = {
            address: 0,
            isRead: false,
            controlByte: null,
            dataBytes: [],
        };
    }

    /**
     * Handle STOP condition
     */
    private handleStop(): void {
        this.log('📡 TWI: STOP condition');

        // Clear TWSTO bit
        this.cpu.data[TWCR] &= ~TWSTO;

        // Process the completed transaction
        if (this.currentTransaction) {
            this.processTransaction(this.currentTransaction);
        }

        this.state = TWIState.IDLE;
        this.currentTransaction = null;
        this.byteCount = 0;
    }

    /**
     * Handle data write to TWDR
     */
    private handleDataWrite(data: number): void {
        if (!this.currentTransaction) {
            return;
        }

        this.byteCount++;

        if (this.state === TWIState.START_PENDING) {
            // First byte after START is the address + R/W bit
            const address = data >> 1;
            const isRead = (data & 0x01) === 1;

            this.currentTransaction.address = address;
            this.currentTransaction.isRead = isRead;

            this.log(`📡 TWI: Address 0x${address.toString(16)} ${isRead ? 'READ' : 'WRITE'}`);

            // Check if we have this device
            if (address === this.OLED_ADDRESS) {
                // ACK - device exists
                this.cpu.data[TWSR] = TW_MT_SLA_ACK;
                this.log(`  ✓ OLED (SSD1306) ACKed`);
            } else {
                // NACK - no device at this address
                this.cpu.data[TWSR] = TW_MT_SLA_NACK;
                this.log(`  ✗ No device at address 0x${address.toString(16)}`);
            }

            // Set TWINT flag
            this.cpu.data[TWCR] |= TWINT;

            this.state = TWIState.ADDRESS_SENT;
        }
        else if (this.state === TWIState.ADDRESS_SENT || this.state === TWIState.DATA_TRANSFER) {
            // Data bytes
            if (this.currentTransaction.controlByte === null) {
                // First data byte is the control byte
                this.currentTransaction.controlByte = data;
                this.log(`📡 TWI: Control byte 0x${data.toString(16)} (${data === 0x00 ? 'COMMAND' : data === 0x40 ? 'DATA' : 'MIXED'})`);
            } else {
                // Subsequent bytes are data
                this.currentTransaction.dataBytes.push(data);
                // Log occasional bytes to avoid spam
                if (this.currentTransaction.dataBytes.length <= 5 ||
                    this.currentTransaction.dataBytes.length % 100 === 0) {
                    this.log(`📡 TWI: Data byte 0x${data.toString(16)} (#${this.currentTransaction.dataBytes.length})`);
                }
            }

            // ACK the data (we're the only master, always ACK)
            this.cpu.data[TWSR] = TW_MT_DATA_ACK;

            // Set TWINT flag
            this.cpu.data[TWCR] |= TWINT;

            this.state = TWIState.DATA_TRANSFER;
        }
    }

    /**
     * Process a completed I2C transaction
     */
    private processTransaction(transaction: I2CTransaction): void {
        this.log(`📡 TWI: Transaction complete`);
        this.log(`   Address: 0x${transaction.address.toString(16)}`);
        this.log(`   Control: 0x${(transaction.controlByte ?? 0).toString(16)}`);
        this.log(`   Data bytes: ${transaction.dataBytes.length}`);

        // Route to appropriate device handler
        if (transaction.address === this.OLED_ADDRESS) {
            this.handleOLEDTransaction(transaction);
        }
    }

    /**
     * Handle transaction for OLED (SSD1306)
     */
    private handleOLEDTransaction(transaction: I2CTransaction): void {
        const oledEngine = getOLEDEngine();
        const controlByte = transaction.controlByte ?? 0x00;
        const isCommand = (controlByte & 0x40) === 0;

        // Get all registered OLED instances and send data to them
        // For now, we'll use a broadcast approach since we don't track which OLED is at which address

        // Simulate I2C byte sequence:
        // 1. START
        // 2. Address byte (already processed)
        // 3. Control byte
        // 4. Data bytes...
        // 5. STOP

        // Simulate the full I2C sequence for OLEDEngine
        // OLEDEngine expects individual pin changes, but we can also add a direct data path

        // For now, let's add a direct method to OLEDEngine to receive I2C data
        // This bypasses the pin-level simulation for efficiency

        this.log(`🖥️ OLED: Sending ${transaction.dataBytes.length} bytes (${isCommand ? 'commands' : 'data'})`);

        // Send data directly to OLED engine
        // We need to call a new method that handles complete I2C transactions
        this.sendToOLED(transaction.address, controlByte, transaction.dataBytes);
    }

    /**
     * Send I2C data directly to OLED engine
     */
    private sendToOLED(address: number, controlByte: number, dataBytes: number[]): void {
        // Get the OLED engine and call the new I2C receive method
        const oledEngine = getOLEDEngine();

        // Call the new method we'll add to OLEDEngine
        (oledEngine as any).receiveI2CData?.(address, controlByte, dataBytes);
    }

    /**
     * Reset the TWI emulator
     */
    reset(): void {
        this.state = TWIState.IDLE;
        this.currentTransaction = null;
        this.byteCount = 0;
        this.lastTWCR = 0;
        this.lastTWDR = 0;

        // Reset registers
        this.cpu.data[TWBR] = 0x00;
        this.cpu.data[TWSR] = 0xF8;
        this.cpu.data[TWAR] = 0xFE;
        this.cpu.data[TWDR] = 0xFF;
        this.cpu.data[TWCR] = 0x00;

        this.log('🔌 TWI Emulator reset');
    }

    /**
     * Enable/disable debug logging
     */
    setDebug(enabled: boolean): void {
        this.debugEnabled = enabled;
    }
}

// Export for use in AVR8jsWrapper
export function createTWIEmulator(cpu: CPU): TWIEmulator {
    return new TWIEmulator(cpu);
}

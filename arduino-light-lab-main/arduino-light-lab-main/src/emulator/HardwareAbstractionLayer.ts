/**
 * Hardware Abstraction Layer (HAL) for AVR Emulator
 * 
 * Bridges AVR register I/O to Arduino virtual hardware:
 * - Maps PORTB/PORTD/PORTC writes to digitalWrite()
 * - Maps PIN reads to digitalRead()
 * - Forwards pin changes to LCD, LED, and sensor engines
 * - Simulates ADC for analogRead()
 */

export interface PinChangeCallback {
    (pin: number, value: 0 | 1): void;
}

export class HardwareAbstractionLayer {
    private pinStates: Map<number, 0 | 1> = new Map();
    private pinModes: Map<number, 'INPUT' | 'OUTPUT'> = new Map();
    private analogValues: Map<number, number> = new Map(); // Analog pin voltages (A0-A5 = pins 14-19)
    private pinChangeCallbacks: PinChangeCallback[] = [];

    // AVR I/O Register Addresses (ATmega328P)
    private readonly IO_REGISTERS = {
        PORTB: 0x05,  // Digital pins 8-13
        PORTC: 0x08,  // Analog pins A0-A5
        PORTD: 0x0B,  // Digital pins 0-7
        PINB: 0x03,   // Read PORTB pins
        PINC: 0x06,   // Read PORTC pins
        PIND: 0x09,   // Read PORTD pins
        DDRB: 0x04,   // Data Direction Register B
        DDRC: 0x07,   // Data Direction Register C
        DDRD: 0x0A,   // Data Direction Register D
    };

    // Pin mapping: AVR register bit → Arduino pin number
    private readonly PIN_MAPPING = {
        PORTB: [8, 9, 10, 11, 12, 13],  // PORTB bits 0-5 → Pins 8-13
        PORTC: [14, 15, 16, 17, 18, 19], // PORTC bits 0-5 → Pins A0-A5 (14-19)
        PORTD: [0, 1, 2, 3, 4, 5, 6, 7]  // PORTD bits 0-7 → Pins 0-7
    };

    /**
     * Register a callback for pin state changes
     */
    onPinChange(callback: PinChangeCallback): void {
        this.pinChangeCallbacks.push(callback);
    }

    /**
     * Handle I/O port write (OUT instruction)
     * This is called when the AVR emulator executes: OUT PORTB, Rd
     */
    writePort(ioAddress: number, value: number): void {
        console.log(`🔌 HAL: OUT 0x${ioAddress.toString(16).toUpperCase()}, 0x${value.toString(16).toUpperCase()}`);

        switch (ioAddress) {
            case this.IO_REGISTERS.PORTB:
                this.updatePinGroup('PORTB', value);
                break;
            case this.IO_REGISTERS.PORTC:
                this.updatePinGroup('PORTC', value);
                break;
            case this.IO_REGISTERS.PORTD:
                this.updatePinGroup('PORTD', value);
                break;
            case this.IO_REGISTERS.DDRB:
            case this.IO_REGISTERS.DDRC:
            case this.IO_REGISTERS.DDRD:
                // Data Direction Register - set pin modes
                this.updatePinModes(ioAddress, value);
                break;
            default:
                console.log(`⚠️ HAL: Unhandled I/O write to 0x${ioAddress.toString(16)}`);
        }
    }

    /**
     * Handle I/O port read (IN instruction)
     * This is called when the AVR emulator executes: IN Rd, PINB
     */
    readPort(ioAddress: number): number {
        switch (ioAddress) {
            case this.IO_REGISTERS.PINB:
                return this.readPinGroup('PORTB');
            case this.IO_REGISTERS.PINC:
                return this.readPinGroup('PORTC');
            case this.IO_REGISTERS.PIND:
                return this.readPinGroup('PORTD');
            case this.IO_REGISTERS.PORTB:
            case this.IO_REGISTERS.PORTC:
            case this.IO_REGISTERS.PORTD:
                // Reading PORT register returns last written value
                return this.readPinGroup(this.getPortName(ioAddress));
            default:
                console.log(`⚠️ HAL: Unhandled I/O read from 0x${ioAddress.toString(16)}`);
                return 0;
        }
    }

    /**
     * Updates a group of pins (e.g., PORTB bits 0-7)
     */
    private updatePinGroup(portName: 'PORTB' | 'PORTC' | 'PORTD', value: number): void {
        const pins = this.PIN_MAPPING[portName];

        for (let bit = 0; bit < pins.length; bit++) {
            const arduinoPin = pins[bit];
            const bitValue = ((value >> bit) & 1) as 0 | 1;

            // Only trigger callbacks if value changed
            if (this.pinStates.get(arduinoPin) !== bitValue) {
                this.pinStates.set(arduinoPin, bitValue);
                console.log(`  📌 Pin ${arduinoPin} (${portName} bit ${bit}) → ${bitValue ? 'HIGH' : 'LOW'}`);

                // Notify all registered callbacks (SimulationCanvas, LCD Engine, etc.)
                this.pinChangeCallbacks.forEach(callback => callback(arduinoPin, bitValue));
            }
        }
    }

    /**
     * Reads current state of a pin group
     */
    private readPinGroup(portName: 'PORTB' | 'PORTC' | 'PORTD'): number {
        const pins = this.PIN_MAPPING[portName];
        let value = 0;

        for (let bit = 0; bit < pins.length; bit++) {
            const arduinoPin = pins[bit];
            const pinValue = this.pinStates.get(arduinoPin) || 0;
            value |= (pinValue << bit);
        }

        return value;
    }

    /**
     * Updates pin modes based on DDR register writes
     */
    private updatePinModes(ddrAddress: number, value: number): void {
        let portName: 'PORTB' | 'PORTC' | 'PORTD';

        if (ddrAddress === this.IO_REGISTERS.DDRB) portName = 'PORTB';
        else if (ddrAddress === this.IO_REGISTERS.DDRC) portName = 'PORTC';
        else if (ddrAddress === this.IO_REGISTERS.DDRD) portName = 'PORTD';
        else return;

        const pins = this.PIN_MAPPING[portName];

        for (let bit = 0; bit < pins.length; bit++) {
            const arduinoPin = pins[bit];
            const mode = ((value >> bit) & 1) ? 'OUTPUT' : 'INPUT';
            this.pinModes.set(arduinoPin, mode);
            console.log(`  📝 pinMode(${arduinoPin}, ${mode})`);
        }
    }

    /**
     * Helper: Get port name from port register address
     */
    private getPortName(address: number): 'PORTB' | 'PORTC' | 'PORTD' {
        if (address === this.IO_REGISTERS.PORTB || address === this.IO_REGISTERS.PINB) return 'PORTB';
        if (address === this.IO_REGISTERS.PORTC || address === this.IO_REGISTERS.PINC) return 'PORTC';
        return 'PORTD';
    }

    /**
     * Set external pin state (for sensors, buttons, etc.)
     * This is called by sensor engines to simulate input
     */
    setExternalPinState(pin: number, value: 0 | 1): void {
        this.pinStates.set(pin, value);
    }

    /**
     * Set analog pin value (for analog sensors)
     * @param pin - Arduino pin (14-19 for A0-A5)
     * @param voltage - Voltage value (0.0 to 5.0V)
     */
    setAnalogValue(pin: number, voltage: number): void {
        this.analogValues.set(pin, voltage);
    }

    /**
     * Get analog pin value
     * @param pin - Arduino pin (14-19 for A0-A5)
     * @returns Voltage value (0.0 to 5.0V)
     */
    getAnalogValue(pin: number): number {
        return this.analogValues.get(pin) || 0;
    }
    /**
     * Get current pin state
     */
    getPinState(pin: number): 0 | 1 {
        return this.pinStates.get(pin) || 0;
    }

    /**
     * Get current pin mode
     */
    getPinMode(pin: number): 'INPUT' | 'OUTPUT' | undefined {
        return this.pinModes.get(pin);
    }

    /**
     * Reset all pin states
     */
    reset(): void {
        this.pinStates.clear();
        this.pinModes.clear();
        console.log('🔄 HAL: Reset all pins');
    }
}

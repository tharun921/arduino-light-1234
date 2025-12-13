/**
 * Turbidity Sensor Engine
 * 
 * Simulates realistic turbidity sensor behavior:
 * 1. IR LED light emission through water
 * 2. Light scattering by suspended particles (Mie scattering)
 * 3. Photodiode light detection
 * 4. Voltage generation (0-5V) based on turbidity
 * 5. NTU (Nephelometric Turbidity Units) calculation
 * 
 * Physics Model:
 * - Clean water (0 NTU): High photodiode signal → ~4.5V
 * - Turbid water (1000 NTU): Low photodiode signal → ~0.5V
 * - Exponential attenuation: I = I₀ * e^(-k * turbidity)
 */

export interface TurbidityPinConfig {
    ledPlus: number;   // LED+ pin (power to IR LED)
    ledMinus: number;  // LED- pin (LED ground)
    phPlus: number;    // Photodiode+ (photodetector output)
    phMinus: number;   // Photodiode- (photodetector ground)
    analogOut: number; // AO pin on sensor module (to Arduino A0-A5)
}

export interface TurbidityProbeState {
    instanceId: string;
    pins: TurbidityPinConfig;
    turbidity: number;        // Water turbidity in NTU (0-1000)
    ledEnabled: boolean;      // IR LED on/off state
    voltage: number;          // Current analog output voltage (0-5V)
    waterChamberConnected: boolean;
    lastUpdateTime: number;
}

export class TurbidityEngine {
    private probes: Map<string, TurbidityProbeState> = new Map();
    private pinToProbe: Map<number, string> = new Map();
    private onVoltageUpdate?: (analogPin: number, voltage: number) => void;

    // Physics constants
    private readonly ATTENUATION_COEFFICIENT = 0.005; // Light scattering coefficient
    private readonly MAX_VOLTAGE = 4.5; // Clean water voltage
    private readonly MIN_VOLTAGE = 0.5; // Maximum turbidity voltage
    private readonly MAX_TURBIDITY = 1000; // Maximum NTU

    constructor(onVoltageUpdate?: (analogPin: number, voltage: number) => void) {
        this.onVoltageUpdate = onVoltageUpdate;
        console.log('💧 Turbidity Engine initialized');
    }

    /**
     * Register a turbidity probe with sensor module
     */
    registerProbe(instanceId: string, pins: TurbidityPinConfig): void {
        const probe: TurbidityProbeState = {
            instanceId,
            pins,
            turbidity: 50, // Default: slightly turbid water
            ledEnabled: false,
            voltage: 0,
            waterChamberConnected: false,
            lastUpdateTime: Date.now(),
        };

        this.probes.set(instanceId, probe);
        this.pinToProbe.set(pins.ledPlus, instanceId);
        this.pinToProbe.set(pins.ledMinus, instanceId);

        console.log(`✅ Turbidity probe registered: ${instanceId}`);
        console.log(`   LED+=${pins.ledPlus}, LED-=${pins.ledMinus}`);
        console.log(`   PH+=${pins.phPlus}, PH-=${pins.phMinus}, AO=${pins.analogOut}`);

        // Calculate initial voltage
        this.updateProbeVoltage(probe);
    }

    /**
     * Unregister a probe
     */
    unregisterProbe(instanceId: string): void {
        const probe = this.probes.get(instanceId);
        if (probe) {
            this.pinToProbe.delete(probe.pins.ledPlus);
            this.pinToProbe.delete(probe.pins.ledMinus);
            this.probes.delete(instanceId);
            console.log(`❌ Turbidity probe unregistered: ${instanceId}`);
        }
    }

    /**
     * Set water turbidity level for a probe
     */
    setTurbidity(instanceId: string, turbidity: number): void {
        const probe = this.probes.get(instanceId);
        if (probe) {
            probe.turbidity = Math.max(0, Math.min(this.MAX_TURBIDITY, turbidity));
            this.updateProbeVoltage(probe);
            console.log(`💧 [${instanceId}] Turbidity set to: ${probe.turbidity.toFixed(1)} NTU`);
        }
    }

    /**
     * Connect/disconnect water chamber
     */
    setWaterChamberConnection(instanceId: string, connected: boolean): void {
        const probe = this.probes.get(instanceId);
        if (probe) {
            probe.waterChamberConnected = connected;
            console.log(`💧 [${instanceId}] Water chamber ${connected ? 'connected' : 'disconnected'}`);
            this.updateProbeVoltage(probe);
        }
    }

    /**
     * Handle pin state changes from Arduino
     */
    onPinChange(pin: number, level: number, timestamp: number): void {
        const probeId = this.pinToProbe.get(pin);
        if (!probeId) return;

        const probe = this.probes.get(probeId);
        if (!probe) return;

        // LED power control
        if (pin === probe.pins.ledPlus) {
            const wasEnabled = probe.ledEnabled;
            probe.ledEnabled = level === 1;

            if (wasEnabled !== probe.ledEnabled) {
                console.log(`💡 [${probeId}] IR LED ${probe.ledEnabled ? 'ON' : 'OFF'}`);
                this.updateProbeVoltage(probe);
            }
        }
    }

    /**
     * Calculate light attenuation based on turbidity (Mie scattering)
     */
    private calculateLightAttenuation(turbidity: number): number {
        // Exponential decay: I = I₀ * e^(-k * turbidity)
        // Higher turbidity → more scattering → less light reaches photodiode
        return Math.exp(-this.ATTENUATION_COEFFICIENT * turbidity);
    }

    /**
     * Convert turbidity to analog voltage
     */
    private turbidityToVoltage(turbidity: number, ledEnabled: boolean): number {
        if (!ledEnabled) {
            return 0; // No LED = no light = no signal
        }

        const attenuation = this.calculateLightAttenuation(turbidity);

        // Linear mapping of attenuation to voltage range
        // Clean water (attenuation ≈ 1.0) → high voltage (4.5V)
        // Turbid water (attenuation ≈ 0.0) → low voltage (0.5V)
        const voltage = this.MIN_VOLTAGE + (attenuation * (this.MAX_VOLTAGE - this.MIN_VOLTAGE));

        return Math.max(0, Math.min(5, voltage));
    }

    /**
     * Convert voltage reading to NTU (for Arduino code)
     */
    public static voltageToNTU(voltage: number): number {
        const MIN_VOLTAGE = 0.5;
        const MAX_VOLTAGE = 4.5;
        const ATTENUATION_COEFFICIENT = 0.005;

        if (voltage <= MIN_VOLTAGE) return 1000; // Maximum turbidity
        if (voltage >= MAX_VOLTAGE) return 0;    // Clean water

        // Inverse of turbidityToVoltage formula
        const attenuation = (voltage - MIN_VOLTAGE) / (MAX_VOLTAGE - MIN_VOLTAGE);
        const turbidity = -Math.log(attenuation) / ATTENUATION_COEFFICIENT;

        return Math.max(0, Math.min(1000, turbidity));
    }

    /**
     * Update probe voltage and notify Arduino
     */
    private updateProbeVoltage(probe: TurbidityProbeState): void {
        // Only generate voltage if water chamber is connected
        if (!probe.waterChamberConnected) {
            probe.voltage = 0;
            return;
        }

        const newVoltage = this.turbidityToVoltage(probe.turbidity, probe.ledEnabled);

        if (Math.abs(newVoltage - probe.voltage) > 0.01) { // Significant change
            probe.voltage = newVoltage;
            probe.lastUpdateTime = Date.now();

            const ntu = TurbidityEngine.voltageToNTU(newVoltage);
            console.log(`📊 [${probe.instanceId}] ${probe.turbidity.toFixed(1)} NTU → ${newVoltage.toFixed(2)}V (reads as ${ntu.toFixed(1)} NTU)`);

            // Update Arduino analog pin
            if (this.onVoltageUpdate) {
                this.onVoltageUpdate(probe.pins.analogOut, newVoltage);
            }
        }
    }

    /**
     * Get probe state for debugging
     */
    getProbeState(instanceId: string): TurbidityProbeState | undefined {
        return this.probes.get(instanceId);
    }

    /**
     * Get all registered probes
     */
    getAllProbes(): TurbidityProbeState[] {
        return Array.from(this.probes.values());
    }

    /**
     * Get voltage-to-NTU conversion formula (for documentation)
     */
    public static getConversionFormula(): string {
        return `
NTU Conversion Formula:
-----------------------
Voltage to NTU:
  attenuation = (voltage - 0.5) / 4.0
  NTU = -ln(attenuation) / 0.005
  
NTU to Voltage:
  attenuation = e^(-0.005 × NTU)
  voltage = 0.5 + (attenuation × 4.0)

Valid ranges:
  - Voltage: 0.5V to 4.5V
  - NTU: 0 to 1000
  - 0 NTU (clean) → 4.5V
  - 1000 NTU (max) → 0.5V
        `.trim();
    }
}

// Singleton instance
let turbidityEngine: TurbidityEngine | null = null;

export function getTurbidityEngine(
    onVoltageUpdate?: (analogPin: number, voltage: number) => void
): TurbidityEngine {
    if (!turbidityEngine) {
        turbidityEngine = new TurbidityEngine(onVoltageUpdate);
    }
    return turbidityEngine;
}

export function resetTurbidityEngine(): void {
    turbidityEngine = null;
}

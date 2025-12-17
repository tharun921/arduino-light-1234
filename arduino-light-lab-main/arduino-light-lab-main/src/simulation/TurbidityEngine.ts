/**
 * Turbidity Sensor Engine
 * 
 * Simulates realistic turbidity sensor behavior:
 * 1. IR LED light emission through optical medium (air/water)
 * 2. Light scattering by suspended particles (Mie scattering)
 * 3. Photodiode light detection
 * 4. Voltage generation (0-5V) based on medium and turbidity
 * 5. NTU (Nephelometric Turbidity Units) calculation
 * 
 * Physics Model:
 * - AIR: Invalid reading (~0.2V, probe not in water)
 * - WATER Clean (0 NTU): High photodiode signal → ~4.5V
 * - WATER Turbid (1000 NTU): Low photodiode signal → ~0.5V
 * - Exponential attenuation: I = I₀ * e^(-k * turbidity)
 */

/**
 * Optical medium that the probe is immersed in
 */
export enum MediumType {
    AIR = 'air',    // Probe in air → invalid reading
    WATER = 'water' // Probe in water → valid NTU measurement
}

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
    medium: MediumType;       // Optical medium: air or water
    lastUpdateTime: number;
    settleUntil: number;      // Timestamp when sensor finishes settling
}

export class TurbidityEngine {
    private probes: Map<string, TurbidityProbeState> = new Map();
    private pinToProbe: Map<number, string> = new Map();
    private onVoltageUpdate?: (analogPin: number, voltage: number) => void;

    // Physics constants
    private readonly ATTENUATION_COEFFICIENT = 0.005; // Light scattering coefficient
    private readonly MAX_VOLTAGE = 4.5; // Clean water voltage
    private readonly MIN_VOLTAGE = 0.5; // Maximum turbidity voltage
    private readonly INVALID_VOLTAGE = 0.2; // Air/invalid reading voltage
    private readonly MAX_TURBIDITY = 1000; // Maximum NTU

    constructor(onVoltageUpdate?: (analogPin: number, voltage: number) => void) {
        this.onVoltageUpdate = onVoltageUpdate;
        console.log('💧 Turbidity Engine initialized');
        // 🔁 Periodic voltage refresh (ADC-like behavior)
        setInterval(() => {
            this.probes.forEach(probe => {
                this.updateProbeVoltage(probe);
            });
        }, 50); // refresh every 50ms
    }

    /**
     * Register a turbidity probe with sensor module
     */
    registerProbe(instanceId: string, pins: TurbidityPinConfig): void {
        const probe: TurbidityProbeState = {
            instanceId,
            pins,
            turbidity: 50, // Default: slightly turbid water
            ledEnabled: true, // LED ON by default (VCC connected to power)
            voltage: 0,
            medium: MediumType.WATER, // Default: probe in water (CHANGED from AIR)
            lastUpdateTime: Date.now(),
            settleUntil: 0, // No settling delay initially
        };

        this.probes.set(instanceId, probe);
        this.pinToProbe.set(pins.ledPlus, instanceId); // Only track LED+

        console.log(`💧 Registered turbidity probe: ${instanceId}`);
        console.log(`   LED+: ${pins.ledPlus}`);
        console.log(`   Analog Out: ${pins.analogOut}`);

        // Provide initial voltage immediately
        probe.voltage = this.turbidityToVoltage(
            probe.turbidity,
            probe.ledEnabled,
            probe.medium
        );

        if (this.onVoltageUpdate) {
            this.onVoltageUpdate(probe.pins.analogOut, probe.voltage);
        }
    }

    /**
     * Unregister a probe
     */
    unregisterProbe(instanceId: string): void {
        const probe = this.probes.get(instanceId);
        if (probe) {
            this.pinToProbe.delete(probe.pins.ledPlus);
            this.probes.delete(instanceId);
            console.log(`❌ Turbidity probe unregistered: ${instanceId}`);
        }
    }

    /**
     * Set water turbidity level for a probe
     */
    setTurbidity(instanceId: string, turbidity: number): void {
        const probe = this.probes.get(instanceId);
        if (!probe) return;

        probe.turbidity = Math.max(0, Math.min(this.MAX_TURBIDITY, turbidity));
        this.updateProbeVoltage(probe);
        probe.settleUntil = Date.now() + 200; // 200ms settling delay (set AFTER update)

        console.log(`💧 Updated turbidity: ${probe.turbidity} NTU → ${probe.voltage.toFixed(2)}V`);
    }

    /**
     * Set the optical medium (air or water)
     */
    setMedium(instanceId: string, medium: MediumType): void {
        const probe = this.probes.get(instanceId);
        if (!probe) return;

        probe.medium = medium;
        this.updateProbeVoltage(probe);
        probe.settleUntil = Date.now() + 200; // 200ms settling delay (set AFTER update)

        console.log(`💧 Medium changed to: ${medium}`);
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
     * Calculate light attenuation based on turbidity and medium (Mie scattering)
     */
    private calculateLightAttenuation(turbidity: number, medium: MediumType): number {
        if (medium === MediumType.AIR) {
            return 1.0; // Almost full light in air, but reading is meaningless
        }

        // WATER: Exponential decay based on turbidity
        // I = I₀ * e^(-k * turbidity)
        // Higher turbidity → more scattering → less light reaches photodiode
        return Math.exp(-this.ATTENUATION_COEFFICIENT * turbidity);
    }

    /**
     * Convert turbidity to analog voltage based on medium
     */
    private turbidityToVoltage(turbidity: number, ledEnabled: boolean, medium: MediumType): number {
        if (!ledEnabled) {
            return 0; // No LED = no light = no signal
        }

        // PROBE IN AIR → Invalid reading
        if (medium === MediumType.AIR) {
            return this.INVALID_VOLTAGE; // ~0.2V, probe not in water
        }

        // PROBE IN WATER → Valid NTU measurement
        const attenuation = this.calculateLightAttenuation(turbidity, medium);

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
        // Block updates during settling period (realistic sensor behavior)
        if (Date.now() < probe.settleUntil) return;

        const newVoltage = this.turbidityToVoltage(
            probe.turbidity,
            probe.ledEnabled,
            probe.medium
        );

        if (Math.abs(newVoltage - probe.voltage) > 0.01) { // Significant change
            probe.voltage = newVoltage;
            probe.lastUpdateTime = Date.now();

            if (probe.medium === MediumType.AIR) {
                console.log(`🌬️ [${probe.instanceId}] AIR → ${newVoltage.toFixed(2)}V (INVALID reading)`);
            } else {
                const ntu = TurbidityEngine.voltageToNTU(newVoltage);
                console.log(`📊 [${probe.instanceId}] ${probe.turbidity.toFixed(1)} NTU → ${newVoltage.toFixed(2)}V (reads as ${ntu.toFixed(1)} NTU)`);
            }

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

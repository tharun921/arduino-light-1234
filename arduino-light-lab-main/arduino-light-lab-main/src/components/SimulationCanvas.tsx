import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Plus, Play, Square, Code, Trash2, RotateCw, Download, MoreVertical, X, Library } from "lucide-react";
import { ComponentLibrary } from "./ComponentLibrary";
import { LibraryManager } from "./LibraryManager";
import { CodeEditor } from "./CodeEditor";
import { DebugConsole, DebugLog } from "./DebugConsole";
import { getUltrasonicEngine } from "../simulation/UltrasonicEngine";
import { getLCDEngine } from "../simulation/LCDEngine";
import { getTurbidityEngine } from "../simulation/TurbidityEngine";
import { simulateLCDFromCode } from "../simulation/LCDHardwareSimulator";
import { UniversalComponent } from "./components/UniversalComponent";
import { PlacedComponent } from "@/types/components";
import { COMPONENT_DATA } from "@/config/componentsData";
import { saveProject, getAllProjects, loadProject, deleteProject, type Project } from "@/utils/projectStorage";
import { AVREmulator, type HexSegment } from "../emulator/AVREmulator";
import { HardwareAbstractionLayer } from "../emulator/HardwareAbstractionLayer";
import { AVR8jsWrapper } from "../emulator/AVR8jsWrapper";


interface Wire {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startPinId: string;
  endPinId: string;
  waypoints?: { x: number; y: number }[]; // Optional waypoints for manual routing
  color?: string; // Wire color for visual distinction
}

// Pin Connection Registry - tracks which components are connected to which Arduino pins
interface PinConnection {
  componentId: string;
  componentName: string;
  arduinoPin: string;
  wireId: string;
}

export const SimulationCanvas = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [placedComponents, setPlacedComponents] = useState<PlacedComponent[]>(
    [],
  );
  const [wires, setWires] = useState<Wire[]>([]);
  const [drawingWire, setDrawingWire] = useState<{
    startX: number;
    startY: number;
    startPinId: string;
    componentInstanceId: string;
    waypoints: { x: number; y: number }[]; // Track waypoints while drawing
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggingComponent, setDraggingComponent] = useState<string | null>(
    null,
  );
  const [currentCode, setCurrentCode] = useState<string>("");
  const [compiledCode, setCompiledCode] = useState<{
    pinStates?: Record<string, number>;
    pinModes?: Record<string, string>;
    analogValues?: Record<string, number>;
    servoPositions?: Record<string, number>;
    delays?: number[];
    delayMs?: number;
    code?: string;
    timestamp?: number;
    hasLCD?: boolean;
    lcdText?: { line1: string; line2: string }; // LCD display text
    serialOutput?: string[];
    sensorValues?: Record<string, number>;
    functionTypes?: Record<string, number>;
    hasBlinking?: boolean;
    pinVariableMap?: Record<string, string>;
  }>({});
  const [blinkInterval, setBlinkInterval] = useState<number | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // Force component re-render
  const [isCodeUploaded, setIsCodeUploaded] = useState(false); // Track if code is compiled and uploaded

  // Debug Console state
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(200);

  // Pin connection tracking
  const [currentBlinkState, setCurrentBlinkState] = useState<
    Record<string, boolean>
  >({});
  const [isDragOver, setIsDragOver] = useState(false); // Track if dragging over canvas
  const [pinConnections, setPinConnections] = useState<PinConnection[]>([]); // NEW: Track pin connections
  const [showProjectsMenu, setShowProjectsMenu] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Compiler Mode state
  const [useCompilerMode, setUseCompilerMode] = useState(true); // Toggle between regex and compiler
  const [useAVR8js, setUseAVR8js] = useState(true); // Use AVR8.js (true) or custom emulator (false)
  const [avrEmulator, setAvrEmulator] = useState<AVREmulator | null>(null);
  const [avr8jsEmulator, setAvr8jsEmulator] = useState<AVR8jsWrapper | null>(null);
  const [emulatorRunning, setEmulatorRunning] = useState(false);
  const emulatorIntervalRef = useRef<number | null>(null);

  // Water Chamber Turbidity Editor state
  const [editingWaterChamber, setEditingWaterChamber] = useState<string | null>(null); // instanceId of water chamber being edited
  const [waterChamberTurbidity, setWaterChamberTurbidity] = useState<number>(50); // Current turbidity value (0-1000 NTU)


  // ═══════════════════════════════════════════════════════════════════
  // 💾 AUTO-SAVE & AUTO-LOAD CIRCUIT (Browser Storage)
  // ═══════════════════════════════════════════════════════════════════

  // Auto-load circuit from localStorage on startup
  useEffect(() => {
    try {
      const savedCircuit = localStorage.getItem('arduino-circuit');
      if (savedCircuit) {
        const circuit = JSON.parse(savedCircuit);
        if (circuit.components) setPlacedComponents(circuit.components);
        if (circuit.wires) setWires(circuit.wires);
        if (circuit.code) setCurrentCode(circuit.code);
        console.log('✅ Circuit loaded from browser storage');
        toast.success('Circuit restored from last session');
      }
    } catch (error) {
      console.error('Failed to load saved circuit:', error);
    }
  }, []); // Run only once on mount

  // Auto-save circuit to localStorage whenever it changes
  useEffect(() => {
    // Skip saving if nothing is placed yet
    if (placedComponents.length === 0 && wires.length === 0) return;

    try {
      const circuit = {
        components: placedComponents,
        wires: wires,
        code: currentCode,
        timestamp: Date.now()
      };
      localStorage.setItem('arduino-circuit', JSON.stringify(circuit));
      console.log('💾 Circuit auto-saved to browser storage');
    } catch (error) {
      console.error('Failed to save circuit:', error);
    }
  }, [placedComponents, wires, currentCode]); // Save when any changes

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 AUTO-UPDATE PIN CONNECTIONS
  // ═══════════════════════════════════════════════════════════════════
  // Automatically update pin connection registry when wires or components change
  useEffect(() => {
    updatePinConnections();
  }, [wires, placedComponents]); // Re-run when wires or components change

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 UNIVERSAL ARDUINO PIN EXTRACTION HELPER
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Extracts Arduino pin number from a wire pin ID
   * Handles ALL Arduino UNO pin types
   * 
   * @param pinId - Full pin ID (e.g., "arduino-uno-123456-d7")
   * @returns Pin label/number (e.g., "7", "A3", "GND", "5V") or null
   * 
   * Examples:
   *   "arduino-uno-123-d7"   → "7"
   *   "arduino-uno-123-d0"   → "0"
   *   "arduino-uno-123-d13"  → "13"
   *   "arduino-uno-123-a3"   → "A3"
   *   "arduino-uno-123-gnd1" → "GND"
   *   "arduino-uno-123-5v"   → "5V"
   */
  const extractArduinoPinNumber = (pinId: string): string | null => {
    if (!pinId || !pinId.includes("arduino-uno")) return null;

    const parts = pinId.split("-");
    const pinLabel = parts[parts.length - 1]; // Last part is always the pin label

    console.log(`📍 Extracting pin from: ${pinId}`);
    console.log(`   Pin label: ${pinLabel}`);

    // Digital pins: d0-d13 → 0-13
    if (pinLabel.startsWith("d") && /\d/.test(pinLabel)) {
      const pinNum = pinLabel.substring(1);
      console.log(`   ✅ Digital pin: ${pinNum}`);
      return pinNum;
    }

    // Analog pins: a0-a5 → A0-A5
    if (pinLabel.startsWith("a") && /\d/.test(pinLabel)) {
      const pinNum = pinLabel.toUpperCase();
      console.log(`   ✅ Analog pin: ${pinNum}`);
      return pinNum;
    }

    // Ground pins: gnd, gnd1, gnd2, gnd3 → GND
    if (pinLabel.includes("gnd")) {
      console.log(`   ✅ Ground pin: GND`);
      return "GND";
    }

    // Power pins
    if (pinLabel === "5v") {
      console.log(`   ✅ Power pin: 5V`);
      return "5V";
    }
    if (pinLabel === "3v3") {
      console.log(`   ✅ Power pin: 3.3V`);
      return "3.3V";
    }
    if (pinLabel === "vin") {
      console.log(`   ✅ Power pin: VIN`);
      return "VIN";
    }

    // Communication pins
    if (pinLabel === "sda") {
      console.log(`   ✅ Communication pin: SDA`);
      return "SDA";
    }
    if (pinLabel === "scl") {
      console.log(`   ✅ Communication pin: SCL`);
      return "SCL";
    }
    if (pinLabel === "aref") {
      console.log(`   ✅ Reference pin: AREF`);
      return "AREF";
    }
    if (pinLabel === "reset") {
      console.log(`   ✅ Reset pin: RESET`);
      return "RESET";
    }
    if (pinLabel === "ioref") {
      console.log(`   ✅ Reference pin: IOREF`);
      return "IOREF";
    }

    console.log(`   ⚠️ Unknown pin type: ${pinLabel}`);
    return null;
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🔍 PIN CONNECTION REGISTRY SYSTEM
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Updates the pin connection registry by analyzing all wires
   * Detects which components are connected to which Arduino pins
   * Stores this information for backend integration and validation
   */
  const updatePinConnections = () => {
    console.log("🔍 Updating Pin Connection Registry...");

    const connections: PinConnection[] = [];

    // Find Arduino component
    const arduino = placedComponents.find((c) => c.id.includes("arduino"));
    if (!arduino) {
      console.log("❌ No Arduino found - cannot detect pin connections");
      setPinConnections([]);
      return;
    }

    // Get all non-Arduino components
    const components = placedComponents.filter(c => !c.id.includes("arduino"));

    // For each component, find ALL Arduino pins it connects to (direct or indirect)
    components.forEach((component) => {
      // Find all wires connected to this component
      const componentWires = wires.filter(wire =>
        wire.startPinId.startsWith(component.instanceId) ||
        wire.endPinId.startsWith(component.instanceId)
      );

      if (componentWires.length === 0) return;

      // Trace through all wires to find Arduino connections
      const arduinoPins: string[] = [];
      const visited = new Set<string>();
      const queue = [component.instanceId];

      while (queue.length > 0) {
        const currentCompId = queue.shift()!;
        if (visited.has(currentCompId)) continue;
        visited.add(currentCompId);

        // Find all wires connected to current component
        const connectedWires = wires.filter(wire =>
          wire.startPinId.startsWith(currentCompId) ||
          wire.endPinId.startsWith(currentCompId)
        );

        for (const wire of connectedWires) {
          // Check if this wire connects to Arduino
          const arduinoPinId = wire.startPinId.includes("arduino-uno")
            ? wire.startPinId
            : wire.endPinId.includes("arduino-uno")
              ? wire.endPinId
              : null;

          if (arduinoPinId) {
            const pin = extractArduinoPinNumber(arduinoPinId);
            if (pin && !arduinoPins.includes(pin)) {
              arduinoPins.push(pin);
            }
          } else {
            // Wire connects to another component - add to queue
            const otherCompId = wire.startPinId.startsWith(currentCompId)
              ? wire.endPinId.split("-")[0]
              : wire.startPinId.split("-")[0];

            if (!visited.has(otherCompId)) {
              queue.push(otherCompId);
            }
          }
        }
      }

      if (arduinoPins.length === 0) return;

      // Register ALL pins for multi-pin components (like HC-SR04)
      // This allows backend to know TRIG, ECHO, VCC, and GND pins
      arduinoPins.forEach(pin => {
        const connection: PinConnection = {
          componentId: component.instanceId,
          componentName: component.name,
          arduinoPin: pin,
          wireId: componentWires.find(w =>
            w.startPinId.includes(pin) || w.endPinId.includes(pin)
          )?.id || componentWires[0].id,
        };

        connections.push(connection);
      });

      console.log(`📌 ${component.name}: ${arduinoPins.length} connections (${arduinoPins.join(", ")})`);
    });

    setPinConnections(connections);

    // Log summary for backend integration
    console.log("═══════════════════════════════════════════════");
    console.log("📊 PIN CONNECTION REGISTRY UPDATED");
    console.log("═══════════════════════════════════════════════");
    console.log(`Total connections: ${connections.length}`);
    connections.forEach((conn, index) => {
      console.log(`  ${index + 1}. ${conn.componentName} → Arduino Pin ${conn.arduinoPin}`);
    });
    console.log("═══════════════════════════════════════════════");

    // This data can be sent to backend API for database storage
    // Example: await fetch('/api/pin-connections', { method: 'POST', body: JSON.stringify(connections) });

    return connections;
  };

  // ═══════════════════════════════════════════════════════════════════
  // 📺 LCD ENGINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Registers LCD components with the LCD engine
   * Maps LCD pins (RS, E, D4-D7) to Arduino pin numbers via wire connections
   */
  const registerLCDComponents = () => {
    console.log("📺 Registering LCD components with engine...");

    const lcdEngine = getLCDEngine();
    const lcdComponents = placedComponents.filter(c => c.id.includes("lcd"));

    if (lcdComponents.length === 0) {
      console.log("  No LCD components found");
      return;
    }

    lcdComponents.forEach(lcdComponent => {
      console.log(`📺 Processing ${lcdComponent.name} (${lcdComponent.instanceId})`);

      // Find all wires connected to this LCD
      const lcdWires = wires.filter(wire =>
        wire.startPinId.startsWith(lcdComponent.instanceId) ||
        wire.endPinId.startsWith(lcdComponent.instanceId)
      );

      if (lcdWires.length === 0) {
        console.log("  No wires connected to LCD");
        return;
      }

      // Map LCD pins to Arduino pins
      const pinMapping: Record<string, number> = {};
      let hasGnd = false;
      let hasVcc = false;

      lcdWires.forEach(wire => {
        // Determine which end is the LCD
        const lcdPinId = wire.startPinId.startsWith(lcdComponent.instanceId)
          ? wire.startPinId
          : wire.endPinId;

        const arduinoPinId = wire.startPinId.includes("arduino-uno")
          ? wire.startPinId
          : wire.endPinId.includes("arduino-uno")
            ? wire.endPinId
            : null;

        // Extract LCD pin name (e.g., "rs", "e", "d4", "vss", "vdd")
        const lcdPinName = lcdPinId.split("-").pop();

        // Check for power pins
        if (lcdPinName === 'vss') {
          hasGnd = true;
          console.log(`  ✓ Found GND connection (VSS)`);
        }
        if (lcdPinName === 'vdd') {
          hasVcc = true;
          console.log(`  ✓ Found VCC connection (VDD)`);
        }

        if (!arduinoPinId) return;

        // Extract Arduino pin number
        const arduinoPinStr = extractArduinoPinNumber(arduinoPinId);

        if (!lcdPinName || !arduinoPinStr) return;

        // Convert Arduino pin string to number (e.g., "7" → 7, "12" → 12)
        const arduinoPinNum = parseInt(arduinoPinStr, 10);

        if (isNaN(arduinoPinNum)) return;

        pinMapping[lcdPinName] = arduinoPinNum;
        console.log(`  Mapped LCD ${lcdPinName.toUpperCase()} → Arduino Pin ${arduinoPinNum}`);
      });

      // ⚡ POWER VALIDATION: Check if LCD has power connections
      if (!hasGnd || !hasVcc) {
        const missing = [];
        if (!hasGnd) missing.push('GND (VSS)');
        if (!hasVcc) missing.push('5V (VDD)');

        console.error(`\n${'='.repeat(50)}`);
        console.error(`❌ LCD POWER ERROR: ${lcdComponent.name}`);
        console.error(`   Missing: ${missing.join(' and ')}`);
        console.error(`   Real LCDs cannot work without power!`);
        console.error(`   Please connect both GND and VCC pins.`);
        console.error('='.repeat(50) + '\n');

        toast.error(`LCD Error: Connect ${missing.join(' and ')} to power the display`, { duration: 5000 });
        addDebugLog('error', `LCD missing power: ${missing.join(', ')}`);
        return; // Don't register LCD without power
      }

      // Check if we have all required pins (RS, E, D4, D5, D6, D7)
      const requiredPins = ["rs", "e", "d4", "d5", "d6", "d7"];
      const missingPins = requiredPins.filter(pin => !pinMapping[pin]);

      if (missingPins.length > 0) {
        console.warn(`  ⚠️ LCD missing pins: ${missingPins.join(", ")}`);
        console.warn(`  ⚠️ LCD will not be registered until all pins are connected`);
        return;
      }

      // Register with LCD engine
      const lcdPinConfig = {
        rs: pinMapping.rs,
        en: pinMapping.e,  // Engine expects "en" not "e"
        d4: pinMapping.d4,
        d5: pinMapping.d5,
        d6: pinMapping.d6,
        d7: pinMapping.d7,
      };

      lcdEngine.registerLCD(lcdComponent.instanceId, lcdPinConfig);
      console.log(`✅ LCD registered with engine:`, lcdPinConfig);
    });
  };

  // ═══════════════════════════════════════════════════════════════════
  // 📡 ULTRASONIC SENSOR ENGINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Registers Ultrasonic sensors (HC-SR04) with the Ultrasonic engine
   * Maps TRIG and ECHO pins to Arduino pin numbers via wire connections
   */
  const registerUltrasonicComponents = () => {
    console.log("📡 Registering Ultrasonic sensors with engine...");

    const ultrasonicEngine = getUltrasonicEngine();
    const ultrasonicComponents = placedComponents.filter(c => c.id.includes("hc-sr04"));

    if (ultrasonicComponents.length === 0) {
      console.log("  No Ultrasonic sensors found");
      return;
    }

    ultrasonicComponents.forEach(sensor => {
      console.log(`📡 Processing ${sensor.name} (${sensor.instanceId})`);

      // Find all wires connected to this sensor
      const sensorWires = wires.filter(wire =>
        wire.startPinId.startsWith(sensor.instanceId) ||
        wire.endPinId.startsWith(sensor.instanceId)
      );

      if (sensorWires.length === 0) {
        console.log("  No wires connected to sensor");
        return;
      }

      // Map sensor pins to Arduino pins
      const pinMapping: Record<string, number> = {};
      let hasGnd = false;
      let hasVcc = false;

      sensorWires.forEach(wire => {
        // Determine which end is the sensor
        const sensorPinId = wire.startPinId.startsWith(sensor.instanceId)
          ? wire.startPinId
          : wire.endPinId;

        const arduinoPinId = wire.startPinId.includes("arduino-uno")
          ? wire.startPinId
          : wire.endPinId.includes("arduino-uno")
            ? wire.endPinId
            : null;

        // Extract sensor pin name (e.g., "trig", "echo", "gnd", "vcc")
        const sensorPinName = sensorPinId.split("-").pop();

        // Check for power pins
        if (sensorPinName === 'gnd') {
          hasGnd = true;
          console.log(`  ✓ Found GND connection`);
        }
        if (sensorPinName === 'vcc') {
          hasVcc = true;
          console.log(`  ✓ Found VCC connection`);
        }

        if (!arduinoPinId) return;

        // Extract Arduino pin number
        const arduinoPinStr = extractArduinoPinNumber(arduinoPinId);

        if (!sensorPinName || !arduinoPinStr) return;

        // Convert Arduino pin string to number
        const arduinoPinNum = parseInt(arduinoPinStr, 10);

        if (isNaN(arduinoPinNum)) return;

        pinMapping[sensorPinName] = arduinoPinNum;
        console.log(`  Mapped Sensor ${sensorPinName.toUpperCase()} → Arduino Pin ${arduinoPinNum}`);
      });

      // ⚡ POWER VALIDATION
      if (!hasGnd || !hasVcc) {
        const missing = [];
        if (!hasGnd) missing.push('GND');
        if (!hasVcc) missing.push('VCC');

        console.error(`\n${'='.repeat(50)}`);
        console.error(`❌ ULTRASONIC POWER ERROR: ${sensor.name}`);
        console.error(`   Missing: ${missing.join(' and ')}`);
        console.error(`   Real sensors cannot work without power!`);
        console.error(`   Please connect both GND and VCC pins.`);
        console.error('='.repeat(50) + '\n');

        toast.error(`Ultrasonic Error: Connect ${missing.join(' and ')} for power`, { duration: 5000 });
        addDebugLog('error', `Ultrasonic missing power: ${missing.join(', ')}`);
        return;
      }

      // Check if we have required pins (TRIG, ECHO)
      if (!pinMapping.trig || !pinMapping.echo) {
        const missing = [];
        if (!pinMapping.trig) missing.push('TRIG');
        if (!pinMapping.echo) missing.push('ECHO');
        console.warn(`  ⚠️ Sensor missing pins: ${missing.join(", ")}`);
        console.warn(`  ⚠️ Sensor will not be registered`);
        return;
      }

      // Register with Ultrasonic engine
      ultrasonicEngine.registerSensor(
        sensor.instanceId,
        pinMapping.trig,
        pinMapping.echo
      );
      console.log(`✅ Ultrasonic sensor registered: TRIG=${pinMapping.trig}, ECHO=${pinMapping.echo}`);
    });
  };


  // ═══════════════════════════════════════════════════════════════════
  // 💧 TURBIDITY ENGINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
  const registerTurbidityProbes = () => {
    console.log("💧 Registering turbidity probes...");

    const turbidityEngine = getTurbidityEngine((analogPin, voltage) => {
      console.log(`📊 Turbidity analog A${analogPin - 14} = ${voltage.toFixed(2)}V`);
    });

    const probes = placedComponents.filter(c => c.id.includes("turbidity-probe"));
    const sensors = placedComponents.filter(c => c.id.includes("turbidity-sensor"));

    if (probes.length === 0) {
      console.log("  No turbidity probes found");
      return;
    }

    probes.forEach(probe => {
      const sensor = sensors.find(s => wires.some(w =>
        (w.startPinId.startsWith(probe.instanceId) || w.endPinId.startsWith(probe.instanceId)) &&
        (w.startPinId.startsWith(s.instanceId) || w.endPinId.startsWith(s.instanceId))
      ));

      if (!sensor) return;

      const sensorWires = wires.filter(w =>
        w.startPinId.startsWith(sensor.instanceId) || w.endPinId.startsWith(sensor.instanceId)
      );

      const pinMap: Record<string, number> = {};
      sensorWires.forEach(w => {
        const sPin = w.startPinId.startsWith(sensor.instanceId) ? w.startPinId : w.endPinId;
        const aPin = w.startPinId.includes("arduino-uno") ? w.startPinId :
          (w.endPinId.includes("arduino-uno") ? w.endPinId : null);
        if (!aPin) return;

        const sName = sPin.split("-").pop();
        const aStr = extractArduinoPinNumber(aPin);
        if (!sName || !aStr) return;

        let aNum = aStr.startsWith('A') ? 14 + parseInt(aStr.substring(1)) : parseInt(aStr);
        if (!isNaN(aNum)) pinMap[sName] = aNum;
      });

      if (!pinMap.aout) return;

      turbidityEngine.registerProbe(probe.instanceId, {
        ledPlus: pinMap.vcc || 5,
        ledMinus: pinMap.gnd || 0,
        phPlus: pinMap.dout || 2,
        phMinus: pinMap.gnd || 0,
        analogOut: pinMap.aout
      });

      const chambers = placedComponents.filter(c => c.id.includes("water-chamber"));
      const chamber = chambers.find(ch => wires.some(w =>
        (w.startPinId.startsWith(probe.instanceId) || w.endPinId.startsWith(probe.instanceId)) &&
        (w.startPinId.startsWith(ch.instanceId) || w.endPinId.startsWith(ch.instanceId))
      ));

      if (chamber) {
        turbidityEngine.setWaterChamberConnection(probe.instanceId, true);
        turbidityEngine.setTurbidity(probe.instanceId, 50);
        console.log(`  ✓ Probe connected to chamber - 50 NTU`);
      }

      console.log(`✅ Turbidity probe registered:`, pinMap);
    });
  };

  // Handle adding a component from the library
  const handleAddComponent = (componentId: string) => {
    const componentConfig = COMPONENT_DATA.find((c) => c.id === componentId);
    if (!componentConfig) return;

    // Place component in center of visible canvas
    const canvasElement = canvasRef.current;
    const centerX = canvasElement
      ? canvasElement.scrollLeft +
      canvasElement.clientWidth / 2 -
      componentConfig.width / 2
      : 100;
    const centerY = canvasElement
      ? canvasElement.scrollTop +
      canvasElement.clientHeight / 2 -
      componentConfig.height / 2
      : 100;

    const newComponent: PlacedComponent = {
      ...componentConfig,
      instanceId: `${componentId}-${Date.now()}`,
      x: centerX,
      y: centerY,
      rotation: 0,
      props: componentConfig.defaultProps || {},
    };

    setPlacedComponents([...placedComponents, newComponent]);
    toast.success(`${componentConfig.name} added to canvas!`);
  };

  // Handle component drag start
  const handleComponentDragStart = (e: React.DragEvent, instanceId: string) => {
    e.stopPropagation();
    setDraggingComponent(instanceId);
    e.dataTransfer.effectAllowed = "move";

    // Store the initial mouse position relative to the component
    const component = placedComponents.find(
      (comp) => comp.instanceId === instanceId,
    );
    if (component && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - component.x;
      const offsetY = e.clientY - rect.top - component.y;
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ offsetX, offsetY, instanceId }),
      );
    }
  };

  // Handle component drag end
  const handleComponentDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();

    if (!draggingComponent || !canvasRef.current) {
      setDraggingComponent(null);
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    let offsetData = { offsetX: 0, offsetY: 0, instanceId: "" };

    try {
      const dataTransfer = e.dataTransfer.getData("text/plain");
      if (dataTransfer) {
        offsetData = JSON.parse(dataTransfer);
      }
    } catch (err) {
      console.error("Error parsing drag offset data:", err);
    }

    // Get old position before update
    const oldComponent = placedComponents.find(
      (comp) => comp.instanceId === draggingComponent
    );
    const oldX = oldComponent?.x || 0;
    const oldY = oldComponent?.y || 0;

    const newX = Math.max(0, e.clientX - rect.left - offsetData.offsetX);
    const newY = Math.max(0, e.clientY - rect.top - offsetData.offsetY);

    // Calculate movement delta
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;

    setPlacedComponents((components) =>
      components.map((comp) =>
        comp.instanceId === draggingComponent
          ? { ...comp, x: newX, y: newY }
          : comp,
      ),
    );

    // Update waypoints to move with the component (preserve wire shape)
    if (deltaX !== 0 || deltaY !== 0) {
      setWires((currentWires) =>
        currentWires.map((wire) => {
          const isConnected =
            wire.startPinId.startsWith(draggingComponent + '-') ||
            wire.endPinId.startsWith(draggingComponent + '-');

          if (isConnected && wire.waypoints && wire.waypoints.length > 0) {
            // Move waypoints by the same delta to preserve wire shape
            const updatedWaypoints = wire.waypoints.map(wp => ({
              x: wp.x + deltaX,
              y: wp.y + deltaY
            }));

            return { ...wire, waypoints: updatedWaypoints };
          }
          return wire;
        })
      );
    }

    setDraggingComponent(null);

    // Force update to ensure wires update with the component
    setForceUpdate((prev) => prev + 1);
  };

  // Handle drag over events on canvas
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  // Handle drag leave events on canvas
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Handle drop events on canvas
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const componentId = e.dataTransfer.getData("componentId");
    if (!componentId || !canvasRef.current) return;

    const componentConfig = COMPONENT_DATA.find((c) => c.id === componentId);
    if (!componentConfig) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dropX = e.clientX - rect.left - componentConfig.width / 2;
    const dropY = e.clientY - rect.top - componentConfig.height / 2;

    const newComponent: PlacedComponent = {
      ...componentConfig,
      instanceId: `${componentId}-${Date.now()}`,
      x: dropX,
      y: dropY,
      rotation: 0,
      props: componentConfig.defaultProps || {},
    };

    setPlacedComponents([...placedComponents, newComponent]);
    toast.success(`${componentConfig.name} placed on canvas!`);
  };

  // Handle mouse movement on canvas
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // Get absolute pin position on canvas
  const getAbsolutePinPosition = (
    component: PlacedComponent,
    pinId: string,
  ): { x: number; y: number } | null => {
    const pin = component.pins.find((p) => p.id === pinId);
    if (!pin) return null;

    return {
      x: component.x + pin.x,
      y: component.y + pin.y,
    };
  };

  // NEW: Get wire endpoints dynamically based on current component positions
  const getWireEndpoints = (wire: Wire): { startX: number; startY: number; endX: number; endY: number } | null => {
    // Wire pin IDs are formatted as: {instanceId}-{pinId}
    // Example: "arduino-uno-1234567890-d7" where instanceId="arduino-uno-1234567890" and pinId="d7"

    // Find the components by checking if wire pin ID starts with component instance ID
    const startComp = placedComponents.find((c) => wire.startPinId.startsWith(c.instanceId + '-'));
    const endComp = placedComponents.find((c) => wire.endPinId.startsWith(c.instanceId + '-'));

    if (!startComp || !endComp) {
      console.warn('Wire component not found:', { wireId: wire.id, startPinId: wire.startPinId, endPinId: wire.endPinId });
      return null;
    }

    // Extract pin IDs by removing the instance ID prefix
    const startPinId = wire.startPinId.substring(startComp.instanceId.length + 1);
    const endPinId = wire.endPinId.substring(endComp.instanceId.length + 1);

    // Get current pin positions
    const startPos = getAbsolutePinPosition(startComp, startPinId);
    const endPos = getAbsolutePinPosition(endComp, endPinId);

    if (!startPos || !endPos) {
      console.warn('Pin position not found:', { startPinId, endPinId });
      return null;
    }

    return {
      startX: startPos.x,
      startY: startPos.y,
      endX: endPos.x,
      endY: endPos.y,
    };
  };


  // ============================================================================
  // TRUE WOKWI ROUTING - Manhattan with straight lines + stroke-linejoin rounding
  // ============================================================================

  // Constants for TRUE Wokwi-style routing
  const PIN_EXIT_DISTANCE = 10;      // Straight exit from pin (10px)
  const GRID_SIZE = 5;                // Grid snap size (5px)
  const WIRE_LANE_OFFSET = 10;       // Parallel wire spacing (10px per lane)

  // Helper: Snap coordinate to grid
  const snapToGrid = (value: number): number => {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

  // Helper: Get direction vector for pin exit
  const getExitVector = (direction: string): { dx: number; dy: number } => {
    switch (direction) {
      case 'top': return { dx: 0, dy: -1 };
      case 'bottom': return { dx: 0, dy: 1 };
      case 'left': return { dx: -1, dy: 0 };
      case 'right': return { dx: 1, dy: 0 };
      default: return { dx: 0, dy: 1 }; // Default down
    }
  };

  // NEW: Create TRUE Wokwi-style Manhattan path (STRAIGHT LINES ONLY)
  const createManhattanPath = (wire: Wire): string => {
    const endpoints = getWireEndpoints(wire);
    if (!endpoints) return '';

    // Get pin information with directions
    const startPin = getPinWithDirection(wire.startPinId);
    const endPin = getPinWithDirection(wire.endPinId);

    if (!startPin || !endPin) {
      // Fallback to straight line
      return `M ${endpoints.startX} ${endpoints.startY} L ${endpoints.endX} ${endpoints.endY}`;
    }

    // Grid-snap pin coordinates (CRITICAL for straight wires)
    const p0 = {
      x: snapToGrid(startPin.x),
      y: snapToGrid(startPin.y)
    };

    const p3 = {
      x: snapToGrid(endPin.x),
      y: snapToGrid(endPin.y)
    };

    // Calculate exit and entry points (straight out from pins)
    const startVector = getExitVector(startPin.direction);
    const endVector = getExitVector(endPin.direction);

    const p1 = {
      x: snapToGrid(p0.x + startVector.dx * PIN_EXIT_DISTANCE),
      y: snapToGrid(p0.y + startVector.dy * PIN_EXIT_DISTANCE)
    };

    const p2 = {
      x: snapToGrid(p3.x + endVector.dx * PIN_EXIT_DISTANCE),
      y: snapToGrid(p3.y + endVector.dy * PIN_EXIT_DISTANCE)
    };

    // Build pure Manhattan path (STRAIGHT LINES ONLY - NO BEZIER)
    let path = `M ${p0.x} ${p0.y}`;

    // Exit straight from start pin
    path += ` L ${p1.x} ${p1.y}`;

    // Manhattan bridge between exit and entry
    const segments = calculateManhattanSegments(p1, p2, startPin.direction, endPin.direction);
    for (const segment of segments) {
      path += ` L ${snapToGrid(segment.x)} ${snapToGrid(segment.y)}`;
    }

    // Entry straight to end pin
    path += ` L ${p2.x} ${p2.y}`;
    path += ` L ${p3.x} ${p3.y}`;

    return path;
  };

  // Helper: Calculate Manhattan segments (horizontal then vertical, or vice versa)
  const calculateManhattanSegments = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    startDir: string,
    endDir: string
  ): Array<{ x: number; y: number }> => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Determine routing strategy based on pin directions
    const startHorizontal = startDir === 'left' || startDir === 'right';
    const endHorizontal = endDir === 'left' || endDir === 'right';

    // If both pins face horizontally or both vertically, use standard Manhattan
    if (startHorizontal === endHorizontal) {
      // Use whichever distance is larger
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal first
        const midX = start.x + dx / 2;
        return [
          { x: midX, y: start.y },
          { x: midX, y: end.y }
        ];
      } else {
        // Vertical first
        const midY = start.y + dy / 2;
        return [
          { x: start.x, y: midY },
          { x: end.x, y: midY }
        ];
      }
    }

    // Mixed directions - route based on start pin direction
    if (startHorizontal) {
      // Start horizontal, then vertical
      return [
        { x: end.x, y: start.y }
      ];
    } else {
      // Start vertical, then horizontal
      return [
        { x: start.x, y: end.y }
      ];
    }
  };

  // Helper: Get pin coordinates with direction from pinId
  const getPinWithDirection = (pinId: string): { x: number; y: number; direction: string } | null => {
    // Parse pinId: "arduino-uno-1234567-d9" or "hc-sr04-1234567-trig"
    const parts = pinId.split('-');
    const pinName = parts[parts.length - 1]; // "d9" or "trig"
    const componentInstanceId = parts.slice(0, -1).join('-'); // "arduino-uno-1234567"

    // Find component in placedComponents
    const component = placedComponents.find(c => c.instanceId === componentInstanceId);
    if (!component) return null;

    // Find pin definition
    const pin = component.pins?.find(p => p.id === pinName);
    if (!pin) return null;

    // Return absolute coordinates with direction
    return {
      x: component.x + pin.x,
      y: component.y + pin.y,
      direction: pin.direction || 'right' // Default to 'right' if not specified
    };
  };

  // Helper: Get wire color based on pin type
  const getWireColorByPinType = (pinId: string): string | null => {
    const pin = pinId.toLowerCase();

    // Power pins - RED
    if (pin.includes('vcc') || pin.includes('5v') || pin.includes('power') || pin.includes('3v3') || pin.includes('vin')) {
      return '#FF0000';
    }

    // Ground pins - BLACK
    if (pin.includes('gnd') || pin.includes('ground')) {
      return '#000000';
    }

    // Signal pins - COLORED
    if (pin.includes('trig')) return '#00FF00'; // GREEN
    if (pin.includes('echo')) return '#0000FF'; // BLUE
    if (pin.includes('data')) return '#FFA500'; // ORANGE
    if (pin.includes('rx')) return '#9C27B0'; // PURPLE
    if (pin.includes('tx')) return '#FF9800'; // ORANGE

    // Default signal - Return null to use wire's default color
    return null;
  };

  // NEW: Get unique color for each wire
  const getWireColor = (wire: Wire, wireIndex: number): string => {
    // Try to get color based on pin type first (power/ground)
    const startPinColor = getWireColorByPinType(wire.startPinId);
    const endPinColor = getWireColorByPinType(wire.endPinId);

    // If either pin is power or ground, use that color
    if (startPinColor) return startPinColor;
    if (endPinColor) return endPinColor;

    // For signal wires, use vibrant color palette for visual distinction
    const colorPalette = [
      '#FF6B6B', // Coral Red
      '#4ECDC4', // Turquoise
      '#45B7D1', // Sky Blue
      '#FFA07A', // Light Salmon
      '#98D8C8', // Mint
      '#C7CEEA', // Lavender
      '#B8E994', // Light Green
      '#F8B500', // Amber
      '#A29BFE', // Periwinkle
      '#FD79A8'  // Pink
    ];

    // Cycle through color palette based on wire index
    return colorPalette[wireIndex % colorPalette.length];
  };

  // Create preview path for wire being drawn (MANUAL ROUTING WITH WAYPOINTS)  
  const createPreviewPath = (): string => {
    if (!drawingWire) return '';

    let path = `M ${drawingWire.startX} ${drawingWire.startY}`;

    // Draw through all existing waypoints
    for (const waypoint of drawingWire.waypoints) {
      path += ` L ${waypoint.x} ${waypoint.y}`;
    }

    // Preview line from last waypoint to current mouse position
    const lastPoint = drawingWire.waypoints.length > 0
      ? drawingWire.waypoints[drawingWire.waypoints.length - 1]
      : { x: drawingWire.startX, y: drawingWire.startY };

    // Direct line to mouse - no auto-snapping
    path += ` L ${mousePos.x} ${mousePos.y}`;

    return path;
  };

  // NEW: Create path from waypoints for completed wires (MANUAL ROUTING)
  const createWaypointPath = (wire: Wire): string => {
    const endpoints = getWireEndpoints(wire);
    if (!endpoints) return '';

    // If no waypoints, draw straight line
    if (!wire.waypoints || wire.waypoints.length === 0) {
      return `M ${endpoints.startX} ${endpoints.startY} L ${endpoints.endX} ${endpoints.endY}`;
    }

    // Build path through waypoints
    let path = `M ${endpoints.startX} ${endpoints.startY}`;

    for (const waypoint of wire.waypoints) {
      path += ` L ${waypoint.x} ${waypoint.y}`;
    }

    // Final segment to end point
    path += ` L ${endpoints.endX} ${endpoints.endY}`;

    return path;
  };

  // Handle pin click for wiring
  const handlePinClick = (
    component: PlacedComponent,
    pinId: string,
    pinX: number,
    pinY: number,
  ) => {
    const absolutePos = getAbsolutePinPosition(component, pinId);
    if (!absolutePos) return;

    if (!drawingWire) {
      // Start drawing a wire
      setDrawingWire({
        startX: absolutePos.x,
        startY: absolutePos.y,
        startPinId: `${component.instanceId}-${pinId}`,
        componentInstanceId: component.instanceId,
        waypoints: [], // Start with no waypoints
      });
      toast.info(`Wire started from ${component.name} - ${pinId}`);
    } else {
      // Complete the wire - don't allow connecting to same component
      if (drawingWire.componentInstanceId === component.instanceId) {
        toast.error("Cannot connect pins on the same component!");
        return;
      }

      // Check if wire already exists between these pins
      const wireExists = wires.some(
        (wire) =>
          (wire.startPinId === drawingWire.startPinId &&
            wire.endPinId === `${component.instanceId}-${pinId}`) ||
          (wire.endPinId === drawingWire.startPinId &&
            wire.startPinId === `${component.instanceId}-${pinId}`),
      );

      if (wireExists) {
        toast.error("Wire already exists between these pins!");
        setDrawingWire(null);
        return;
      }

      const newWire: Wire = {
        id: `wire-${Date.now()}`,
        startX: drawingWire.startX,
        startY: drawingWire.startY,
        endX: absolutePos.x,
        endY: absolutePos.y,
        startPinId: drawingWire.startPinId,
        endPinId: `${component.instanceId}-${pinId}`,
        waypoints: drawingWire.waypoints, // Store waypoints
        // color: '#4CAF50', // All wires are green
      };
      setWires([...wires, newWire]);
      setDrawingWire(null);
      toast.success(`Wire connected to ${component.name} - ${pinId}`);

      // Update pin connection registry after state settles
      setTimeout(() => {
        updatePinConnections();
        registerLCDComponents();  // Register LCDs with engine
        registerUltrasonicComponents();  // Register Ultrasonic sensors with engine
      }, 100);

      // If simulation is active, update the circuit state
      if (isSimulating) {
        updateCircuitState();
      }
    }
  };

  // Add waypoint when clicking on canvas (MANUAL ROUTING - NO AUTO-SNAPPING)
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawingWire && e.target === e.currentTarget) {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Add waypoint EXACTLY at clicked position - no automatic orthogonal constraint
        const newWaypoint = { x: clickX, y: clickY };

        setDrawingWire({
          ...drawingWire,
          waypoints: [...drawingWire.waypoints, newWaypoint],
        });

        toast.success(`Bend point ${drawingWire.waypoints.length + 1} added - Click more points or click target pin to finish`);
      }
    }
  };

  // Add debug log to console
  const addDebugLog = (type: DebugLog['type'], message: string, value?: number) => {
    const log: DebugLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      message,
      value
    };
    setDebugLogs(prev => [...prev, log]);
  };

  // Remove a specific component
  const removeComponent = (instanceId: string) => {
    const component = placedComponents.find((c) => c.instanceId === instanceId);
    if (!component) return;

    // Remove the component
    setPlacedComponents((components) =>
      components.filter((c) => c.instanceId !== instanceId),
    );

    // Remove all wires connected to this component
    setWires((wires) =>
      wires.filter(
        (w) =>
          !w.startPinId.startsWith(instanceId) &&
          !w.endPinId.startsWith(instanceId),
      ),
    );

    toast.success(`${component.name} removed from circuit!`);

    // Update pin connection registry
    setTimeout(() => updatePinConnections(), 100);
  };

  // Remove a specific wire
  // ═══════════════════════════════════════════════════════════════════
  // 💾 PROJECT MANAGEMENT FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const handleSaveProject = () => {
    const projectName = prompt('Enter project name:');
    if (!projectName) return;

    try {
      saveProject({
        name: projectName,
        components: placedComponents,
        wires: wires,
        code: currentCode
      });

      toast.success(`💾 Project "${projectName}" saved!`);
      setSavedProjects(getAllProjects());
    } catch (error) {
      toast.error('Failed to save project');
      console.error(error);
    }
  };

  const handleLoadProject = (projectId: string) => {
    try {
      const project = loadProject(projectId);
      if (!project) {
        toast.error('Project not found');
        return;
      }

      setPlacedComponents(project.components);
      setWires(project.wires);
      setCurrentCode(project.code);

      toast.success(`📂 Loaded "${project.name}"`);
      setShowProjectsMenu(false);
    } catch (error) {
      toast.error('Failed to load project');
      console.error(error);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      deleteProject(projectId);
      setSavedProjects(getAllProjects());
      toast.success('🗑️ Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
      console.error(error);
    }
  };

  const toggleProjectsMenu = () => {
    setSavedProjects(getAllProjects());
    setShowProjectsMenu(!showProjectsMenu);
  };

  const removeWire = (wireId: string) => {
    const wire = wires.find((w) => w.id === wireId);
    if (!wire) return;

    setWires((wires) => wires.filter((w) => w.id !== wireId));

    // Get component names from wire IDs
    const startComp = placedComponents.find((c) =>
      wire.startPinId.startsWith(c.instanceId),
    );
    const endComp = placedComponents.find((c) =>
      wire.endPinId.startsWith(c.instanceId),
    );

    toast.success(`Wire removed: ${startComp?.name} → ${endComp?.name}`);

    // Update pin connection registry
    setTimeout(() => updatePinConnections(), 100);
  };

  // Clear all wires
  const clearAllWires = () => {
    setWires([]);
    setDrawingWire(null);
    toast.success("All wires cleared!");

    // Update pin connection registry
    setTimeout(() => updatePinConnections(), 100);
  };

  // Delete a single component
  const handleDeleteComponent = (instanceId: string) => {
    // Remove component
    setPlacedComponents((components) =>
      components.filter((c) => c.instanceId !== instanceId),
    );

    // Remove all wires connected to this component
    setWires((wires) =>
      wires.filter(
        (w) =>
          !w.startPinId.startsWith(instanceId) &&
          !w.endPinId.startsWith(instanceId),
      ),
    );

    toast.success("Component deleted!");
  };

  // Delete a single wire
  const handleDeleteWire = (wireId: string) => {
    setWires((wires) => wires.filter((w) => w.id !== wireId));
    toast.success("Wire deleted!");
  };

  // Clear entire canvas
  const clearCanvas = () => {
    setPlacedComponents([]);
    setWires([]);
    setDrawingWire(null);
    toast.success("Canvas cleared!");
  };

  // ═══════════════════════════════════════════════════════════════════
  // 💧 WATER CHAMBER TURBIDITY EDITING
  // ═══════════════════════════════════════════════════════════════════

  // Open water chamber turbidity editor
  const handleWaterChamberDoubleClick = (component: PlacedComponent) => {
    if (!component.id.includes('water-chamber')) return;

    setEditingWaterChamber(component.instanceId);

    // Get current turbidity value from turbidity engine if available
    const turbidityEngine = getTurbidityEngine();

    // Find connected turbidity sensors
    const connectedSensors = placedComponents.filter(c =>
      c.id.includes('turbidity') &&
      wires.some(w =>
        (w.startPinId.startsWith(c.instanceId) && w.endPinId.startsWith(component.instanceId)) ||
        (w.endPinId.startsWith(c.instanceId) && w.startPinId.startsWith(component.instanceId))
      )
    );

    if (connectedSensors.length > 0) {
      const sensorState = turbidityEngine.getProbeState(connectedSensors[0].instanceId);
      if (sensorState) {
        setWaterChamberTurbidity(sensorState.turbidity);
      }
    }

    toast.info(`Editing water chamber turbidity`);
  };

  // Update turbidity value
  const handleTurbidityChange = (newTurbidity: number) => {
    setWaterChamberTurbidity(newTurbidity);

    if (!editingWaterChamber) return;

    const turbidityEngine = getTurbidityEngine();

    // Find the water chamber component
    const waterChamber = placedComponents.find(c => c.instanceId === editingWaterChamber);
    if (!waterChamber) return;

    // Find all turbidity sensors connected to this water chamber
    const connectedSensors = placedComponents.filter(c =>
      c.id.includes('turbidity') &&
      wires.some(w =>
        (w.startPinId.startsWith(c.instanceId) && w.endPinId.startsWith(waterChamber.instanceId)) ||
        (w.endPinId.startsWith(c.instanceId) && w.startPinId.startsWith(waterChamber.instanceId))
      )
    );

    // Update turbidity for all connected sensors
    connectedSensors.forEach(sensor => {
      turbidityEngine.setTurbidity(sensor.instanceId, newTurbidity);
    });

    console.log(`💧 Water chamber turbidity set to ${newTurbidity} NTU for ${connectedSensors.length} connected sensors`);
  };

  // Close water chamber editor
  const closeWaterChamberEditor = () => {
    setEditingWaterChamber(null);
  };

  // Update circuit state based on connections
  const updateCircuitState = () => {
    console.log("Updating circuit state based on connections");

    // Detect HC-SR04 Ultrasonic Sensors and simulate readings
    const ultrasonicSensors = placedComponents.filter(c =>
      c.id.toLowerCase().includes('hc-sr04') ||
      c.id.toLowerCase().includes('ultrasonic')
    );

    if (ultrasonicSensors.length > 0) {
      const ultrasonicEngine = getUltrasonicEngine();

      ultrasonicSensors.forEach(sensor => {
        // Simulate realistic distance with variation (10-50cm range)
        const baseDistance = 20 + Math.random() * 30; // 20-50cm
        const noise = (Math.random() - 0.5) * 5; // ±2.5cm noise
        const distance = Math.max(5, Math.min(200, baseDistance + noise));

        // Update engine distance
        ultrasonicEngine.setDistance(sensor.instanceId, distance);

        // Log to debug console
        console.log(`🔵 Logging distance: ${distance.toFixed(2)} cm`);  // DEBUG
        addDebugLog('sensor', 'HC-SR04 Distance', distance);
      });
    }

    // Find Arduino component
    const arduino = placedComponents.find((c) => c.id.includes("arduino"));
    if (!arduino) {
      toast.error("Arduino not found in circuit!");
      return;
    }

    // Get all connected components through wires
    const connections = new Map();

    // Build connection map
    wires.forEach((wire) => {
      const [startCompId] = wire.startPinId.split("-");
      const [endCompId] = wire.endPinId.split("-");

      if (!connections.has(startCompId)) {
        connections.set(startCompId, new Set());
      }
      if (!connections.has(endCompId)) {
        connections.set(endCompId, new Set());
      }

      connections.get(startCompId).add(endCompId);
      connections.get(endCompId).add(startCompId);
    });

    // Find LEDs connected to active Arduino pins
    const activePins = Object.keys(compiledCode.pinStates || {});
    const activeComponents = new Set();

    // Mark Arduino as active
    if (arduino) {
      activeComponents.add(arduino.instanceId);

      // Find components connected to active pins
      activePins.forEach((pin) => {
        const pinState = compiledCode.pinStates[pin];
        if (!pinState) return; // Skip inactive pins

        // Map digitalWrite pin numbers to Arduino pin IDs (8 -> d8, 9 -> d9, etc.)
        const mappedPinId = `d${pin}`;

        // Find wires connected to this pin
        wires.forEach((wire) => {
          const arduinoPinId = `${arduino.instanceId}-${mappedPinId}`;

          if (
            wire.startPinId === arduinoPinId ||
            wire.endPinId === arduinoPinId
          ) {
            // Get the other component
            const otherPinId =
              wire.startPinId === arduinoPinId
                ? wire.endPinId
                : wire.startPinId;
            const [otherCompId] = otherPinId.split("-");

            // Mark component as active
            activeComponents.add(otherCompId);

            // Recursively mark connected components
            const queue = [otherCompId];
            while (queue.length > 0) {
              const currentId = queue.shift();
              const connected = connections.get(currentId);

              if (connected) {
                connected.forEach((connId) => {
                  if (!activeComponents.has(connId)) {
                    activeComponents.add(connId);
                    queue.push(connId);
                  }
                });
              }
            }
          }
        });
      });
    }

    console.log("Active components:", Array.from(activeComponents));

    // Update component states
    setPlacedComponents((components) =>
      components.map((comp) => {
        if (comp.id.includes("led")) {
          const isActive = activeComponents.has(comp.instanceId);
          return {
            ...comp,
            props: {
              ...comp.props,
              isActive,
            },
          };
        }
        return comp;
      }),
    );

    // Force re-render
    setForceUpdate((prev) => prev + 1);
  };

  // Toggle simulation - Simple and forgiving like Wokwi
  const toggleSimulation = () => {
    if (!isSimulating) {
      // Just check if there's any code at all
      if (!isCodeUploaded) {
        toast.error("⚠️ Please write and compile some code first!");
        addDebugLog('error', 'Cannot start simulation - no code uploaded');
        return;
      }

      setIsSimulating(true);
      toast.success("🚀 Simulation started!");
      addDebugLog('info', 'Simulation started');

      // Initialize ultrasonic engine
      const ultrasonicEngine = getUltrasonicEngine();

      // Register HC-SR04 sensors
      const sensors = placedComponents.filter(c =>
        c.id.toLowerCase().includes('hc-sr04') ||
        c.id.toLowerCase().includes('ultrasonic')
      );

      if (sensors.length > 0) {
        sensors.forEach(sensor => {
          // For now, use default pins (will be improved with actual wire detection)
          // TRIG = pin 9, ECHO = pin 3 (from your code)
          ultrasonicEngine.registerSensor(sensor.instanceId, 9, 3);
          ultrasonicEngine.setDistance(sensor.instanceId, 20); // Start at 20cm
          addDebugLog('info', `HC-SR04 sensor registered (TRIG=9, ECHO=3)`);
        });
      }

      // Register LCD components with engine
      registerLCDComponents();
      addDebugLog('info', 'LCD components registered with engine');

      // Update LCD component props with compiled text (only when simulation starts)
      if (compiledCode?.hasLCD && compiledCode?.lcdText) {
        // 🔍 VALIDATE: Check if LiquidCrystal pins in code match actual wiring
        const validateLCDPinConfiguration = (): boolean => {
          if (!compiledCode?.code) return false;

          // Extract LiquidCrystal initialization from code
          const lcdInitRegex = /LiquidCrystal\s+lcd\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)?\s*\)/;
          const match = compiledCode.code.match(lcdInitRegex);

          if (!match) {
            console.error(`\n${'='.repeat(50)}`);
            console.error(`❌ LCD CODE ERROR`);
            console.error(`   No valid LiquidCrystal lcd(...) initialization found`);
            console.error(`   Expected: LiquidCrystal lcd(RS, EN, D4, D5, D6, D7);`);
            console.error('='.repeat(50) + '\n');
            toast.error('LCD Error: Missing LiquidCrystal lcd(...) initialization', { duration: 5000 });
            addDebugLog('error', 'LCD initialization not found in code');
            return false;
          }

          // Check if all 6 pins are provided
          if (!match[6]) {
            console.error(`\n${'='.repeat(50)}`);
            console.error(`❌ LCD CODE ERROR`);
            console.error(`   Incomplete LCD initialization - missing D7 pin`);
            console.error(`   Found: LiquidCrystal lcd(${match.slice(1, 6).filter(Boolean).join(', ')})`);
            console.error(`   Expected: LiquidCrystal lcd(RS, EN, D4, D5, D6, D7);`);
            console.error('='.repeat(50) + '\n');
            toast.error('LCD Error: Missing D7 pin in LiquidCrystal lcd(...)', { duration: 5000 });
            addDebugLog('error', 'Incomplete LCD pin configuration');
            return false;
          }

          const codePins = {
            rs: parseInt(match[1]),
            en: parseInt(match[2]),
            d4: parseInt(match[3]),
            d5: parseInt(match[4]),
            d6: parseInt(match[5]),
            d7: parseInt(match[6])
          };

          // Get actual wiring from components
          const lcdComponents = placedComponents.filter(c => c.id.includes('lcd'));

          for (const lcdComp of lcdComponents) {
            const lcdWires = wires.filter(wire =>
              wire.startPinId.startsWith(lcdComp.instanceId) ||
              wire.endPinId.startsWith(lcdComp.instanceId)
            );

            const actualPins: Record<string, number> = {};
            lcdWires.forEach(wire => {
              const lcdPinId = wire.startPinId.startsWith(lcdComp.instanceId)
                ? wire.startPinId
                : wire.endPinId;
              const lcdPinName = lcdPinId.split("-").pop();

              const arduinoPinId = wire.startPinId.includes("arduino-uno")
                ? wire.startPinId
                : wire.endPinId;

              if (!arduinoPinId || !arduinoPinId.includes("arduino-uno")) return;

              const arduinoPinStr = extractArduinoPinNumber(arduinoPinId);
              const arduinoPinNum = parseInt(arduinoPinStr, 10);

              if (lcdPinName && !isNaN(arduinoPinNum)) {
                actualPins[lcdPinName] = arduinoPinNum;
              }
            });

            // Compare code pins with actual wiring
            const pinNames = ['rs', 'en', 'd4', 'd5', 'd6', 'd7'];
            const mismatches = [];

            for (const pinName of pinNames) {
              const wireName = pinName === 'en' ? 'e' : pinName;
              const codePin = codePins[pinName as keyof typeof codePins];
              const actualPin = actualPins[wireName];

              if (actualPin && codePin !== actualPin) {
                mismatches.push(`${pinName.toUpperCase()}: code says D${codePin}, wired to D${actualPin}`);
              }
            }

            if (mismatches.length > 0) {
              console.error(`\n${'='.repeat(50)}`);
              console.error(`❌ LCD PIN MISMATCH!`);
              console.error(`   Your code doesn't match your wiring:`);
              mismatches.forEach(msg => console.error(`   • ${msg}`));
              console.error(`\n   Code says: LiquidCrystal lcd(${Object.values(codePins).join(', ')})`);
              console.error(`   But circuit has different wiring!`);
              console.error(`\n   Fix: Update your code to match the wiring`);
              console.error('='.repeat(50) + '\n');

              toast.error('LCD Error: Pin mismatch! Code doesn\'t match wiring', { duration: 5000 });
              addDebugLog('error', `LCD pin mismatch: ${mismatches.join(', ')}`);
              return false;
            }
          }

          console.log('✅ LCD pin configuration validated - code matches wiring');
          return true;
        };

        // Validate before displaying LCD text
        if (!validateLCDPinConfiguration()) {
          console.log('📺 LCD validation failed - text will not be displayed');
          // Don't update LCD props
        } else {
          // Validation passed - update LCD props to display text
          setPlacedComponents((components) =>
            components.map((comp) => {
              if (comp.id.includes('lcd')) {
                return {
                  ...comp,
                  props: {
                    ...comp.props,
                    lcdText: compiledCode?.lcdText, // Display LCD text from uploaded code
                  },
                };
              }
              return comp;
            })
          );
          console.log('📺 LCD text displayed in simulation:', compiledCode?.lcdText);
        }
      }

      // Update circuit state immediately
      updateCircuitState();

      // Use ACTUAL delay from compiled code - get the first delay value
      const actualDelay =
        compiledCode.delays && compiledCode.delays.length > 0
          ? compiledCode.delays[0]
          : compiledCode.delayMs || 500;

      console.log(
        `🚀 Starting REAL-TIME simulation with delay ${actualDelay}ms`,
      );
      console.log(`📋 All delays found in code:`, compiledCode.delays);

      // REAL-TIME BLINKING SYSTEM - Uses actual Arduino delay() values
      const interval = setInterval(() => {
        // Update circuit state and sensor readings every cycle
        updateCircuitState();

        if (compiledCode.hasBlinking) {
          const newBlinkState: Record<string, boolean> = {};

          // UNIVERSAL: Handle ALL pins (0-13) automatically
          for (let pin = 0; pin <= 13; pin++) {
            const pinStr = pin.toString();

            // Check direct pin usage
            let pinIsUsed =
              compiledCode.code &&
              (compiledCode.code.includes(`pinMode(${pin},`) ||
                compiledCode.code.includes(`digitalWrite(${pin},`) ||
                compiledCode.code.includes(`analogWrite(${pin},`));

            // Also check variable usage
            if (!pinIsUsed && compiledCode.pinVariableMap) {
              const varsForPin = Object.entries(compiledCode.pinVariableMap)
                .filter(([_, pinNum]) => pinNum === pinStr)
                .map(([varName]) => varName);

              for (const varName of varsForPin) {
                if (compiledCode.code &&
                  (compiledCode.code.includes(`pinMode(${varName},`) ||
                    compiledCode.code.includes(`digitalWrite(${varName},`) ||
                    compiledCode.code.includes(`analogWrite(${varName},`))) {
                  pinIsUsed = true;
                  break;
                }
              }
            }

            if (pinIsUsed) {
              // Alternate the state for realistic blinking with actual timing
              newBlinkState[pinStr] = !currentBlinkState[pinStr];

              console.log(
                `⚡ Pin ${pin}: ${newBlinkState[pinStr] ? "HIGH" : "LOW"} (${actualDelay}ms timing)`,
              );
            }
          }

          setCurrentBlinkState(newBlinkState);
        }

        updateCircuitState();
        setForceUpdate((prev) => prev + 1);
      }, actualDelay);

      setBlinkInterval(interval);
    } else {
      // Stop simulation
      setIsSimulating(false);
      toast.info("⏸️ Simulation stopped");
      addDebugLog('info', 'Simulation stopped');

      // Clear interval and reset blink state
      if (blinkInterval !== null) {
        window.clearInterval(blinkInterval);
        setBlinkInterval(null);
      }

      // Reset blinking states
      setCurrentBlinkState({});

      // Clear LCD display when simulation stops
      setPlacedComponents((components) =>
        components.map((comp) => {
          if (comp.id.includes('lcd')) {
            return {
              ...comp,
              props: {
                ...comp.props,
                lcdText: undefined, // Clear LCD text
              },
            };
          }
          return comp;
        })
      );
      console.log('📺 LCD display cleared');
    }
  };

  // Auto-fix pin mismatch in code
  const fixPinInCode = (oldPin: string, newPin: string) => {
    console.log(`🔧 Auto-fixing code: Replacing pin ${oldPin} with pin ${newPin}`);

    let updatedCode = currentCode;

    // ENHANCED: First, check if there's a variable declaration like "int led = 7;"
    const variableDeclarationRegex = new RegExp(
      `(int|const\\s+int|#define)\\s+(\\w+)\\s*=\\s*${oldPin}\\s*;`,
      'g'
    );

    const varMatch = variableDeclarationRegex.exec(updatedCode);
    if (varMatch) {
      const variableName = varMatch[2];
      console.log(`🔍 Found variable declaration: ${varMatch[0]}`);
      console.log(`   Variable name: ${variableName}, old value: ${oldPin}, new value: ${newPin}`);

      // Replace the variable value
      updatedCode = updatedCode.replace(
        new RegExp(`(${varMatch[1]}\\s+${variableName}\\s*=\\s*)${oldPin}(\\s*;)`, 'g'),
        `$1${newPin}$2`
      );

      console.log(`✅ Updated variable declaration to use pin ${newPin}`);
    } else {
      // No variable found, replace direct pin usage
      console.log(`🔍 No variable declaration found, replacing direct pin usage`);

      // Replace all occurrences of the old pin with the new pin
      // Handle pinMode, digitalWrite, digitalRead, analogWrite, analogRead
      const patterns = [
        new RegExp(`pinMode\\(\\s*${oldPin}\\s*,`, 'g'),
        new RegExp(`digitalWrite\\(\\s*${oldPin}\\s*,`, 'g'),
        new RegExp(`digitalRead\\(\\s*${oldPin}\\s*\\)`, 'g'),
        new RegExp(`analogWrite\\(\\s*${oldPin}\\s*,`, 'g'),
        new RegExp(`analogRead\\(\\s*${oldPin}\\s*\\)`, 'g'),
      ];

      const replacements = [
        `pinMode(${newPin},`,
        `digitalWrite(${newPin},`,
        `digitalRead(${newPin})`,
        `analogWrite(${newPin},`,
        `analogRead(${newPin})`,
      ];

      patterns.forEach((pattern, index) => {
        updatedCode = updatedCode.replace(pattern, replacements[index]);
      });
    }

    // Update the code editor
    setCurrentCode(updatedCode);

    // Re-compile the code
    setTimeout(() => {
      executeCode(updatedCode);
      toast.success(`✅ Code fixed! Pin ${oldPin} → Pin ${newPin}`, { duration: 3000 });
    }, 100);
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🚀 COMPILER MODE - Real AVR Compilation and Emulation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Executes Arduino code using real compilation and AVR emulation
   */
  const executeCodeWithCompiler = async (code: string) => {
    try {
      console.log('⚙️ --- COMPILATION START ---');
      console.log('📋 Using:', useAVR8js ? 'AVR8.js (Real AVR Emulation)' : 'Custom Emulator');
      addDebugLog('info', 'Compiling with Arduino CLI...');

      console.log('🌐 Fetching from backend: http://localhost:3001/api/compile');
      const response = await fetch('http://localhost:3001/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, board: 'arduino:avr:uno' })
      });

      console.log('📡 Backend response status:', response.status, response.statusText);
      console.log('📡 Response OK:', response.ok);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('📡 About to parse JSON...');

      const result = await response.json();
      console.log('📦 Backend result:', result);
      console.log('📦 Result keys:', Object.keys(result));

      if (!result.success) {
        console.error('❌ Compilation failed:', result.errors);
        addDebugLog('error', `Compilation failed: ${result.errors.join(', ')}`);
        toast.error('Compilation failed!');
        setIsCodeUploaded(false);
        return;
      }

      console.log('✅ Compilation successful!');
      addDebugLog('info', 'Compilation successful!');

      // Create Hardware Abstraction Layer
      const hal = new HardwareAbstractionLayer();
      hal.onPinChange((pin: number, value: 0 | 1) => {
        console.log(`🔌 HAL PIN CHANGE: Pin ${pin} = ${value ? 'HIGH' : 'LOW'}`);
        setCompiledCode(prev => ({
          ...prev,
          pinStates: { ...prev.pinStates, [pin.toString()]: value }
        }));
        getLCDEngine().onPinChange(pin, value, Date.now());
        getUltrasonicEngine().onPinChange(pin, value, Date.now());
        getTurbidityEngine().onPinChange(pin, value, Date.now());
        setForceUpdate(prev => prev + 1);
      });

      if (useAVR8js) {
        // Use AVR8.js for accurate emulation
        console.log('🎮 Initializing AVR8.js emulator...');
        const emulator = new AVR8jsWrapper(hal);
        console.log('📦 Loading HEX with', result.binaryData?.length || 0, 'segments...');
        console.log('🔍 First segment sample:', result.binaryData?.[0]);
        console.log('🔍 First segment data type:', Array.isArray(result.binaryData?.[0]?.data) ? 'Array' : typeof result.binaryData?.[0]?.data);
        console.log('🔍 First segment data length:', result.binaryData?.[0]?.data?.length);
        emulator.loadHex(result.binaryData as HexSegment[]);
        console.log('▶️ Starting AVR8.js CPU...');
        emulator.start();
        setAvr8jsEmulator(emulator);

        toast.success('✅ Code compiled with AVR8.js!');
        setIsCodeUploaded(true);
        console.log('🔄 Starting AVR8.js execution loop...');
        startAVR8jsLoop(emulator);
        console.log('✅ --- COMPILATION COMPLETE ---');
      } else {
        // Use custom emulator (fallback)
        console.log('🔧 Initializing custom AVR emulator...');
        const emulator = new AVREmulator(hal);
        emulator.loadHex(result.binaryData as HexSegment[]);
        setAvrEmulator(emulator);

        toast.success('✅ Code compiled with custom emulator!');
        setIsCodeUploaded(true);
        startEmulatorLoop(emulator);
      }

    } catch (error: any) {
      console.error('💥 Compiler error caught:', error);
      console.error('💥 Error name:', error.name);
      console.error('💥 Error message:', error.message);
      console.error('💥 Error stack:', error.stack);

      if (error.message?.includes('fetch')) {
        console.warn('⚠️ Backend unavailable - using simple mode');
        toast.warning('Backend unavailable, using simple mode');
        executeCode(code);
      } else {
        toast.error(`Compilation failed: ${error.message}`);
      }
      setIsCodeUploaded(false);
    }
  };

  // Add this function after executeCodeWithCompiler (around line 1890)
  // This function chooses between real and simple compilation modes
  /**
   * Unified upload handler - chooses between compiler modes
   */
  const handleUploadCode = (code: string) => {
    if (useCompilerMode) {
      // Use real Arduino CLI + AVR8.js compilation
      console.log('📤 Using real compiler mode (Arduino CLI + AVR8.js)');
      executeCodeWithCompiler(code);
    } else {
      // Use regex-based simple compilation
      console.log('📤 Using simple mode (regex-based)');
      executeCode(code);
    }
  };
  const startEmulatorLoop = (emulator: AVREmulator) => {
    if (emulatorIntervalRef.current) clearInterval(emulatorIntervalRef.current);
    setEmulatorRunning(true);
    emulatorIntervalRef.current = window.setInterval(() => {
      if (emulator && !emulator.halted) {
        const executed = emulator.run(1000);
        if (executed === 0) stopEmulatorLoop();
      }
    }, 16);
  };

  const stopEmulatorLoop = () => {
    if (emulatorIntervalRef.current) {
      clearInterval(emulatorIntervalRef.current);
      emulatorIntervalRef.current = null;
    }
    setEmulatorRunning(false);
  };

  // AVR8.js emulator loop (runs at ~60 FPS, executes 16MHz / 60 = ~266k cycles per frame)
  const startAVR8jsLoop = (emulator: AVR8jsWrapper) => {
    console.log('🚀 startAVR8jsLoop() CALLED');
    console.log(`   Emulator exists: ${!!emulator}`);

    if (emulatorIntervalRef.current) clearInterval(emulatorIntervalRef.current);
    setEmulatorRunning(true);

    // Run at 60 FPS, execute proportional CPU cycles for 16 MHz
    const CYCLES_PER_FRAME = Math.floor(16000000 / 60);
    console.log(`   Cycles per frame: ${CYCLES_PER_FRAME}`);

    let frameCount = 0;
    emulatorIntervalRef.current = window.setInterval(() => {
      frameCount++;
      if (frameCount % 60 === 0) {
        console.log(`⏱️ AVR8.js interval executing (frame ${frameCount})`);
      }

      if (emulator) {
        const executed = emulator.run(CYCLES_PER_FRAME);
        if (frameCount <= 3) {
          console.log(`   Frame ${frameCount}: Executed ${executed} cycles`);
        }

        // ✨ CRITICAL: Check for port changes to detect digitalWrite()!
        emulator.checkPortChanges();

        if (executed === 0) {
          console.log('❌ Emulator returned 0 cycles - stopping');
          stopAVR8jsLoop();
        }
      } else {
        console.log('❌ Emulator is null in interval!');
      }
    }, 16); // ~60 FPS

    console.log(`✅ AVR8.js interval started (ID: ${emulatorIntervalRef.current})`);
  };

  const stopAVR8jsLoop = () => {
    if (avr8jsEmulator) {
      avr8jsEmulator.stop();
    }
    if (emulatorIntervalRef.current) {
      clearInterval(emulatorIntervalRef.current);
      emulatorIntervalRef.current = null;
    }
    setEmulatorRunning(false);
  };

  useEffect(() => {
    return () => {
      if (emulatorIntervalRef.current) clearInterval(emulatorIntervalRef.current);
    };
  }, []);

  // Enhanced Arduino compiler - supports all components and functions
  const executeCode = (code: string) => {
    try {
      console.log("Compiling Arduino code...");

      // Basic validation
      const codeLines = code
        .trim()
        .split("\n")
        .filter((line) => line.trim().length > 0);

      if (codeLines.length === 0) {
        toast.error("❌ Please write some code first!");
        setIsCodeUploaded(false);
        return;
      }

      // Syntax check
      const openBrackets = (code.match(/\{/g) || []).length;
      const closeBrackets = (code.match(/\}/g) || []).length;
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;

      if (openBrackets !== closeBrackets) {
        toast.error(`❌ Syntax Error: Mismatched brackets { }`);
        setIsCodeUploaded(false);
        return;
      }

      if (openParens !== closeParens) {
        toast.error(`❌ Syntax Error: Mismatched parentheses ( )`);
        setIsCodeUploaded(false);
        return;
      }

      // Enhanced parsing for all Arduino functions
      const pinModes: Record<string, string> = {};
      const pinStates: Record<string, number> = {};
      const analogValues: Record<string, number> = {};
      const servoPositions: Record<string, number> = {};
      const serialOutput: string[] = [];
      const pinVariableMap: Record<string, string> = {}; // Map variable names to pin numbers

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: Parse variable declarations to map variable names to pins
      // ═══════════════════════════════════════════════════════════════════
      const varDeclRegex = /(int|const\s+int|#define)\s+(\w+)\s*=\s*(\d+)\s*;/g;
      let varMatch;
      while ((varMatch = varDeclRegex.exec(code)) !== null) {
        const varName = varMatch[2];
        const pinNum = varMatch[3];

        // Only track if it's a valid pin number (0-13 or A0-A5)
        const pinNumber = parseInt(pinNum);
        if (pinNumber >= 0 && pinNumber <= 13) {
          pinVariableMap[varName] = pinNum;
          console.log(`📌 Variable mapping: ${varName} = Pin ${pinNum}`);
        }
      }

      console.log(`📋 Total pin variables mapped:`, pinVariableMap);

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: Parse Arduino function calls with enhanced variable support
      // ═══════════════════════════════════════════════════════════════════

      // Helper function to resolve pin references (variable names or direct numbers)
      const resolvePinReference = (pinRef: string): string => {
        // Check if it's a variable name
        if (pinVariableMap[pinRef]) {
          console.log(`  🔄 Resolved variable "${pinRef}" to pin ${pinVariableMap[pinRef]}`);
          return pinVariableMap[pinRef];
        }
        // Otherwise, extract the number directly
        const directPin = pinRef.replace(/[^0-9]/g, "");
        return directPin;
      };

      // Parse pinMode calls - Enhanced for variables and direct pins
      const pinModeRegex =
        /pinMode\s*\(\s*([A-Za-z_]\w*|\d+)\s*,\s*(OUTPUT|INPUT|INPUT_PULLUP)\s*\)/gi;
      let match;
      while ((match = pinModeRegex.exec(code)) !== null) {
        const pinRef = match[1];
        const pin = resolvePinReference(pinRef);
        const mode = match[2].toUpperCase();
        if (pin) {
          pinModes[pin] = mode;
          console.log(`🔌 pinMode: Pin ${pin} (from "${pinRef}") = ${mode}`);
        }
      }

      // Parse digitalWrite calls - Enhanced for variables and direct pins
      const digitalWriteRegex =
        /digitalWrite\s*\(\s*([A-Za-z_]\w*|\d+)\s*,\s*(HIGH|LOW|1|0)\s*\)/gi;
      while ((match = digitalWriteRegex.exec(code)) !== null) {
        const pinRef = match[1];
        const value = match[2];
        const pin = resolvePinReference(pinRef);
        if (pin) {
          pinStates[pin] = value === "HIGH" || value === "1" ? 1 : 0;

          // Forward pin changes to LCD engine for realistic simulation
          const lcdEngine = getLCDEngine();
          lcdEngine.onPinChange(parseInt(pin), pinStates[pin] as 0 | 1, Date.now());

          console.log(
            `🔌 digitalWrite: Pin ${pin} (from "${pinRef}") = ${pinStates[pin] ? "HIGH" : "LOW"}`,
          );
        }
      }

      // Parse analogWrite calls (PWM) - Enhanced for variables and direct pins
      const analogWriteRegex =
        /analogWrite\s*\(\s*([A-Za-z_]\w*|\d+)\s*,\s*(\d+)\s*\)/gi;
      while ((match = analogWriteRegex.exec(code)) !== null) {
        const pinRef = match[1];
        const pin = resolvePinReference(pinRef);
        const value = parseInt(match[2]);
        if (pin && value >= 0 && value <= 255) {
          analogValues[pin] = value;
          pinStates[pin] = value > 0 ? 1 : 0; // Convert to number (0|1)
          console.log(
            `🔌 analogWrite: Pin ${pin} (from "${pinRef}") = ${value} (${value > 0 ? "ON" : "OFF"})`,
          );
        }
      }

      // Parse digitalRead calls (sensors)
      const digitalReadRegex = /digitalRead\s*\(\s*([A-Za-z]?\d+)\s*\)/gi;
      while ((match = digitalReadRegex.exec(code)) !== null) {
        const pin = match[1];
        pinModes[pin] = "INPUT"; // Auto-set as input
        console.log(`digitalRead: Pin ${pin} detected`);
      }

      // Parse analogRead calls (analog sensors)
      const analogReadRegex = /analogRead\s*\(\s*([A-Za-z]?\d+)\s*\)/gi;
      while ((match = analogReadRegex.exec(code)) !== null) {
        const pin = match[1];
        pinModes[pin] = "ANALOG_INPUT";
        console.log(`analogRead: Pin ${pin} detected`);
      }

      // Parse Servo functions
      const servoWriteRegex = /(?:servo|myservo)\.write\s*\(\s*(\d+)\s*\)/gi;
      while ((match = servoWriteRegex.exec(code)) !== null) {
        const angle = parseInt(match[1]);
        servoPositions["servo"] = angle;
        console.log(`Servo write: ${angle} degrees`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // 📺 LCD ENGINE REGISTRATION (Realistic Hardware Simulation)
      // ═══════════════════════════════════════════════════════════════════

      // Detect LCD usage and extract pin configuration
      // Pattern: LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
      const lcdInitRegex = /LiquidCrystal\s+lcd\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i;
      const lcdMatch = code.match(lcdInitRegex);

      const hasLCD = lcdMatch !== null || /lcd\.(?:print|setCursor|clear|begin)/.test(code);
      let lcdText = { line1: '', line2: '' };

      if (hasLCD && lcdMatch) {
        // Extract LCD pin configuration from code
        const rs = parseInt(lcdMatch[1]);
        const en = parseInt(lcdMatch[2]);
        const d4 = parseInt(lcdMatch[3]);
        const d5 = parseInt(lcdMatch[4]);
        const d6 = parseInt(lcdMatch[5]);
        const d7 = parseInt(lcdMatch[6]);

        console.log(`📺 LCD Detected: LiquidCrystal(rs=${rs}, en=${en}, d4=${d4}, d5=${d5}, d6=${d6}, d7=${d7})`);

        // Register LCD with engine
        const lcdEngine = getLCDEngine();

        // Find LCD instances in placed components
        placedComponents
          .filter(comp => comp.id.includes('lcd'))
          .forEach(lcd => {
            lcdEngine.registerLCD(lcd.instanceId, { rs, en, d4, d5, d6, d7 });
            console.log(`📺 Registered LCD: ${lcd.instanceId}`);

            // Get display buffer from engine (will be empty initially, populated by pin changes)
            const buffer = lcdEngine.getDisplayBuffer(lcd.instanceId);
            if (buffer) {
              lcdText = buffer;
            }
          });
      } else if (hasLCD) {
        // LCD functions found but no LiquidCrystal initialization
        // Use default pin configuration (common Arduino LCD shield pins)
        console.log('⚠️ LCD functions detected but no LiquidCrystal initialization. Using default pins: rs=12, en=11, d4=5, d5=4, d6=3, d7=2');

        const lcdEngine = getLCDEngine();
        placedComponents
          .filter(comp => comp.id.includes('lcd'))
          .forEach(lcd => {
            lcdEngine.registerLCD(lcd.instanceId, {
              rs: 12, en: 11, d4: 5, d5: 4, d6: 3, d7: 2
            });
          });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 📺 LCD TEXT PARSING (Static Code Analysis)
      // ═══════════════════════════════════════════════════════════════════
      // Parse lcd.print() and lcd.setCursor() to build display buffer
      if (hasLCD) {
        const displayBuffer = {
          line1: '                ', // 16 spaces for 16x2 LCD
          line2: '                '
        };
        let cursorRow = 0;
        let cursorCol = 0;

        // Find all LCD commands in order of appearance
        const lcdCommandRegex = /lcd\.(print|println|setCursor|clear|begin)\s*\((.*?)\)/gi;
        let cmdMatch;

        while ((cmdMatch = lcdCommandRegex.exec(code)) !== null) {
          const command = cmdMatch[1].toLowerCase();
          const args = cmdMatch[2];

          if (command === 'clear') {
            // Clear display
            displayBuffer.line1 = '                ';
            displayBuffer.line2 = '                ';
            cursorRow = 0;
            cursorCol = 0;
            console.log('📺 LCD: clear()');
          }
          else if (command === 'setcursor') {
            // Parse setCursor(col, row)
            const setCursorArgs = args.split(',').map(a => a.trim());
            if (setCursorArgs.length >= 2) {
              cursorCol = parseInt(setCursorArgs[0]) || 0;
              cursorRow = parseInt(setCursorArgs[1]) || 0;
              // Clamp to valid range
              cursorRow = Math.max(0, Math.min(1, cursorRow));
              cursorCol = Math.max(0, Math.min(15, cursorCol));
              console.log(`📺 LCD: setCursor(${cursorCol}, ${cursorRow})`);
            }
          }
          else if (command === 'print' || command === 'println') {
            // Extract text from quotes
            const textMatch = args.match(/["']([^"']*)["']/);
            if (textMatch) {
              const text = textMatch[1];
              console.log(`📺 LCD: print("${text}") at row=${cursorRow}, col=${cursorCol}`);

              // Write text to current cursor position
              if (cursorRow === 0) {
                // Ensure line1 is at least 16 characters with spaces
                displayBuffer.line1 = displayBuffer.line1.padEnd(16, ' ');

                // Insert text at cursor position
                const before = displayBuffer.line1.substring(0, cursorCol);
                const after = displayBuffer.line1.substring(cursorCol + text.length);
                displayBuffer.line1 = (before + text + after).substring(0, 16);
                cursorCol += text.length;
              } else if (cursorRow === 1) {
                // Ensure line2 is at least 16 characters with spaces
                displayBuffer.line2 = displayBuffer.line2.padEnd(16, ' ');

                // Insert text at cursor position
                const before = displayBuffer.line2.substring(0, cursorCol);
                const after = displayBuffer.line2.substring(cursorCol + text.length);
                displayBuffer.line2 = (before + text + after).substring(0, 16);
                cursorCol += text.length;
              }

              // Handle println - move to next line
              if (command === 'println') {
                cursorRow++;
                cursorCol = 0;
              }

              // Clamp cursor position
              if (cursorCol >= 16) {
                cursorCol = 0;
                cursorRow++;
              }
              if (cursorRow >= 2) {
                cursorRow = 0;
              }
            }
          }
        }

        // Trim trailing spaces for cleaner display
        lcdText = {
          line1: displayBuffer.line1,
          line2: displayBuffer.line2
        };

        console.log('📺 LCD Final Display:');
        console.log(`   Line 1: "${lcdText.line1}"`);
        console.log(`   Line 2: "${lcdText.line2}"`);
      }


      // Parse Serial functions
      const serialRegex = /Serial\.(?:print|println)\s*\(\s*"([^"]*)"\s*\)/gi;
      while ((match = serialRegex.exec(code)) !== null) {
        serialOutput.push(match[1]);
        console.log(`Serial output: ${match[1]}`);
      }

      // Parse pulseIn function (for ultrasonic)
      const pulseInRegex = /pulseIn\s*\(\s*([A-Za-z]?\d+)\s*,\s*HIGH\s*\)/gi;
      while ((match = pulseInRegex.exec(code)) !== null) {
        const pin = match[1];
        pinStates[pin] = 1; // Simulate HIGH state during pulseIn
        console.log(`pulseIn: Pin ${pin} detected`);
      }

      // Parse tone() function for buzzer
      const toneRegex = /tone\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/gi;
      while ((match = toneRegex.exec(code)) !== null) {
        const pin = match[1];
        const frequency = match[2];
        pinStates[pin] = 1; // Buzzer active (represented as 1)
        console.log(`tone: Pin ${pin} at ${frequency}Hz`);
      }

      // Parse delay
      const delayRegex = /delay\s*\(\s*(\d+)\s*\)/gi;
      const delays: number[] = [];
      while ((match = delayRegex.exec(code)) !== null) {
        delays.push(parseInt(match[1]));
      }
      const delayMs = delays.length > 0 ? Math.min(...delays) : 1000;

      // Parse sensor reading simulation values
      const sensorValues: Record<string, number> = {};

      // DHT sensor simulation
      if (
        code.includes("dht.readTemperature") ||
        code.includes("dht.readHumidity")
      ) {
        sensorValues["temperature"] = 25.5; // Default temp
        sensorValues["humidity"] = 60; // Default humidity
        console.log("DHT sensor functions detected");
      }

      // Ultrasonic sensor simulation
      if (
        code.includes("pulseIn") ||
        code.includes("TRIG") ||
        code.includes("ECHO")
      ) {
        sensorValues["distance"] = Math.random() * 200 + 10; // Random distance 10-210cm
        console.log("Ultrasonic sensor detected");
      }

      // PIR sensor simulation
      if (code.includes("pir") || code.includes("motion")) {
        sensorValues["motion"] = Math.random() > 0.7 ? 1 : 0; // Random motion detection
        console.log("PIR sensor detected");
      }

      // UNIVERSAL BLINKING DETECTION - Works for ANY pin and ANY delay
      const hasBlinking =
        code.includes("delay") &&
        (code.includes("digitalWrite") || code.includes("analogWrite")) &&
        delays.length > 0;

      console.log(`🔍 Blinking detection:`, {
        hasDelay: code.includes("delay"),
        hasDigitalWrite: code.includes("digitalWrite"),
        hasAnalogWrite: code.includes("analogWrite"),
        delaysFound: delays.length,
        hasBlinking,
      });

      // UNIVERSAL: Initialize blinking for ALL pins (0-13) that are used in code
      if (hasBlinking) {
        const initialBlinkState: Record<string, boolean> = {};

        // Initialize ALL pins that are mentioned in the Arduino code (direct OR via variables)
        for (let pin = 0; pin <= 13; pin++) {
          const pinStr = pin.toString();

          // Check direct pin usage
          let pinUsedInCode =
            code.includes(`pinMode(${pin},`) ||
            code.includes(`digitalWrite(${pin},`) ||
            code.includes(`analogWrite(${pin},`) ||
            code.includes(`digitalRead(${pin})`) ||
            code.includes(`analogRead(${pin})`);

          // Also check if any variable maps to this pin
          if (!pinUsedInCode) {
            const varsForPin = Object.entries(pinVariableMap)
              .filter(([_, pinNum]) => pinNum === pinStr)
              .map(([varName]) => varName);

            for (const varName of varsForPin) {
              if (code.includes(`pinMode(${varName},`) ||
                code.includes(`digitalWrite(${varName},`) ||
                code.includes(`analogWrite(${varName},`)) {
                pinUsedInCode = true;
                break;
              }
            }
          }

          if (pinUsedInCode) {
            // Start with HIGH state if digitalWrite HIGH is in code (direct or variable)
            let startsHigh =
              code.includes(`digitalWrite(${pin}, HIGH)`) ||
              code.includes(`digitalWrite(${pin},HIGH)`);

            // Check variables too
            if (!startsHigh) {
              const varsForPin = Object.entries(pinVariableMap)
                .filter(([_, pinNum]) => pinNum === pinStr)
                .map(([varName]) => varName);

              for (const varName of varsForPin) {
                if (code.includes(`digitalWrite(${varName}, HIGH)`) ||
                  code.includes(`digitalWrite(${varName},HIGH)`)) {
                  startsHigh = true;
                  break;
                }
              }
            }

            initialBlinkState[pinStr] = startsHigh;
            console.log(
              `🔧 Pin ${pin} initialized for blinking: ${initialBlinkState[pinStr] ? "HIGH" : "LOW"}`,
            );
          }
        }

        setCurrentBlinkState(initialBlinkState);
        console.log(
          `🔄 Real-time blinking enabled for pins:`,
          Object.keys(initialBlinkState),
          `with delay: ${delays[0]}ms`,
        );
      }

      // Comprehensive compiled code object
      const compiled = {
        pinStates,
        pinModes,
        analogValues,
        servoPositions,
        sensorValues,
        serialOutput,
        delays,
        delayMs,
        hasBlinking,
        code: code,
        timestamp: Date.now(),
        hasLCD,
        lcdText,  // ← LCD text content parsed from lcd.print()
        pinVariableMap,  // NEW: Variable-to-pin mapping for validation
        functionTypes: {
          digital: Object.keys(pinStates).length,
          analog: Object.keys(analogValues).length,
          servo: Object.keys(servoPositions).length,
          sensors: Object.keys(sensorValues).length,
          serial: serialOutput.length,
        },
      };

      setCompiledCode(compiled);
      setIsCodeUploaded(true);

      console.log("Enhanced compilation with pin validation:", compiled);

      // Enhanced success message
      const totalFunctions =
        compiled.functionTypes.digital +
        compiled.functionTypes.analog +
        compiled.functionTypes.servo +
        compiled.functionTypes.sensors;

      if (totalFunctions > 0) {
        const details = [];
        if (compiled.functionTypes.digital > 0)
          details.push(`${compiled.functionTypes.digital} digital`);
        if (compiled.functionTypes.analog > 0)
          details.push(`${compiled.functionTypes.analog} analog`);
        if (compiled.functionTypes.servo > 0)
          details.push(`${compiled.functionTypes.servo} servo`);
        if (compiled.functionTypes.sensors > 0)
          details.push(`${compiled.functionTypes.sensors} sensor`);

        toast.success(`✅ Code compiled! Functions: ${details.join(", ")}`);
      } else {
        toast.success(`✅ Code compiled successfully! Ready to run`);
      }
    } catch (error) {
      console.error("Compilation error:", error);
      toast.error(`❌ Compilation failed: ${error}`);
      setIsCodeUploaded(false);
    }
  };

  // Get pin state for simulation - comprehensive version with LED support
  const getPinState = (componentInstanceId: string): boolean => {
    // Only allow glowing if code is uploaded
    if (!isCodeUploaded) {
      console.log(`❌ Code not uploaded for ${componentInstanceId}`);
      return false;
    }

    if (!isSimulating || !compiledCode.pinStates) {
      console.log(
        `❌ Not simulating or no pin states for ${componentInstanceId}`,
      );
      return false;
    }

    // Find which component this is
    const component = placedComponents.find(
      (c) => c.instanceId === componentInstanceId,
    );
    if (!component) {
      console.log(`❌ Component not found: ${componentInstanceId}`);
      return false;
    }

    // NEVER let Arduino board glow - only components connected to it
    if (component.id.includes("arduino")) {
      console.log(`🚫 Arduino board should not glow: ${component.name}`);
      return false;
    }

    console.log(
      `🔍 Checking pin state for ${component.name} (${componentInstanceId})`,
    );

    // Find all wires connected to this component
    const componentWires = wires.filter(
      (wire) =>
        wire.startPinId.startsWith(componentInstanceId) ||
        wire.endPinId.startsWith(componentInstanceId),
    );

    console.log(
      `📡 Component ${component.name} has ${componentWires.length} wires`,
    );
    componentWires.forEach((wire, index) => {
      console.log(`  Wire ${index + 1}: ${wire.startPinId} → ${wire.endPinId}`);
    });
    console.log(`📡 Component ${component.name} has ${componentWires.length} wires`);
    componentWires.forEach((wire, index) => {
      console.log(`  Wire ${index + 1}: ${wire.startPinId} → ${wire.endPinId}`);
    });

    // Component-specific logic
    const componentType = component.id.toLowerCase();
    console.log(`🎯 Component type detected: ${componentType}`);

    // SMART PIN VALIDATION SYSTEM - Trace through circuit to find active pins
    if (
      componentType.includes("led") ||
      componentType.includes("buzzer") ||
      componentType.includes("motor") ||
      componentType.includes("servo")
    ) {
      console.log(
        `🔍 Component detected: ${componentType}, Instance: ${componentInstanceId}`,
      );

      // ═══════════════════════════════════════════════════════════════════
      // NEW: Trace through ENTIRE circuit path to find ALL Arduino pins
      // ═══════════════════════════════════════════════════════════════════
      const allArduinoPins: string[] = [];
      const visited = new Set<string>();
      const queue = [componentInstanceId];

      while (queue.length > 0) {
        const currentCompId = queue.shift()!;
        if (visited.has(currentCompId)) continue;
        visited.add(currentCompId);

        // Find all wires connected to current component/resistor/etc
        const connectedWires = wires.filter(wire =>
          wire.startPinId.startsWith(currentCompId) ||
          wire.endPinId.startsWith(currentCompId)
        );

        for (const wire of connectedWires) {
          // Check if this wire connects to Arduino
          const arduinoPinId = wire.startPinId.includes("arduino-uno")
            ? wire.startPinId
            : wire.endPinId.includes("arduino-uno")
              ? wire.endPinId
              : null;

          if (arduinoPinId) {
            const pin = extractArduinoPinNumber(arduinoPinId);
            if (pin && !allArduinoPins.includes(pin)) {
              allArduinoPins.push(pin);
            }
          } else {
            // Wire connects to another component - trace through it
            const otherCompId = wire.startPinId.startsWith(currentCompId)
              ? wire.endPinId.split("-")[0]
              : wire.startPinId.split("-")[0];

            if (!visited.has(otherCompId) && otherCompId !== componentInstanceId) {
              queue.push(otherCompId);
            }
          }
        }
      }

      console.log(`📡 ${component.name} connects to Arduino pins: ${allArduinoPins.join(", ")}`);

      if (allArduinoPins.length === 0) {
        console.log(`❌ No Arduino connection found`);
        return false;
      }

      // Find SIGNAL pins (D0-D13, A0-A5) - ignore GND/VCC
      const signalPins = allArduinoPins.filter(pin => {
        const num = parseInt(pin);
        if (!isNaN(num) && num >= 0 && num <= 13) return true;
        if (pin.match(/^A[0-5]$/)) return true;
        return false;
      });

      console.log(`🎯 Signal pins: ${signalPins.join(", ")}`);

      // Check if ANY of the signal pins are active in the code
      for (const circuitPin of signalPins) {
        console.log(`🔍 Checking if pin ${circuitPin} is active in code...`);

        // Check if code uses this pin (direct or variable)
        let codeUsesThisPin = false;

        // Direct usage
        if (compiledCode.code &&
          (compiledCode.code.includes(`pinMode(${circuitPin},`) ||
            compiledCode.code.includes(`digitalWrite(${circuitPin},`) ||
            compiledCode.code.includes(`analogWrite(${circuitPin},`))) {
          console.log(`  ✅ Direct usage found for pin ${circuitPin}`);
          codeUsesThisPin = true;
        }

        // Variable usage
        if (!codeUsesThisPin && compiledCode.pinVariableMap) {
          const varsForPin = Object.entries(compiledCode.pinVariableMap)
            .filter(([_, pinNum]) => pinNum === circuitPin)
            .map(([varName]) => varName);

          for (const varName of varsForPin) {
            if (compiledCode.code &&
              (compiledCode.code.includes(`pinMode(${varName},`) ||
                compiledCode.code.includes(`digitalWrite(${varName},`) ||
                compiledCode.code.includes(`analogWrite(${varName},`))) {
              console.log(`  ✅ Variable "${varName}" usage found for pin ${circuitPin}`);
              codeUsesThisPin = true;
              break;
            }
          }
        }

        // Pin state check
        if (!codeUsesThisPin) {
          if (compiledCode.pinStates && compiledCode.pinStates[circuitPin]) {
            console.log(`  ✅ Pin ${circuitPin} found in pinStates`);
            codeUsesThisPin = true;
          }
        }

        if (codeUsesThisPin) {
          console.log(`✅ PIN MATCH FOUND! Pin ${circuitPin} is used in code`);

          // NOW CHECK IF PIN IS ACTIVE (HIGH)

          // Priority 1: Blinking
          if (compiledCode.hasBlinking && currentBlinkState[circuitPin] !== undefined) {
            const isBlinking = currentBlinkState[circuitPin];
            console.log(`🔄 Pin ${circuitPin} BLINKING: ${isBlinking ? "HIGH" : "LOW"}`);
            return isBlinking;
          }

          // Priority 2: digitalWrite HIGH
          if (compiledCode.code &&
            (compiledCode.code.includes(`digitalWrite(${circuitPin}, HIGH)`) ||
              compiledCode.code.includes(`digitalWrite(${circuitPin},HIGH)`))) {
            console.log(`✅ digitalWrite(${circuitPin}, HIGH) - LED GLOWS!`);
            return true;
          }

          // Priority 3: Variable digitalWrite HIGH
          if (compiledCode.pinVariableMap) {
            const varsForPin = Object.entries(compiledCode.pinVariableMap)
              .filter(([_, pinNum]) => pinNum === circuitPin)
              .map(([varName]) => varName);

            for (const varName of varsForPin) {
              if (compiledCode.code &&
                (compiledCode.code.includes(`digitalWrite(${varName}, HIGH)`) ||
                  compiledCode.code.includes(`digitalWrite(${varName},HIGH)`))) {
                console.log(`✅ digitalWrite(${varName}, HIGH) - LED GLOWS!`);
                return true;
              }
            }
          }

          // Priority 4: Pin states
          if (compiledCode.pinStates && compiledCode.pinStates[circuitPin]) {
            console.log(`✅ pinStates[${circuitPin}] = HIGH - LED GLOWS!`);
            return true;
          }

          // Priority 5: analogWrite
          if (compiledCode.analogValues && compiledCode.analogValues[circuitPin] > 0) {
            console.log(`✅ analogWrite(${circuitPin}, ${compiledCode.analogValues[circuitPin]}) - LED GLOWS!`);
            return true;
          }
        }
      }

      console.log(`❌ No active signal pins found for ${component.name}`);
      return false;
    }

    // Servos
    if (componentType.includes("servo")) {
      for (const wire of componentWires) {
        const arduinoPin = wire.startPinId.includes("arduino-uno")
          ? wire.startPinId.split("-").pop()
          : wire.endPinId.includes("arduino-uno")
            ? wire.endPinId.split("-").pop()
            : null;

        if (arduinoPin) {
          const pinNumber = arduinoPin.replace(/[^0-9]/g, "");
          if (
            compiledCode.servoPositions &&
            compiledCode.servoPositions[pinNumber] !== undefined
          ) {
            return true;
          }
        }
      }
    }

    // Displays
    if (
      componentType.includes("lcd") ||
      componentType.includes("oled") ||
      componentType.includes("display")
    ) {
      return !!(compiledCode.hasLCD || compiledCode.serialOutput?.length);
    }

    // Sensors - simple activity simulation
    if (
      componentType.includes("sensor") ||
      componentType.includes("dht") ||
      componentType.includes("ultrasonic")
    ) {
      return !!(
        compiledCode.sensorValues &&
        Object.keys(compiledCode.sensorValues).length > 0
      );
    }

    console.log(
      `❌ No active state found for ${component.name} (${componentType})`,
      {
        componentWires: componentWires.length,
        pinStates: compiledCode.pinStates,
        isSimulating,
        isCodeUploaded,
      },
    );
    return false;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Controls */}
      <header className="border-b bg-card px-6 py-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold mr-4">Arduino Light Lab</h1>
        <Button
          size="icon"
          variant={isSimulating ? "destructive" : "default"}
          className="h-12 w-12 rounded-full"
          onClick={toggleSimulation}
          title={isSimulating ? "Stop Simulation" : "Start Simulation"}
        >
          <Play
            className="h-5 w-5"
            fill={isSimulating ? "currentColor" : "none"}
          />
        </Button>
        <Button
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={() => setShowLibrary(!showLibrary)}
          title="Component Library"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full"
          onClick={() => setShowLibraryManager(true)}
          title="Arduino Libraries"
        >
          <Library className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full"
          onClick={clearAllWires}
          title="Clear all wires"
        >
          <Trash2 className="h-5 w-5" />
        </Button>

        {/* TEST LED GLOW BUTTON */}
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full bg-red-500 hover:bg-red-600 text-white"
          onClick={() => {
            console.log("🧪 TESTING LED GLOW - Forcing all LEDs to glow");
            // Force all LED components to show glow
            setPlacedComponents((prev) =>
              prev.map((comp) =>
                comp.id.includes("led")
                  ? {
                    ...comp,
                    props: { ...comp.props, forceGlow: true, testMode: true },
                  }
                  : comp,
              ),
            );
            setForceUpdate((prev) => prev + 1);
            toast.success("🧪 LED Test Mode ON - All LEDs should glow!", {
              duration: 3000,
            });
          }}
          title="Test LED Glow"
        >
          💡
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full"
          onClick={clearCanvas}
          title="Clear canvas"
        >
          <RotateCw className="h-5 w-5" />
        </Button>
        {/* Code Editor Button */}
        <Button
          size="icon"
          variant={showCodeEditor ? "default" : "secondary"}
          className="h-12 w-12 rounded-full"
          onClick={() => setShowCodeEditor(!showCodeEditor)}
          title="Code Editor"
        >
          <Code className="h-5 w-5" />
        </Button>

        {/* 🧪 TEST BUTTON - Direct Upload */}
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white border-2 border-yellow-300"
          onClick={() => {
            const testCode = `void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n}\n\nvoid loop() {\n}\n`;
            console.log('🧪 TEST BUTTON: Uploading hardcoded code...');
            console.log('Code:', testCode);
            handleUploadCode(testCode);
          }}
          title="🧪 TEST: Upload LED On Code"
        >
          <span className="text-xl font-bold">🧪</span>
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full"
          onClick={handleSaveProject}
          title="Save Project"
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-12 w-12 rounded-full"
          onClick={toggleProjectsMenu}
          title="My Projects"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Components: {placedComponents.length}
          </span>
          <span className="text-sm text-muted-foreground">
            Wires: {wires.length}
          </span>
          {drawingWire && (
            <span className="text-sm text-accent font-medium animate-pulse">
              Click on a pin to connect wire...
            </span>
          )}
        </div>
      </header>

      {/* Projects Menu Dropdown */}
      {showProjectsMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProjectsMenu(false)}
        >
          <div
            className="absolute top-16 right-4 bg-white border border-gray-300 rounded-lg shadow-2xl p-4 z-50 w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-bold text-lg">📂 My Projects</h3>
              <button
                onClick={() => setShowProjectsMenu(false)}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">No saved projects</p>
                <p className="text-sm text-gray-400">
                  Click the Download button to save your first project
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {savedProjects
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map(project => (
                    <div
                      key={project.id}
                      className="flex items-start justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div
                        onClick={() => handleLoadProject(project.id)}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium text-gray-900">{project.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(project.updatedAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {project.components?.length || 0} components, {project.wires?.length || 0} wires
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        className="ml-3 p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t text-xs text-gray-500 text-center">
              {savedProjects.length} project{savedProjects.length !== 1 ? 's' : ''} saved
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="relative">
        <div
          ref={canvasRef}
          className={`min-h-[calc(100vh-73px)] p-8 relative overflow-auto ${isDragOver ? "border-2 border-dashed border-primary" : ""}`}
          style={{ backgroundColor: "hsl(var(--canvas-bg))" }}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Render all placed components */}
          {placedComponents.map((component) => (
            <div
              key={`${component.instanceId}-${forceUpdate}`}
              onDoubleClick={() => handleWaterChamberDoubleClick(component)}
            >
              <UniversalComponent
                component={component}
                isSimulating={isSimulating}
                isDraggable={true}
                onDragStart={handleComponentDragStart}
                onDragEnd={handleComponentDragEnd}
                pinState={
                  isSimulating
                    ? (() => {
                      const state = getPinState(component.instanceId);
                      console.log(
                        `🔍 Component ${component.name} pinState = ${state}`,
                      );
                      // TEST MODE: Check if LED is in test mode
                      if (
                        component.id.includes("led") &&
                        component.props?.testMode
                      ) {
                        console.log(
                          `🧪 TEST MODE: LED ${component.name} forced to glow`,
                        );
                        return true;
                      }
                      return state;
                    })()
                    : false
                }
              />

              {/* Delete button for components */}
              {!isSimulating && (
                <button
                  className="absolute top-0 right-0 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center z-50 cursor-pointer"
                  style={{
                    transform: "translate(50%, -50%)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeComponent(component.instanceId);
                  }}
                  title={`Delete ${component.name}`}
                >
                  ✕
                </button>
              )}

              {/* INVISIBLE pin hit-areas - only highlight on hover/click */}
              {component.pins.map((pin) => {
                const absolutePos = getAbsolutePinPosition(component, pin.id);
                if (!absolutePos) return null;

                const pinFullId = `${component.instanceId}-${pin.id}`;
                const isActivePin = drawingWire?.startPinId === pinFullId;

                // Check if this pin has a wire connected
                const hasWire = wires.some(
                  wire => wire.startPinId === pinFullId || wire.endPinId === pinFullId
                );

                return (
                  <div
                    key={pinFullId}
                    className="absolute z-20 group"
                    style={{
                      left: `${absolutePos.x - 6}px`,
                      top: `${absolutePos.y - 6}px`,
                      width: "12px",
                      height: "12px",
                    }}
                  >
                    {/* Invisible hit-area - ONLY shows on hover/active/connected */}
                    <div
                      className={`absolute inset-0 rounded-full cursor-crosshair transition-all ${isActivePin
                        ? "bg-green-500 scale-150 shadow-lg ring-2 ring-green-300"
                        : hasWire
                          ? "bg-blue-500 scale-110"
                          : "bg-green-400 group-hover:scale-125"
                        }`}
                      style={{
                        boxShadow: isActivePin
                          ? "0 0 12px rgba(34, 197, 94, 0.9)"
                          : hasWire
                            ? "0 0 6px rgba(59, 130, 246, 0.7)"
                            : "none",
                        // INVISIBLE by default, only visible on hover/active/connected
                        opacity: isActivePin ? 1 : hasWire ? 1 : 0,
                      }}
                      onMouseEnter={(e) => {
                        // Make visible on hover
                        e.currentTarget.style.opacity = "0.7";
                      }}
                      onMouseLeave={(e) => {
                        // Hide when not hovering (unless active or has wire)
                        if (!isActivePin && !hasWire) {
                          e.currentTarget.style.opacity = "0";
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePinClick(component, pin.id, pin.x, pin.y);
                      }}
                      title={`${pin.label}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {/* WOKWI-STYLE DEBUG PANEL - Real-time pin monitoring */}
          {isSimulating && (
            <div className="fixed top-4 right-4 bg-white/95 border-2 border-blue-200 rounded-lg shadow-2xl z-50 min-w-[300px] max-w-[400px] max-h-[80vh] flex flex-col">
              {/* Header - Fixed */}
              <div className="flex items-center gap-2 p-4 border-b border-blue-100">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <h3 className="text-lg font-bold text-blue-700">
                  🔍 Live Monitor
                </h3>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto overflow-x-hidden p-4" style={{ maxHeight: 'calc(80vh - 64px)' }}>
                {/* Pin States Section */}
                <div className="space-y-3">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="font-semibold text-blue-800 mb-2">
                      📍 Arduino Pins:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: 14 }, (_, i) => {
                        const pin = i.toString();

                        // Check blinking state first, then static states
                        const isBlinking = currentBlinkState[pin];
                        const isStaticActive =
                          compiledCode.pinStates?.[pin] ||
                          (compiledCode.analogValues?.[pin] || 0) > 0;
                        const isActive =
                          isBlinking !== undefined ? isBlinking : isStaticActive;

                        // Check direct pin usage OR variable usage
                        let isUsed =
                          compiledCode.code?.includes(`pinMode(${pin},`) ||
                          compiledCode.code?.includes(`digitalWrite(${pin},`) ||
                          compiledCode.code?.includes(`analogWrite(${pin},`) ||
                          compiledCode.code?.includes(`digitalRead(${pin})`) ||
                          compiledCode.code?.includes(`analogRead(${pin})`);

                        // Also check if any variable maps to this pin
                        if (!isUsed && compiledCode.pinVariableMap) {
                          const varsForPin = Object.entries(compiledCode.pinVariableMap)
                            .filter(([_, pinNum]) => pinNum === pin)
                            .map(([varName]) => varName);

                          for (const varName of varsForPin) {
                            if (compiledCode.code &&
                              (compiledCode.code.includes(`pinMode(${varName},`) ||
                                compiledCode.code.includes(`digitalWrite(${varName},`) ||
                                compiledCode.code.includes(`analogWrite(${varName},`))) {
                              isUsed = true;
                              break;
                            }
                          }
                        }

                        return isUsed ? (
                          <div
                            key={pin}
                            className="flex items-center justify-between bg-white p-2 rounded border"
                          >
                            <span className="font-mono text-sm">Pin {pin}:</span>
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-3 h-3 rounded-full ${isActive
                                  ? "bg-red-500 animate-pulse shadow-lg"
                                  : "bg-gray-300"
                                  }`}
                              ></div>
                              <span
                                className={`text-xs font-bold ${isActive ? "text-red-600" : "text-gray-500"
                                  }`}
                              >
                                {isActive ? "HIGH" : "LOW"}
                                {currentBlinkState[pin] !== undefined && (
                                  <span className="text-xs text-blue-500 ml-1">
                                    ⚡
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* Components Status */}
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="font-semibold text-green-800 mb-2">
                      💡 Components:
                    </div>
                    <div className="space-y-2">
                      {placedComponents
                        .filter((c) => !c.id.includes("arduino"))
                        .map((comp) => {
                          const pinState = getPinState(comp.instanceId);
                          const connectedWires = wires.filter(
                            (w) =>
                              w.startPinId.startsWith(comp.instanceId) ||
                              w.endPinId.startsWith(comp.instanceId),
                          );

                          // Find ALL Arduino connections and prioritize signal pins over GND/power
                          const arduinoWires = connectedWires.filter(
                            (w) =>
                              w.startPinId.includes("arduino-uno") ||
                              w.endPinId.includes("arduino-uno"),
                          );

                          // Extract pin numbers from all Arduino wires
                          const arduinoPins = arduinoWires.map(w => ({
                            wire: w,
                            pin: extractArduinoPinNumber(
                              w.startPinId.includes("arduino-uno")
                                ? w.startPinId
                                : w.endPinId
                            )
                          })).filter(p => p.pin !== null);

                          // Prioritize signal pins (digital/analog) over power/ground
                          const prioritizedPin = arduinoPins.find(p => {
                            const pin = p.pin!;
                            // Signal pins: numbers or A0-A5
                            return /^\d+$/.test(pin) || /^A\d+$/.test(pin);
                          }) || arduinoPins[0]; // Fallback to first pin if no signal pin

                          const arduinoPin = prioritizedPin?.pin || null;

                          return (
                            <div
                              key={comp.instanceId}
                              className="flex items-center justify-between bg-white p-2 rounded border"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded-full ${pinState
                                    ? "bg-red-500 animate-pulse shadow-lg"
                                    : "bg-gray-300"
                                    }`}
                                ></div>
                                <span className="text-sm font-medium">
                                  {comp.name}
                                </span>
                                {arduinoPin && (
                                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                    Pin {arduinoPin}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <div
                                  className={`text-xs font-bold ${pinState ? "text-green-600" : "text-gray-500"
                                    }`}
                                >
                                  {pinState ? "🔴 ON" : "⚫ OFF"}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {connectedWires.length} wire
                                  {connectedWires.length !== 1 ? "s" : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Code Status */}
                  {compiledCode.code && (
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <div className="font-semibold text-purple-800 mb-2">
                        ⚡ Simulation:
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Delay:</span>
                          <span className="font-mono text-purple-600">
                            {compiledCode.delays && compiledCode.delays.length > 0
                              ? compiledCode.delays[0]
                              : compiledCode.delayMs || 1000}
                            ms
                          </span>
                        </div>
                        {compiledCode.delays &&
                          compiledCode.delays.length > 1 && (
                            <div className="flex justify-between">
                              <span>All Delays:</span>
                              <span className="font-mono text-purple-600 text-xs">
                                {compiledCode.delays.join(", ")}ms
                              </span>
                            </div>
                          )}
                        <div className="flex justify-between">
                          <span>Blinking:</span>
                          <span
                            className={`font-bold ${compiledCode.hasBlinking
                              ? "text-green-600"
                              : "text-gray-500"
                              }`}
                          >
                            {compiledCode.hasBlinking ? "🔄 Yes" : "❌ No"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Active Pins:</span>
                          <span className="font-mono text-blue-600">
                            {Object.keys(compiledCode.pinStates || {}).length}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pin Connection Registry - NEW! */}
                  <div className="bg-orange-50 p-3 rounded-lg border-2 border-orange-200">
                    <div className="font-semibold text-orange-800 mb-2">
                      🔌 Pin Connection Registry:
                    </div>
                    <div className="text-xs text-orange-700 mb-2">
                      {pinConnections.length} component{pinConnections.length !== 1 ? 's' : ''} connected
                    </div>
                    {pinConnections.length > 0 ? (
                      <div className="space-y-1">
                        {pinConnections.map((conn, index) => (
                          <div
                            key={conn.wireId}
                            className="bg-white p-2 rounded border border-orange-200 text-xs"
                          >
                            <span className="font-mono text-orange-900">
                              {conn.componentName} → Pin {conn.arduinoPin}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic">
                        No components connected to Arduino pins
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      ℹ️ This data is logged to console for backend storage
                    </div>
                  </div>
                </div>
              </div>
              {/* End scrollable content */}
            </div>
          )}

          {/* Water Chamber Turbidity Editor Panel */}
          {editingWaterChamber && (() => {
            const waterChamber = placedComponents.find(c => c.instanceId === editingWaterChamber);
            if (!waterChamber) return null;

            // Get turbidity quality label
            const getTurbidityLabel = (turbidity: number) => {
              if (turbidity <= 100) return { text: "Pure Water", color: "text-blue-600" };
              if (turbidity <= 300) return { text: "Slightly Turbid", color: "text-green-600" };
              if (turbidity <= 600) return { text: "Turbid", color: "text-yellow-600" };
              if (turbidity <= 900) return { text: "Very Turbid", color: "text-orange-600" };
              return { text: "Dirty Water", color: "text-red-600" };
            };

            const label = getTurbidityLabel(waterChamberTurbidity);

            return (
              <>
                {/* Backdrop - click to close */}
                <div
                  className="absolute inset-0 bg-black bg-opacity-10 z-[2000]"
                  onClick={closeWaterChamberEditor}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeWaterChamberEditor();
                  }}
                  tabIndex={0}
                />

                {/* Editing Panel */}
                <div
                  className="absolute bg-gray-800 text-white rounded-lg shadow-2xl p-4 z-[2001]"
                  style={{
                    left: `${waterChamber.x + waterChamber.width / 2}px`,
                    top: `${waterChamber.y - 120}px`,
                    transform: 'translateX(-50%)',
                    minWidth: '400px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      💧 Editing Water Chamber
                    </h3>
                    <button
                      onClick={closeWaterChamberEditor}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Turbidity Label */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Turbidity:</span>
                      <span className={`font-bold text-lg ${label.color}`}>
                        {label.text}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 text-right">
                      {waterChamberTurbidity.toFixed(0)} NTU
                    </div>
                  </div>

                  {/* Slider */}
                  <div className="mb-2">
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="10"
                      value={waterChamberTurbidity}
                      onChange={(e) => handleTurbidityChange(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gradient-to-r from-blue-500 via-yellow-500 to-red-600 rounded-lg appearance-none cursor-pointer"
                      style={{
                        accentColor: '#3b82f6',
                      }}
                    />
                  </div>

                  {/* Scale Labels */}
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0 NTU<br />(Pure)</span>
                    <span className="text-center">500 NTU<br />(Medium)</span>
                    <span className="text-right">1000 NTU<br />(Dirty)</span>
                  </div>

                  {/* Instructions */}
                  <div className="mt-3 pt-3 border-t border-gray-600 text-xs text-gray-400">
                    💡 Tip: Adjust the slider to change water turbidity. Connected sensors will reflect this change.
                  </div>
                </div>
              </>
            );
          })()}

          {/* Wire SVG Layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%", zIndex: 1000 }}
          >
            {/* Existing wires - MANUAL ROUTING with waypoints */}
            {wires.map((wire) => {
              const endpoints = getWireEndpoints(wire);
              if (!endpoints) return null; // Skip if components are missing

              // Use waypoint-based path if waypoints exist, otherwise use Manhattan routing
              const wirePath = (wire.waypoints && wire.waypoints.length > 0)
                ? createWaypointPath(wire)  // Manual routing with user-placed waypoints
                : createManhattanPath(wire); // Fallback to auto-routing for old wires

              return (
                <g key={wire.id} className="pointer-events-auto">
                  <path
                    d={wirePath}
                    stroke="#00c853"    // Green color for all wires
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    className="cursor-pointer hover:stroke-red-500 transition-all duration-200"
                    onClick={(e) => {
                      if (!isSimulating) {
                        e.stopPropagation();
                        removeWire(wire.id);
                      }
                    }}
                  />

                  {/* Delete button for wire (only when not simulating) */}
                  {!isSimulating && endpoints && (
                    <circle
                      cx={(endpoints.startX + endpoints.endX) / 2}
                      cy={(endpoints.startY + endpoints.endY) / 2}
                      r="8"
                      fill="red"
                      className="cursor-pointer hover:fill-red-600 transition-all opacity-0 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWire(wire.id);
                      }}
                    />
                  )}
                </g>
              );
            })}

            {/* Wire being drawn - shows waypoints */}
            {drawingWire && (
              <path
                d={createPreviewPath()}
                stroke="hsl(var(--accent))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5,5"
                fill="none"
                className="animate-pulse"
              />
            )}
          </svg>
          {/* Empty state message */}
          {placedComponents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4">🔌</div>
                <h2 className="text-2xl font-semibold mb-2">
                  Start Building Your Circuit
                </h2>
                <p className="text-muted-foreground mb-4">
                  Click the + button to add components from the library
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => setShowLibrary(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Open Component Library
                  </Button>
                  <Button onClick={() => setShowLibraryManager(true)} variant="outline">
                    <Library className="h-4 w-4 mr-2" />
                    Libraries
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Component Library Sidebar */}
        {showLibrary && (
          <ComponentLibrary
            onClose={() => setShowLibrary(false)}
            onAddComponent={handleAddComponent}
          />
        )}

        {/* Library Manager Modal */}
        <LibraryManager
          isOpen={showLibraryManager}
          onClose={() => setShowLibraryManager(false)}
        />

        {/* Code Editor Sidebar */}
        {showCodeEditor && (
          <CodeEditor
            value={currentCode}
            onClose={() => setShowCodeEditor(false)}
            onCompile={(code) => {
              setCurrentCode(code);
              handleUploadCode(code);
              toast.success("Code compiled and ready to upload!");
            }}
            onCodeChange={(code) => {
              setCurrentCode(code);
              handleUploadCode(code);
            }}
          />
        )}
      </div>

      {/* Debug Console at bottom */}
      <DebugConsole
        logs={debugLogs}
        isExpanded={consoleExpanded}
        height={consoleHeight}
        onToggle={() => setConsoleExpanded(!consoleExpanded)}
        onHeightChange={setConsoleHeight}
        onClear={() => setDebugLogs([])}
      />
    </div>
  );
};

# 🚨 CRITICAL RUNTIME ISSUES - LCD & SERVO NOT WORKING

## ❌ Problem Statement

**Architecture is correct, but LCD and Servo are NOT working in practice!**

Despite the Wokwi-compliant architecture, the actual simulation is failing because:
1. **LCD is blank** - No text appears
2. **Servo doesn't move** - Motor stays at initial position
3. **Changing AVR8jsWrapper code breaks everything**

---

## 🔍 Root Cause Analysis

### Issue #1: `checkPortChanges()` is called, but observers might not be registered

**Location:** `SimulationCanvas.tsx` line 2362

```typescript
// ✨ CRITICAL: Check for port changes to detect digitalWrite()!
emulator.checkPortChanges();
```

**Problem:** `checkPortChanges()` calls `hal.writePort()`, but the HAL might not be routing to engines correctly.

### Issue #2: LCD/Servo engines might not be receiving pin changes

**Location:** `SimulationCanvas.tsx` lines 2175-2187

```typescript
hal.onPinChange((pin: number, value: 0 | 1) => {
    console.log(`🔌 HAL PIN CHANGE: Pin ${pin} = ${value ? 'HIGH' : 'LOW'}`);
    setCompiledCode(prev => ({
        ...prev,
        pinStates: { ...prev.pinStates, [pin.toString()]: value }
    }));
    getLCDEngine().onPinChange(pin, value, Date.now());
    getUltrasonicEngine().onPinChange(pin, value, Date.now());
    getTurbidityEngine().onPinChange(pin, value, Date.now());
    getServoEngine().onPinChange(pin, value, performance.now());
    // Update servo angles for smooth movement
    getServoEngine().updateServoAngle();
    setForceUpdate(prev => prev + 1);
});
```

**Problem:** This callback is registered, but `hal.writePort()` might not be calling it!

### Issue #3: Timer1 observation might not be working

**Location:** `AVR8jsWrapper.ts` line 218

```typescript
// ✅ Observe Timer1 for Servo (Wokwi style)
this.observeTimer1();
```

**Problem:** `observeTimer1()` is called in `step()`, but the servo might not be receiving events.

---

## 🔧 DIAGNOSTIC STEPS

### Step 1: Check if HAL is routing pin changes

Add this to `HardwareAbstractionLayer.ts`:

```typescript
writePort(port: number, value: number): void {
    console.log(`🔌 HAL.writePort() CALLED: port=${port}, value=0x${value.toString(16)}`);
    
    // Decode which pins changed
    for (let bit = 0; bit < 8; bit++) {
        const pinValue = (value >> bit) & 1;
        const pin = this.portToPin(port, bit);
        console.log(`   Pin ${pin} = ${pinValue}`);
        
        // Call callback
        if (this.pinChangeCallback) {
            this.pinChangeCallback(pin, pinValue as 0 | 1);
        } else {
            console.error(`❌ HAL: No pin change callback registered!`);
        }
    }
}
```

### Step 2: Check if LCD is receiving EN edges

Add this to `LCDEngine.ts` in `onPinChange()`:

```typescript
onPinChange(pin: number, level: 0 | 1, timestamp: number): void {
    console.log(`📺 LCD.onPinChange() CALLED: pin=${pin}, level=${level}`);
    
    // Update pin state
    this.state.pinStates[pin] = level;
    
    // Check if this is the ENABLE pin
    if (pin === this.pins.en) {
        console.log(`   📺 EN pin detected! lastEnState=${this.state.lastEnState}, level=${level}`);
        
        // Detect HIGH → LOW transition (falling edge)
        if (this.state.lastEnState === 1 && level === 0) {
            console.log(`   📺 ✅ EN FALLING EDGE DETECTED! Latching data...`);
            this.latchData();
        }
        this.state.lastEnState = level;
    }
}
```

### Step 3: Check if Servo is receiving Timer1 changes

Add this to `ServoEngine.ts` in `setAngleFromTimer1()`:

```typescript
setAngleFromTimer1(instanceId: string, ocr: number, icr: number): void {
    console.log(`🦾 ServoEngine.setAngleFromTimer1() CALLED: instanceId=${instanceId}, ocr=${ocr}, icr=${icr}`);
    
    const servo = this.servos.get(instanceId);
    if (!servo) {
        console.error(`❌ Servo not found: ${instanceId}`);
        return;
    }
    
    // ... rest of method
}
```

---

## 🚨 CRITICAL FIX #1: Ensure HAL Callback is Registered

**Problem:** HAL might not have a callback registered.

**Fix in `SimulationCanvas.tsx`:**

```typescript
// Create Hardware Abstraction Layer
const hal = new HardwareAbstractionLayer();

// ✅ CRITICAL: Register callback BEFORE creating emulator
hal.onPinChange((pin: number, value: 0 | 1) => {
    console.log(`🔌 HAL PIN CHANGE: Pin ${pin} = ${value ? 'HIGH' : 'LOW'}`);
    
    // Route to all engines
    getLCDEngine().onPinChange(pin, value, Date.now());
    getServoEngine().onPinChange(pin, value, performance.now());
    getUltrasonicEngine().onPinChange(pin, value, Date.now());
    getTurbidityEngine().onPinChange(pin, value, Date.now());
    
    // Update UI
    setForceUpdate(prev => prev + 1);
});

// NOW create emulator with HAL
const emulator = new AVR8jsWrapper(hal);
```

---

## 🚨 CRITICAL FIX #2: Ensure LCD is Registered BEFORE Emulator Starts

**Problem:** LCD might not be registered when Arduino code runs `lcd.begin()`.

**Fix in `SimulationCanvas.tsx`:**

```typescript
// ✅ Register LCD BEFORE starting emulator
console.log('📺 Registering LCD components...');
registerLCDComponents();

// ✅ Reset LCD for clean state
console.log('📺 Resetting LCD engine...');
getLCDEngine().resetAll();

// NOW start emulator
emulator.start();
startAVR8jsLoop(emulator);
```

---

## 🚨 CRITICAL FIX #3: Ensure Servo Listeners are Registered

**Problem:** Servo might be updating angle, but UI isn't listening.

**Fix in `ServoComponent.tsx` (or wherever servo is rendered):**

```typescript
useEffect(() => {
    const servoEngine = getServoEngine();
    
    // ✅ Register listener
    const handleAngleChange = (id: string, angle: number) => {
        if (id === instanceId) {
            console.log(`🦾 Servo ${id} angle changed: ${angle}°`);
            setAngle(angle);
        }
    };
    
    servoEngine.onChange(handleAngleChange);
    
    console.log(`✅ Servo listener registered for ${instanceId}`);
    
    // Cleanup
    return () => {
        // Note: ServoEngine doesn't have removeListener yet
        // You might need to add this
    };
}, [instanceId]);
```

---

## 🚨 CRITICAL FIX #4: Check if `observeTimer1()` is Actually Running

**Problem:** `observeTimer1()` might not be detecting Timer1 changes.

**Add debug logs in `AVR8jsWrapper.ts`:**

```typescript
private observeTimer1(): void {
    const icr1 = (this.cpu.data[this.ICR1L] | (this.cpu.data[this.ICR1H] << 8));
    const ocr1a = (this.cpu.data[this.OCR1AL] | (this.cpu.data[this.OCR1AH] << 8));
    const ocr1b = (this.cpu.data[this.OCR1BL] | (this.cpu.data[this.OCR1BH] << 8));
    
    // ✅ DEBUG: Log Timer1 state every 10000 calls
    if (this.stepDebugCount % 10000 === 0) {
        console.log(`🔍 Timer1 State: ICR1=${icr1}, OCR1A=${ocr1a}, OCR1B=${ocr1b}`);
    }
    
    const servoEngine = getServoEngine();
    
    // ✅ Detect Servo library initialization (ICR1 = 40000)
    if (icr1 === 40000 && !this.timer1Initialized) {
        console.log(`🎛️ ✅ Servo library initialized (ICR1 = ${icr1})`);
        this.timer1Initialized = true;
        
        // ... rest of method
    }
}
```

---

## 🧪 TESTING PROCEDURE

### Test 1: Verify HAL is Working

1. Upload simple blink code:
```cpp
void setup() {
    pinMode(13, OUTPUT);
}

void loop() {
    digitalWrite(13, HIGH);
    delay(1000);
    digitalWrite(13, LOW);
    delay(1000);
}
```

2. Check console for:
```
🔌 HAL.writePort() CALLED: port=0x05, value=0x20
   Pin 13 = 1
🔌 HAL PIN CHANGE: Pin 13 = HIGH
```

3. If you DON'T see these logs → **HAL is broken**

### Test 2: Verify LCD is Working

1. Upload simple LCD code:
```cpp
#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
    lcd.begin(16, 2);
    lcd.print("Hello");
}

void loop() {}
```

2. Check console for:
```
📺 LCD.onPinChange() CALLED: pin=11, level=1
   📺 EN pin detected! lastEnState=0, level=1
📺 LCD.onPinChange() CALLED: pin=11, level=0
   📺 ✅ EN FALLING EDGE DETECTED! Latching data...
📺 LCD Command: 0x48  (ASCII 'H')
```

3. If you DON'T see EN edges → **LCD is not receiving pin changes**

### Test 3: Verify Servo is Working

1. Upload simple servo code:
```cpp
#include <Servo.h>
Servo myServo;

void setup() {
    myServo.attach(9);
    myServo.write(90);
}

void loop() {}
```

2. Check console for:
```
🔍 Timer1 State: ICR1=40000, OCR1A=3000, OCR1B=0
🎛️ ✅ Servo library initialized (ICR1 = 40000)
🦾 ServoEngine.setAngleFromTimer1() CALLED: instanceId=servo_pin9, ocr=3000, icr=40000
🦾 [servo_pin9] Timer1: OCR=3000 → 1500µs → 90.0°
```

3. If you DON'T see Timer1 initialization → **Servo observation is broken**

---

## 📋 CHECKLIST

Before claiming "it works", verify:

- [ ] HAL.writePort() is being called
- [ ] HAL pin change callback is registered
- [ ] LCD.onPinChange() is being called
- [ ] LCD EN edges are detected
- [ ] LCD latchData() is being called
- [ ] ServoEngine.setAngleFromTimer1() is being called
- [ ] Servo angle change events are emitted
- [ ] UI components are listening to servo events
- [ ] Console shows actual pin changes
- [ ] Console shows Timer1 register changes

---

## 🔧 QUICK FIX SCRIPT

Add this to the top of `startAVR8jsLoop()` in `SimulationCanvas.tsx`:

```typescript
const startAVR8jsLoop = (emulator: AVR8jsWrapper) => {
    console.log('🚀 startAVR8jsLoop() CALLED');
    
    // ✅ DIAGNOSTIC: Check if HAL callback is registered
    console.log('🔍 Checking HAL callback...');
    const testHal = new HardwareAbstractionLayer();
    let callbackCalled = false;
    testHal.onPinChange(() => { callbackCalled = true; });
    testHal.writePort(0x05, 0xFF);
    console.log(`   HAL callback ${callbackCalled ? '✅ WORKS' : '❌ BROKEN'}`);
    
    // ✅ DIAGNOSTIC: Check if LCD is registered
    console.log('🔍 Checking LCD registration...');
    const lcdEngine = getLCDEngine();
    const lcdBuffer = lcdEngine.getDisplayBuffer('lcd_1');
    console.log(`   LCD ${lcdBuffer ? '✅ REGISTERED' : '❌ NOT REGISTERED'}`);
    
    // ✅ DIAGNOSTIC: Check if Servo is registered
    console.log('🔍 Checking Servo registration...');
    const servoEngine = getServoEngine();
    const servoState = servoEngine.getServoState('servo_pin9');
    console.log(`   Servo ${servoState ? '✅ REGISTERED' : '❌ NOT REGISTERED'}`);
    
    // ... rest of function
};
```

---

## 🎯 EXPECTED CONSOLE OUTPUT (When Working)

```
🚀 startAVR8jsLoop() CALLED
🔍 Checking HAL callback...
   HAL callback ✅ WORKS
🔍 Checking LCD registration...
   LCD ✅ REGISTERED
🔍 Checking Servo registration...
   Servo ✅ REGISTERED
✅ AVR8.js animation frame loop started
⏱️ AVR8.js frame 1
   Frame 1: Executed 160000 cycles in 10ms
🔌 HAL.writePort() CALLED: port=0x05, value=0x08
   Pin 11 = 1
🔌 HAL PIN CHANGE: Pin 11 = HIGH
📺 LCD.onPinChange() CALLED: pin=11, level=1
   📺 EN pin detected! lastEnState=0, level=1
🔌 HAL.writePort() CALLED: port=0x05, value=0x00
   Pin 11 = 0
🔌 HAL PIN CHANGE: Pin 11 = LOW
📺 LCD.onPinChange() CALLED: pin=11, level=0
   📺 ✅ EN FALLING EDGE DETECTED! Latching data...
📺 LCD Command: 0x48
📺 LCD Write: 'H' (0x48) at [0, 0]
🔍 Timer1 State: ICR1=40000, OCR1A=3000, OCR1B=0
🎛️ ✅ Servo library initialized (ICR1 = 40000)
🦾 ServoEngine.setAngleFromTimer1() CALLED: instanceId=servo_pin9, ocr=3000, icr=40000
🦾 [servo_pin9] Timer1: OCR=3000 → 1500µs → 90.0°
```

---

## 🚨 IF STILL NOT WORKING

If after all these fixes it STILL doesn't work, the problem is likely:

1. **HEX file is corrupted** - Check `result.binaryData` in console
2. **AVR CPU is stuck** - Check if `step()` is returning `true`
3. **Registers are not updating** - Check `cpu.data[PORTB]` values
4. **Engines are singletons but not initialized** - Check `getLCDEngine()` returns same instance

---

**Last Updated:** 2025-12-26  
**Status:** 🚨 **CRITICAL RUNTIME ISSUES IDENTIFIED**  
**Next Step:** **ADD DIAGNOSTIC LOGS AND TEST**

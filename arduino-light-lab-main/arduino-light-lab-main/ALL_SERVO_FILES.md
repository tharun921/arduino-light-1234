# 🔍 ALL SERVO-RELATED FILES

## Complete list of files that handle servo functionality

### 1. **Backend/Engine Files** (Core Logic)

#### `src/simulation/ServoEngine.ts`
- **Purpose:** Manages servo instances, processes PWM pulses, calculates angles
- **Key Functions:**
  - `onPinChange()` - Receives PWM pulses
  - `updateServoAngle()` - Animation loop (60fps)
  - `notifyAngleChange()` - Sends angle updates to UI
- **Potential Issue:** May be calling `notifyAngleChange()` too many times

#### `src/emulator/AVR8jsWrapper.ts`
- **Purpose:** Emulates Arduino CPU, handles delay fast-forward
- **Key Functions:**
  - Main execution loop
  - Timer1 tick control
- **Recent Fix:** Changed Timer1 to tick with actual cycles, not fast-forwarded cycles

#### `src/emulator/Timer1Emulator.ts`
- **Purpose:** Emulates Timer1 hardware, generates PWM pulses
- **Key Functions:**
  - `tick()` - Advances timer counter
  - Detects overflow and generates PWM pulses
- **Potential Issue:** May be overflowing multiple times

#### `src/simulation/PWMRouter.ts`
- **Purpose:** Routes PWM pulses from Timer1 to ServoEngine
- **Key Functions:**
  - `onPWMPulse()` - Forwards pulses to servos

---

### 2. **Frontend/UI Files** (Visual Display)

#### `src/components/components/ServoComponent.tsx`
- **Purpose:** Dedicated React component for servo visualization
- **Key Functions:**
  - Receives `angle` prop
  - Rotates servo horn using CSS transform
- **Recent Fixes:**
  - Added `React.memo` to prevent unnecessary re-renders
  - Added `prevAngleRef` to skip duplicate rotations

#### `src/components/components/UniversalComponent.tsx`
- **Purpose:** Renders all components including servos
- **Key Functions:**
  - Renders `ServoComponent` when type is servo
- **Potential Issue:** May be re-rendering too often

#### `src/components/SimulationCanvas.tsx`
- **Purpose:** Main simulation container, registers servo listeners
- **Key Functions:**
  - Registers `servoEngine.onChange()` listener
  - Updates component state when servo angle changes
- **Potential Issue:** May have duplicate listeners or force re-renders

---

### 3. **SVG Assets**

#### `public/components/servo-sg90-rotatable.svg`
- **Purpose:** SVG image of servo with rotatable horn
- **Contains:** Servo body and horn elements

---

## 🔍 SYSTEMATIC CHECK

We need to check each file for:

1. **Multiple Listeners:** Are we registering the same listener multiple times?
2. **Multiple Notifications:** Is `notifyAngleChange()` being called multiple times for the same angle?
3. **Multiple Updates:** Is the animation loop calling notify too often?
4. **Multiple Re-renders:** Is React re-rendering the component multiple times?

---

## 📋 CHECKING PLAN

### Step 1: Check ServoEngine.ts
- [ ] Verify `notifyAngleChange()` is only called when angle changes significantly
- [ ] Check if `updateServoAngle()` is being called multiple times per frame
- [ ] Verify listener array size

### Step 2: Check SimulationCanvas.tsx
- [ ] Verify only ONE `servoEngine.onChange()` listener is registered
- [ ] Check for duplicate listener registrations
- [ ] Check for force re-renders (`setForceUpdate`)

### Step 3: Check Timer1Emulator.ts
- [ ] Verify Timer1 only overflows ONCE per PWM period
- [ ] Check if `tick()` is being called with correct cycle count

### Step 4: Check AVR8jsWrapper.ts
- [ ] Verify Timer1 is ticked with actual instruction cycles during delay
- [ ] Check if delay detection is working correctly

---

## 🎯 NEXT STEPS

I will now check each file systematically to find the exact source of the multiple rotations.

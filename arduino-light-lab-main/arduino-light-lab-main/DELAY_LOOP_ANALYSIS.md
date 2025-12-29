# 🔴 CRITICAL ISSUE: CPU Stuck in delay() Loop

## 📊 Current Status

**Problem**: CPU is permanently stuck in bootloader/init delay loops and never reaches `setup()`

**Evidence**:
```
PC=0x138-0x189 [BOOTLOADER/INIT]
Cycles=10,075,787,558 (10 BILLION!)
Steps=21,700,000
TIMER1: ICR1=0 (never initialized)
All ports: 0x00 (no activity)
```

---

## 🧠 ROOT CAUSE ANALYSIS

### How Arduino `delay()` Works

1. **Timer0 Setup**: Arduino bootloader configures Timer0 to overflow every 1.024ms
2. **ISR Increments Counter**: Each Timer0 overflow triggers an interrupt that increments a counter
3. **millis() Reads Counter**: `millis()` returns this counter value
4. **delay() Waits**: `delay(1000)` loops until `millis()` increases by 1000

### Why Our "Escape" Doesn't Work

```typescript
// ❌ WRONG: Just advancing cycles doesn't help
this.cpu.cycles += cyclesFor500ms;

// Why? Because delay() checks millis(), which requires Timer0 ISR to run!
```

**The Problem**:
- We advance `cpu.cycles` by millions
- But Timer0 overflow interrupt **never fires** because we skip the actual execution
- `millis()` counter **stays at 0**
- `delay()` **never exits** because it's waiting for `millis()` to change

---

## 🔧 THE SOLUTION

### Option 1: Manually Update millis() Counter (RECOMMENDED)

Directly write to the memory location where `millis()` stores its counter:

```typescript
// Find the millis counter in SRAM (usually around 0x100-0x200)
const MILLIS_COUNTER_ADDR = 0x???; // Need to find this

// Advance millis by 500ms
const currentMillis = this.cpu.data[MILLIS_COUNTER_ADDR];
this.cpu.data[MILLIS_COUNTER_ADDR] = currentMillis + 500;
```

**Problem**: We don't know the exact address of the millis counter.

### Option 2: Force PC Jump (AGGRESSIVE)

When stuck in delay, **force the CPU to jump past it**:

```typescript
if (stuck in delay loop for too long) {
    console.log('⚠️ FORCING PC JUMP to skip delay');
    this.cpu.pc = 0x200; // Jump to likely setup() location
}
```

**Pros**: Guaranteed to escape
**Cons**: Might skip important initialization

### Option 3: Disable Bootloader Entirely (CLEANEST)

Compile Arduino sketches **without bootloader**:

```bash
arduino-cli compile --fqbn arduino:avr:uno:bootloader=no
```

**Pros**: No bootloader delays to get stuck in
**Cons**: Requires recompilation

---

## 🎯 RECOMMENDED FIX: Hybrid Approach

1. **Detect infinite delay** (already working ✅)
2. **Try to advance millis** by triggering Timer0 overflows
3. **If still stuck after N attempts**, force PC jump to 0x200

---

## 📝 IMPLEMENTATION PLAN

### Step 1: Enhanced Delay Detection
```typescript
private delayEscapeAttempts = 0;
private readonly MAX_ESCAPE_ATTEMPTS = 10;
```

### Step 2: Try Timer0 Overflow Trigger
```typescript
// Manually trigger Timer0 overflow interrupt
const TIMER0_OVF_VECTOR = 0x0020; // Timer0 overflow ISR address
// Push return address to stack
// Jump to ISR
// Let ISR increment millis counter
// Return
```

### Step 3: Force Jump if Still Stuck
```typescript
if (this.delayEscapeAttempts > MAX_ESCAPE_ATTEMPTS) {
    console.warn('⚠️ Delay escape failed, forcing PC jump to 0x200');
    this.cpu.pc = 0x200;
    this.cpu.SP = 0x08FF; // Reset stack pointer
    this.delayEscapeAttempts = 0;
}
```

---

## 🔬 ALTERNATIVE: Wokwi's Approach

Wokwi likely does ONE of these:

1. **Compiles without bootloader** - No delay loops to get stuck in
2. **Patches delay() function** - Replaces it with instant return
3. **Fast-forwards Timer0** - Manually triggers overflows at high speed
4. **Uses custom firmware** - Modified Arduino core without delays

---

## ✅ NEXT STEPS

1. Implement **force PC jump** as immediate fix
2. Research exact millis() counter location
3. Consider compiling without bootloader for production

---

**Status**: Issue identified, solution designed, ready to implement
**Priority**: CRITICAL - Blocks all functionality
**ETA**: 5 minutes to implement force jump fix

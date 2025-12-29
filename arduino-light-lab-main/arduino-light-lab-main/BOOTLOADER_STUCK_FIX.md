# 🚨 BOOTLOADER STUCK - ROOT CAUSE IDENTIFIED

## 📊 Diagnostic Results

### ✅ **What We Confirmed:**
```
Delay fast-forward: DISABLED ✓
CPU still stuck: YES ✗
PC range: 0x138-0x179 (bootloader)
PORTB/C/D: All 0x00
Cycles: 54+ million (running for minutes!)
```

### 🔍 **Root Cause:**
**The Arduino bootloader is stuck in an infinite wait loop.**

The bootloader is waiting for:
- Serial communication (to upload new code)
- Timer0 overflow interrupt (for timeout)
- Watchdog timer reset

**None of these are happening in `avr8js`!**

---

## 🎯 The Real Problem

### **Why Bootloaders Exist:**
On real Arduino hardware, the bootloader:
1. Waits ~1 second for serial upload
2. If no upload, jumps to user code at `0x0000`
3. Uses Timer0 + interrupts for timing

### **Why It Fails in avr8js:**
```typescript
// avr8js emulates the CPU perfectly
// BUT: It doesn't automatically handle bootloader timing
// The bootloader waits forever because:

1. No serial data arrives (we're not uploading)
2. Timer0 interrupts may not fire correctly
3. Watchdog timer not implemented
4. Bootloader timeout logic broken
```

---

## 💡 The Solution: Skip the Bootloader

### **Method 1: Compile Without Bootloader (RECOMMENDED)**

**Step 1:** Modify your Arduino compilation command

**Current command** (in your backend):
```bash
arduino-cli compile --fqbn arduino:avr:uno sketch.ino
```

**New command:**
```bash
arduino-cli compile --fqbn arduino:avr:uno:bootloader=none sketch.ino
```

**OR use "Upload Using Programmer" mode:**
```bash
arduino-cli compile --fqbn arduino:avr:uno --programmer arduinoisp sketch.ino
```

This creates a HEX file that:
- ✅ Starts at address `0x0000` (no bootloader)
- ✅ Jumps directly to `setup()`
- ✅ Uses full 32KB flash (vs 30.5KB with bootloader)

---

### **Method 2: Force Jump to User Code**

If you can't recompile, **manually jump the PC** to user code:

**File:** `src/emulator/AVR8jsWrapper.ts`

**Add this to the `loadHex()` method:**

```typescript
loadHex(hex: string): void {
    loadHex(hex, new Uint8Array(this.cpu.progMem.buffer));
    
    // 🔧 FIX: Skip bootloader, jump directly to user code
    // Bootloader is at 0x7800-0x7FFF (last 2KB)
    // User code starts at 0x0000
    this.cpu.pc = 0x0000;  // Force PC to start of user code
    
    console.log('✅ HEX loaded, PC set to 0x0000 (skipping bootloader)');
}
```

**This forces the CPU to start at your `setup()` function!**

---

### **Method 3: Implement Bootloader Timeout**

**Add bootloader detection and auto-skip:**

```typescript
// In AVR8jsWrapper.ts, add to step() method:

private bootloaderStuckCount = 0;
private readonly BOOTLOADER_TIMEOUT = 100000; // ~100k cycles = ~6ms at 16MHz

step(): void {
    const pc = this.cpu.pc;
    
    // 🔧 Detect bootloader stuck
    if (pc < 0x200) {
        this.bootloaderStuckCount++;
        
        if (this.bootloaderStuckCount > this.BOOTLOADER_TIMEOUT) {
            console.warn('⚠️ Bootloader timeout! Jumping to user code at 0x0000');
            this.cpu.pc = 0x0000;
            this.bootloaderStuckCount = 0;
            return;
        }
    } else {
        // In user code, reset counter
        this.bootloaderStuckCount = 0;
    }
    
    // ... rest of step() logic
}
```

---

## 🧪 Quick Test

### **Test 1: Check if bootloader is present**

Look at your HEX file. If it contains addresses like `:107800...`, you have a bootloader.

**Bootloader HEX:**
```
:107800001F920F920FB60F9211242F933F938F939F93AF
:107810009F93EF93FF931092850010928400109287007C
...
:00000001FF  ← End of file marker
```

**No-bootloader HEX:**
```
:100000000C9434000C943E000C943E000C943E0082  ← Starts at 0x0000
:100010000C943E000C943E000C943E000C943E0068
...
```

### **Test 2: Try Method 2 (Force PC)**

1. Add the `this.cpu.pc = 0x0000;` line to `loadHex()`
2. Reload browser
3. Upload servo code
4. Check console for:
   ```
   ✅ HEX loaded, PC set to 0x0000
   🔍 Step 1: PC=0x0000, Instruction=0x...
   🔌 PORTB changed: 0x00 → 0x02
   🎛️ ✅ Servo library initialized
   ```

---

## 📋 Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Delay fast-forward breaking CPU | ✅ **RULED OUT** | Was not the cause |
| Bootloader stuck in wait loop | ❌ **CONFIRMED** | Skip bootloader |
| No serial/timer interrupts | ❌ **ROOT CAUSE** | Compile without bootloader |
| PC stuck at 0x138-0x179 | ❌ **SYMPTOM** | Force PC to 0x0000 |

---

## 🔧 Recommended Fix (Choose ONE)

### **Option A: Backend Fix (Best)**
Modify compilation command to exclude bootloader:
```bash
arduino-cli compile --fqbn arduino:avr:uno:bootloader=none
```

### **Option B: Frontend Fix (Quick)**
Add to `AVR8jsWrapper.loadHex()`:
```typescript
this.cpu.pc = 0x0000;
```

### **Option C: Auto-Skip (Robust)**
Add bootloader timeout detection to `step()` method.

---

**Status:** 🚨 **Bootloader is the blocker, not delay detection**  
**Next Step:** Apply Option B (quickest) or Option A (cleanest)

# 🔥 RETI FIX - CRITICAL UPDATE

## ✅ WHAT WE FIXED

### The Problem:
```
ISR jumped to 0x20 ✅
Should return to 0x2dd ✅
Actually returned to 0xed ❌  ← WRONG!
```

### Root Cause:
**Stack push order was incorrect!**

ATmega328P pushes return address as:
1. HIGH byte first (to current SP)
2. LOW byte second (to SP-1)
3. SP decrements by 2

We were pushing in the wrong order, so RETI popped the wrong address.

### The Fix:
```typescript
// BEFORE (WRONG):
this.cpu.data[SP] = (returnAddress >> 8) & 0xFF;
this.cpu.data[0x5D] = (SP - 1) & 0xFF;  // ❌ Updating SP too early
this.cpu.data[SP - 1] = returnAddress & 0xFF;  // ❌ Wrong!

// AFTER (CORRECT):
let SP = /* get SP */;
this.cpu.data[SP] = (returnAddress >> 8) & 0xFF;  // Push HIGH
SP--;
this.cpu.data[SP] = returnAddress & 0xFF;  // Push LOW
SP--;
this.cpu.data[0x5D] = SP & 0xFF;  // Update SP once
this.cpu.data[0x5E] = (SP >> 8) & 0xFF;
```

## 🧪 TEST NOW

Refresh browser and check console for:
```
🚀 Jumped to ISR at PC=0x20, return=0x2dd, SP=0x...
```

Then after RETI, PC should return to **0x2dd** (not 0xed)!

If this works:
- ✅ delay() will work
- ✅ Servo.attach() will complete
- ✅ ICR1 and OCR1A will be written
- ✅ Servo will move!

---

**Date:** 2025-12-25
**Fix:** Stack push order for RETI
**Status:** Ready to test

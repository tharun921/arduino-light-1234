# 🔧 Fix Duplicate Wire Entry

## Problem
You have a duplicate wire entry `wire-1766900919286-l6wkmtsdu` in your circuit diagram stored in browser localStorage. This can cause React key duplication warnings and visual glitches.

## Solution: Clear Browser LocalStorage

### Method 1: Using Browser DevTools (Recommended)

1. **Open your application** in the browser (http://localhost:5173)

2. **Open DevTools**:
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Or right-click → "Inspect"

3. **Navigate to Application/Storage tab**:
   - Click on the **"Application"** tab (Chrome/Edge)
   - Or **"Storage"** tab (Firefox)

4. **Clear localStorage**:
   - In the left sidebar, expand **"Local Storage"**
   - Click on your site (e.g., `http://localhost:5173`)
   - You'll see stored data including:
     - `circuit-components`
     - `circuit-wires`
   - **Right-click** on the domain → **"Clear"**
   - Or click the **🗑️ Clear All** button

5. **Refresh the page** (`Ctrl+R` or `F5`)

### Method 2: Using Browser Console

1. Open DevTools Console (`F12` → Console tab)

2. Run this command:
```javascript
localStorage.clear();
location.reload();
```

### Method 3: Manual Wire Deletion (Advanced)

If you want to keep your components and only remove the duplicate wire:

1. Open DevTools Console
2. Run:
```javascript
// Get current wires
let wires = JSON.parse(localStorage.getItem('circuit-wires') || '[]');

// Show all wires
console.table(wires);

// Remove duplicate wire by ID
wires = wires.filter(w => w.id !== 'wire-1766900919286-l6wkmtsdu');

// Save back
localStorage.setItem('circuit-wires', JSON.stringify(wires));

// Reload
location.reload();
```

## After Clearing

1. **Re-add your components**:
   - Add Arduino Uno
   - Add Servo Motor
   - Connect them properly

2. **Upload your sketch** again

3. **Start simulation** - the servo should now work without duplicate key warnings

## Verification

Check the browser console - you should NO longer see:
```
⚠️ Warning: Encountered two children with the same key
```

## Prevention

- Always use the **Delete** button in the UI to remove wires
- Don't manually edit localStorage unless necessary
- Clear localStorage if you encounter visual glitches

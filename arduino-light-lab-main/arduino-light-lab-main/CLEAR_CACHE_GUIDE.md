# 🧹 Clear Browser Cache & Reset Simulation

## Quick Fix for "Ghost" Components

If you're still seeing ghost servo arms or duplicate components after the code fix, you need to clear the browser's cached state.

## Method 1: Hard Reload (Fastest) ⚡

### Windows/Linux:
```
Ctrl + Shift + R
```

### Mac:
```
Cmd + Shift + R
```

This forces the browser to:
- Reload all JavaScript files
- Clear component state
- Remove cached circuit data

## Method 2: Clear Local Storage (Recommended) 🎯

Your simulator saves circuit state in browser Local Storage. To clear it:

### Using Browser DevTools:

1. **Open DevTools**:
   - Press `F12` or `Ctrl + Shift + I`

2. **Go to Application Tab**:
   - Click "Application" in the top menu

3. **Clear Local Storage**:
   - In left sidebar: Storage → Local Storage
   - Click on your site URL (e.g., `http://localhost:5173`)
   - Right-click → "Clear"

4. **Reload the page**:
   - Press `F5` or `Ctrl + R`

### Using Console (Quick Method):

1. **Open Console**:
   - Press `F12`, then click "Console" tab

2. **Run this command**:
   ```javascript
   localStorage.clear()
   location.reload()
   ```

3. **Press Enter**

## Method 3: Full Cache Clear (Nuclear Option) 💣

If ghost components persist:

### Chrome/Edge:
1. Press `Ctrl + Shift + Delete`
2. Select "Cached images and files"
3. Select "Cookies and other site data"
4. Time range: "Last hour" (or "All time" if needed)
5. Click "Clear data"

### Firefox:
1. Press `Ctrl + Shift + Delete`
2. Select "Cache"
3. Select "Cookies"
4. Time range: "Last hour"
5. Click "Clear Now"

## Method 4: Reset Simulation in App 🔄

If your app has a "Reset" or "Clear Canvas" button:

1. Click the reset button
2. Confirm the action
3. Reload the page

## Verification Checklist ✅

After clearing cache, verify:

- [ ] No React key warnings in console
- [ ] Only ONE servo horn visible per servo
- [ ] Servo rotates smoothly (no flickering)
- [ ] No duplicate wires in the circuit
- [ ] Components have unique instance IDs

## Console Checks

### ✅ Good Console Output:
```
🦾 UniversalComponent SERVO: Servo SG90 {isSimulating: true, servoAngle: 90, rotation: 0}
✅ Servo horn ACTUALLY rotating to 90° (0° rotation)
```

### ❌ Bad Console Output (Before Fix):
```
Warning: Encountered two children with the same key, wire-1766841304235
🦾 UniversalComponent SERVO: Servo SG90 {isSimulating: true, servoAngle: 90, rotation: 0}
🦾 UniversalComponent SERVO: Servo SG90 {isSimulating: true, servoAngle: 90, rotation: 0}
```

## Still Having Issues?

If ghost components persist after clearing cache:

1. **Check the code fix was applied**:
   - Open `SimulationCanvas.tsx`
   - Line 1386 should have: `id: \`wire-${Date.now()}-${Math.random()...}\``
   - Line 3463 should have: `key={component.instanceId}`

2. **Verify dev server restarted**:
   - Stop the dev server (`Ctrl + C`)
   - Start it again (`npm run dev`)

3. **Check for multiple browser tabs**:
   - Close all tabs with the simulator
   - Open a fresh tab

4. **Try Incognito/Private mode**:
   - Opens with clean state
   - No cached data

## Why This Happens

The browser caches:
- **Component state** in memory
- **Circuit diagrams** in Local Storage
- **JavaScript bundles** in HTTP cache

Even after fixing the code, old cached data can cause the same visual bugs until cleared.

---

**Quick Command Summary**:
- Hard Reload: `Ctrl + Shift + R`
- Clear Storage: `localStorage.clear()` in console
- Full Clear: `Ctrl + Shift + Delete`

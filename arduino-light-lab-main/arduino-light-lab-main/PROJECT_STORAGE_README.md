# Arduino Light Lab - Project Save/Load System

## Overview

Arduino Light Lab now includes a **Project Management System** that allows you to save multiple circuit designs and load them later. All projects are stored locally in your browser - no server or database required!

---

## How It Works

### 🎯 Key Features

- **Save Projects**: Save your current circuit with a custom name
- **Load Projects**: Restore any saved project with one click
- **Delete Projects**: Remove old projects you no longer need
- **Auto-Save**: Circuit automatically saves to temporary storage
- **Browser Storage**: All data stored locally (no account needed)

---

## Using the Project System

### 💾 Saving a Project

1. Design your circuit (add components, connect wires, write code)
2. Click the **Download button (↓)** in the toolbar
3. Enter a project name (e.g., "LCD Hello World")
4. Click OK
5. ✅ Project saved!

**Tip:** Give your projects descriptive names like:
- "Ultrasonic Sensor Test"
- "LED Blink Assignment"
- "Temperature Monitor"

### 📂 Loading a Project

1. Click the **Menu button (⋮)** in the toolbar
2. Browse your saved projects
3. Click on the project name you want to load
4. ✅ Circuit restored!

**What Gets Restored:**
- All components and their positions
- All wires and connections
- Arduino code
- Component rotations and properties

### 🗑️ Deleting a Project

1. Click the **Menu button (⋮)**
2. Find the project you want to delete
3. Click the **trash icon (🗑️)** next to the project name
4. Confirm deletion
5. ✅ Project removed!

---

## Where Projects Are Stored

### Storage Location

Projects are stored in your browser's **localStorage**:

```
Browser → Local Storage → Key: "arduino-projects"
```

### Storage Structure

```json
{
  "arduino-projects": [
    {
      "id": "project-1733647890123",
      "name": "LCD Hello World",
      "description": "",
      "components": [...],
      "wires": [...],
      "code": "#include <LiquidCrystal.h>...",
      "createdAt": 1733647890123,
      "updatedAt": 1733647900456
    },
    {
      "id": "project-1733648000789",
      "name": "Ultrasonic Sensor",
      "components": [...],
      "wires": [...],
      "code": "...",
      "createdAt": 1733648000789,
      "updatedAt": 1733648020123
    }
  ]
}
```

### View Stored Data

**Using Browser DevTools:**

1. Press `F12` to open DevTools
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Click on your site URL
5. Find key: `arduino-projects`

**Using Console:**

```javascript
// View all projects
JSON.parse(localStorage.getItem('arduino-projects'))

// Count projects
JSON.parse(localStorage.getItem('arduino-projects')).length

// Export all projects to file
const data = localStorage.getItem('arduino-projects');
const blob = new Blob([data], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-arduino-projects.json';
a.click();
```

---

## Storage Limits

### Browser Storage Capacity

| Limit | Value |
|-------|-------|
| **Max Storage** | 5-10 MB (varies by browser) |
| **Typical Project Size** | 10-50 KB |
| **Estimated Capacity** | 100+ projects |

### What Counts Toward Storage:

- Component data (type, position, rotation)
- Wire data (connections, waypoints)
- Arduino code
- Timestamps and metadata

**Note:** Images and component graphics are NOT stored (they're part of the app).

---

## File Structure

### Project Files

```
arduino-light-lab-main/
├── src/
│   ├── components/
│   │   └── SimulationCanvas.tsx    # Main UI with save/load buttons
│   └── utils/
│       └── projectStorage.ts       # Storage utility functions
```

### Key Files

#### 1. `projectStorage.ts`

**Location:** `src/utils/projectStorage.ts`

**Functions:**
- `saveProject()` - Save a circuit
- `loadProject(id)` - Load by ID
- `getAllProjects()` - List all projects
- `deleteProject(id)` - Remove project
- `getCurrentProjectId()` - Get active project

#### 2. `SimulationCanvas.tsx`

**Location:** `src/components/SimulationCanvas.tsx`

**Features:**
- Download button (line ~2142)
- Projects menu button (line ~2158)
- Projects dropdown UI (line ~2193)
- Handler functions (line ~950)

---

## Data Persistence

### What Persists:

✅ **Saved Projects** - Permanent until you delete them  
✅ **Auto-Save** - Last circuit state (temporary)  
✅ **Browser Storage** - Survives page refresh

### What Doesn't Persist:

❌ **Simulation State** - Stops on page refresh  
❌ **Running Code** - Needs re-upload  
❌ **Temporary Variables** - React state only

### Auto-Save Feature

**How It Works:**

```typescript
// Automatically saves every change to localStorage
useEffect(() => {
  localStorage.setItem('arduino-circuit', JSON.stringify({
    components: placedComponents,
    wires: wires,
    code: currentCode,
    timestamp: Date.now()
  }));
}, [placedComponents, wires, currentCode]);
```

**Auto-Load on Startup:**

```typescript
// Loads last circuit when page opens
useEffect(() => {
  const saved = localStorage.getItem('arduino-circuit');
  if (saved) {
    const circuit = JSON.parse(saved);
    setPlacedComponents(circuit.components);
    // ...restore state
  }
}, []);
```

---

## Backup & Export

### Manual Backup

**Export All Projects:**

```javascript
// In browser console
const data = localStorage.getItem('arduino-projects');
copy(data); // Copy to clipboard
// Paste into a text file and save as: projects-backup.json
```

**Import Projects:**

```javascript
// Paste your backup data here
const backupData = '...paste JSON here...';
localStorage.setItem('arduino-projects', backupData);
location.reload(); // Refresh page
```

### Individual Project Export

1. Open Projects Menu (⋮)
2. Note the project ID (in console: `console.log(project.id)`)
3. Export specific project:

```javascript
const projects = JSON.parse(localStorage.getItem('arduino-projects'));
const myProject = projects.find(p => p.name === 'LCD Hello World');
console.log(JSON.stringify(myProject, null, 2));
```

---

## Troubleshooting

### Projects Not Saving

**Issue:** Click Download but nothing happens

**Solutions:**
- Check browser console for errors
- Verify localStorage is enabled
- Try clearing cache and reload
- Check storage quota isn't full

### Projects Disappear

**Possible Causes:**
- Cleared browser data/cookies
- Private/Incognito mode (doesn't persist)
- Different browser profile
- Browser update cleared storage

**Prevention:**
- Regular manual backups (export JSON)
- Don't use Private/Incognito for important work
- Keep projects in one browser

### Storage Full Error

**Issue:** `QuotaExceededError`

**Solutions:**
- Delete old projects
- Export and remove large projects
- Clear browser cache
- Use different browser

### Can't Load Project

**Issue:** Project loads but circuit is empty

**Solutions:**
- Check if project data is corrupted
- Re-save the circuit
- Check browser console for errors
- Try exporting/importing project data

---

## Advanced Usage

### Project Metadata

Each project includes:

```typescript
interface Project {
  id: string;              // Unique identifier
  name: string;            // User-defined name
  description?: string;    // Optional description
  components: any[];       // Component data
  wires: any[];           // Wire connections
  code: string;           // Arduino code
  createdAt: number;      // Creation timestamp
  updatedAt: number;      // Last modified timestamp
}
```

### Programmatic Access

```javascript
// Get all projects
const projects = JSON.parse(localStorage.getItem('arduino-projects')) || [];

// Filter projects
const lcdProjects = projects.filter(p => 
  p.name.toLowerCase().includes('lcd')
);

// Sort by date (newest first)
projects.sort((a, b) => b.updatedAt - a.updatedAt);

// Get project stats
projects.forEach(p => {
  console.log(`${p.name}: ${p.components.length} components, ${p.wires.length} wires`);
});
```

---

## Future Enhancements

### Planned Features

- [ ] Cloud sync (optional)
- [ ] Project sharing via URL
- [ ] Project templates
- [ ] Tags and categories
- [ ] Search functionality
- [ ] Thumbnail previews
- [ ] Export to image/PNG
- [ ] Version history

### Request a Feature

Have an idea? Open an issue on GitHub!

---

## FAQ

**Q: Where exactly is my data stored?**  
A: In your browser's localStorage database. Run `localStorage.getItem('arduino-projects')` in console to see it.

**Q: Can I access my projects on another computer?**  
A: No, localStorage is per-browser. You need to export and import manually, or wait for cloud sync feature.

**Q: How many projects can I save?**  
A: Typically 100+ projects. Exact limit depends on browser storage quota (5-10MB).

**Q: Is my data secure?**  
A: Data stays on your computer. It's not sent to any server. But anyone with access to your browser can see it.

**Q: Can I share my project with others?**  
A: Currently, you can export the JSON and share the file. They can import it manually.

**Q: What happens if I clear browser data?**  
A: All projects will be deleted. Always backup important projects!

---

## Support

**Issues?** Check the troubleshooting section above.  
**Questions?** Open an issue on GitHub.  
**Want to contribute?** Pull requests welcome!

---

## Summary

✅ **Save unlimited projects** - Local browser storage  
✅ **Quick load** - One click to restore  
✅ **Auto-save** - Never lose work  
✅ **No account needed** - Works offline  
✅ **Export/Import** - Manual backup support  

**Enjoy building your Arduino circuits!** 🎉

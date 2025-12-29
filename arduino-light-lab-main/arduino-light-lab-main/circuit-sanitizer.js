/**
 * Circuit Sanitizer - Fixes duplicate wire IDs and other issues
 * 
 * Run this in the browser console to clean up your circuit data
 */

// 🧹 SANITIZE CIRCUIT DATA
function sanitizeCircuit() {
    console.log('🧹 Starting circuit sanitization...');

    try {
        // Get current circuit from localStorage
        const savedCircuit = localStorage.getItem('arduino-circuit');

        if (!savedCircuit) {
            console.log('❌ No circuit found in localStorage');
            return;
        }

        const circuit = JSON.parse(savedCircuit);
        console.log(`📊 Found circuit with ${circuit.wires?.length || 0} wires`);

        // 1. Remove duplicate wires
        if (circuit.wires) {
            const wireIds = new Set();
            const duplicates = [];
            const uniqueWires = [];

            circuit.wires.forEach(wire => {
                if (wireIds.has(wire.id)) {
                    duplicates.push(wire.id);
                    console.log(`🗑️ Found duplicate wire: ${wire.id}`);
                } else {
                    wireIds.add(wire.id);
                    uniqueWires.push(wire);
                }
            });

            circuit.wires = uniqueWires;
            console.log(`✅ Removed ${duplicates.length} duplicate wire(s)`);
        }

        // 2. Regenerate wire IDs with better uniqueness
        if (circuit.wires) {
            circuit.wires.forEach(wire => {
                // Check if ID looks suspicious (might be duplicate-prone)
                if (wire.id.match(/^wire-\d+$/)) {
                    const oldId = wire.id;
                    wire.id = `wire-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
                    console.log(`🔄 Regenerated wire ID: ${oldId} → ${wire.id}`);
                }
            });
        }

        // 3. Save cleaned circuit
        localStorage.setItem('arduino-circuit', JSON.stringify(circuit));
        console.log('✅ Circuit sanitized and saved!');
        console.log('🔄 Reloading page...');

        // Reload page to apply changes
        setTimeout(() => location.reload(), 1000);

    } catch (error) {
        console.error('❌ Error sanitizing circuit:', error);
    }
}

// 🗑️ NUCLEAR OPTION: Clear everything and start fresh
function clearCircuit() {
    console.log('🗑️ Clearing circuit data...');
    localStorage.removeItem('arduino-circuit');
    console.log('✅ Circuit cleared!');
    console.log('🔄 Reloading page...');
    setTimeout(() => location.reload(), 500);
}

// 🔍 INSPECT CIRCUIT: View current circuit data
function inspectCircuit() {
    const savedCircuit = localStorage.getItem('arduino-circuit');
    if (!savedCircuit) {
        console.log('❌ No circuit found');
        return;
    }

    const circuit = JSON.parse(savedCircuit);
    console.log('📊 Circuit Data:');
    console.log(`  Components: ${circuit.components?.length || 0}`);
    console.log(`  Wires: ${circuit.wires?.length || 0}`);

    if (circuit.wires) {
        const wireIds = {};
        circuit.wires.forEach(wire => {
            wireIds[wire.id] = (wireIds[wire.id] || 0) + 1;
        });

        const duplicates = Object.entries(wireIds).filter(([id, count]) => count > 1);
        if (duplicates.length > 0) {
            console.log('⚠️ Duplicate wire IDs found:');
            duplicates.forEach(([id, count]) => {
                console.log(`  - ${id}: ${count} instances`);
            });
        } else {
            console.log('✅ No duplicate wire IDs');
        }
    }

    return circuit;
}

// Export functions to window for easy access
window.sanitizeCircuit = sanitizeCircuit;
window.clearCircuit = clearCircuit;
window.inspectCircuit = inspectCircuit;

console.log('🛠️ Circuit Sanitizer Loaded!');
console.log('');
console.log('Available commands:');
console.log('  sanitizeCircuit()  - Fix duplicate wires');
console.log('  clearCircuit()     - Delete all circuit data');
console.log('  inspectCircuit()   - View circuit data');
console.log('');
console.log('💡 Recommended: Run inspectCircuit() first to see issues');

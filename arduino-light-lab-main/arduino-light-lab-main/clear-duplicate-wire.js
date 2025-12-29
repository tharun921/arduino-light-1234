/**
 * Script to find and remove duplicate wire IDs from circuit data
 * Run this if you see: "Warning: Encountered two children with the same key"
 */

const fs = require('fs');
const path = require('path');

// Check if a file path was provided
const filePath = process.argv[2];

if (!filePath) {
    console.log('❌ Usage: node clear-duplicate-wire.js <path-to-diagram.json>');
    console.log('   Example: node clear-duplicate-wire.js ./circuit-data.json');
    process.exit(1);
}

// Read the circuit data file
try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    console.log('🔍 Analyzing circuit data...\n');

    // Track seen IDs
    const seenIds = new Set();
    const duplicates = [];

    // Check wires for duplicates
    if (data.wires && Array.isArray(data.wires)) {
        data.wires.forEach((wire, index) => {
            if (seenIds.has(wire.id)) {
                duplicates.push({ type: 'wire', id: wire.id, index });
                console.log(`❌ DUPLICATE WIRE: ${wire.id} at index ${index}`);
            } else {
                seenIds.add(wire.id);
            }
        });
    }

    // Check components for duplicates
    seenIds.clear();
    if (data.components && Array.isArray(data.components)) {
        data.components.forEach((component, index) => {
            if (seenIds.has(component.id)) {
                duplicates.push({ type: 'component', id: component.id, index });
                console.log(`❌ DUPLICATE COMPONENT: ${component.id} at index ${index}`);
            } else {
                seenIds.add(component.id);
            }
        });
    }

    if (duplicates.length === 0) {
        console.log('✅ No duplicates found! Circuit data is clean.');
        process.exit(0);
    }

    console.log(`\n⚠️ Found ${duplicates.length} duplicate(s)\n`);

    // Ask for confirmation to remove duplicates
    console.log('Would you like to remove duplicates? (y/n)');

    process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();

        if (answer === 'y' || answer === 'yes') {
            // Remove duplicates (keep first occurrence)
            const cleanedData = { ...data };

            // Remove duplicate wires
            if (cleanedData.wires) {
                const seenWireIds = new Set();
                cleanedData.wires = cleanedData.wires.filter(wire => {
                    if (seenWireIds.has(wire.id)) {
                        console.log(`🗑️ Removing duplicate wire: ${wire.id}`);
                        return false;
                    }
                    seenWireIds.add(wire.id);
                    return true;
                });
            }

            // Remove duplicate components
            if (cleanedData.components) {
                const seenComponentIds = new Set();
                cleanedData.components = cleanedData.components.filter(component => {
                    if (seenComponentIds.has(component.id)) {
                        console.log(`🗑️ Removing duplicate component: ${component.id}`);
                        return false;
                    }
                    seenComponentIds.add(component.id);
                    return true;
                });
            }

            // Create backup
            const backupPath = filePath + '.backup';
            fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
            console.log(`\n💾 Backup created: ${backupPath}`);

            // Write cleaned data
            fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2));
            console.log(`✅ Cleaned data written to: ${filePath}`);
            console.log('\n🎉 Done! Reload your browser to see the changes.');

            process.exit(0);
        } else {
            console.log('❌ Cancelled. No changes made.');
            process.exit(0);
        }
    });

} catch (error) {
    console.error('❌ Error reading file:', error.message);
    process.exit(1);
}

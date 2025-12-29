/**
 * Servo Library Injector
 * 
 * This module solves the arduino-cli Servo library linking problem by:
 * 1. Copying Servo library source files into the sketch folder
 * 2. Forcing arduino-cli to compile them together with the sketch
 * 3. Ensuring Servo code is included in the final HEX
 */

const fs = require('fs').promises;
const path = require('path');

class ServoLibraryInjector {
    constructor() {
        // Path to Arduino AVR core Servo library
        this.servoLibPath = path.join(
            process.env.LOCALAPPDATA || process.env.HOME,
            'Arduino15/packages/arduino/hardware/avr/1.8.6/libraries/Servo/src'
        );
    }

    /**
     * Check if sketch uses Servo library
     */
    async sketchUsesServo(sketchCode) {
        return sketchCode.includes('#include <Servo.h>') ||
            sketchCode.includes('#include "Servo.h"');
    }

    /**
     * Inject Servo library into sketch folder
     * This forces arduino-cli to compile it
     */
    async injectServoLibrary(projectDir) {
        try {
            console.log('🔧 Injecting Servo library into sketch...');

            // Create Servo subfolder in sketch
            const servoDir = path.join(projectDir, 'Servo');
            await fs.mkdir(servoDir, { recursive: true });

            // Copy Servo source files
            const servoSrcPath = path.join(this.servoLibPath, 'avr');

            // Copy Servo.cpp
            const servoCppSrc = path.join(servoSrcPath, 'Servo.cpp');
            const servoCppDest = path.join(servoDir, 'Servo.cpp');
            await fs.copyFile(servoCppSrc, servoCppDest);
            console.log('  ✅ Copied Servo.cpp');

            // Copy Servo.h (from parent directory)
            const servoHSrc = path.join(this.servoLibPath, 'Servo.h');
            const servoHDest = path.join(servoDir, 'Servo.h');
            await fs.copyFile(servoHSrc, servoHDest);
            console.log('  ✅ Copied Servo.h');

            // Copy ServoTimers.h
            const servoTimersSrc = path.join(servoSrcPath, 'ServoTimers.h');
            const servoTimersDest = path.join(servoDir, 'ServoTimers.h');
            await fs.copyFile(servoTimersSrc, servoTimersDest);
            console.log('  ✅ Copied ServoTimers.h');

            console.log('✅ Servo library injected successfully!');
            return true;

        } catch (error) {
            console.error('❌ Failed to inject Servo library:', error.message);
            return false;
        }
    }

    /**
     * Clean up injected Servo files after compilation
     */
    async cleanupServoLibrary(projectDir) {
        try {
            const servoDir = path.join(projectDir, 'Servo');
            await fs.rm(servoDir, { recursive: true, force: true });
            console.log('🧹 Cleaned up injected Servo library');
        } catch (error) {
            // Ignore cleanup errors
            console.warn('⚠️ Cleanup warning:', error.message);
        }
    }
}

module.exports = { ServoLibraryInjector };

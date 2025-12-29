const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const glob = require('glob');
const { ServoLibraryInjector } = require('./ServoLibraryInjector');

const execPromise = util.promisify(exec);

/**
 * ArduinoCompiler - Compiles Arduino code using Arduino CLI
 * 
 * This module handles:
 * 1. Creating temporary .ino files
 * 2. Invoking arduino-cli to compile code
 * 3. Parsing generated HEX files (Intel HEX format)
 * 4. Returning compiled binary data
 * 5. Cleaning up temporary files
 */
class ArduinoCompiler {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'arduino-lab-compiler');
        this.ensureTempDir();
    }

    /**
     * Ensures the temporary directory exists
     */
    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Check if Arduino CLI is installed and available
     */
    async checkArduinoCLI() {
        try {
            const { stdout } = await execPromise('arduino-cli version');
            console.log('✅ Arduino CLI found:', stdout.trim());
            return { available: true, version: stdout.trim() };
        } catch (error) {
            console.error('❌ Arduino CLI not found');
            return {
                available: false,
                error: 'Arduino CLI is not installed. Please install from https://arduino.github.io/arduino-cli/'
            };
        }
    }

    /**
     * Compiles Arduino code and returns compiled HEX data
     * 
     * @param {string} code - Arduino source code (.ino file content)
     * @param {string} board - Board FQBN (fully qualified board name), default: arduino:avr:uno
     * @returns {Promise<Object>} Compilation result
     */
    async compileArduinoCode(code, board = 'arduino:avr:uno') {
        console.log('\n🔨 Starting Arduino compilation...');
        console.log(`📋 Board: ${board} `);
        console.log(`📝 Code length: ${code.length} characters`);

        // Check if Arduino CLI is available
        const cliCheck = await this.checkArduinoCLI();
        if (!cliCheck.available) {
            return {
                success: false,
                error: cliCheck.error,
                errors: [cliCheck.error],
                warnings: []
            };
        }

        // Create unique project directory
        const timestamp = Date.now();
        const projectName = `sketch_${timestamp}`;
        const projectDir = path.join(this.tempDir, projectName);
        const sketchFile = path.join(projectDir, `${projectName}.ino`);

        try {
            // Create project directory
            fs.mkdirSync(projectDir, { recursive: true });
            console.log(`📁 Created project directory: ${projectDir}`);

            // Write sketch file
            fs.writeFileSync(sketchFile, code, 'utf8');
            console.log(`📄 Created sketch file: ${sketchFile} `);
            console.log('\n🔍 EXACT CODE RECEIVED:');
            console.log('═══════════════════════════════════════');
            code.split('\n').forEach((line, i) => {
                console.log(`Line ${i + 1}: "${line}"`);
            });
            console.log('═══════════════════════════════════════\n');

            // ✅ CRITICAL FIX: Inject Servo library if needed
            const servoInjector = new ServoLibraryInjector();
            const usesServo = await servoInjector.sketchUsesServo(code);

            if (usesServo) {
                console.log('🎯 Detected Servo library usage - injecting Servo source files...');
                await servoInjector.injectServoLibrary(projectDir);
            }

            // Compile the sketch with explicit build path
            console.log('🔧 Running arduino-cli compile...');
            const buildPath = path.join(projectDir, 'build');

            // ✅ CRITICAL: Compile WITHOUT bootloader for AVR8.js compatibility
            // Bootloader waits for serial upload which causes infinite loops in emulator
            // This flag tells arduino-cli to generate code that starts immediately at 0x0000
            const arduinoCliPath = 'C:\\Users\\tharu\\Arduino CLI\\\\arduino-cli.exe';

            // ✅ FORCE Servo library inclusion by specifying library path
            const avrLibPath = path.join(process.env.LOCALAPPDATA || process.env.HOME,
                'Arduino15/packages/arduino/hardware/avr/1.8.6/libraries');

            const compileCommand = `"${arduinoCliPath}" compile --fqbn ${board} ` +
                `--build-property "build.bootloader=no" ` +
                `--libraries "${avrLibPath}" ` +
                `--build-path "${buildPath}" "${projectDir}"`;

            console.log('📝 Compile command:', compileCommand);

            // Execute with explicit shell for Windows compatibility
            const { stdout, stderr } = await execPromise(compileCommand, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large compilation outputs
                shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
            });

            console.log('✅ Compilation successful!');

            // Parse warnings from stderr
            const warnings = this.parseWarnings(stderr);
            if (warnings.length > 0) {
                console.log(`⚠️ Compilation warnings: ${warnings.length} `);
                warnings.forEach((warning, i) => console.log(`   ${i + 1}. ${warning} `));
            }

            // Find and parse HEX file (now in explicit build path)
            const hexFile = path.join(buildPath, `${projectName}.ino.hex`);
            const elfFile = path.join(buildPath, `${projectName}.ino.elf`);

            if (!fs.existsSync(hexFile)) {
                // List what's actually in the build directory for debugging
                console.error(`❌ HEX file not found at: ${hexFile} `);

                if (fs.existsSync(buildPath)) {
                    const files = fs.readdirSync(buildPath);
                    console.error(`   Build directory contents: ${files.join(', ')} `);
                } else {
                    console.error(`   Build directory doesn't exist: ${buildPath}`);
                }

                throw new Error(`HEX file not found at: ${hexFile}`);
            }

            console.log(`📦 Reading HEX file: ${hexFile}`);

            // ✅ CRITICAL FIX: Generate bootloader-free HEX for AVR8.js
            // Standard HEX includes bootloader which causes infinite loops in AVR8.js
            // We extract only .text (code) and .data (initialized variables) sections
            const cleanHexFile = path.join(buildPath, `${projectName}.clean.hex`);
            let finalHexFile = hexFile; // Default to standard HEX
            let bootloaderFree = false;

            try {
                console.log('🔧 Generating bootloader-free HEX for AVR8.js...');

                // Find avr-objcopy dynamically (works with any avr-gcc version)
                const arduinoPath = path.join(process.env.LOCALAPPDATA || process.env.HOME, 'Arduino15');
                const objcopyPattern = path.join(arduinoPath, 'packages/arduino/tools/avr-gcc/*/bin/avr-objcopy.exe');

                const objcopyFiles = glob.sync(objcopyPattern);
                if (objcopyFiles.length === 0) {
                    throw new Error('avr-objcopy not found in Arduino installation');
                }

                const objcopyPath = objcopyFiles[0]; // Use first match
                console.log('📍 Found avr-objcopy:', objcopyPath);

                // Use avr-objcopy to remove bootloader sections (keep vectors for ISRs)
                // -R removes sections: eeprom, fuse, lock (bootloader stuff)
                // Keeps: .text (code), .data (variables), .vectors (interrupt table)
                const objcopyCmd = `"${objcopyPath}" -O ihex -R .eeprom -R .fuse -R .lock "${elfFile}" "${cleanHexFile}"`;
                console.log('📝 Objcopy command:', objcopyCmd);

                await execPromise(objcopyCmd, {
                    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
                });

                console.log('✅ Clean HEX generated successfully (no bootloader)!');
                finalHexFile = cleanHexFile;
                bootloaderFree = true;
            } catch (objcopyError) {
                console.warn('⚠️ avr-objcopy failed, using standard HEX (may have bootloader issues)');
                console.warn('   Error:', objcopyError.message);
                // Continue with standard HEX file
            }

            const hexData = fs.readFileSync(finalHexFile, 'utf8');
            const hexLines = hexData.trim().split('\n');

            console.log(`📊 HEX file stats:`);
            console.log(`   File: ${bootloaderFree ? 'CLEAN (no bootloader)' : 'STANDARD (with bootloader)'}`);
            console.log(`   Lines: ${hexLines.length}`);
            console.log(`   Size: ${hexData.length} bytes`);

            // Parse HEX file into binary data
            const binaryData = this.parseIntelHex(hexData);

            // Get file sizes for metadata
            const stats = {
                hexSize: fs.existsSync(hexFile) ? fs.statSync(hexFile).size : 0,
                elfSize: fs.existsSync(elfFile) ? fs.statSync(elfFile).size : 0
            };

            // Cleanup temporary files
            this.cleanup(projectDir);

            return {
                success: true,
                hex: hexData,
                hexLines: hexLines,
                binaryData: binaryData,
                warnings: warnings,
                errors: [],
                metadata: {
                    board: board,
                    compiledAt: new Date().toISOString(),
                    bootloaderFree: bootloaderFree, // Flag to indicate clean HEX
                    ...stats
                }
            };

        } catch (error) {
            console.error('❌ Compilation failed:', error.message);

            // Parse compilation errors
            const errors = this.parseErrors(error.stderr || error.message);

            // Cleanup injected Servo library and project directory
            if (usesServo) {
                await servoInjector.cleanupServoLibrary(projectDir);
            }
            if (fs.existsSync(projectDir)) {
                this.cleanup(projectDir);
            }

            return {
                success: false,
                error: error.message,
                errors: errors,
                warnings: [],
                hex: null,
                binaryData: null
            };
        }
    }

    /**
     * Parses Intel HEX format into binary data
     * 
     * Intel HEX Format:
     * :LLAAAATT[DD...]CC
     * LL = Byte count
     * AAAA = Address
     * TT = Record type (00=data, 01=EOF)
     * DD = Data bytes
     * CC = Checksum
     * 
     * @param {string} hexData - Intel HEX file content
     * @returns {Array<{address: number, data: Uint8Array}>} Parsed binary data segments
     */
    parseIntelHex(hexData) {
        const lines = hexData.trim().split('\n');
        const segments = [];
        let extendedAddress = 0;

        for (const line of lines) {
            if (!line.startsWith(':')) continue;

            const byteCount = parseInt(line.substr(1, 2), 16);
            const address = parseInt(line.substr(3, 4), 16) + extendedAddress;
            const recordType = parseInt(line.substr(7, 2), 16);

            if (recordType === 0x00) {
                // Data record
                const data = new Uint8Array(byteCount);
                for (let i = 0; i < byteCount; i++) {
                    data[i] = parseInt(line.substr(9 + i * 2, 2), 16);
                }
                // ✅ FIX: Convert Uint8Array to regular array for JSON serialization
                segments.push({ address, data: Array.from(data) });
            } else if (recordType === 0x01) {
                // End of file
                break;
            } else if (recordType === 0x04) {
                // Extended linear address
                extendedAddress = parseInt(line.substr(9, 4), 16) << 16;
            }
        }

        console.log(`🔍 Parsed ${segments.length} HEX segments`);
        return segments;
    }

    /**
     * Parses compilation errors from stderr
     */
    parseErrors(stderr) {
        if (!stderr) return ['Unknown compilation error'];

        const errors = [];
        const errorLines = stderr.split('\n');

        for (const line of errorLines) {
            // Match typical GCC error format: "file:line:col: error: message"
            if (line.includes('error:')) {
                const cleaned = line.replace(/^.*error:\s*/, '').trim();
                if (cleaned) errors.push(cleaned);
            }
        }

        return errors.length > 0 ? errors : [stderr.trim()];
    }

    /**
     * Parses compilation warnings from stderr
     */
    parseWarnings(stderr) {
        if (!stderr) return [];

        const warnings = [];
        const lines = stderr.split('\n');

        for (const line of lines) {
            // Match typical GCC warning format
            if (line.includes('warning:')) {
                const cleaned = line.replace(/^.*warning:\s*/, '').trim();
                if (cleaned) warnings.push(cleaned);
            }
        }

        return warnings;
    }

    /**
     * Cleans up temporary project directory
     */
    cleanup(projectDir) {
        try {
            if (fs.existsSync(projectDir)) {
                fs.rmSync(projectDir, { recursive: true, force: true });
                console.log(`🗑️ Cleaned up: ${projectDir}`);
            }
        } catch (error) {
            console.warn(`⚠️ Cleanup warning: ${error.message}`);
        }
    }
}

// Export singleton instance
module.exports = new ArduinoCompiler();

// Test script to verify bootloader-free compilation
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

async function testCompilation() {
    console.log('🧪 Testing bootloader-free compilation...\n');

    const testCode = `
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
  myServo.write(90);
}

void loop() {
  myServo.write(0);
  delay(1000);
  myServo.write(180);
  delay(1000);
}
`;

    const testDir = path.join(__dirname, 'test_compile');
    const sketchFile = path.join(testDir, 'test_compile.ino');
    const buildDir = path.join(testDir, 'build');

    try {
        // Create directories
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(sketchFile, testCode);

        console.log('📝 Test sketch created');
        console.log('🔧 Compiling WITHOUT bootloader...\n');

        const arduinoCliPath = 'C:\\Users\\tharu\\Arduino CLI\\arduino-cli.exe';
        const command = `"${arduinoCliPath}" compile --fqbn arduino:avr:uno ` +
            `--build-property "build.bootloader=no" ` +
            `--build-path "${buildDir}" "${testDir}"`;

        console.log('Command:', command);
        console.log('');

        const { stdout, stderr } = await execPromise(command, {
            shell: 'cmd.exe'
        });

        console.log('✅ Compilation successful!\n');

        // Check if HEX was created
        const hexFile = path.join(buildDir, 'test_compile.ino.hex');
        if (fs.existsSync(hexFile)) {
            const hexData = fs.readFileSync(hexFile, 'utf8');
            const lines = hexData.trim().split('\n');

            console.log('📦 HEX File Generated:');
            console.log(`   Path: ${hexFile}`);
            console.log(`   Lines: ${lines.length}`);
            console.log(`   Size: ${hexData.length} bytes`);
            console.log('');
            console.log('First 5 lines:');
            lines.slice(0, 5).forEach((line, i) => {
                console.log(`   ${i + 1}. ${line}`);
            });

            console.log('\n✅ SUCCESS: Bootloader-free HEX generated!');
            console.log('📋 Next step: Use this HEX in your emulator');
        } else {
            console.log('❌ HEX file not found!');
        }

        // Cleanup
        fs.rmSync(testDir, { recursive: true, force: true });

    } catch (error) {
        console.error('❌ Compilation failed:', error.message);
        if (error.stderr) {
            console.error('stderr:', error.stderr);
        }
    }
}

testCompilation();

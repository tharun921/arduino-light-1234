const { execSync } = require('child_process');

// Test arduino-cli with proper escaping
const arduinoPath = 'C:\\Users\\tharu\\Arduino CLI\\arduino-cli.exe';

try {
    const result = execSync(`"${arduinoPath}" version`, {
        encoding: 'utf8',
        shell: 'cmd.exe'
    });
    console.log('✅ SUCCESS with cmd.exe:');
    console.log(result);
} catch (error) {
    console.log('❌ FAILED with cmd.exe:');
    console.log(error.message);
}

try {
    const result = execSync(`"${arduinoPath}" version`, {
        encoding: 'utf8',
        shell: 'powershell.exe'
    });
    console.log('✅ SUCCESS with powershell.exe:');
    console.log(result);
} catch (error) {
    console.log('❌ FAILED with powershell.exe:');
    console.log(error.message);
}

// Try without shell
try {
    const result = execSync(`"${arduinoPath}" version`, {
        encoding: 'utf8'
    });
    console.log('✅ SUCCESS without shell:');
    console.log(result);
} catch (error) {
    console.log('❌ FAILED without shell:');
    console.log(error.message);
}

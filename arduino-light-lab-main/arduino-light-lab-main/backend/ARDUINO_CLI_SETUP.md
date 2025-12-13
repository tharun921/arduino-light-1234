# Arduino CLI Installation Guide

## Windows Installation

### Option 1: Using Installer (Recommended)

1. Download the latest Arduino CLI installer for Windows:
   ```
   https://github.com/arduino/arduino-cli/releases/latest
   ```
   Look for: `arduino-cli_<version>_Windows_64bit.zip`

2. Extract the ZIP file to a permanent location (e.g., `C:\Program Files\Arduino CLI`)

3. Add Arduino CLI to your system PATH:
   - Open "Environment Variables" (Search in Start Menu)
   - Under "System variables", find and edit "Path"
   - Click "New" and add: `C:\Program Files\Arduino CLI`
   - Click "OK" on all dialogs

4. Open a **new** PowerShell/Command Prompt and verify:
   ```powershell
   arduino-cli version
   ```

### Option 2: Using Chocolatey

If you have Chocolatey installed:
```powershell
choco install arduino-cli
```

### Post-Installation Setup

After installing Arduino CLI, configure it for Arduino Uno:

```powershell
# Initialize configuration
arduino-cli config init

# Update core index
arduino-cli core update-index

# Install Arduino AVR core (for Uno, Mega, Nano, etc.)
arduino-cli core install arduino:avr

# Verify installation
arduino-cli board listall
```

## Testing the Backend

Once Arduino CLI is installed:

1. Make sure the backend server is running:
   ```powershell
   cd backend
   npm start
   ```

2. Test the compiler status endpoint:
   ```powershell
   curl http://localhost:3001/api/compile/check
   ```
   
   Expected response:
   ```json
   {
     "success": true,
     "available": true,
     "version": "arduino-cli  Version: x.x.x ..."
   }
   ```

3. Test a simple compilation:
   ```powershell
   curl -X POST http://localhost:3001/api/compile `
     -H "Content-Type: application/json" `
     -d '{\"code\": \"void setup() { pinMode(13, OUTPUT); } void loop() { digitalWrite(13, HIGH); }\", \"board\": \"arduino:avr:uno\"}'
   ```

## Troubleshooting

### "arduino-cli is not recognized"
- Make sure you added Arduino CLI to your PATH
- **Restart your terminal** after modifying PATH
- Verify the path is correct: `where arduino-cli`

### "Platform 'arduino:avr' not found"
Run:
```powershell
arduino-cli core update-index
arduino-cli core install arduino:avr
```

### Compilation fails with "avr-gcc not found"
The Arduino AVR core includes avr-gcc. Reinstall it:
```powershell
arduino-cli core uninstall arduino:avr
arduino-cli core install arduino:avr
```

## Next Steps

After Arduino CLI is installed and working, the backend will automatically:
1. Accept Arduino code via `/api/compile` endpoint
2. Compile it using `arduino-cli compile`
3. Parse the generated HEX file
4. Return binary data for the AVR emulator

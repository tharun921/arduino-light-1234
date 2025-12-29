# Download and install Servo library for AVR
$servoUrl = "https://github.com/arduino-libraries/Servo/archive/refs/heads/master.zip"
$tempZip = "$env:TEMP\Servo-master.zip"
$tempExtract = "$env:TEMP\Servo-master"
$targetPath = "$env:LOCALAPPDATA\Arduino15\packages\arduino\hardware\avr\1.8.6\libraries\Servo"

Write-Host "📥 Downloading Servo library from GitHub..."
Invoke-WebRequest -Uri $servoUrl -OutFile $tempZip

Write-Host "📦 Extracting..."
Expand-Archive -Path $tempZip -DestinationPath $env:TEMP -Force

Write-Host "📁 Installing to AVR core..."
if (Test-Path $targetPath) {
    Remove-Item $targetPath -Recurse -Force
}
Copy-Item -Path "$tempExtract\Servo-master" -Destination $targetPath -Recurse -Force

Write-Host "🧹 Cleaning up..."
Remove-Item $tempZip -Force
Remove-Item $tempExtract -Recurse -Force

Write-Host ""
Write-Host "✅ Servo library installed successfully!"
Write-Host "Location: $targetPath"
Write-Host ""
Write-Host "Verifying installation..."
if (Test-Path "$targetPath\src\Servo.h") {
    Write-Host "✅ Servo.h found - installation successful!"
} else {
    Write-Host "❌ Installation failed - Servo.h not found"
}

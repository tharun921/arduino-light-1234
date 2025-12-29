// Compile servo test via backend API
const http = require('http');

const servoCode = `#include <Servo.h>

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
}`;

const postData = JSON.stringify({ code: servoCode });

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/compile',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('🔨 Compiling servo test via backend API...\n');

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const result = JSON.parse(data);

            if (result.success) {
                console.log('✅ Compilation successful!');
                console.log(`📦 HEX size: ${result.hex.length} bytes`);
                console.log(`🔍 Bootloader-free: ${result.metadata?.bootloaderFree || false}`);

                // Check for ICR1 = 40000 (0x9C40)
                if (result.hex.includes('9C40') || result.hex.includes('9c40')) {
                    console.log('\n✅ FOUND: ICR1=40000 in HEX!');
                    console.log('   Servo library code is present!');
                } else {
                    console.log('\n❌ NOT FOUND: ICR1=40000');
                    console.log('   Servo library may not be compiled in');
                }

                // Save HEX for inspection
                const fs = require('fs');
                fs.writeFileSync('./servo_test.hex', result.hex);
                console.log('\n📄 HEX saved to: ./servo_test.hex');

            } else {
                console.log('❌ Compilation failed:');
                console.log(result.error);
                if (result.errors) {
                    result.errors.forEach(err => console.log('  -', err));
                }
            }
        } catch (e) {
            console.error('❌ Failed to parse response:', e.message);
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Request failed: ${e.message}`);
});

req.write(postData);
req.end();

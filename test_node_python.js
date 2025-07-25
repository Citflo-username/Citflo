// test_node_python.js
const { spawn } = require('child_process');
const path = require('path');

// const testData = [
//     {"timestamp": "2024-01-01T10:00:00Z", "voltage": 3.5},
//     {"timestamp": "2024-01-01T10:01:00Z", "voltage": 3.7},
//     {"timestamp": "2024-01-01T10:02:00Z", "voltage": 3.2}
// ];

// In test_node_python.js, replace testData with:
const testData = [];
for (let i = 0; i < 100; i++) {
    testData.push({
        timestamp: new Date(2024, 0, 1, 10, i).toISOString(),
        voltage: 3.5 + 0.5 * Math.sin(i / 10) + Math.random() * 0.1
    });
}

const pythonScript = path.join(__dirname, 'python/find_peaks_and_calc_slopes.py');
console.log('Running script:', pythonScript);

const python = spawn('python', [pythonScript]);

let output = '';
let error = '';

python.stdout.on('data', (data) => {
    output += data.toString();
    console.log('STDOUT:', data.toString());
});

python.stderr.on('data', (data) => {
    error += data.toString();
    console.log('STDERR:', data.toString());
});

python.on('close', (code) => {
    console.log('Exit code:', code);
    console.log('Final output:', output);
    if (error) console.log('Final error:', error);
});

python.on('error', (err) => {
    console.log('Process error:', err);
});

const jsonData = JSON.stringify(testData);
console.log('Sending data:', jsonData);

python.stdin.write(jsonData);
python.stdin.end();
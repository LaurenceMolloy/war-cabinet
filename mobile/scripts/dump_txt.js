const fs = require('fs');
const lines = fs.readFileSync('test_output.txt', 'utf8').split('\n');
const errorStart = lines.findIndex(l => l.includes('1 failed'));
if (errorStart !== -1) {
    console.log(lines.slice(errorStart, errorStart + 50).join('\n'));
} else {
    console.log(lines.slice(-50).join('\n'));
}

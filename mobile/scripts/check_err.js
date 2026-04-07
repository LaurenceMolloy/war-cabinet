const fs = require('fs');
let txt = fs.readFileSync('test_output.txt', 'utf16le');
if (!txt || txt.length < 10) {
  txt = fs.readFileSync('test_output.txt', 'utf8');
}
const lines = txt.split('\n');
for(let i=7; i<25; i++) {
  console.log(lines[i]);
}

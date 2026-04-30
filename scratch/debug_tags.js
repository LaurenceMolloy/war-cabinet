const fs = require('fs');
const content = fs.readFileSync('mobile/src/app/logistics.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];
lines.forEach((line, i) => {
  const openMatches = line.matchAll(/<([a-zA-Z0-9]+)(?:\s|>)/g);
  for (const match of openMatches) {
    const tag = match[1];
    if (line.includes('/>') && line.indexOf('/>') > match.index) continue; // Skip self-closing
    if (tag === 'br' || tag === 'img' || tag === 'TextInput' || tag === 'ActivityIndicator' || tag === 'MaterialCommunityIcons' || tag === 'Switch') {
        // These are often self-closing or I know they are fine
    } else {
        stack.push({ tag, line: i + 1 });
    }
  }
  const closeMatches = line.matchAll(/<\/([a-zA-Z0-9]+)>/g);
  for (const match of closeMatches) {
    const tag = match[1];
    if (stack.length > 0 && stack[stack.length - 1].tag === tag) {
      stack.pop();
    } else {
      console.log(`Unexpected closing tag </${tag}> at line ${i + 1}`);
    }
  }
});

console.log('Unclosed tags:');
stack.forEach(s => console.log(`${s.tag} at line ${s.line}`));

import fs from 'fs';

const content = fs.readFileSync('c:\\Users\\Laurence Molloy\\Desktop\\GIT\\Personal_Github\\war-cabinet\\mobile\\src\\app\\recipes.tsx', 'utf8');

let openTags = 0;
let closeTags = 0;

// Match <View (but not </View)
const openRegex = /<View(?!\/)/g;
const closeRegex = /<\/View>/g;

let match;
while ((match = openRegex.exec(content)) !== null) {
    openTags++;
}
while ((match = closeRegex.exec(content)) !== null) {
    closeTags++;
}

console.log(`Open Views: ${openTags}`);
console.log(`Close Views: ${closeTags}`);

// Count TouchableOpacity
let openTO = 0;
let closeTO = 0;
const openTORegex = /<TouchableOpacity(?!\/)/g;
const closeTORegex = /<\/TouchableOpacity>/g;

while ((match = openTORegex.exec(content)) !== null) {
    openTO++;
}
while ((match = closeTORegex.exec(content)) !== null) {
    closeTO++;
}
console.log(`Open TouchableOpacity: ${openTO}`);
console.log(`Close TouchableOpacity: ${closeTO}`);

// Count curly braces inside the return
const startReturn = content.indexOf('return (');
const endReturn = content.lastIndexOf(');');
const returnContent = content.substring(startReturn, endReturn);

let openBrace = 0;
let closeBrace = 0;
for (let char of returnContent) {
    if (char === '{') openBrace++;
    if (char === '}') closeBrace++;
}
console.log(`Open braces in return: ${openBrace}`);
console.log(`Close braces in return: ${closeBrace}`);

const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.join(__dirname, '../gdd_extract.xml'), 'utf8');
const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
let match;
const parts = [];
while ((match = regex.exec(xml)) !== null) parts.push(match[1]);
fs.writeFileSync(path.join(__dirname, '../gdd_text.txt'), parts.join(''));
console.log('Extracted', parts.length, 'text segments');

import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
const bad = "join('" + String.fromCharCode(10) + "');";
const good = "join('\\n');";
if (!source.includes(bad)) throw new Error('Missing malformed relationship context newline marker');
source = source.replace(bad, good);
fs.writeFileSync(path, source);
console.log('Fixed phase 1 relationship context newline literal');

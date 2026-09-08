import fs from 'node:fs';
const path = 'tools/v0526-patch.mjs';
let source = fs.readFileSync(path, 'utf8');
const from = 'and isolated quoted `you` outside the accepted NPC activity remain rejected.';
const to = 'and isolated quoted \\`you\\` outside the accepted NPC activity remain rejected.';
if (!source.includes(from)) throw new Error('expected helper fragment not found');
source = source.replace(from, to);
fs.writeFileSync(path, source, 'utf8');
console.log('temporary helper quoting fixed');

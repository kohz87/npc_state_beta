import fs from 'node:fs';

const path = 'v03/relationship-policy.js';
let source = fs.readFileSync(path, 'utf8');
const trimmed = source.trimEnd();
if (trimmed.endsWith('}\n\n}')) {
    source = trimmed.slice(0, -1).trimEnd() + '\n';
    fs.writeFileSync(path, source);
}

console.log('Repaired NPC State 0.4.20 relationship policy transform boundary');

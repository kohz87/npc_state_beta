import fs from 'node:fs';

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
const before = `    applyBirthdayFill,\n    createEmptyState,\n    findNpcByReference,`;
const after = `    applyBirthdayFill,\n    findNpcByReference,\n    createEmptyState,`;
if (!source.includes(after)) {
    if (!source.includes(before)) throw new Error('Missing v0.4.33 engine schema import compatibility marker');
    source = source.replace(before, after);
    fs.writeFileSync(path, source);
}
console.log('Prepared v0.4.33 engine schema import ordering for life-state transform');

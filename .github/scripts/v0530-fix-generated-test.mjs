import fs from 'node:fs';

const path = 'tests/v0530-first-pass-sufficiency.test.mjs';
if (!fs.existsSync(path)) process.exit(0);
let source = fs.readFileSync(path, 'utf8');
const replacements = [
    ['safe/default', 'safe\\/default'],
    ['new/first-scene', 'new\\/first-scene'],
    ['status/observation', 'status\\/observation'],
];
for (const [before, after] of replacements) source = source.replace(before, after);
fs.writeFileSync(path, source);

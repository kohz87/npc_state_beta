import fs from 'node:fs';

const path = 'v03/injection.js';
let source = fs.readFileSync(path, 'utf8');
const from = "field('Current/known forms', appearanceFormsText(npc))";
const to = "field('Known physical forms', appearanceFormsText(npc))";
if (!source.includes(from)) throw new Error('Missing Phase 1B form-label marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Preserved v0.4.1+ Known physical forms injection label');

import fs from 'node:fs';

const path = 'v03/ui.js';
let source = fs.readFileSync(path, 'utf8');
const from = `            const npc = findNpcByReference(state(), id);`;
const to = `            const npc = dossierNpc(id);`;
if (source.includes(from)) source = source.replaceAll(from, to);
else if (!source.includes(to)) throw new Error('Missing v0.4.39 dossier action lookup marker');
fs.writeFileSync(path, source);

console.log('Moved remaining dossier actions onto v0.4.39 selected-NPC projection reads');
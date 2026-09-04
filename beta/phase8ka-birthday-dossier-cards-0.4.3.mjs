import fs from 'node:fs';

const path = 'v03/dossier-view.js';
let source = fs.readFileSync(path, 'utf8');
const from = "          <div class=\"npc-state-v3-current-grid\">\n            ${currentFact('Mood', npc.mood)}";
const to = "          <div class=\"npc-state-v3-current-grid\">\n            ${currentFact('Actual age', npc.age)}\n            ${currentFact('Apparent age', npc.apparentAge)}\n            ${currentFact('Birthday', npc.birthday ? npc.birthday + (npc.birthdayProvenance === 'generated' ? ' · generated placeholder' : '') : '')}\n            ${currentFact('Mood', npc.mood)}";
if (!source.includes(from)) throw new Error('Missing phase 8KA dossier Current-grid marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Added NPC State 0.4.3 separate Actual age, Apparent age, and Birthday dossier cards');

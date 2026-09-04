import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `        'appearanceFormChanges normally revises a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution. mode age_progression is the narrow exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence for every revision.',`;
const to = `        'appearanceFormChanges may revise a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution; mode age_progression is the narrow exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence for every revision.',`;
if (!source.includes(from)) throw new Error('Missing targeted form compatibility marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Preserved targeted Refresh form-revision compatibility wording');

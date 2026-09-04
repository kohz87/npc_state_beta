import fs from 'node:fs';

const path = 'beta/verify-phase8a-form-aware-appearance-sync-0.4.3.mjs';
let source = fs.readFileSync(path, 'utf8');

const oldInjection = "assert(injection.includes('Shared / ordinary appearance: ' + mira.appearance), 'Foreground injection does not distinguish stored shared/ordinary appearance');";
const newInjection = "assert(!injection.includes('Shared / ordinary appearance:'), 'Foreground injection still exposes redundant stored shared/ordinary appearance');\nassert(!injection.includes('Current form:'), 'Foreground injection still exposes redundant standalone Current form');\nassert(injection.includes('Appearance forms:'), 'Foreground injection lacks the compact Appearance forms registry');";
if (!source.includes(oldInjection)) throw new Error('Missing legacy injection appearance assertion');
source = source.replace(oldInjection, newInjection);

const oldDossier = "assert(dossier.includes('Shared / ordinary appearance'), 'Dossier lacks Shared / ordinary appearance');\nassert(dossier.includes('Appearance forms'), 'Dossier lacks complete Appearance forms registry');";
const newDossier = "assert(!dossier.includes('Shared / ordinary appearance'), 'Dossier still exposes redundant Shared / ordinary appearance');\nassert(!dossier.includes('>Current form<'), 'Dossier still exposes redundant standalone Current form');\nassert(dossier.includes('Appearance forms'), 'Dossier lacks complete Appearance forms registry');";
if (!source.includes(oldDossier)) throw new Error('Missing legacy dossier appearance assertions');
source = source.replace(oldDossier, newDossier);

fs.writeFileSync(path, source);
console.log('Made legacy appearance verifier compatible with 0.4.5 two-surface presentation');

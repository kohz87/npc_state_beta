import fs from 'node:fs';

const path = 'beta/verify-phase39-relationship-evidence-contract-0.4.20.mjs';
let source = fs.readFileSync(path, 'utf8');

const exact = "assert.equal(manifest.version, '0.4.20');";
const descendant = "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 20, 'Relationship evidence verifier regressed below v0.4.20');";
if (source.includes(exact)) source = source.replace(exact, descendant);
else if (!source.includes('Relationship evidence verifier regressed below v0.4.20')) throw new Error('Missing v0.4.20 relationship evidence verifier version marker');

fs.writeFileSync(path, source);
console.log('Made v0.4.20 relationship evidence verifier forward-compatible with v0.4.21+');

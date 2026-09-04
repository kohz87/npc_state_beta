import fs from 'node:fs';

const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
let source = fs.readFileSync(path, 'utf8');
const from = `    assert(schema.includes("NPC_STATE_VERSION = '0.4.2'"), 'Runtime version was not bumped to 0.4.2');
    assert(manifest.version === '0.4.2', 'Manifest version was not bumped to 0.4.2');`;
const to = `    const runtimeMatch = schema.match(/NPC_STATE_VERSION = '(0\\.4\\.(\\d+))'/);
    assert(runtimeMatch && Number(runtimeMatch[2]) >= 2, 'Runtime version regressed below the 0.4.2 relationship-hardening baseline');
    const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
    assert(/^0\\.4\\./.test(String(manifest.version || '')) && Number.isFinite(manifestPatch) && manifestPatch >= 2, 'Manifest version regressed below the 0.4.2 relationship-hardening baseline');`;
if (!source.includes(from)) throw new Error('Missing legacy 0.4.2 verifier version marker');
source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Made legacy 0.4.2 relationship verifier forward-compatible with 0.4.x descendants');

import fs from 'node:fs';

const path = 'beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs';
let source = fs.readFileSync(path, 'utf8');
const old = "assert.equal(manifest.version, '0.4.11');";
const replacement = "assert(Number(manifest.version.split('.')[2]) >= 11, 'Manifest regressed below 0.4.11');";
if (!source.includes(old) && !source.includes(replacement)) throw new Error('Missing v0.4.11 verifier version marker');
source = source.replace(old, replacement);
fs.writeFileSync(path, source);
console.log('Made v0.4.11 scanner verifier forward-compatible with v0.4.12+');

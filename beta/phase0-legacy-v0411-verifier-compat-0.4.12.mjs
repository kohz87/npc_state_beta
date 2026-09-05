import fs from 'node:fs';

const path = 'beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs';
let source = fs.readFileSync(path, 'utf8');
const oldVersion = "assert.equal(manifest.version, '0.4.11');";
const replacementVersion = "assert(Number(manifest.version.split('.')[2]) >= 11, 'Manifest regressed below 0.4.11');";
if (!source.includes(oldVersion) && !source.includes(replacementVersion)) throw new Error('Missing v0.4.11 verifier version marker');
source = source.replace(oldVersion, replacementVersion);
const oldError = "/missing required payload structure/i";
const replacementError = "/(?:missing required payload structure|invalid payload structure or members)/i";
if (!source.includes(oldError) && !source.includes(replacementError)) throw new Error('Missing v0.4.11 invalid-payload assertion marker');
source = source.replace(oldError, replacementError);
fs.writeFileSync(path, source);
console.log('Made v0.4.11 scanner verifier forward-compatible with v0.4.12+');

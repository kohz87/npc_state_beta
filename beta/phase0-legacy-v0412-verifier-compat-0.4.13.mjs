import fs from 'node:fs';

const path = 'beta/verify-phase17-second-order-hardening-0.4.12.mjs';
let source = fs.readFileSync(path, 'utf8');
const oldLine = "assert.equal(manifest.version, '0.4.12');";
const newLine = "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 12, 'Manifest regressed below v0.4.12');";
if (source.includes(oldLine)) source = source.replace(oldLine, newLine);
else if (!source.includes('Manifest regressed below v0.4.12')) throw new Error('Missing v0.4.12 verifier manifest marker');
fs.writeFileSync(path, source);
console.log('Made v0.4.12 second-order verifier forward-compatible with v0.4.13+');

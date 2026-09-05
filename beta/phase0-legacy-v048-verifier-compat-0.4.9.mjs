import fs from 'node:fs';

const path = 'beta/verify-phase13-milestone-gate-invariants-0.4.8.mjs';
let source = fs.readFileSync(path, 'utf8');
const oldLine = "assert.equal(manifest.version, '0.4.8', 'Manifest was not bumped to 0.4.8');";
const newLine = "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 8, 'Manifest is not a 0.4.8+ descendant');";
if (source.includes(oldLine)) source = source.replace(oldLine, newLine);
else if (!source.includes("Manifest is not a 0.4.8+ descendant")) throw new Error('Missing legacy 0.4.8 manifest assertion');
fs.writeFileSync(path, source);
console.log('Made 0.4.8 gate verifier forward-compatible with 0.4.x descendants');

import fs from 'node:fs';

const path = 'beta/verify-phase10-appearance-presentation-0.4.5.mjs';
let source = fs.readFileSync(path, 'utf8');

const oldHeader = "assert(injection.includes('[NPC STATE v0.4.5 BETA | FOREGROUND CONTINUITY]'), '0.4.5 injection header missing');";
const newHeader = "assert(/\\[NPC STATE v0\\.4\\.\\d+ BETA \\| FOREGROUND CONTINUITY\\]/.test(injection), '0.4.x descendant injection header missing');";
if (!source.includes(oldHeader) && !source.includes(newHeader)) throw new Error('Missing legacy 0.4.5 injection-header assertion');
source = source.replace(oldHeader, newHeader);

const oldManifest = "assert(manifest.version === '0.4.5', 'Manifest was not bumped to 0.4.5');";
const newManifest = "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 5, 'Manifest is not a 0.4.5+ descendant');";
if (!source.includes(oldManifest) && !source.includes(newManifest)) throw new Error('Missing legacy 0.4.5 manifest assertion');
source = source.replace(oldManifest, newManifest);

fs.writeFileSync(path, source);
console.log('Made 0.4.5 appearance verifier forward-compatible with 0.4.x descendants');
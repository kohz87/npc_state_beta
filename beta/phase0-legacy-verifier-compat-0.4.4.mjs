import fs from 'node:fs';

const path = 'beta/verify-phase1-generation-continuity-0.4.3.mjs';
let source = fs.readFileSync(path, 'utf8');
const from = "assert(injection.includes('[NPC STATE v0.4.3 BETA | FOREGROUND CONTINUITY]'), '0.4.3 injection header missing');";
const to = "assert(/\\[NPC STATE v0\\.4\\.[3-9] BETA \\| FOREGROUND CONTINUITY\\]/.test(injection), '0.4.x descendant injection header missing');";
if (!source.includes(from) && !source.includes(to)) throw new Error('Missing 0.4.3 generation verifier header sentinel');
if (source.includes(from)) source = source.replace(from, to);
fs.writeFileSync(path, source);
console.log('Made 0.4.3 generation continuity verifier forward-compatible with 0.4.x descendants');

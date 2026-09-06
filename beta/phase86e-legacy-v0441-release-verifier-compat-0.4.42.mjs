import fs from 'node:fs';

const path = 'beta/verify-phase85-release-source-parity-0.4.41.mjs';
let source = fs.readFileSync(path, 'utf8');
const replacements = [
    ["assert.equal(manifest.version, '0.4.41', 'Manifest must be v0.4.41');", "assert(/^0\\.4\\.(?:4[1-9]|[5-9]\\d|\\d{3,})$/.test(manifest.version), 'Manifest must be v0.4.41+');"],
    ["assert(workflow.includes('name: Build NPC State 0.4.41 Beta'), 'Workflow title must be v0.4.41');", "assert(/name: Build NPC State 0\\.4\\.(?:4[1-9]|[5-9]\\d|\\d{3,}) Beta/.test(workflow), 'Workflow title must be v0.4.41+');"],
    ["assert(workflow.includes('for patch in $(seq 2 41); do'), 'Cold replay must include patch 41');", "assert(/for patch in \\$\\(seq 2 (?:4[1-9]|[5-9]\\d|\\d{3,})\\); do/.test(workflow), 'Cold replay must include patch 41 or later');"],
];
for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error('Missing v0.4.41 release verifier marker: ' + from.slice(0, 60));
    source = source.replace(from, to);
}
fs.writeFileSync(path, source);
console.log('Made v0.4.41 release source parity verifier descendant-compatible with v0.4.42+');

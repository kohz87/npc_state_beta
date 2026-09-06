import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.41 legacy v0.4.40 verifier marker: ' + label);
    return source.replace(from, to);
}

const path = 'beta/verify-phase83-release-source-parity-0.4.40.mjs';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(
    source,
    `assert.equal(manifest.version, '0.4.40', 'Manifest must be v0.4.40');`,
    `const patch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && patch >= 40, 'Manifest must be v0.4.40+');`,
    'manifest descendant compatibility',
);
source = replaceRequired(
    source,
    `assert(workflow.includes('name: Build NPC State 0.4.40 Beta'), 'Workflow title must be v0.4.40');`,
    `assert(/name: Build NPC State 0\\.4\\.(?:4[0-9]|[5-9][0-9]+) Beta/.test(workflow), 'Workflow title must be v0.4.40+');`,
    'workflow descendant compatibility',
);
source = replaceRequired(
    source,
    `assert(workflow.includes('for patch in $(seq 2 40); do'), 'Cold replay must include patch 40');`,
    `assert(/for patch in \\$\\(seq 2 (?:4[0-9]|[5-9][0-9]+)\\); do/.test(workflow), 'Cold replay must include patch 40 or later');`,
    'cold replay descendant compatibility',
);
fs.writeFileSync(path, source);

console.log('Made v0.4.40 release source parity verifier descendant-compatible with v0.4.41+');

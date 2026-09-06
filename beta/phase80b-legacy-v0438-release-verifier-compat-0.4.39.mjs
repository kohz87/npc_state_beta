import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.39 legacy v0.4.38 verifier marker: ' + label);
    return source.replace(from, to);
}

const path = 'beta/verify-phase79-release-source-parity-0.4.38.mjs';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(
    source,
    `assert.equal(manifest.version, '0.4.38', 'Manifest must be v0.4.38');`,
    `assert(/^0\\.4\\.(?:3[8-9]|[4-9]\\d+)$/.test(manifest.version), 'Manifest must be v0.4.38+');`,
    'manifest descendant compatibility',
);
source = replaceRequired(
    source,
    `assert(workflow.includes('name: Build NPC State 0.4.38 Beta'), 'Workflow title must be v0.4.38');`,
    `assert(/name: Build NPC State 0\\.4\\.(?:3[8-9]|[4-9]\\d+) Beta/.test(workflow), 'Workflow title must be v0.4.38+');`,
    'workflow title descendant compatibility',
);
source = replaceRequired(
    source,
    `assert(workflow.includes('for patch in $(seq 2 38); do'), 'Cold replay must include patch 38');`,
    `assert(/for patch in \\$\\(seq 2 (?:3[8-9]|[4-9]\\d+)\\); do/.test(workflow), 'Cold replay must include patch 38 or later');`,
    'cold replay descendant compatibility',
);
fs.writeFileSync(path, source);

console.log('Made v0.4.38 release parity verifier descendant-compatible with v0.4.39+');
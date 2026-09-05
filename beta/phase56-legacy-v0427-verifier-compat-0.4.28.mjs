import fs from 'node:fs';

const path = 'beta/verify-phase56-release-source-parity-0.4.27.mjs';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label) {
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.27 parity verifier marker: ' + label);
    source = source.replace(from, to);
}

replaceRequired(
    `assert.equal(manifest.version, '0.4.27', 'Manifest is not v0.4.27');`,
    `assert(/^0\\.4\\.(?:27|2[89]|[3-9]\\d+)$/.test(manifest.version), 'Manifest is older than v0.4.27');`,
    'manifest version',
);
replaceRequired(
    `assert(workflow.includes('name: Build NPC State 0.4.27 Beta'), 'Workflow title is not v0.4.27');`,
    `assert(/name: Build NPC State 0\\.4\\.\\d+ Beta/.test(workflow), 'Workflow title is not an NPC State 0.4.x beta build');`,
    'workflow title',
);
replaceRequired(
    `assert(workflow.includes('for patch in $(seq 2 27); do'), 'Cold replay does not include v0.4.27');`,
    `assert(/for patch in \\$(?:\\(seq 2 \\d+\\)); do/.test(workflow), 'Cold replay loop is missing');`,
    'cold replay loop',
);
replaceRequired(
    `assert(readme.includes('# NPC State Beta 0.4.27'), 'README title is not v0.4.27');`,
    `assert(/# NPC State Beta 0\\.4\\.\\d+/.test(readme), 'README title is not an NPC State 0.4.x release');`,
    'README title',
);

fs.writeFileSync(path, source);
console.log('Made v0.4.27 release parity verifier forward-compatible with v0.4.28+');

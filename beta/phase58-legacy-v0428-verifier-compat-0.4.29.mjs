import fs from 'node:fs';

const path = 'beta/verify-phase58-release-source-parity-0.4.28.mjs';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label, acceptedFuture = []) {
    if (source.includes(to) || acceptedFuture.some(marker => source.includes(marker))) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.28 verifier marker for v0.4.29+: ' + label);
    source = source.replace(from, to);
}

replaceRequired(
    "assert.equal(manifest.version, '0.4.28', 'Manifest is not v0.4.28');",
    "assert(/^0\\.4\\.(?:28|29)$/.test(String(manifest.version)), 'Manifest is older than v0.4.28');",
    'manifest version',
    ["assert(/^0\\.4\\.(?:2[89]|[3-9]\\d)$/.test(String(manifest.version)), 'Manifest is older than v0.4.28');"],
);
replaceRequired(
    "assert(workflow.includes('name: Build NPC State 0.4.28 Beta'), 'Workflow title is not v0.4.28');",
    "assert(/name: Build NPC State 0\\.4\\.(?:28|29) Beta/.test(workflow), 'Workflow title is older than v0.4.28');",
    'workflow title',
    ["assert(/name: Build NPC State 0\\.4\\.(?:2[89]|[3-9]\\d) Beta/.test(workflow), 'Workflow title is older than v0.4.28');"],
);
replaceRequired(
    "assert(workflow.includes('for patch in $(seq 2 28); do'), 'Cold replay does not include v0.4.28');",
    "assert(/for patch in \\$\\(seq 2 (?:28|29)\\); do/.test(workflow), 'Cold replay does not include v0.4.28+');",
    'cold replay range',
    ["assert(/for patch in \\$\\(seq 2 (?:2[89]|[3-9]\\d)\\); do/.test(workflow), 'Cold replay does not include v0.4.28+');"],
);
replaceRequired(
    "assert(workflow.includes(\"# node beta/bump-0.4.28.mjs ; -name 'phase*-0.4.28.mjs'\"), 'Workflow lacks v0.4.28 source marker');",
    "assert(workflow.includes(\"# node beta/bump-0.4.28.mjs ; -name 'phase*-0.4.28.mjs'\"), 'Workflow lacks v0.4.28 source marker');\nassert(!workflow.includes('for patch in $(seq 2 27); do'), 'Cold replay regressed below v0.4.28');",
    'source marker compatibility',
    ["assert(!workflow.includes('for patch in $(seq 2 27); do'), 'Cold replay regressed below v0.4.28');"],
);
replaceRequired(
    "assert(readme.includes('# NPC State Beta 0.4.28'), 'README title is not v0.4.28');",
    "assert(/# NPC State Beta 0\\.4\\.(?:28|29)/.test(readme), 'README title is older than v0.4.28');",
    'README version',
    ["assert(/# NPC State Beta 0\\.4\\.(?:2[89]|[3-9]\\d)/.test(readme), 'README title is older than v0.4.28');"],
);
replaceRequired(
    "console.log('NPC State 0.4.28 release source parity verified');",
    "console.log('NPC State 0.4.28+ release source parity verified');",
    'console marker',
);

fs.writeFileSync(path, source);
console.log('Made v0.4.28 release source parity verifier replay-safe through v0.4.30 descendants');

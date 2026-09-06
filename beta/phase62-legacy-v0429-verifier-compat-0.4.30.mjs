import fs from 'node:fs';

function replaceCompat(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.30 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

const path = 'beta/verify-phase60-release-source-parity-0.4.29.mjs';
let source = fs.readFileSync(path, 'utf8');

source = replaceCompat(
    source,
    "assert.equal(manifest.version, '0.4.29', 'Manifest is not v0.4.29');",
    "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 29, 'Manifest regressed below v0.4.29');",
    'manifest version',
);
source = replaceCompat(
    source,
    "assert(workflow.includes('name: Build NPC State 0.4.29 Beta'), 'Workflow title is not v0.4.29');",
    "assert(/name: Build NPC State 0\\.4\\.(?:29|[3-9]\\d) Beta/.test(workflow), 'Workflow title regressed below v0.4.29');",
    'workflow title',
);
source = replaceCompat(
    source,
    "assert(workflow.includes('for patch in $(seq 2 29); do'), 'Cold replay does not include v0.4.29');",
    "assert(/for patch in \\$\\(seq 2 (?:29|[3-9]\\d)\\); do/.test(workflow), 'Cold replay regressed below v0.4.29');",
    'cold replay range',
);
source = replaceCompat(
    source,
    "assert(readme.includes('# NPC State Beta 0.4.29'), 'README title is not v0.4.29');",
    "assert(/^# NPC State Beta 0\\.4\\.(?:29|[3-9]\\d)/m.test(readme), 'README title regressed below v0.4.29');",
    'README title',
);
source = replaceCompat(
    source,
    "console.log('NPC State 0.4.29 release source parity verified');",
    "console.log('NPC State 0.4.29+ release source parity verified');",
    'verifier label',
);

fs.writeFileSync(path, source);
console.log('Made v0.4.29 release parity verifier forward-compatible with v0.4.30');

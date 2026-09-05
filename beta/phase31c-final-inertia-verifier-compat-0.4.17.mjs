import fs from 'node:fs';

const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
let source = fs.readFileSync(path, 'utf8');

const replacements = [
    [
        '// Milestones still work on top of inertia. At 50, a qualifying major +3 opens the gate,\n// while resistance means only one visible point is earned immediately.',
        '// Milestones still work on top of inertia. At 50, a qualifying major +3 opens the gate,\n// and the inclusive 26–50 band applies ×0.80 before fractional accumulation.',
    ],
    [
        "assert(mira(state).relationship.trust === 51, 'Major +3 at 50 ignored restored relationship inertia');",
        "assert(mira(state).relationship.trust === 52, 'Major +3 at 50 did not apply the v0.4.17 80% boundary-band inertia');",
    ],
    [
        "assert(near(mira(state).relationshipProgress.trust, 0.5), 'Major +3 at 50 did not retain its fractional remainder');",
        "assert(near(mira(state).relationshipProgress.trust, 0.4), 'Major +3 at 50 did not retain its v0.4.17 fractional remainder');",
    ],
];
for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error('Missing final v0.4.17 historical inertia marker');
    source = source.replace(from, to);
}
fs.writeFileSync(path, source);
console.log('Updated final historical relationship inertia expectation for v0.4.17');

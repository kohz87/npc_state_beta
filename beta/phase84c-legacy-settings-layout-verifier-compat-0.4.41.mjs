import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.41 legacy settings verifier marker: ' + label);
    return source.replace(from, to);
}

const path = 'beta/verify-phase22-settings-ui-cleanup-0.4.14.mjs';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(
    source,
    `assert(layout.includes("label.textContent = 'Relationship Rubric'"), 'Relationship rubric label missing');`,
    `assert(layout.includes("setTextIfChanged(label, 'Relationship Rubric')"), 'Relationship rubric label missing or no longer idempotent');`,
    'relationship rubric descendant expectation',
);
source = replaceRequired(
    source,
    `assert(layout.includes("label.textContent = 'Memory Rubric'"), 'Memory rubric label missing');`,
    `assert(layout.includes("setTextIfChanged(label, 'Memory Rubric')"), 'Memory rubric label missing or no longer idempotent');`,
    'memory rubric descendant expectation',
);
fs.writeFileSync(path, source);

console.log('Made v0.4.14 settings layout verifier compatible with v0.4.41 idempotent label writes');

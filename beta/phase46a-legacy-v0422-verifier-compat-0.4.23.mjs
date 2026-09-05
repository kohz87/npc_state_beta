import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.22 verifier marker for v0.4.23 compatibility: ' + label);
    return source.replace(from, to);
}

const path = 'beta/verify-phase45-release-source-parity-0.4.22.mjs';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(
    source,
    "assert.equal(manifest.version, '0.4.22', 'Release source is not v0.4.22');",
    "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 22, 'Release source regressed below v0.4.22');",
    'manifest descendant compatibility',
);
source = replaceRequired(
    source,
    "assert(policy.includes('export function relationshipMechanicsPrompt()'), 'Shared relationship numeric contract helper is missing');",
    "assert(policy.includes('export function relationshipMechanicsPrompt('), 'Shared relationship numeric contract helper is missing');",
    'settings-aware mechanics helper signature',
);
source = replaceRequired(
    source,
    "assert(injection.includes('relationshipJudgmentRubricPrompt()') && injection.includes('relationshipMechanicsPrompt()'), 'Foreground does not use shared relationship guidance');",
    "assert(injection.includes('relationshipJudgmentRubricPrompt()') && injection.includes('relationshipMechanicsPrompt('), 'Foreground does not use shared relationship guidance');",
    'foreground mechanics call compatibility',
);
source = replaceRequired(
    source,
    "assert(scanner.includes('relationshipJudgmentRubricPrompt()') && scanner.includes('relationshipMechanicsPrompt()'), 'Recovery scanner does not use shared relationship guidance');",
    "assert(scanner.includes('relationshipJudgmentRubricPrompt()') && scanner.includes('relationshipMechanicsPrompt('), 'Recovery scanner does not use shared relationship guidance');",
    'recovery mechanics call compatibility',
);
source = replaceRequired(
    source,
    "assert(workflow.includes('Build NPC State 0.4.22 Beta'), 'Workflow is not versioned for v0.4.22');",
    "assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');",
    'workflow descendant compatibility',
);
fs.writeFileSync(path, source);

console.log('Made v0.4.22 release parity verifier compatible with v0.4.23 settings-aware relationship caps');

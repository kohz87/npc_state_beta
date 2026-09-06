import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.33') {
    console.log('NPC State v0.4.33 release parity verification skipped on pre-0.4.33 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const scanner = read('v03/scanner.js');
const schema = read('v03/schema.js');
const engine = read('v03/engine.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.33', 'Manifest is not v0.4.33');
assert(workflow.includes('name: Build NPC State 0.4.33 Beta'), 'Workflow title is not v0.4.33');
assert(workflow.includes('for patch in $(seq 2 33); do'), 'Cold replay does not include v0.4.33');
assert(workflow.includes("# node beta/bump-0.4.33.mjs ; -name 'phase*-0.4.33.mjs'"), 'Workflow lacks v0.4.33 source marker');

for (const path of [
    'beta/bump-0.4.33.mjs',
    'beta/phase68-life-state-semantics-and-death-invariant-0.4.33.mjs',
    'beta/verify-phase68-life-state-semantics-and-death-invariant-0.4.33.mjs',
    'beta/verify-phase69-release-source-parity-0.4.33.mjs',
]) assert(exists(path), 'Missing v0.4.33 source-owned file: ' + path);

assert(schema.includes('export function applyConfirmedDeathTransition(input = {}, options = {})'), 'Shared confirmed-death transition is missing');
assert(schema.includes('export function normalizeLifeStateDiagnostics(value = [])'), 'Life-state diagnostics schema is missing');
assert(schema.includes("const confirmedDead = lifeState === 'dead';"), 'Dead-to-archive normalization invariant is missing');
assert(schema.includes('lifeStateDiagnostics: normalizeLifeStateDiagnostics(input.lifeStateDiagnostics)'), 'Life-state diagnostics are not persisted');
assert(scanner.includes('function lifeStateEvidenceGrounded(evidence, context)'), 'Scanner does not validate life-state evidence provenance');
assert(scanner.includes("['explicit', 'strong', 'confirmed']"), 'Scanner certainty contract is not aligned');
assert(scanner.includes("reject('unverifiable-evidence'"), 'Life-state evidence rejection diagnostic is missing');
assert(scanner.includes("reject('insufficient-certainty'"), 'Life-state certainty rejection diagnostic is missing');
assert(scanner.includes("reject('living-return-required'"), 'Dead-to-alive rejection diagnostic is missing');
assert(!scanner.includes('AFFIRMATIVE_DEATH_CUE'), 'Hardcoded death cue grammar remains');
assert(!scanner.includes('clauseAssertsNpcDeath'), 'Hardcoded death sentence parser remains');
assert(!scanner.includes('affirmativeDeathEvidence'), 'Hardcoded death semantic gate remains');
assert(!scanner.includes('affirmativeLivingReturnEvidence'), 'Hardcoded living-return semantic gate remains');
assert(engine.includes('const authoritativeManualDeath ='), 'Manual confirmed-death transition is not explicit');
assert(engine.includes('applyConfirmedDeathTransition(nextRaw'), 'Manual death does not use shared transition');

assert(readme.startsWith('# NPC State Beta 0.4.33'), 'README title is not v0.4.33');
assert(readme.includes('## Grounded semantic life-state transitions'), 'README lacks v0.4.33 life-state documentation');
assert(changelog.includes('## v0.4.33'), 'CHANGELOG lacks v0.4.33 entry');
assert(changelog.includes('hardcoded English sentence-pattern gating'), 'CHANGELOG lacks semantic death-gate removal');
assert(changelog.includes('lifeStateDiagnostics'), 'CHANGELOG lacks rejection diagnostics');

console.log('NPC State v0.4.33 release source parity verified');

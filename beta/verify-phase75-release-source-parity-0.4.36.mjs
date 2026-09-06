import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.36') {
    console.log('NPC State v0.4.36 release parity verification skipped on pre-0.4.36 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const schema = read('v03/schema.js');
const scanner = read('v03/scanner.js');
const engine = read('v03/engine.js');
const injection = read('v03/injection.js');
const ui = read('v03/ui.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.36', 'Manifest is not v0.4.36');
assert(workflow.includes('name: Build NPC State 0.4.36 Beta'), 'Workflow title is not v0.4.36');
assert(workflow.includes('for patch in $(seq 2 36); do'), 'Cold replay does not include v0.4.36');
assert(workflow.includes("# node beta/bump-0.4.36.mjs ; -name 'phase*-0.4.36.mjs'"), 'Workflow lacks v0.4.36 source marker');

for (const path of [
    'beta/bump-0.4.36.mjs',
    'beta/phase74-life-state-reconciliation-and-manual-recovery-0.4.36.mjs',
    'beta/verify-phase74-life-state-reconciliation-and-manual-recovery-0.4.36.mjs',
    'beta/verify-phase75-release-source-parity-0.4.36.mjs',
]) assert(exists(path), 'Missing v0.4.36 source-owned file: ' + path);

assert(schema.includes('export function applyManualLifeStateTransition'), 'Generated schema lacks manual lifecycle helper');
assert(scanner.includes('lifeStateUpdates'), 'Generated scanner lacks dedicated lifecycle channel');
assert(scanner.includes('lifeStateUpdateByNpcId'), 'Generated scanner does not independently route lifecycle updates');
assert(scanner.includes('LIFE-STATE UPDATE CHANNEL'), 'Generated scanner lacks lifecycle-channel instruction');
assert(engine.includes('applyManualLifeStateTransition'), 'Generated engine lacks manual lifecycle transition plumbing');
assert(engine.includes('parsedRaw.lifeStateUpdates'), 'Generated targeted refresh drops lifecycle updates');
assert(injection.includes('lifeStateUpdates'), 'Generated foreground capture lacks lifecycle output channel');
assert(ui.includes('npc_state_v3_edit_life_state'), 'Generated UI lacks Life state editor');
assert(ui.includes('npc_state_v3_edit_life_state_reason'), 'Generated UI lacks Life-state note editor');
assert(!scanner.includes('AFFIRMATIVE_DEATH_CUE'), 'Generated scanner reintroduced hardcoded English death grammar');
assert(!scanner.includes('clauseAssertsNpcDeath'), 'Generated scanner reintroduced a hardcoded death sentence parser');

assert(readme.startsWith('# NPC State Beta 0.4.36'), 'README title is not v0.4.36');
assert(readme.includes('## Lifecycle reconciliation and manual life-state recovery'), 'README lacks v0.4.36 lifecycle documentation');
assert(changelog.includes('## v0.4.36\n'), 'CHANGELOG lacks v0.4.36 entry');
assert(changelog.includes('lifeStateUpdates'), 'CHANGELOG lacks dedicated lifecycle-channel description');
assert(changelog.includes('manual Life state editing'), 'CHANGELOG lacks manual lifecycle recovery description');

console.log('NPC State v0.4.36 release source parity verified');

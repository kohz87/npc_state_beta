import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.30') {
    console.log('NPC State v0.4.30 release parity verification skipped on pre-0.4.30 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const branches = read('v03/branches.js');
const engine = read('v03/engine.js');
const schema = read('v03/schema.js');
const index = read('v03/index.js');
const ui = read('v03/branch-recovery-ui.js');
const settings = read('v03/settings-layout.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.30', 'Manifest is not v0.4.30');
assert(workflow.includes('name: Build NPC State 0.4.30 Beta'), 'Workflow title is not v0.4.30');
assert(workflow.includes('for patch in $(seq 2 30); do'), 'Cold replay does not include v0.4.30');
assert(workflow.includes("# node beta/bump-0.4.30.mjs ; -name 'phase*-0.4.30.mjs'"), 'Workflow lacks v0.4.30 source marker');

for (const path of [
    'beta/bump-0.4.30.mjs',
    'beta/phase61-safe-rebase-relationship-modes-0.4.29.mjs',
    'beta/phase62-legacy-v0429-verifier-compat-0.4.30.mjs',
    'beta/verify-phase61-safe-rebase-relationship-modes-0.4.29.mjs',
    'beta/verify-phase63-release-source-parity-0.4.30.mjs',
]) assert(exists(path), 'Missing v0.4.30 source-owned file: ' + path);

assert(branches.includes("relationshipMode = 'preserve'"), 'Rebase does not default to preserve mode');
assert(branches.includes('previewRelationshipRebase'), 'Rollback relationship preview is missing');
assert(branches.includes("timelineStatus: 'accepted-pre-rebase'"), 'Accepted pre-rebase audit quarantine is missing');
assert(engine.includes("applyRelationship: rebase && mode === 'preserve' ? false : null"), 'Preserve refresh can still duplicate relationship movement');
assert(engine.includes('Timeline rebase refused to persist without a restorable pre-rebase snapshot.'), 'Pre-rebase backup assertion is missing');
assert(schema.includes('rebaseBackup'), 'Rebase backup is not persisted by schema');
assert(index.includes('previewRebase: options => engine.previewRebase(options)'), 'Rollback preview is not public');
assert(ui.includes('Keep NPC state and accept timeline'), 'Preserve action is missing from UI');
assert(ui.includes('Roll back discarded story changes'), 'Rollback action is missing from UI');
assert(settings.includes('keep current NPC relationship state'), 'Advanced Recovery copy does not explain preservation');

assert(readme.startsWith('# NPC State Beta 0.4.30'), 'README title is not v0.4.30');
assert(readme.includes('## Safe timeline rebase relationship modes'), 'README lacks v0.4.30 rebase documentation');
assert(changelog.includes('## v0.4.30'), 'CHANGELOG lacks v0.4.30 entry');
assert(changelog.includes('Separates timeline acceptance from relationship rollback'), 'CHANGELOG lacks the primary v0.4.30 behavior change');

console.log('NPC State v0.4.30 release source parity verified');

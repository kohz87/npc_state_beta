import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.31') {
    console.log('NPC State v0.4.31 release parity verification skipped on pre-0.4.31 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const engine = read('v03/engine.js');
const branches = read('v03/branches.js');
const schema = read('v03/schema.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert.equal(manifest.version, '0.4.31', 'Manifest is not v0.4.31');
assert(workflow.includes('name: Build NPC State 0.4.31 Beta'), 'Workflow title is not v0.4.31');
assert(workflow.includes('for patch in $(seq 2 31); do'), 'Cold replay does not include v0.4.31');
assert(workflow.includes("# node beta/bump-0.4.31.mjs ; -name 'phase*-0.4.31.mjs'"), 'Workflow lacks v0.4.31 source marker');

for (const path of [
    'beta/bump-0.4.31.mjs',
    'beta/phase64-rebase-state-boundary-hardening-0.4.31.mjs',
    'beta/verify-phase64-rebase-state-boundary-hardening-0.4.31.mjs',
    'beta/verify-phase65-release-source-parity-0.4.31.mjs',
]) assert(exists(path), 'Missing v0.4.31 source-owned file: ' + path);

assert(schema.includes('relationshipReplayBoundary'), 'Persisted accepted relationship boundary is missing from schema');
assert(engine.includes('relationshipReplayProtected(state, chat = [], messageId = null)'), 'Replay-boundary enforcement helper is missing');
assert(engine.includes("chatChanged('after-queue')"), 'Queued rebase is not bound to its origin chat');
assert(engine.includes("stage: 'preview-after-load'"), 'Rebase preview is not bound to its origin chat');
assert(engine.includes("reason: 'rebase-required'"), 'Unsafe reconciliation does not expose rebase-required');
assert(engine.includes('persistenceFailed: Boolean(persistenceError)'), 'Unsafe-state persistence failure is not surfaced');
assert(engine.includes('applyRelationship: relationshipApplyRequested && !replayProtectedRelationship'), 'Manual/full scanner retries can bypass accepted relationship boundary');
assert(engine.includes('applyRelationship: !relationshipReplayProtected(state, chat, messageId)'), 'Embedded scanner can bypass accepted relationship boundary');
assert(branches.includes("next.relationshipReplayBoundary = mode === 'preserve'"), 'Preserve rebase does not establish the accepted relationship boundary');
assert(branches.includes('restored.rebaseBackup = structuredClone(normalized.rebaseBackup || null)'), 'Checkpoint restoration still drops the rebase backup');

assert(readme.startsWith('# NPC State Beta 0.4.31'), 'README title is not v0.4.31');
assert(readme.includes('## Rebase state and operation-boundary hardening'), 'README lacks v0.4.31 state-boundary documentation');
assert(changelog.includes('## v0.4.31'), 'CHANGELOG lacks v0.4.31 entry');
assert(changelog.includes('accepted relationship replay boundary'), 'CHANGELOG lacks replay-boundary fix');
assert(changelog.includes('Preserves `rebaseBackup` across checkpoint rollback'), 'CHANGELOG lacks backup-retention fix');

console.log('NPC State v0.4.31 release source parity verified');

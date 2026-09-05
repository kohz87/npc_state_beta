import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const workflow = read('.github/workflows/seed-beta.yml');
const schema = read('v03/schema.js');
const storage = read('v03/storage.js');
const engine = read('v03/engine.js');
const index = read('v03/index.js');
const ui = read('v03/branch-recovery-ui.js');
const scanner = read('v03/scanner.js');
const dossier = read('v03/dossier-view.js');
const phase57 = read('beta/phase57-recovery-rebuild-core-0.4.28.mjs');
const phase57b = read('beta/phase57b-recovery-ui-0.4.28.mjs');
const verify57 = read('beta/verify-phase57-recovery-rebuild-0.4.28.mjs');
const changelog = read('CHANGELOG.md');
const readme = read('README.md');

assert.equal(manifest.version, '0.4.28', 'Manifest is not v0.4.28');
assert(workflow.includes('name: Build NPC State 0.4.28 Beta'), 'Workflow title is not v0.4.28');
assert(workflow.includes('for patch in $(seq 2 28); do'), 'Cold replay does not include v0.4.28');
assert(workflow.includes("# node beta/bump-0.4.28.mjs ; -name 'phase*-0.4.28.mjs'"), 'Workflow lacks v0.4.28 source marker');
assert(workflow.includes('beta/verify-*.mjs'), 'Generated-file parity still uses an incomplete hard-coded verifier list');
assert(workflow.includes('Source checkout behavior gate'), 'Workflow does not test regenerated source checkout directly');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks zero-diff parity exit');

for (const marker of [
    'RECOVERY_RELATIONSHIP_MODES',
    'RECOVERY_STATUSES',
    'normalizeRecoveryRelationshipMode',
    'normalizeRecoveryState',
    'recovery: null',
    'copy.recovery = null',
]) assert(schema.includes(marker), 'Schema lacks recovery marker: ' + marker);

for (const marker of [
    'createRecoveryV3Sidecar',
    'makeRecoveryV3FileName',
    'NPC_STATE_V04_BETA_RECOVERY_SOURCE_EXISTS',
    'newer sidecar pointer from another tab',
]) assert(storage.includes(marker), 'Storage lacks recovery marker: ' + marker);

for (const marker of [
    'startHistoricalRecovery',
    'resumeHistoricalRecovery',
    'pauseHistoricalRecovery',
    'cancelHistoricalRecovery',
    'historicalRecoveryStep',
    'historicalChat = liveChat.slice(0, nextMessageId + 1)',
    "applyRelationship: working.recovery?.relationshipMode === 're-evaluate'",
    'staleDeleteAfter: 1000000000',
    'completed-history-changed',
    'Unprocessed recovery suffix was replanned',
    'recoveryBlocksLiveScan',
]) assert(engine.includes(marker), 'Engine lacks recovery marker: ' + marker);

for (const marker of [
    'recoveryPending',
    'recoveryStatus: () => engine.recoveryStatus',
    'initializeFresh: options => engine.initializeFresh',
    'rebuildFromChat: options => engine.startHistoricalRecovery',
    'resumeRebuild: () => engine.resumeHistoricalRecovery()',
    'pauseRebuild: reason => engine.pauseHistoricalRecovery(reason)',
    'cancelRebuild: () => engine.cancelHistoricalRecovery()',
]) assert(index.includes(marker), 'Index lacks recovery marker: ' + marker);

for (const marker of [
    'RECOVERY_REBUILD_UI_VERSION',
    'Recovery & historical rebuild',
    'Fresh database',
    'Rebuild from chat',
    'All surviving exchanges',
    'Latest exchange only',
    'Custom message IDs',
    'Start meters fresh',
    'Re-evaluate history',
    'Resume',
    'Pause',
    'Cancel',
]) assert(ui.includes(marker), 'Recovery UI lacks marker: ' + marker);

// Source-owned transforms must recreate every release behavior from the pinned stable baseline.
for (const [source, marker] of [
    [phase57, 'resumable recovery and chronological rebuild core'],
    [phase57, 'createRecoveryV3Sidecar'],
    [phase57, 'historicalChat = liveChat.slice(0, nextMessageId + 1)'],
    [phase57b, 'recovery rebuild interface'],
    [phase57b, 'RECOVERY_REBUILD_UI_VERSION'],
]) assert(source.includes(marker), 'v0.4.28 transform source lacks marker: ' + marker);

for (const marker of [
    'v0428-missing-file',
    'v0428-healthy-protection',
    'v0428-prefix-only',
    'v0428-relationship-',
    'v0428-failure-resume-suffix',
    'v0428-completed-prefix-edit',
    'v0428-cancel-inflight',
]) assert(verify57.includes(marker), 'v0.4.28 recovery regression pack lacks: ' + marker);

// Existing relationship, family, branch and identity invariants must survive the recovery release.
for (const marker of [
    'relationshipInertiaFactor',
    'selectRelationshipAxes(delta, axisLimit, priority = [])',
    'relationshipAxisLooksDuplicate',
    'FAMILY_KINSHIP_GROUPS',
    'reciprocalFamilyRelation',
    'projectFamilySlotMembers',
    'identityEvidenceVerified',
    'activityEvidenceVerified',
]) assert(scanner.includes(marker), 'Existing scanner invariant disappeared: ' + marker);
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto was reintroduced');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Runtime relationship semantic keyword gate was reintroduced');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Runtime relationship polarity keyword gate was reintroduced');
assert(dossier.includes('relationshipHistoryRemarkHtml'), 'Relationship history remarks disappeared');
assert(engine.includes('rollback') || read('v03/branches.js').includes('rollbackRebasedRelationship'), 'Branch relationship rollback disappeared');
assert(ui.includes('Rebase to current chat') && ui.includes('Force Timeline Rebase'), 'Existing branch rebase controls disappeared');

assert(changelog.includes('## v0.4.28'), 'Changelog lacks v0.4.28');
assert(readme.includes('# NPC State Beta 0.4.28'), 'README title is not v0.4.28');
assert(readme.includes('## Recovery and chronological rebuild'), 'README lacks recovery documentation');

console.log('NPC State 0.4.28 release source parity verified');

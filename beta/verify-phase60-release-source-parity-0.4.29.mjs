import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);

const manifest = JSON.parse(read('manifest.json'));
const workflow = read('.github/workflows/seed-beta.yml');
const engine = read('v03/engine.js');
const scanner = read('v03/scanner.js');
const schema = read('v03/schema.js');
const index = read('v03/index.js');
const ui = read('v03/branch-recovery-ui.js');
const policy = read('v03/relationship-policy.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const behavior = read('beta/verify-phase59-recovery-interruptions-0.4.29.mjs');

const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 29, 'Manifest regressed below v0.4.29');
assert(/name: Build NPC State 0\.4\.(?:29|[3-9]\d) Beta/.test(workflow), 'Workflow title regressed below v0.4.29');
assert(/for patch in \$\(seq 2 (?:29|[3-9]\d)\); do/.test(workflow), 'Cold replay regressed below v0.4.29');
assert(workflow.includes("# node beta/bump-0.4.29.mjs ; -name 'phase*-0.4.29.mjs'"), 'Workflow lacks v0.4.29 source marker');
assert(workflow.includes('Source checkout behavior gate'), 'Workflow lacks checked-in source behavior gate');
assert(workflow.includes("git diff --quiet -- v03 bootstrap.js manifest.json package.json CHANGELOG.md README.md beta/verify-*.mjs"), 'Generated parity does not cover all verifier fixtures');
assert(workflow.includes('git add v03 bootstrap.js manifest.json package.json CHANGELOG.md README.md beta/verify-*.mjs'), 'Generated commit does not include all verifier fixtures');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks generated zero-diff parity marker');

const sourceOwned = [
    'beta/bump-0.4.29.mjs',
    'beta/phase58-legacy-v0428-verifier-compat-0.4.29.mjs',
    'beta/phase59-recovery-concurrency-hardening-0.4.29.mjs',
    'beta/phase59b-recovery-concurrency-ui-0.4.29.mjs',
    'beta/phase59c-repair-event-key-encoding-0.4.29.mjs',
    'beta/phase59d-event-dedupe-verifier-compat-0.4.29.mjs',
    'beta/phase59e-distinct-exchange-verifier-compat-0.4.29.mjs',
    'beta/phase59f-recovery-range-shadow-fix-0.4.29.mjs',
    'beta/phase59g-recovery-range-helper-name-0.4.29.mjs',
    'beta/verify-phase59-recovery-interruptions-0.4.29.mjs',
];
for (const path of sourceOwned) assert(exists(path), 'Missing v0.4.29 source-owned file: ' + path);

// Recovery is bound to the originating chat at planning, generation, suffix validation,
// and completion. Switching chats pauses the original run rather than replanning it against
// whichever conversation happens to be open now.
assert(engine.includes('pauseRecoveryForChatSwitchUnlocked'), 'Missing chat-switch pause helper');
assert(engine.includes("reason: 'chat-switched-before-plan'"), 'Missing pre-plan chat identity guard');
assert(engine.includes("reason: 'chat-switched-before-install'"), 'Missing pre-install chat identity guard');
assert(engine.includes("reason: 'chat-switched-before-resume'"), 'Missing resume chat identity guard');
assert(engine.includes('if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);'), 'Historical recovery step is not bound to its chat key');
assert(engine.includes('historicalChat = liveChat.slice(0, nextMessageId + 1)'), 'Historical scan no longer uses prefix-only chat context');
assert(engine.includes('staleDeleteAfter: 1000000000'), 'Recovery no longer defers destructive stale deletion');

// Multi-instance ownership is explicit and persisted. A foreign live lease is observed,
// while an expired lease can be reclaimed after the last committed checkpoint.
assert(schema.includes('ownerSessionId: recoveryText(value.ownerSessionId, 160)'), 'Recovery owner is not persisted');
assert(schema.includes('leaseUntil: Number(value.leaseUntil) || null'), 'Recovery lease expiry is not persisted');
assert(engine.includes('recoveryOwnedByThisSession'), 'Missing local recovery owner check');
assert(engine.includes('recoveryLeaseActive'), 'Missing recovery lease activity check');
assert(engine.includes('recoveryOwnedElsewhere'), 'Missing foreign-owner recovery check');
assert(engine.includes('claimRecoveryOwnership'), 'Missing recovery lease claim');
assert(engine.includes('releaseRecoveryOwnership'), 'Missing recovery lease release');
assert(engine.includes("reason: 'recovery-owned-elsewhere'"), 'Foreign recovery owner is not exposed as a non-takeover condition');
assert(engine.includes("reason: 'recovery-lease-lost'"), 'Lease-loss protection is missing');
assert(ui.includes('Another tab owns this recovery.'), 'Recovery UI does not expose foreign ownership');
assert(ui.includes('active in another tab'), 'Recovery status does not expose another active tab');

// Cancellation must outrank a pending model failure. The handler checks cancellation before
// assigning failed state, and cancelled recovery does not remain an active scan blocker.
const generationCatch = engine.indexOf("catch (error) {\n                const signal = recoverySignals.get(chatKey) || {};");
const cancelInCatch = engine.indexOf('if (signal.cancel) {', generationCatch);
const failedInCatch = engine.indexOf("state.recovery.status = 'failed';", generationCatch);
assert(generationCatch >= 0 && cancelInCatch > generationCatch && failedInCatch > cancelInCatch, 'Generation failure can outrank cancellation');
assert(engine.includes("state.recovery.status = 'cancelled';"), 'Cancelled recovery state is missing');

// Custom ranges are strict and the public API exposes the actual selected assistant count.
assert(engine.includes('function computeRecoveryRangeForChat('), 'Strict recovery range planner is missing');
assert.equal((engine.match(/function recoveryRange\s*\(/g) || []).length, 1, 'Expected exactly one public recoveryRange declaration');
assert.equal(engine.includes('function recoveryRange() {'), false, 'Legacy no-argument recoveryRange shadow remains');
assert(engine.includes("error.code = 'NPC_STATE_V04_BETA_RECOVERY_RANGE'"), 'Invalid custom range error code is missing');
assert(engine.includes('Recovery start message is outside the current chat.'), 'Out-of-range start is not rejected');
assert(engine.includes('Recovery end message is outside the current chat.'), 'Out-of-range end is not rejected');
assert(index.includes('recoveryRange: options => engine.recoveryRange(options)'), 'Public recovery range options are not wired');
assert(ui.includes('npc-state-v0429-selected-count'), 'Recovery UI lacks exact selected exchange preview');
assert(ui.includes('Selected assistant exchanges:'), 'Recovery confirmation lacks actual exchange count');

// Relationship duplicate protection is source-event scoped. Same-event replay stays blocked,
// but identical quotation text in a different exchange does not veto a new LLM judgment.
assert(schema.includes('sourceEventKey: text(raw?.sourceEventKey, 240)'), 'Relationship source-event identity is not persisted');
assert(scanner.includes('function relationshipSourceEventKey(options = {})'), 'Relationship source-event key builder is missing');
assert(scanner.includes('if (currentEventKey && previous.sourceEventKey) return previous.sourceEventKey === currentEventKey;'), 'Duplicate gate is not source-event scoped');
assert.equal(scanner.includes('previousEvidence && previousEvidence === currentEvidence'), false, 'Quotation-text duplicate veto returned');
assert.equal(scanner.includes('DESIRE_EVIDENCE_CUES'), false, 'Keyword desire authorization returned to scanner');
assert.equal(scanner.includes('relationshipEvidenceGrounding('), false, 'Legacy semantic relationship grounding returned to scanner');
assert.equal(scanner.includes('relationshipEvidencePolarityConflict('), false, 'Legacy relationship polarity veto returned to scanner');

// Existing deterministic relationship mechanics and shared LLM rubric remain authoritative.
assert(scanner.includes('relationshipInertiaFactor'), 'Relationship inertia was removed');
assert(scanner.includes('relationshipMilestoneUnlocked'), 'Relationship milestone gates were removed');
assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Relationship axis priority/caps were removed');
assert(schema.includes('RELATIONSHIP_MILESTONE_THRESHOLDS'), 'Relationship milestone schema was removed');
assert(policy.includes('relationshipJudgmentRubricPrompt'), 'Shared LLM relationship rubric was removed');

// Regression source explicitly covers the five reported failures and both sides of event dedupe.
assert(behavior.includes('CHAT_B_PRIVATE_SENTINEL'), 'Chat-switch cross-content regression is missing');
assert(behavior.includes('activeElsewhere'), 'Two-tab lease regression is missing');
assert(behavior.includes('synthetic rejected request after cancel'), 'Cancel-plus-generation-failure regression is missing');
assert(behavior.includes('startMessageId: 100, endMessageId: 200'), 'Invalid custom-range regression is missing');
assert(behavior.includes("assert.equal(clara.relationship.trust, 2, 'Identical quotation in a distinct exchange was wrongly deduplicated')"), 'Distinct identical-quote event regression is missing');
assert(behavior.includes("assert.equal(replayClara.relationship.trust, 2, 'Reapplying the same source event moved relationship twice')"), 'Same-event replay protection regression is missing');
assert(behavior.includes("event.reasons?.includes('trust:duplicate')"), 'Same-event duplicate diagnostic regression is missing');

assert(/^# NPC State Beta 0\.4\.(?:29|[3-9]\d)/m.test(readme), 'README title regressed below v0.4.29');
assert(readme.includes('## Recovery interruption and concurrency hardening'), 'README lacks v0.4.29 recovery hardening section');
assert(changelog.includes('## v0.4.29'), 'CHANGELOG lacks v0.4.29 entry');

console.log('NPC State 0.4.29+ release source parity verified');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const branchesSource = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
const MARKER = 'PHASE61_SAFE_REBASE_RELATIONSHIP_MODES';
if (!branchesSource.includes(MARKER)) {
    console.log('NPC State phase61 safe-rebase verification skipped on pre-transform source checkout');
    process.exit(0);
}

const {
    chatLineage,
    normalizeRebaseRelationshipMode,
    previewRelationshipRebase,
    rebaseToCurrentChat,
} = await import('../v03/branches.js');
const { normalizeNpc, normalizeState, relationshipMilestoneUnlocked } = await import('../v03/schema.js');

const axes = ['trust', 'affection', 'desire', 'tension'];
const oldChat = [
    { is_user: true, mes: 'Opening at the gate.' },
    { is_user: false, mes: 'Mira greets Lucien.' },
    { is_user: true, mes: 'Lucien entrusts Mira with the seal.' },
    { is_user: false, mes: 'Mira accepts it and their bond deepens.' },
];
const earlyRewrite = [
    { is_user: true, mes: 'Opening at the eastern road instead.' },
    { is_user: false, mes: 'Mira greets Lucien.' },
];
const removedOpening = oldChat.slice(2);
const unchanged = structuredClone(oldChat);

function relationshipState(extra = {}) {
    const npc = normalizeNpc({
        id: 'npc-mira-phase61',
        name: 'Mira',
        relationship: { trust: 52, affection: 17, desire: -3, tension: 8 },
        relationshipProgress: { trust: 0.375, affection: -0.125, desire: 0.625, tension: -0.875 },
        relationshipMilestones: [
            { axis: 'trust', polarity: 1, threshold: 25, reason: 'Old trust.', evidence: 'Earlier exchange.', sourceMessageId: 1, turn: 1, at: 10 },
            { axis: 'trust', polarity: 1, threshold: 50, reason: 'Branch breakthrough.', evidence: 'Bond deepens.', sourceMessageId: 3, turn: 2, at: 20 },
        ],
        relationshipHistory: [
            { impact: 'meaningful', delta: { trust: 2, affection: 1 }, evidence: 'Earlier exchange.', reason: 'Earlier bond.', sourceMessageId: 1, turn: 1, at: 10 },
            { impact: 'major', delta: { trust: 3, affection: 2 }, evidence: 'Bond deepens.', reason: 'Branch breakthrough.', sourceMessageId: 3, turn: 2, at: 20 },
        ],
        relationshipEvidenceHistory: [
            { impact: 'meaningful', delta: { trust: 2, affection: 1 }, evidence: 'Earlier exchange.', reason: 'Earlier bond.', sourceEventKey: 'old-1', sourceMessageId: 1, turn: 1, at: 10 },
            { impact: 'major', delta: { trust: 3, affection: 2 }, evidence: 'Bond deepens.', reason: 'Branch breakthrough.', sourceEventKey: 'old-3', sourceMessageId: 3, turn: 2, at: 20 },
        ],
        relationshipDiagnostics: [
            {
                impact: 'major', reason: 'Branch breakthrough.', evidence: 'Bond deepens.',
                before: { trust: 49, affection: 15, desire: -3, tension: 8 },
                after: { trust: 52, affection: 17, desire: -3, tension: 8 },
                proposed: { trust: 3, affection: 2, desire: 0, tension: 0 },
                applied: { trust: 3, affection: 2, desire: 0, tension: 0 },
                progressBefore: { trust: 0.125, affection: 0, desire: 0.625, tension: -0.875 },
                progressAfter: { trust: 0.375, affection: -0.125, desire: 0.625, tension: -0.875 },
                sourceEventKey: 'old-3', sourceMessageId: 3, turn: 2, at: 21,
            },
        ],
        lastRelationshipChange: { impact: 'major', delta: { trust: 3, affection: 2 }, evidence: 'Bond deepens.', reason: 'Branch breakthrough.', sourceMessageId: 3, turn: 2, at: 20 },
        relationshipSummary: 'Mira trusts Lucien deeply and has grown openly affectionate.',
        ...extra,
    });
    return normalizeState({
        schemaVersion: 1,
        appVersion: '0.4.29',
        chatKey: 'phase61-rebase',
        npcs: [npc],
        branchHeadLineage: chatLineage(oldChat),
        branchSafety: { status: 'rebase-required', kind: 'prebaseline-rewrite', reason: 'test' },
        lastScannedMessageId: 3,
        checkpoints: [],
        branchBase: null,
    }, 'phase61-rebase');
}

function assertRelationshipExact(actual, expected, label) {
    assert.deepEqual(actual.relationship, expected.relationship, label + ': meters changed');
    assert.deepEqual(actual.relationshipProgress, expected.relationshipProgress, label + ': fractional progress changed');
    assert.equal(actual.relationshipSummary, expected.relationshipSummary, label + ': summary changed');
    assert.deepEqual(actual.lastRelationshipChange.delta, expected.lastRelationshipChange.delta, label + ': last change delta changed');
    assert.equal(actual.relationshipHistory.length, expected.relationshipHistory.length, label + ': history length changed');
    assert.equal(actual.relationshipMilestones.length, expected.relationshipMilestones.length, label + ': milestone length changed');
    assert.equal(actual.relationshipEvidenceHistory.length, expected.relationshipEvidenceHistory.length, label + ': evidence audit length changed');
    assert.equal(actual.relationshipDiagnostics.length, expected.relationshipDiagnostics.length, label + ': diagnostic audit length changed');
}

assert.equal(normalizeRebaseRelationshipMode(), 'preserve', 'Missing mode did not default to preserve');
assert.equal(normalizeRebaseRelationshipMode('rollback'), 'rollback', 'Rollback mode was rejected');
assert.throws(() => normalizeRebaseRelationshipMode('erase'), /preserve or rollback/, 'Unknown rebase mode did not fail closed');

for (const [label, chat] of [['early rewrite', earlyRewrite], ['removed opening', removedOpening]]) {
    const beforeState = relationshipState();
    const before = beforeState.npcs[0];
    const rebased = rebaseToCurrentChat(beforeState, chat, { relationshipMode: 'preserve' });
    const after = rebased.npcs[0];
    assertRelationshipExact(after, before, label);
    assert(rebased.rebaseBackup?.snapshot, label + ': pre-rebase snapshot was not retained');
    assert.deepEqual(rebased.rebaseBackup.snapshot.npcs[0].relationship, before.relationship, label + ': backup did not capture pre-rebase meters');
    assert.deepEqual(rebased.rebaseBackup.snapshot.npcs[0].relationshipProgress, before.relationshipProgress, label + ': backup did not capture fractional progress');
    assert.equal(rebased.rebaseBackup.relationshipMode, 'preserve', label + ': backup mode is wrong');
    for (const audit of [...after.relationshipHistory, ...after.relationshipMilestones, ...after.relationshipEvidenceHistory, ...after.relationshipDiagnostics]) {
        assert.equal(audit.sourceMessageId, null, label + ': stale source message id survived as current provenance');
        assert.equal(audit.timelineStatus, 'accepted-pre-rebase', label + ': audit record was not marked as accepted pre-rebase history');
    }
    const evidenceWithOldId = after.relationshipEvidenceHistory.find(row => row.originalSourceMessageId === 3);
    assert(evidenceWithOldId, label + ': original relationship evidence message id was not retained for audit');
    assert.equal(evidenceWithOldId.sourceEventKey, '', label + ': stale event key survived as current provenance');
    assert.equal(evidenceWithOldId.originalSourceEventKey, 'old-3', label + ': original event key was not retained for audit');
}

{
    const beforeState = relationshipState();
    const first = rebaseToCurrentChat(beforeState, earlyRewrite, { relationshipMode: 'preserve' });
    const firstNpc = first.npcs[0];
    const second = rebaseToCurrentChat(first, earlyRewrite, { relationshipMode: 'preserve' });
    assertRelationshipExact(second.npcs[0], firstNpc, 'repeated preserve rebase');
    assert.equal(second.npcs[0].relationshipEvidenceHistory.find(row => row.evidence === 'Bond deepens.')?.originalSourceMessageId, 3, 'Repeated preserve rebase lost original audit provenance');
}

{
    const beforeState = relationshipState();
    const rebased = rebaseToCurrentChat(beforeState, unchanged, { relationshipMode: 'preserve' });
    assert.equal(rebased.lastScannedMessageId, 3, 'Unchanged-chat preserve rebase lost the latest scanned marker');
    assertRelationshipExact(rebased.npcs[0], beforeState.npcs[0], 'unchanged preserve rebase');
}

{
    const state = relationshipState();
    const preview = previewRelationshipRebase(state, earlyRewrite, { relationshipMode: 'rollback' });
    assert.equal(preview.relationshipMode, 'rollback');
    assert(preview.affectedNpcs.length >= 1, 'Rollback preview did not expose affected NPCs');
    const row = preview.affectedNpcs[0];
    assert.equal(row.before.trust, 52, 'Rollback preview before meter is wrong');
    assert(row.historyRemoved >= 1 || row.milestonesRemoved >= 1, 'Rollback preview omitted destructive history/milestone impact');

    const rolled = rebaseToCurrentChat(state, earlyRewrite, { relationshipMode: 'rollback' });
    assert.equal(rolled.rebaseBackup?.relationshipMode, 'rollback', 'Rollback did not save a mode-tagged pre-rebase snapshot');
    assert(rolled.npcs[0].relationship.trust <= state.npcs[0].relationship.trust, 'Explicit rollback increased discarded relationship state');
    assert.equal(relationshipMilestoneUnlocked(rolled.npcs[0].relationshipMilestones, 'trust', 1, 50), false, 'Explicit rollback retained discarded +50 milestone');
}

const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
assert(engine.includes("relationshipMode = 'preserve'"), 'Engine rebase does not default to preserve');
assert(engine.includes("applyRelationship: rebase && mode === 'preserve' ? false : null"), 'Immediate preserve-mode refresh does not suppress relationship updates');
assert(engine.includes("const relationshipApplyRequested = applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true"), 'Scan lacks explicit relationship-update override');
assert(engine.includes("applyRelationship: relationshipApplyRequested && !replayProtectedRelationship"), 'Accepted preserve-rebase history can bypass the persisted replay boundary');
assert(engine.includes("throw new Error('Timeline rebase refused to persist without a restorable pre-rebase snapshot.')"), 'Engine can persist a rebase without a backup assertion');

const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
assert(index.includes('previewRebase: options => engine.previewRebase(options)'), 'Rollback preview is not exposed through NPCState');

const ui = fs.readFileSync(new URL('../v03/branch-recovery-ui.js', import.meta.url), 'utf8');
assert(ui.includes('Keep NPC state and accept timeline'), 'Preserve-mode UI choice is missing');
assert(ui.includes('Roll back discarded story changes'), 'Rollback-mode UI choice is missing');
assert(ui.includes("previewRebase?.({ relationshipMode: 'rollback' })"), 'Rollback UI does not preview destructive relationship impact');
assert(ui.includes("relationshipMode: mode"), 'UI does not pass the selected relationship mode to reconcile');

const settings = fs.readFileSync(new URL('../v03/settings-layout.js', import.meta.url), 'utf8');
assert(settings.includes('keep current NPC relationship state'), 'Force Timeline Rebase settings copy does not explain preservation mode');
assert(settings.includes('explicitly roll back discarded story relationship changes'), 'Force Timeline Rebase settings copy does not explain rollback mode');

for (const axis of axes) assert(Number.isFinite(relationshipState().npcs[0].relationshipProgress[axis]), 'Fractional progress normalization broke on ' + axis);

console.log('NPC State v0.4.29 phase61 safe timeline rebase relationship modes verified');

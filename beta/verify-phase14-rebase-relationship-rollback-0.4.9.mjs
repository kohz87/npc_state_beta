import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chatLineage, branchDivergenceMessageId, rebaseToCurrentChat, rollbackRebasedRelationship } from '../v03/branches.js';
import { normalizeNpc, relationshipMilestoneUnlocked } from '../v03/schema.js';

const oldChat = [
    { is_user: true, mes: 'We arrive at the manor.' },
    { is_user: false, mes: 'Mira greets Lucien cautiously.' },
    { is_user: true, mes: 'I hand her the sealed letter.' },
    { is_user: false, mes: 'Mira entrusts Lucien with her life and her trust surges.' },
];
const rewrittenChat = [
    { is_user: true, mes: 'We arrive at the manor.' },
    { is_user: false, mes: 'Mira greets Lucien cautiously.' },
    { is_user: true, mes: 'I decide not to hand over the letter.' },
];
const truncatedChat = oldChat.slice(0, 2);
const evidence = 'Mira entrusts Lucien with her life and her trust surges.';
const staleVisibleEvent = {
    impact: 'extreme',
    delta: { trust: 3, affection: 0, desire: 0, tension: 0 },
    evidence,
    reason: 'A discarded branch event deepened trust.',
    sourceMessageId: 3,
    turn: 2,
    at: 300,
};

function baseNpc(extra = {}) {
    return normalizeNpc({
        id: 'npc-mira-rebase',
        name: 'Mira',
        relationship: { trust: 52, affection: 10, desire: 0, tension: 0 },
        relationshipProgress: { trust: 0.4, affection: 0, desire: 0, tension: 0 },
        relationshipMilestones: [
            { axis: 'trust', polarity: 1, threshold: 25, reason: 'Earlier surviving milestone.', evidence: 'Earlier trust.', sourceMessageId: 1, turn: 1, at: 100 },
            { axis: 'trust', polarity: 1, threshold: 50, reason: 'Discarded breakthrough.', evidence, sourceMessageId: 3, turn: 2, at: 300 },
        ],
        relationshipHistory: [staleVisibleEvent],
        relationshipEvidenceHistory: [{ ...staleVisibleEvent, delta: { trust: 5, affection: 0, desire: 0, tension: 0 } }],
        relationshipDiagnostics: [{
            impact: 'extreme', reason: staleVisibleEvent.reason, evidence,
            before: { trust: 49, affection: 10, desire: 0, tension: 0 },
            after: { trust: 52, affection: 10, desire: 0, tension: 0 },
            proposed: { trust: 5, affection: 0, desire: 0, tension: 0 },
            applied: { trust: 3, affection: 0, desire: 0, tension: 0 },
            progressBefore: { trust: 0.2, affection: 0, desire: 0, tension: 0 },
            progressAfter: { trust: 0.4, affection: 0, desire: 0, tension: 0 },
            reasons: [],
            unlocks: [{ axis: 'trust', polarity: 1, threshold: 50, reason: 'Discarded breakthrough.', evidence, sourceMessageId: 3, turn: 2, at: 300 }],
            sourceMessageId: 3, turn: 2, at: 301,
        }],
        lastRelationshipChange: staleVisibleEvent,
        relationshipSummary: 'Mira now trusts Lucien deeply after the discarded breakthrough.',
        ...extra,
    });
}

assert.equal(branchDivergenceMessageId({ branchHeadLineage: chatLineage(oldChat) }, rewrittenChat), 2, 'Rewrite divergence message id was not detected');
assert.equal(branchDivergenceMessageId({ branchHeadLineage: chatLineage(oldChat) }, truncatedChat), 2, 'Truncation divergence message id was not detected');

{
    const rolled = rollbackRebasedRelationship(baseNpc(), 2);
    assert.equal(rolled.relationship.trust, 49, 'Recent discarded relationship score was not restored from diagnostics');
    assert.equal(rolled.relationshipProgress.trust, 0.2, 'Recent discarded fractional progress was not restored from diagnostics');
    assert.equal(relationshipMilestoneUnlocked(rolled.relationshipMilestones, 'trust', 1, 50), false, 'Discarded +50 milestone remained unlocked');
    assert.equal(relationshipMilestoneUnlocked(rolled.relationshipMilestones, 'trust', 1, 25), true, 'Pre-divergence +25 milestone was lost');
    assert.equal(rolled.relationshipHistory.length, 0, 'Discarded visible relationship history survived rollback');
    assert.equal(rolled.relationshipEvidenceHistory.length, 0, 'Discarded relationship evidence survived rollback helper');
    assert.equal(rolled.relationshipDiagnostics.length, 0, 'Discarded scoring diagnostics survived rollback helper');
    assert.equal(rolled.relationshipSummary, '', 'Discarded-branch relationship summary survived rollback');
}

{
    const npc = normalizeNpc({
        id: 'npc-old-history', name: 'Old History',
        relationship: { trust: 80 }, relationshipProgress: { trust: 0.7 },
        relationshipMilestones: [
            { axis: 'trust', polarity: 1, threshold: 25, reason: 'Old.', sourceMessageId: null, inferred: true },
            { axis: 'trust', polarity: 1, threshold: 50, reason: 'Old.', sourceMessageId: null, inferred: true },
            { axis: 'trust', polarity: 1, threshold: 75, reason: 'Discarded.', sourceMessageId: 3, turn: 2 },
        ],
        relationshipHistory: [], relationshipDiagnostics: [], relationshipEvidenceHistory: [],
    });
    const rolled = rollbackRebasedRelationship(npc, 2);
    assert.equal(rolled.relationship.trust, 75, 'Unrecoverable over-gate residue was not clamped to the now-locked boundary');
    assert.equal(rolled.relationshipProgress.trust, 0, 'Clamped gate residue retained fractional deepening progress');
    assert.equal(relationshipMilestoneUnlocked(rolled.relationshipMilestones, 'trust', 1, 75), false, 'Discarded +75 milestone survived fallback clamp');
}

{
    // A manual score edit makes the edited axis authoritative. Model that with the
    // source-less milestone state produced by the manual editor, not two duplicate +50
    // milestone identities, because milestone normalization intentionally deduplicates them.
    const npc = normalizeNpc({
        ...baseNpc(),
        relationship: { trust: 60, affection: 10, desire: 0, tension: 0 },
        relationshipProgress: { trust: 0, affection: 0, desire: 0, tension: 0 },
        relationshipMilestones: [
            { axis: 'trust', polarity: 1, threshold: 25, reason: 'Manual baseline.', sourceMessageId: null, inferred: true },
            { axis: 'trust', polarity: 1, threshold: 50, reason: 'Manual baseline.', sourceMessageId: null, inferred: true },
        ],
        relationshipHistory: [
            staleVisibleEvent,
            { impact: 'manual', delta: { trust: 8, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId: 3, turn: 2, at: 400 },
        ],
    });
    const rolled = rollbackRebasedRelationship(npc, 2);
    assert.equal(rolled.relationship.trust, 60, 'Manual relationship edit was overwritten by rebase rollback');
    assert.equal(relationshipMilestoneUnlocked(rolled.relationshipMilestones, 'trust', 1, 50), true, 'Manual/inferred milestone authority was lost');
}

{
    const state = {
        schemaVersion: 1,
        appVersion: '0.4.9',
        chatKey: 'rebase-test',
        npcs: [baseNpc()],
        branchHeadLineage: chatLineage(oldChat),
        branchSafety: { status: 'rebase-required', kind: 'prebaseline-rewrite', reason: 'test' },
        checkpoints: [],
        branchBase: null,
    };
    const rebased = rebaseToCurrentChat(state, rewrittenChat);
    const npc = rebased.npcs[0];
    assert.equal(npc.relationship.trust, 49, 'Full rebase did not roll back the discarded relationship event');
    assert.equal(npc.relationshipProgress.trust, 0.2, 'Full rebase lost exact recoverable fractional state');
    assert.equal(relationshipMilestoneUnlocked(npc.relationshipMilestones, 'trust', 1, 50), false, 'Full rebase retained discarded +50 breakthrough');
    const surviving25 = npc.relationshipMilestones.find(entry => entry.axis === 'trust' && entry.threshold === 25 && entry.polarity === 1);
    assert(surviving25 && surviving25.sourceMessageId === null && surviving25.turn === null, 'Accepted surviving milestone kept stale pre-rebase message provenance');
    assert.equal(npc.relationshipEvidenceHistory.length, 0, 'Full rebase retained timeline-local relationship evidence');
    assert.equal(npc.relationshipDiagnostics.length, 0, 'Full rebase retained timeline-local relationship diagnostics');
}

const recoveryUi = fs.readFileSync(new URL('../v03/branch-recovery-ui.js', import.meta.url), 'utf8');
assert(recoveryUi.includes('Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back'), 'Rebase confirmation still implies all relationship state is preserved');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const manifestParts = String(manifest.version || '').split('.').map(Number);
assert(manifestParts[0] === 0 && manifestParts[1] === 4 && manifestParts[2] >= 9, 'Manifest regressed below the 0.4.9 rebase rollback release');

console.log('NPC State 0.4.9 timeline rebase relationship rollback verification passed');

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';

const EVIDENCE = "A squeezes Lucien's hand and says she trusts him more now.";

function baseState(summary = 'Cautiously friendly toward the player.') {
    const state = createEmptyState('chat:relationship-summary-projection');
    state.npcs = [normalizeNpc({
        id: 'npc-a',
        name: 'A',
        present: true,
        relationship: { trust: 12, affection: 8, desire: 0, tension: 0 },
        relationshipProgress: { trust: 0.4, affection: 0, desire: 0, tension: 0 },
        relationshipSummary: summary,
        relationshipEvidenceHistory: [{
            delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            impact: 'ordinary',
            evidence: 'A previously accepted Lucien\'s help.',
            reason: 'Accepted prior help.',
            sourceEventKey: 'prior:event',
            sourceMessageId: 8,
            turn: 1,
            at: 1,
        }],
    })];
    return state;
}

function relationshipPatch(summary, relationshipChange = null) {
    return {
        id: 'npc-a',
        name: 'A',
        relationshipSummary: summary,
        relationshipChange: relationshipChange || {
            evaluated: true,
            impact: 'ordinary',
            delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            priority: ['trust'],
            axisEvidence: {
                trust: {
                    excerpts: [EVIDENCE],
                    explanation: 'A explicitly expresses increased trust toward Lucien.',
                },
            },
            evidence: EVIDENCE,
            reason: 'A expresses increased trust toward the player.',
        },
    };
}

function payload(patch, exchangeActive = true) {
    return {
        exchangeActiveNpcIds: exchangeActive ? ['npc-a'] : [],
        inChatNpcIds: exchangeActive ? ['npc-a'] : [],
        worldActiveNpcIds: [],
        npcs: [patch],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

test('grounded Current Dynamic updates even when relationship score application is replay-protected', () => {
    const before = normalizeState(baseState(), 'chat:relationship-summary-projection');
    const relationshipSnapshot = structuredClone(before.npcs[0].relationship);
    const progressSnapshot = structuredClone(before.npcs[0].relationshipProgress);
    const evidenceSnapshot = structuredClone(before.npcs[0].relationshipEvidenceHistory);
    const historySnapshot = structuredClone(before.npcs[0].relationshipHistory);
    const lastChangeSnapshot = structuredClone(before.npcs[0].lastRelationshipChange);

    const applied = applyScanResult(before, payload(relationshipPatch('A now regards Lucien with warmer, growing trust.')), {
        sourceMessageId: 12,
        turn: 2,
        relationshipContext: EVIDENCE,
        profileContext: EVIDENCE,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationshipSummary, 'A now regards Lucien with warmer, growing trust.');
    assert.deepEqual(npc.relationship, relationshipSnapshot);
    assert.deepEqual(npc.relationshipProgress, progressSnapshot);
    assert.deepEqual(npc.relationshipEvidenceHistory, evidenceSnapshot);
    assert.deepEqual(npc.relationshipHistory, historySnapshot);
    assert.deepEqual(npc.lastRelationshipChange, lastChangeSnapshot);
});

test('impact-none or ungrounded turns cannot stylistically rewrite Current Dynamic', () => {
    const none = relationshipPatch('A has a dramatically rewritten dynamic for no new reason.', {
        evaluated: true,
        impact: 'none',
        delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
        priority: [],
        axisEvidence: {},
        evidence: '',
        reason: 'No new relationship shift.',
    });
    const applied = applyScanResult(baseState(), payload(none), {
        sourceMessageId: 13,
        turn: 3,
        relationshipContext: EVIDENCE,
        profileContext: EVIDENCE,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    assert.equal(applied.state.npcs[0].relationshipSummary, 'Cautiously friendly toward the player.');
});

test('targeted Refresh can reconcile Current Dynamic without relationship score mutation', () => {
    const before = baseState();
    const relationshipSnapshot = structuredClone(before.npcs[0].relationship);
    const progressSnapshot = structuredClone(before.npcs[0].relationshipProgress);
    const applied = applyScanResult(before, payload({
        id: 'npc-a',
        name: 'A',
        relationshipSummary: 'A sees Lucien as a reliably supportive companion.',
    }, false), {
        sourceMessageId: 14,
        turn: 3,
        allowHistoricalProfilePatches: true,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        reconcileRelationshipSummary: true,
    });
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationshipSummary, 'A sees Lucien as a reliably supportive companion.');
    assert.deepEqual(npc.relationship, relationshipSnapshot);
    assert.deepEqual(npc.relationshipProgress, progressSnapshot);
});

test('regular Full Scan and targeted Refresh receive the stored Current Dynamic', () => {
    const state = baseState();
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I help A.' },
        { is_user: false, name: 'Narrator', mes: EVIDENCE },
    ];
    const scan = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
    const refresh = buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
    for (const prompt of [scan, refresh]) assert.match(prompt, /Cautiously friendly toward the player\./);
});

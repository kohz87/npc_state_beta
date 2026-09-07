import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';

const PLACEHOLDER = 'NPC relationship with PLAYER only';

function baseState(summary = 'Cautiously friendly toward the player.') {
    const state = createEmptyState('chat:relationship-summary');
    state.npcs = [normalizeNpc({
        id: 'npc-a',
        name: 'A',
        relationshipSummary: summary,
        present: true,
    })];
    return state;
}

function relationshipPayload(summary) {
    const evidence = "A accepts the player's help and thanks them sincerely.";
    return {
        evidence,
        result: {
            exchangeActiveNpcIds: ['npc-a'],
            inChatNpcIds: ['npc-a'],
            worldActiveNpcIds: [],
            npcs: [{
                id: 'npc-a',
                name: 'A',
                relationshipSummary: summary,
                relationshipChange: {
                    evaluated: true,
                    impact: 'ordinary',
                    delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
                    priority: ['trust'],
                    axisEvidence: {
                        trust: {
                            excerpts: [evidence],
                            explanation: 'Accepting sincere help increases trust.',
                        },
                    },
                    evidence,
                    reason: 'A accepts meaningful help from the player.',
                },
            }],
            socialEdges: [],
            familyFacts: [],
            lifeStateUpdates: [],
        },
    };
}

function applyRelationship(summary) {
    const { evidence, result } = relationshipPayload(summary);
    return applyScanResult(baseState(), result, {
        sourceMessageId: 12,
        turn: 1,
        profileContext: evidence,
        relationshipContext: evidence,
        applyReturnedNpcPatches: true,
    });
}

test('persisted scanner relationship-summary placeholders normalize away', () => {
    assert.equal(normalizeNpc({ id: 'npc-a', name: 'A', relationshipSummary: PLACEHOLDER }).relationshipSummary, '');
    assert.equal(normalizeNpc({ id: 'npc-a', name: 'A', relationshipSummary: ' NPC relationship with the player only. ' }).relationshipSummary, '');
    assert.equal(normalizeNpc({ id: 'npc-a', name: 'A', relationshipSummary: 'Cautiously friendly toward the player.' }).relationshipSummary, 'Cautiously friendly toward the player.');
});

test('scan and refresh output contracts do not expose an instructional relationshipSummary value', () => {
    const state = baseState();
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I help A with the damaged pack.' },
        { is_user: false, name: 'Narrator', mes: "A accepts Lucien's help and thanks him." },
    ];
    const scan = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
    const refresh = buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
    for (const prompt of [scan, refresh]) {
        assert.doesNotMatch(prompt, /NPC relationship with PLAYER only/i);
        assert.match(prompt, /"relationshipSummary":""/);
        assert.match(prompt, /Never copy (?:schema instructions|an output-schema instruction)/);
    }
});

test('a real relationship change cannot persist the old schema placeholder as the current dynamic', () => {
    const applied = applyRelationship(PLACEHOLDER);
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationship.trust, 1);
    assert.equal(npc.relationshipSummary, 'Cautiously friendly toward the player.');
});

test('a grounded natural-language relationship summary still updates normally', () => {
    const applied = applyRelationship('A is cautiously more trusting after accepting the player\'s help.');
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationship.trust, 1);
    assert.equal(npc.relationshipSummary, "A is cautiously more trusting after accepting the player's help.");
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { applyScanResult } from '../src/scanner.js';
import { foregroundContract, FOREGROUND_CONTRACT_VERSION } from '../src/foreground-contract.js';
import { NPC_STATE_MODEL_CONTRACT_VERSION, semanticDossierContext, semanticUpdatePrompt } from '../src/model/semantic-updates.js';

function baseState() {
    const state = createEmptyState('test-chat');
    state.npcs = [normalizeNpc({
        id: 'npc-sora',
        name: 'Sora',
        mood: 'Nervous about the storm.',
        location: 'Inside the mountain shelter.',
        goal: 'Reach the southern gate before dark.',
        status: 'Preparing to leave the shelter.',
        lifeState: 'alive',
        present: true,
    })];
    return state;
}

function payload(semanticUpdates, compatibility = {}) {
    return {
        exchangeActiveNpcIds: ['npc-sora'],
        inChatNpcIds: ['npc-sora'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-sora',
            name: 'Sora',
            ...compatibility,
            semanticUpdates,
            relationshipChange: {
                evaluated: true,
                impact: 'none',
                delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
                priority: [],
                axisEvidence: {},
                evidence: '',
                reason: 'No relationship-changing event.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

const source = 'Sora smiles now that the storm has passed. She steps into the market square and decides her next goal is to learn the city routes. She is currently studying the posted map.';
const sources = [{ messageId: 12, excerpt: source }];

test('live-state semantic fields are present in foreground/model contracts', () => {
    const context = semanticDossierContext(baseState().npcs[0]);
    assert.equal(context.mood, 'Nervous about the storm.');
    assert.equal(context.location, 'Inside the mountain shelter.');
    assert.equal(context.goal, 'Reach the southern gate before dark.');
    assert.equal(context.status, 'Preparing to leave the shelter.');
    assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 3);
    assert.equal(FOREGROUND_CONTRACT_VERSION, 4);
    const semanticPrompt = semanticUpdatePrompt({ npcs: baseState().npcs, allowedSourceIds: [12] });
    for (const field of ['mood', 'location', 'goal', 'status', 'currentForm']) assert.match(semanticPrompt, new RegExp(`\\b${field}\\b`));
    const foreground = foregroundContract({}, { capture: true });
    assert.match(foreground, /mood\|location\|goal\|status\|currentForm/);
    assert.match(foreground, /LIVE STATE: mood\/location\/goal\/status\/currentForm/);
});

test('one-pass semantic updates replace all live-state scalars and override compatibility fields', () => {
    const result = applyScanResult(baseState(), payload([
        { field: 'mood', operation: 'replace', value: 'Relieved and curious.', durability: 'temporary', sources, explanation: 'The danger has passed.' },
        { field: 'location', operation: 'replace', value: 'Market square.', durability: 'temporary', sources, explanation: 'She moved into the square.' },
        { field: 'goal', operation: 'replace', value: 'Learn the city routes.', durability: 'temporary', sources, explanation: 'She explicitly chooses a new goal.' },
        { field: 'status', operation: 'replace', value: 'Studying the posted map.', durability: 'temporary', sources, explanation: 'Current activity changed.' },
    ], {
        mood: 'STALE COMPAT MOOD',
        location: 'STALE COMPAT LOCATION',
        goal: 'STALE COMPAT GOAL',
        status: 'STALE COMPAT STATUS',
    }), {
        sourceMessageId: 12,
        turn: 1,
        profileContext: source,
        relationshipContext: source,
        applyReturnedNpcPatches: true,
    });
    const npc = result.state.npcs[0];
    assert.equal(npc.mood, 'Relieved and curious.');
    assert.equal(npc.location, 'Market square.');
    assert.equal(npc.goal, 'Learn the city routes.');
    assert.equal(npc.status, 'Studying the posted map.');
    for (const field of ['mood', 'location', 'goal', 'status']) {
        assert.equal(result.semanticDiagnostics.some(row => row.field === field && row.status === 'applied'), true, field);
    }
});

test('one-pass semantic remove clears a completed goal without inventing a replacement', () => {
    const evidence = 'Sora reaches the southern gate. With that task complete, she has no further objective for now.';
    const result = applyScanResult(baseState(), payload([
        {
            field: 'goal',
            operation: 'remove',
            durability: 'temporary',
            sources: [{ messageId: 12, excerpt: evidence }],
            explanation: 'The stored goal was completed and no replacement is established.',
        },
    ], { goal: 'Reach the southern gate before dark.' }), {
        sourceMessageId: 12,
        turn: 1,
        profileContext: evidence,
        relationshipContext: evidence,
        applyReturnedNpcPatches: true,
    });
    assert.equal(result.state.npcs[0].goal, '');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'goal' && row.operation === 'remove' && row.status === 'applied'), true);
});

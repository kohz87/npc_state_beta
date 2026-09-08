import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const ZERO = Object.freeze({
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'Initial direct professional interaction without numeric movement.',
});

const IDENTITY = 'A young woman stood behind the pine counter, her cuffs pinned back with iron needles.';
const PLAYER_ACTIVITY = 'Her hand caught your ragged sleeve and tugged you toward the counter.';
const NEUTRAL_ACTIVITY = 'The young woman flipped open the intake ledger.';
const DIALOGUE = '"Put your mark on the third line. No coin required from you today."';

function safeState(key) {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function evidencePolicy(visible) {
    return {
        detected: true,
        visibleText: visible,
        worldStateText: 'Vrena Kessel: Guild Intake Clerk',
        worldPresentText: 'Vrena Kessel: Guild Intake Clerk',
        worldOffscreenText: '',
        worldOtherText: '',
        innerChatterText: '',
        excludedText: '',
        excludedTags: [],
        relationshipSources: [{ id: 'assistant-visible', kind: 'visible', role: 'assistant', text: visible }],
    };
}

function patch(activityExcerpt) {
    return {
        id: '',
        name: 'Vrena Kessel',
        identityKind: 'named',
        role: 'Guild intake clerk / receptionist',
        identityEvidence: {
            anchor: 'young woman',
            excerpts: [IDENTITY],
            explanation: 'The visible young woman is the canonically named clerk in current World_State.',
        },
        activityEvidence: {
            exchangeActive: {
                excerpts: [activityExcerpt],
                explanation: 'The clerk actively handles the current intake exchange.',
            },
            inChat: {
                excerpts: [activityExcerpt],
                explanation: 'The clerk remains relevant at scene end.',
            },
        },
        relationshipChange: structuredClone(ZERO),
        relationshipSummary: 'Brisk, no-nonsense professional intake; Vrena directs Lucien through registration.',
        relationshipSummaryEvidence: {
            excerpts: [DIALOGUE],
            explanation: 'Vrena gives Lucien direct practical registration instructions.',
        },
    };
}

function payload(row) {
    return {
        exchangeActiveNpcIds: ['Vrena Kessel'],
        inChatNpcIds: ['Vrena Kessel'],
        worldActiveNpcIds: [],
        npcs: [row],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
        candidateAccounting: {},
    };
}

function apply(row, visible, key) {
    return applyScanResult(safeState(key), payload(row), {
        sourceMessageId: 2,
        turn: 1,
        playerName: 'Lucien Noctis',
        relationshipContext: visible,
        profileContext: visible,
        semanticEvidenceContext: visible,
        evidencePolicy: evidencePolicy(visible),
        currentAdmissionText: visible,
        admissionMode: 'balanced',
        applyReturnedNpcPatches: true,
        applyRelationship: true,
        preservePresence: false,
        preserveObservation: true,
        requireDossierCoverage: false,
    });
}

test('World_State-enriched new identity can reuse same-source accepted identity and player-facing activity for dialogue-only Current Dynamic evidence', () => {
    const visible = [IDENTITY, PLAYER_ACTIVITY, DIALOGUE].join('\n\n');
    const result = apply(patch(PLAYER_ACTIVITY), visible, 'chat:v0529-source-reuse');
    const npc = result.state.npcs.find(row => row.name === 'Vrena Kessel');

    assert.ok(npc);
    assert.equal(result.patchResolutions[0]?.status, 'accepted');
    assert.equal(npc.relationshipSummary, 'Brisk, no-nonsense professional intake; Vrena directs Lucien through registration.');
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(npc.relationshipHistory.length, 0);
    assert.equal(npc.relationshipEvidenceHistory.length, 0);
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
});

test('accepted identity alone still cannot turn isolated quoted second person into player-bound Current Dynamic evidence', () => {
    const visible = [IDENTITY, NEUTRAL_ACTIVITY, DIALOGUE].join('\n\n');
    const result = apply(patch(NEUTRAL_ACTIVITY), visible, 'chat:v0529-quoted-you');
    const npc = result.state.npcs.find(row => row.name === 'Vrena Kessel');

    assert.ok(npc);
    assert.equal(npc.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

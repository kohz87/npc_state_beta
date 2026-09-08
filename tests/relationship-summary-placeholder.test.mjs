import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
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

function establishedRelationshipState(summary = '') {
    const state = createEmptyState('chat:relationship-summary-repair');
    state.npcs = [normalizeNpc({
        id: 'npc-a',
        name: 'A',
        relationshipSummary: summary,
        present: true,
        relationship: { trust: 24, affection: 18, desire: 0, tension: 2 },
        relationshipProgress: { trust: 0.5, affection: 0.25, desire: 0, tension: 0 },
        relationshipEvidenceHistory: [{
            impact: 'meaningful',
            delta: { trust: 2, affection: 1, desire: 0, tension: 0 },
            evidence: "A trusted the player with a vulnerable truth.",
            reason: 'Repeated support has made A more trusting and emotionally secure with the player.',
            sourceMessageId: 8,
            turn: 4,
        }],
        relationshipHistory: [{
            impact: 'ordinary',
            delta: { trust: 1, affection: 1, desire: 0, tension: 0 },
            evidence: 'A accepted help from the player.',
            reason: 'Support strengthened the bond.',
            sourceMessageId: 6,
            turn: 3,
        }],
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

function repairPayload(summary) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: ['npc-a'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-a',
            name: 'A',
            relationshipSummary: summary,
            relationshipChange: {
                evaluated: true,
                impact: 'none',
                delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
                priority: [],
                axisEvidence: {},
                evidence: '',
                reason: 'No new relationship event in this exchange.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
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
        assert.match(prompt, /relationshipSummaryEvidence/);
        assert.match(prompt, /Never copy facts\/ids|Never copy .*output-schema instruction/);
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

test('current-cast repair can reconstruct a blank Current Dynamic without replaying relationship state', () => {
    const state = establishedRelationshipState(PLACEHOLDER);
    const before = structuredClone(normalizeState(state, state.chatKey).npcs[0]);
    assert.equal(before.relationshipSummary, '');
    const applied = applyScanResult(state, repairPayload('A is increasingly trusting and warmly attached to the player.'), {
        sourceMessageId: 12,
        turn: 5,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        repairRelationshipSummary: true,
    });
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationshipSummary, 'A is increasingly trusting and warmly attached to the player.');
    assert.deepEqual(npc.relationship, before.relationship);
    assert.deepEqual(npc.relationshipProgress, before.relationshipProgress);
    assert.deepEqual(npc.relationshipMilestones, before.relationshipMilestones);
    assert.deepEqual(npc.relationshipEvidenceHistory, before.relationshipEvidenceHistory);
    assert.deepEqual(npc.relationshipHistory, before.relationshipHistory);
    assert.deepEqual(npc.lastRelationshipChange, before.lastRelationshipChange);
});

test('automatic/non-repair scan cannot fill a blank Current Dynamic from replayed state', () => {
    const state = establishedRelationshipState('');
    const applied = applyScanResult(state, repairPayload('A is increasingly trusting and warmly attached to the player.'), {
        sourceMessageId: 12,
        turn: 5,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    assert.equal(applied.state.npcs[0].relationshipSummary, '');
});

test('current-cast repair never overwrites an existing real Current Dynamic', () => {
    const state = establishedRelationshipState('A already regards the player as a dependable ally.');
    const applied = applyScanResult(state, repairPayload('A now sees the player as something else.'), {
        sourceMessageId: 12,
        turn: 5,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        repairRelationshipSummary: true,
    });
    assert.equal(applied.state.npcs[0].relationshipSummary, 'A already regards the player as a dependable ally.');
});

test('current-cast repair requires established relationship state or accepted history', () => {
    const state = baseState('');
    const applied = applyScanResult(state, repairPayload('A is deeply bonded to the player.'), {
        sourceMessageId: 12,
        turn: 5,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        repairRelationshipSummary: true,
    });
    assert.equal(applied.state.npcs[0].relationshipSummary, '');
});

test('manual current-cast prompt exposes bounded accepted relationship repair context only in repair mode', () => {
    const state = establishedRelationshipState('');
    state.npcs.push(normalizeNpc({
        id: 'npc-b',
        name: 'B',
        present: false,
        relationship: { trust: 40, affection: 20, desire: 0, tension: 0 },
        relationshipEvidenceHistory: [{ impact: 'meaningful', delta: { trust: 2 }, evidence: 'OFFSCREEN_REPAIR_BLOAT_SENTINEL', reason: 'Off-screen history must not inflate current-cast repair context.' }],
    }));
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I ask A whether everything is ready.' },
        { is_user: false, name: 'Narrator', mes: 'A nods and remains beside Lucien.' },
    ];
    const ordinary = buildScanPrompt({ state, chat, assistantMessageId: 1, playerName: 'Lucien' });
    const repair = buildScanPrompt({ state, chat, assistantMessageId: 1, playerName: 'Lucien', relationshipSummaryRepair: true });
    assert.doesNotMatch(ordinary, /relationshipSummaryRepairContext/);
    assert.match(repair, /CURRENT-DYNAMIC REPAIR MODE/);
    assert.match(repair, /relationshipSummaryRepairContext/);
    assert.match(repair, /Repeated support has made A more trusting/);
    assert.match(repair, /Support strengthened the bond/);
    assert.doesNotMatch(repair, /OFFSCREEN_REPAIR_BLOAT_SENTINEL/);
});

test('manual current-cast scan wires summary repair independently from relationship replay', () => {
    const engineSource = fs.readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8');
    assert.match(engineSource, /relationshipSummaryRepair:\s*manual/);
    assert.match(engineSource, /repairRelationshipSummary:\s*manual/);
    assert.match(engineSource, /applyRelationship:\s*relationshipApplyRequested && !replayProtectedRelationship/);
});

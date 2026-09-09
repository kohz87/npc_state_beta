import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';
import { buildExchangeEvidencePolicy } from '../src/evidence-adapter.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';

const IDENTITY = 'Maren Kael works at the guild intake counter.';
const ACTION = 'Maren Kael pulls you toward the ledger, explains each entry, and places the contracts before you.';
const chat = [
    { is_user: true, name: 'Lucien Noctis', mes: 'I approach a young woman receptionist to register.' },
    { is_user: false, name: 'Narrator', swipe_id: 0, mes: `${IDENTITY}\n${ACTION}` },
];
const observation = () => ({
    field: 'behaviorProfile', observation: 'Directed intake through paperwork and contracts.',
    concept: 'Direct intake guidance.', sources: [{ messageId: 1, excerpt: ACTION }],
});
function payload() {
    return {
        exchangeActiveNpcIds: ['Maren Kael'], inChatNpcIds: ['Maren Kael'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Maren Kael', identityKind: 'named', role: 'Guild intake clerk',
            identityEvidence: { anchor: 'Maren Kael', excerpts: [IDENTITY], explanation: 'Named intake clerk.' },
            activityEvidence: {
                exchangeActive: { excerpts: [ACTION], explanation: 'Guides Lucien through intake.' },
                inChat: { excerpts: [ACTION], explanation: 'Remains at the counter.' },
            },
            profileObservations: [observation()],
            fieldEvaluations: { unchanged: [], insufficient: ['personality', 'behaviorProfile', 'mannerisms'], unavailable: [] },
        }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}
function initial() {
    const state = createEmptyState('chat:test');
    state.branchSafety = { status: 'safe' };
    return state;
}
function apply(state, result = payload(), overrides = {}) {
    const visible = chat.map(row => row.mes).join('\n');
    return applyScanResult(state, result, {
        sourceMessageId: 1, turn: 1, playerName: 'Lucien Noctis',
        currentAdmissionText: visible, profileContext: visible, semanticEvidenceContext: visible,
        evidencePolicy: buildExchangeEvidencePolicy({ user: { ...chat[0], id: 0 }, assistant: { ...chat[1], id: 1 } }),
        semanticSourceContextsByMessageId: {
            0: { semanticEvidenceContext: chat[0].mes },
            1: { semanticEvidenceContext: chat[1].mes },
        },
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, ...overrides,
    });
}

test('first-contact observations resolve the admitted stable id, preserve unknown fields, and dedupe on retry', () => {
    const result = apply(initial());
    const npc = result.state.npcs[0];
    assert.equal(result.patchResolutions[0].npcId, npc.id);
    assert.ok(npc.id);
    assert.equal(npc.personality, '');
    assert.deepEqual(npc.behaviorProfile, []);
    assert.deepEqual(npc.mannerisms, []);
    assert.equal(npc.profileEvolutionEvidence.length, 1);
    assert.equal(npc.profileEvolutionEvidence[0].kind, 'observation');
    assert.equal(npc.profileEvolutionEvidence[0].evidence, ACTION);
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    const retried = payload();
    retried.npcs[0].id = npc.id;
    const replay = apply(result.state, retried);
    assert.equal(replay.state.npcs.length, 1);
    assert.equal(replay.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.ok(replay.semanticDiagnostics.some(row => row.reason === 'duplicate-owned-observation'));
});

test('one bootstrap value and its same-source observations remain one item of evidence', () => {
    const result = payload();
    result.npcs[0].behaviorProfile = ['Guides applicants through paperwork and contract choices.'];
    result.npcs[0].profileObservations.push(observation());
    const npc = apply(initial(), result).state.npcs[0];
    assert.deepEqual(npc.behaviorProfile, result.npcs[0].behaviorProfile);
    assert.equal(npc.profileEvolutionEvidence.length, 1);
});

test('first-contact observations cannot authorize failed admission or borrow an incorrect source', () => {
    const rejected = payload();
    rejected.npcs[0].name = 'Unmentioned Stranger';
    rejected.npcs[0].identityEvidence = { anchor: 'Unmentioned Stranger', excerpts: ['Unmentioned Stranger arrived.'], explanation: 'Invented.' };
    const denied = apply(initial(), rejected);
    assert.equal(denied.state.npcs.length, 0);
    assert.ok(denied.semanticDiagnostics.some(row => row.reason === 'observation-target-not-accepted'));

    const wrongSource = payload();
    wrongSource.npcs[0].profileObservations[0].sources[0].messageId = 0;
    const result = apply(initial(), wrongSource);
    assert.equal(result.state.npcs.length, 1);
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 0);
    assert.ok(result.semanticDiagnostics.some(row => row.channel === 'profile-observation' && row.status === 'rejected-proposal'));
});

test('deletion and swipe restore admission and first-contact evidence together', () => {
    const baseline = ensurePreUpdateBaseline(initial(), chat, 1);
    let state = apply(baseline).state;
    state.lastScannedMessageId = 1;
    state.turn = 1;
    state = recordCheckpoint(state, chat, 1, 'scan');
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 1);
    for (const changed of [chat.slice(0, 1), [chat[0], { ...chat[1], swipe_id: 1, mes: 'The counter is empty.' }]]) {
        const restored = reconcileToCurrentBranch(state, changed);
        assert.equal(restored.unsafeDivergence, false);
        assert.equal(restored.state.npcs.length, 0);
    }
});

for (const mode of ['save', 'conflict', 'stale']) {
    test(`first-contact observations use the normal automatic ${mode} boundary`, () => withHost(async h => {
        h.context.chat = structuredClone(chat);
        h.context.generateRaw = async () => {
            h.metrics.generations += 1;
            if (mode === 'stale') h.context.chat[1].mes = 'The counter is empty.';
            return JSON.stringify(payload());
        };
        if (mode === 'conflict') h.beforeWrite = () => ({ ok: false, status: 409, text: async () => 'fixture conflict' });
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(h.metrics.generations, 1);
        if (mode === 'save') {
            assert.equal(result.ok, true);
            const npc = h.persisted().npcs[0];
            assert.equal(npc.profileEvolutionEvidence.length, 1);
            assert.match(npc.profileEvolutionEvidence[0].sourceEventKey, /^source:/);
            assert.deepEqual(npc.behaviorProfile, []);
        } else {
            assert.equal(result.ok, false);
            assert.equal(h.persisted().npcs.length, 0);
        }
    }, { state: initial() }));
}

test('first-contact prompt distinguishes initial establishment, longitudinal support, and current user age evidence', () => {
    const prompt = buildScanPrompt({ state: initial(), chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    assert.match(prompt, /repeated encounters are not required/);
    assert.match(prompt, /ONE owned source for later development/);
    assert.match(prompt, /NEW and EXISTING NPCs may retain tentative/);
    assert.match(prompt, /either CURRENT USER or ASSISTANT/);
    assert.doesNotMatch(prompt, /same-source facts are not independent support|EXISTING NPCs may emit evidence-only/);
});

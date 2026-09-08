import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { buildFirstContactCompletionPrompt } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const user = 'I enter the guild and approach the young woman receptionist.';
const visible = 'A young woman in a wool waistcoat grips your sleeve, puts a ledger before you, and says, "Name on the fifth line."';
const assistant = `${visible}\n\n<Blocks><World_State>NPCs Present:\nTessa Morren:\n* G-Rank: N/A (Guild Intake Clerk)\n* Position: Behind the registration counter</World_State><NPC_Inner_Chatter>TESSA: I need this ledger closed by dusk.</NPC_Inner_Chatter></Blocks>`;
const chat = [
    { is_user: true, name: 'Lucien Noctis', mes: user },
    { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistant },
];

function firstPayload() {
    return {
        exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Tessa Morren', identityKind: 'named', evaluatedGroups: ['canon','profile','live','memory','npcRelationships'],
            identityEvidence: { anchor: 'young woman in a wool waistcoat', excerpts: [visible], explanation: 'The visible receptionist is Tessa Morren in current World_State.' },
            activityEvidence: { exchangeActive: { excerpts: [visible], explanation: 'She handles Lucien intake.' }, inChat: { excerpts: [visible], explanation: 'She remains at the counter.' } },
            role: 'Guild intake clerk', personality: 'Brisk and no-nonsense during intake.', location: 'Adventurer Guild Post', status: 'Processing Lucien intake paperwork.',
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust:0, affection:0, desire:0, tension:0 }, axisEvidence: {}, reason: 'Initial professional interaction.' },
            relationshipSummary: 'Transactional clerk-to-applicant intake interaction.',
            relationshipSummaryEvidence: { excerpts: [visible], explanation: 'Tessa briskly processes Lucien as an applicant.' },
            fieldEvaluations: { unchanged: [], insufficient: ['species','background','age','apparentAge','birthday','appearance','appearanceForms','behaviorProfile','speech','mannerisms','mood','goal','currentForm','memories','keyRelationships'], unavailable: [] },
        }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}

function completionPayload(id) {
    return {
        exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: ['Tessa Morren'],
        npcs: [{
            id, name: 'Tessa Morren',
            personality: 'This direct field must not overwrite first-pass personality.',
            relationshipSummary: 'Must not rewrite Current Dynamic.',
            semanticUpdates: [
                { field: 'goal', operation: 'establish', value: 'Close the intake ledger by dusk.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] },
                { field: 'personality', operation: 'replace', value: 'Must be filtered because personality is already populated.', sources: [{ messageId: 1, excerpt: visible }] },
            ],
            fieldEvaluations: { unchanged: [], insufficient: ['age','species'], unavailable: [] },
        }],
        socialEdges: [{ from: id, to: 'somebody', relation: 'invented' }], familyFacts: [],
        lifeStateUpdates: [{ id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'invented' }], candidateAccounting: {},
    };
}

test('first-contact completion prompt is current-only and forbids second-pass cast/relationship authority', () => {
    const state = createEmptyState('chat:test');
    const npc = { ...state.npcs[0], id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', goal: '' };
    const prompt = buildFirstContactCompletionPrompt({ targets: [{ npc, fields: ['goal','mood'] }], chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
    assert.match(prompt, /ONLY the complete CURRENT USER \+ ASSISTANT exchange/);
    assert.match(prompt, /Do not create NPCs, rename targets, revisit presence\/activity, relationship scores\/Current Dynamic, lifecycle, family\/social graph/);
    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW \(bounded operation evidence\)/);
    assert.match(prompt, /ADMITTED TARGETS AND ONLY FIELDS TO RECHECK:\n\[{\"id\":\"npc-tessa\",\"name\":\"Tessa Morren\",\"unresolvedFields\":\[\"goal\",\"mood\"\]}/);
    assert.doesNotMatch(prompt, /\"dossier\":/);
});

test('automatic new-NPC admission gets one bounded completion request that can fill a missed current-source goal without repainting first-pass state', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
        const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
        assert.ok(id);
        return JSON.stringify(completionPayload(id));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    const npc = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
    assert.ok(npc);
    assert.equal(npc.goal, 'Close the intake ledger by dusk.');
    assert.equal(npc.personality, 'Brisk and no-nonsense during intake.');
    assert.equal(npc.relationshipSummary, 'Transactional clerk-to-applicant intake interaction.');
    assert.equal(npc.lifeState, 'unknown');
    assert.equal(npc.present, true);
    assert.equal(npc.worldActive, false);
    assert.deepEqual(npc.relationship, { trust:0, affection:0, desire:0, tension:0 });
    assert.equal((h.persisted().socialEdges || []).length, 0);
}), { state: createEmptyState('chat:actor.png:fixture') });


test('first-contact completion requires the admitted stable id and will not bind a same-name patch with a wrong id', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
        return JSON.stringify({
            exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
            npcs: [{
                id: 'npc-wrong-target', name: 'Tessa Morren',
                semanticUpdates: [{ field: 'goal', operation: 'establish', value: 'Wrong-id mutation.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] }],
            }],
            socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
        });
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    const admitted = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
    assert.ok(admitted?.id && admitted.id !== 'npc-wrong-target');
    assert.equal(admitted.goal, '');
}), { state: createEmptyState('chat:actor.png:fixture') });

test('completion provider failure preserves the valid first pass and reports partial instead of losing admission', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async () => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        throw new Error('completion fixture unavailable');
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().npcs.length, 1);
    assert.ok(result.coverageDiagnostics.some(row => row.status === 'first-contact-completion-failed'));
}), { state: createEmptyState('chat:actor.png:fixture') });

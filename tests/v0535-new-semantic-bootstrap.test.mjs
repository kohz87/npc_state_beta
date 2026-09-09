import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult } from '../src/scanner.js';
import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { createEmptyState } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const IDENTITY = 'A young woman stood behind the intake counter. "Linnea Brand. Station clerk, third intake. Move past the hearth."';
const ACTION = 'Linnea seized Lucien by the elbow, planted him before the register, and thrust a cedar pen into his hand.';
const CONTRACTS = '"Take your pick. Three jobs open before sundown."';
const END = 'Linnea leaned her knuckles on the counter while Lucien studied the boar contract.';
const WORLD = 'NPCs Present:\nLinnea Brand | Rimecross Guild Station intake counter | Mood: Brisk, impatient';
const INNER = 'Linnea Brand: "I need this drift-in to choose one of the open contracts before the wagon arrives."';
const ZERO = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'Initial professional intake.' };

function state(key) {
    const value = createEmptyState(key);
    value.branchSafety = { status: 'safe' };
    return value;
}

function exchange() {
    return {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I enter the guild to register and look over the available contracts.' },
        assistant: {
            id: 1,
            is_user: false,
            name: 'Narrator',
            swipe_id: 0,
            mes: [
                IDENTITY,
                ACTION,
                CONTRACTS,
                END,
                `<Blocks><World_State>${WORLD}</World_State><NPC_Inner_Chatter>${INNER}</NPC_Inner_Chatter><Inventory>Linnea Brand | bleached linen sleeves</Inventory></Blocks>`,
            ].join('\n'),
        },
    };
}

function options(ex) {
    const visible = [profileEvidenceText(ex.user.mes), profileEvidenceText(ex.assistant.mes)].join('\n');
    return {
        sourceMessageId: 1,
        turn: 1,
        playerName: PLAYER,
        currentAdmissionText: visible,
        profileContext: visible,
        semanticEvidenceContext: visible,
        relationshipContext: [relationshipEvidenceText(ex.user.mes), relationshipEvidenceText(ex.assistant.mes)].join('\n'),
        evidencePolicy: buildExchangeEvidencePolicy(ex),
        applyReturnedNpcPatches: true,
        applyRelationship: true,
        preservePresence: true,
        preserveObservation: true,
    };
}

function newPatch(extra = {}) {
    return {
        id: '',
        name: 'Linnea Brand',
        identityKind: 'named',
        evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'],
        identityEvidence: { anchor: 'Linnea Brand', excerpts: [IDENTITY], explanation: 'Linnea introduces herself during intake.' },
        activityEvidence: {
            exchangeActive: { excerpts: [ACTION, CONTRACTS], explanation: 'Linnea directly processes Lucien and presents contracts.' },
            inChat: { excerpts: [END], explanation: 'Linnea remains at the counter at scene end.' },
        },
        relationshipChange: structuredClone(ZERO),
        relationshipSummary: 'Direct, transactional intake clerk managing Lucien’s registration and contract selection.',
        relationshipSummaryEvidence: { excerpts: [ACTION, CONTRACTS], explanation: 'Linnea directs Lucien through a professional intake.' },
        fieldEvaluations: { unchanged: [], insufficient: ['species', 'age', 'birthday', 'appearanceForms', 'currentForm', 'memories', 'keyRelationships'], unavailable: [] },
        ...extra,
    };
}

function payload(patch) {
    return {
        exchangeActiveNpcIds: ['Linnea Brand'],
        inChatNpcIds: ['Linnea Brand'],
        worldActiveNpcIds: [],
        npcs: [patch],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
        candidateAccounting: {},
    };
}

test('NEW semantic bootstrap keeps grounded fields even when vocabulary overlaps structured context', () => {
    const ex = exchange();
    const patch = newPatch({
        semanticUpdates: [
            { field: 'role', operation: 'establish', value: 'Station clerk', sources: [{ messageId: null, excerpt: IDENTITY }], explanation: 'Visible self-introduction establishes her function.' },
            { field: 'background', operation: 'establish', value: 'Third intake clerk at the Rimecross Guild Station.', sources: [{ messageId: null, excerpt: IDENTITY }], explanation: 'Visible self-introduction establishes her intake-clerk affiliation.' },
            { field: 'apparentAge', operation: 'establish', value: '~20-29', sources: [{ messageId: null, excerpt: IDENTITY }], explanation: 'Visible narration establishes a young adult woman.' },
            { field: 'personality', operation: 'establish', value: 'Brisk, assertive, and no-nonsense in managing station business.', sources: [{ messageId: null, excerpt: ACTION }], explanation: 'Her visible handling of intake supports a narrow first-scene characterization.' },
            { field: 'speech', operation: 'establish', value: 'Curt, imperative, and instructional.', sources: [{ messageId: null, excerpt: CONTRACTS }], explanation: 'Her visible dialogue is concise and directive.' },
            { field: 'mood', operation: 'establish', value: 'Brisk and businesslike', sources: [{ messageId: null, excerpt: INNER }], explanation: 'Permitted private context supports her current businesslike focus.' },
            { field: 'location', operation: 'establish', value: 'Rimecross Guild Station intake counter', sources: [{ messageId: null, excerpt: WORLD }], explanation: 'World State may corroborate live location.' },
            { field: 'goal', operation: 'establish', value: 'Have Lucien choose and accept an available frontier contract.', sources: [{ messageId: null, excerpt: INNER }], explanation: 'Permitted private context states the remaining objective.' },
            { field: 'status', operation: 'establish', value: 'Leaning on the intake counter while Lucien reviews contracts.', sources: [{ messageId: null, excerpt: END }], explanation: 'Visible scene ending establishes current activity.' },
        ],
    });
    const result = applyScanResult(state('chat:v0535-semantic-bootstrap'), payload(patch), options(ex));
    const npc = result.state.npcs.find(row => row.name === 'Linnea Brand');

    assert.equal(npc.role, 'Station clerk');
    assert.equal(npc.background, 'Third intake clerk at the Rimecross Guild Station.');
    assert.match(npc.apparentAge, /^~2\d$/);
    assert.equal(npc.personality, 'Brisk, assertive, and no-nonsense in managing station business.');
    assert.equal(npc.speech, 'Curt, imperative, and instructional.');
    assert.equal(npc.mood, 'Brisk and businesslike');
    assert.equal(npc.location, 'Rimecross Guild Station intake counter');
    assert.equal(npc.goal, 'Have Lucien choose and accept an available frontier contract.');
    assert.equal(npc.status, 'Leaning on the intake counter while Lucien reviews contracts.');
    for (const field of ['role', 'background', 'apparentAge', 'personality', 'speech', 'mood', 'location', 'goal', 'status']) {
        assert.equal(result.semanticDiagnostics.some(row => row.field === field && row.status === 'applied'), true, field);
    }
});

test('NEW semantic bootstrap still rejects a durable field sourced only from disallowed structured context', () => {
    const ex = exchange();
    const patch = newPatch({
        semanticUpdates: [{
            field: 'appearance',
            operation: 'establish',
            value: 'Bleached linen sleeves.',
            sources: [{ messageId: null, excerpt: 'Linnea Brand | bleached linen sleeves' }],
            explanation: 'Inventory-only detail must not become durable appearance authority.',
        }],
    });
    const result = applyScanResult(state('chat:v0535-structured-only'), payload(patch), options(ex));
    const npc = result.state.npcs.find(row => row.name === 'Linnea Brand');

    assert.equal(npc.appearance, '');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'appearance' && row.status === 'invalid-source-reference' && row.reason === 'out-of-scope-source'), true);
});

test('NEW semantic mannerism establishment keeps the v0.5.34 explicit-or-reinforced gate', () => {
    const ex = exchange();
    const update = {
        field: 'mannerisms',
        operation: 'establish',
        changes: [{ action: 'add', value: 'Taps relevant contract lines while explaining terms.' }],
        sources: [{ messageId: null, excerpt: ACTION }],
        explanation: 'Candidate first-scene mannerism.',
    };
    const rejected = applyScanResult(state('chat:v0535-mannerism-reject'), payload(newPatch({ semanticUpdates: [update] })), options(ex));
    assert.deepEqual(rejected.state.npcs.find(row => row.name === 'Linnea Brand').mannerisms, []);
    assert.equal(rejected.semanticDiagnostics.some(row => row.field === 'mannerisms' && row.reason === 'profile-establishment-basis-required'), true);

    const accepted = applyScanResult(state('chat:v0535-mannerism-accept'), payload(newPatch({
        profileEstablishment: { mannerisms: 'reinforced' },
        semanticUpdates: [update],
    })), options(ex));
    assert.deepEqual(accepted.state.npcs.find(row => row.name === 'Linnea Brand').mannerisms, ['Taps relevant contract lines while explaining terms.']);
});

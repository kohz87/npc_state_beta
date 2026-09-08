import test from 'node:test';
import assert from 'node:assert/strict';

import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';
import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { buildScanPrompt, buildTargetedRefreshPrompt, applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const NELDA_PULL = 'A woman in a thick homespun smock reached across the threshold, caught your sleeve with firm fingers, and tugged you across the coir mat into the warmth of the hall.';
const NELDA_IDENTITY = '"Nelda Hessel. Guild intake for Rimecross post. Take the quill."';
const NELDA_REGISTER = '"Rhunwald frontier command pays the entry tally this season. We need boots on the lower tracks. Write your name across the fifth column."';
const NELDA_PRESENT = 'Nelda Hessel did not wait for an answer. She released your arm, stepped behind a waist-high pine counter, and shook the snow from her cuffs.';
const NELDA_ASSISTANT = [
    NELDA_PULL,
    '<font color="#d97736">"Sit down by the brazier. Your coat looks soaked through with mountain sleet."</font>',
    NELDA_PRESENT,
    `<font color="#d97736">${NELDA_IDENTITY}</font>`,
    'She spun an open register across the planks. A dry iron nib and a clay inkpot clattered alongside the binding.',
    `<font color="#d97736">${NELDA_REGISTER}</font>`,
].join('\n\n');

const ZERO_REL = Object.freeze({
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'Initial brisk, professional guild intake with no relationship shift.',
});

function safeState(key = 'chat:v0523') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function exchangeFor(assistantText = NELDA_ASSISTANT) {
    return {
        user: { id: 0, is_user: true, name: 'Lucien Noctis', mes: 'I enter the guild, follow the receptionist through registration, and look over the boar-hunting contracts.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', swipe_id: 0, mes: assistantText },
    };
}

function currentOptions(exchange, extra = {}) {
    const visible = [profileEvidenceText(exchange.user.mes), profileEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\n');
    const relationship = [relationshipEvidenceText(exchange.user.mes), relationshipEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\n');
    return {
        sourceMessageId: 1,
        turn: 1,
        playerName: 'Lucien Noctis',
        relationshipContext: relationship,
        profileContext: visible,
        semanticEvidenceContext: visible,
        evidencePolicy: buildExchangeEvidencePolicy(exchange),
        currentAdmissionText: visible,
        applyReturnedNpcPatches: true,
        applyRelationship: true,
        preservePresence: false,
        preserveObservation: true,
        requireDossierCoverage: false,
        ...extra,
    };
}

function neldaPatch({ id = '', summaryExcerpts = [NELDA_IDENTITY, NELDA_REGISTER], summary = 'Brisk and transactional professional intake.' } = {}) {
    return {
        id,
        name: 'Nelda Hessel',
        identityKind: 'named',
        identityEvidence: {
            anchor: 'Nelda Hessel',
            excerpts: [NELDA_IDENTITY],
            explanation: 'Nelda explicitly introduces herself by name and role at the Rimecross post.',
        },
        activityEvidence: {
            exchangeActive: {
                excerpts: [NELDA_PULL, NELDA_IDENTITY],
                explanation: 'Nelda pulls Lucien inside the waystation and directs his registration.',
            },
            inChat: {
                excerpts: [NELDA_PRESENT],
                explanation: 'Nelda is present behind the intake counter in the guild post.',
            },
        },
        role: 'Guild intake clerk',
        background: 'Adventurer Guild intake clerk stationed at the Rimecross post.',
        relationshipChange: structuredClone(ZERO_REL),
        relationshipSummary: summary,
        relationshipSummaryEvidence: {
            excerpts: summaryExcerpts,
            explanation: "Nelda handles Lucien's registration strictly according to guild and frontier intake needs.",
        },
    };
}

function payloadFor(patch = neldaPatch()) {
    return {
        exchangeActiveNpcIds: ['Nelda Hessel'],
        inChatNpcIds: ['Nelda Hessel'],
        worldActiveNpcIds: [],
        npcs: [patch],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
        candidateAccounting: {},
    };
}

test('captured Nelda summary reuses accepted narrator activity without repeating it in relationshipSummaryEvidence', () => {
    const exchange = exchangeFor();
    const payload = payloadFor();
    const originalSummaryEvidence = structuredClone(payload.npcs[0].relationshipSummaryEvidence);
    const result = applyScanResult(safeState(), payload, currentOptions(exchange));
    const nelda = result.state.npcs.find(npc => npc.name === 'Nelda Hessel');

    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, 'Brisk and transactional professional intake.');
    assert.deepEqual(nelda.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.deepEqual(nelda.relationshipProgress, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(nelda.relationshipHistory.length, 0);
    assert.equal(nelda.relationshipEvidenceHistory.length, 0);
    assert.equal(nelda.relationshipMilestones.length, 0);
    assert.deepEqual(payload.npcs[0].relationshipSummaryEvidence, originalSummaryEvidence);
    assert.equal(payload.npcs[0].relationshipSummaryEvidence.excerpts.includes(NELDA_PULL), false);
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
});

test('contextual reuse does not lend the player interaction to another customer in the same message', () => {
    const wrongCustomer = 'Nelda Hessel turns to Mira Vale, pushes a separate ledger toward her, and says, "You should sign the blue column."';
    const assistant = `${NELDA_ASSISTANT}\n\n${wrongCustomer}`;
    const exchange = exchangeFor(assistant);
    const state = safeState('chat:v0523-other-customer');
    state.npcs = [normalizeNpc({ id: 'mira', name: 'Mira Vale' })];
    const patch = neldaPatch({ summaryExcerpts: [NELDA_IDENTITY, wrongCustomer], summary: 'Nelda directs Lucien to sign the blue column.' });
    const result = applyScanResult(state, payloadFor(patch), currentOptions(exchange));
    const nelda = result.state.npcs.find(npc => npc.name === 'Nelda Hessel');

    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('contextual reuse rejects narrated dialogue redirected to an unnamed other customer', () => {
    const wrongCustomer = 'Nelda Hessel turns to another traveler, pushes a separate ledger toward them, and says, "You should sign the blue column."';
    const exchange = exchangeFor(`${NELDA_ASSISTANT}\n\n${wrongCustomer}`);
    const patch = neldaPatch({
        summaryExcerpts: [NELDA_IDENTITY, wrongCustomer],
        summary: 'Nelda directs Lucien to sign the blue column.',
    });
    const result = applyScanResult(safeState('chat:v0523-anonymous-other-customer'), payloadFor(patch), currentOptions(exchange));
    const nelda = result.state.npcs.find(npc => npc.name === 'Nelda Hessel');

    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('a rejected contextual proposal preserves an already established Current Dynamic', () => {
    const wrongCustomer = 'Nelda Hessel turns to Mira Vale and tells her to sign the blue column.';
    const exchange = exchangeFor(`${NELDA_ASSISTANT}\n\n${wrongCustomer}`);
    const state = safeState('chat:v0523-preserve-established');
    state.npcs = [
        normalizeNpc({ id: 'nelda', name: 'Nelda Hessel', present: true, relationshipSummary: 'Established professional registry contact.' }),
        normalizeNpc({ id: 'mira', name: 'Mira Vale' }),
    ];
    const result = applyScanResult(state, payloadFor(neldaPatch({
        id: 'nelda',
        summaryExcerpts: [NELDA_IDENTITY, wrongCustomer],
        summary: 'Nelda directs Lucien to sign the blue column.',
    })), currentOptions(exchange, { preservePresence: true }));
    assert.equal(result.state.npcs.find(npc => npc.id === 'nelda')?.relationshipSummary, 'Established professional registry contact.');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('direct named player-bound Current Dynamic remains valid without contextual evidence reuse', () => {
    const direct = 'Nelda Hessel tells Lucien Noctis that his guild registration is complete.';
    const exchange = exchangeFor(direct);
    const patch = neldaPatch({
        summaryExcerpts: [direct],
        summary: 'Professional registrar-applicant relationship.',
    });
    patch.identityEvidence.excerpts = [direct];
    patch.activityEvidence.exchangeActive.excerpts = [direct];
    patch.activityEvidence.inChat.excerpts = [direct];
    const result = applyScanResult(safeState('chat:v0523-direct'), payloadFor(patch), currentOptions(exchange));
    assert.equal(result.state.npcs.find(npc => npc.name === 'Nelda Hessel')?.relationshipSummary,
        'Professional registrar-applicant relationship.');
});

test('quoted second person without accepted player-facing narrator binding remains rejected', () => {
    const assistant = `<font color="#d97736">${NELDA_IDENTITY}</font>\n\n<font color="#d97736">"You should take the quill."</font>`;
    const exchange = exchangeFor(assistant);
    const patch = neldaPatch({ summaryExcerpts: [NELDA_IDENTITY, '"You should take the quill."'] });
    patch.activityEvidence.exchangeActive.excerpts = [NELDA_IDENTITY];
    patch.activityEvidence.inChat.excerpts = [NELDA_IDENTITY];
    const result = applyScanResult(safeState('chat:v0523-quoted-you'), payloadFor(patch), currentOptions(exchange));
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(result.state.npcs.find(npc => npc.name === 'Nelda Hessel')?.relationshipSummary, '');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('summary-only Current Dynamic persists through storage reload and rolls back with the owned checkpoint', () => {
    const exchange = exchangeFor();
    const chat = [exchange.user, exchange.assistant];
    let state = safeState('chat:v0523-persist');
    state.npcs = [normalizeNpc({ id: 'nelda', name: 'Nelda Hessel', present: true })];
    state = ensurePreUpdateBaseline(state, chat, 1);

    const applied = applyScanResult(state, payloadFor(neldaPatch({ id: 'nelda' })), currentOptions(exchange, { preservePresence: true }));
    state = applied.state;
    state.lastScannedMessageId = 1;
    state.turn = 1;
    state = recordCheckpoint(state, chat, 1, 'scan');
    assert.equal(state.npcs[0].relationshipSummary, 'Brisk and transactional professional intake.');

    const encoded = encodeV3Payload(state.chatKey, state, 1);
    const reloaded = decodeV3Payload(encoded, state.chatKey).state;
    assert.equal(reloaded.npcs[0].relationshipSummary, 'Brisk and transactional professional intake.');

    const deleted = reconcileToCurrentBranch(reloaded, []);
    assert.equal(deleted.unsafeDivergence, false);
    assert.equal(deleted.state.npcs[0].relationshipSummary, '');
    assert.deepEqual(deleted.state.npcs[0].relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
});

test('Scan and Refresh contract says accepted identity/activity evidence can supply target binding without repeated narrator evidence', () => {
    const exchange = exchangeFor();
    const chat = [exchange.user, exchange.assistant];
    const scan = buildScanPrompt({ state: safeState('chat:v0523-prompt'), chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'nelda', name: 'Nelda Hessel' }), chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /accepted identity\/activity evidence/i);
        assert.match(prompt, /do not repeat|need not repeat/i);
        assert.match(prompt, /zero numeric movement/i);
    }
});

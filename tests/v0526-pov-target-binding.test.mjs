import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { relationshipEvidenceExcerptMatch } from '../src/relationship-evidence.js';
import { buildScanPrompt, buildTargetedRefreshPrompt, applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const ZERO = Object.freeze({
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'Routine interaction with no numeric relationship movement.',
});

function safeState(key) {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function optionsFor(exchange) {
    const visible = [profileEvidenceText(exchange.user.mes), profileEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\n');
    const relationship = [relationshipEvidenceText(exchange.user.mes), relationshipEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\n');
    return {
        sourceMessageId: 1,
        turn: 1,
        playerName: PLAYER,
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
    };
}

function payloadFor({ name, identityExcerpt, activityExcerpts, summaryExcerpts = activityExcerpts, inChatExcerpt = identityExcerpt, summary = 'Professional first-contact interaction.' }) {
    return {
        exchangeActiveNpcIds: [name],
        inChatNpcIds: [name],
        worldActiveNpcIds: [],
        candidateAccounting: {},
        npcs: [{
            id: '',
            name,
            identityKind: 'named',
            identityEvidence: {
                anchor: name,
                excerpts: [identityExcerpt],
                explanation: 'Current visible evidence identifies the NPC.',
            },
            activityEvidence: {
                exchangeActive: {
                    excerpts: activityExcerpts,
                    explanation: 'The NPC participates directly in the current player-facing exchange.',
                },
                inChat: {
                    excerpts: [inChatExcerpt],
                    explanation: 'The NPC remains relevant in the scene.',
                },
            },
            relationshipChange: structuredClone(ZERO),
            relationshipSummary: summary,
            relationshipSummaryEvidence: {
                excerpts: summaryExcerpts,
                explanation: 'The evidence establishes the current NPC-player interaction without numeric movement.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

function assertNeutralApplied(result, name, summary) {
    const npc = result.state.npcs.find(row => row.name === name);
    assert.ok(npc);
    assert.equal(npc.relationshipSummary, summary);
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(npc.relationshipHistory.length, 0);
    assert.equal(npc.relationshipEvidenceHistory.length, 0);
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
}

test('first-person USER prose binds the PC directly without requiring literal player naming', () => {
    const user = 'I place my signed form beneath Hesta Vale’s hand and ask her to check it.';
    const assistant = 'Hesta Vale scans the form and taps the approval box.';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: user },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: assistant },
    };
    const policy = buildExchangeEvidencePolicy(exchange);
    const match = relationshipEvidenceExcerptMatch(user, policy.relationshipSources);
    assert.equal(match?.sourceRole, 'user');

    const summary = 'Professional clerk-applicant intake interaction.';
    const result = applyScanResult(safeState('chat:v0526-first-person'), payloadFor({
        name: 'Hesta Vale', identityExcerpt: user, activityExcerpts: [user], inChatExcerpt: assistant, summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Hesta Vale', summary);
});

test('accepted exchange activity binds second-person NPC dialogue without narrator you', () => {
    const identity = 'Talia Brant slapped three pinned slips across the scarred oak counter.';
    const first = '"Sign the lower line, name or mark, do not drip slush on the blotter."';
    const second = '"The butcher wants the tallow and the hams. The farmers just want them dead. Which line are you putting your name to?"';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I wait at the intake counter for the clerk to finish.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: [identity, first, second].join('\n\n') },
    };
    const summary = 'Professional and curt Guild intake clerk processing Lucien’s registration and contract selection.';
    const result = applyScanResult(safeState('chat:v0526-second-person-dialogue'), payloadFor({
        name: 'Talia Brant', identityExcerpt: identity, activityExcerpts: [first, identity, second], summaryExcerpts: [first, identity, second], summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Talia Brant', summary);
});

test('accepted exchange activity binds third-person pronoun prose without a hardcoded pronoun resolver', () => {
    const activity = 'Oren Vale set the registration board before him and waited while he signed the lower line.';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'Lucien approaches the registry desk.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: activity },
    };
    const summary = 'Routine registrar-applicant interaction.';
    const result = applyScanResult(safeState('chat:v0526-third-person'), payloadFor({
        name: 'Oren Vale', identityExcerpt: activity, activityExcerpts: [activity], summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Oren Vale', summary);
});

test('accepted activity cannot lend Current Dynamic to an explicitly different known addressee', () => {
    const activity = 'Talia Brant turns from the counter to Mira Vale and pushes the ledger toward her. "Which line are you signing?"';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I wait beside Mira Vale at the counter.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: activity },
    };
    const state = safeState('chat:v0526-other-addressee');
    state.npcs = [normalizeNpc({ id: 'mira', name: 'Mira Vale', present: true })];
    const result = applyScanResult(state, payloadFor({
        name: 'Talia Brant', identityExcerpt: activity, activityExcerpts: [activity],
        summary: 'Talia directs Lucien through registration.',
    }), optionsFor(exchange));
    const talia = result.state.npcs.find(row => row.name === 'Talia Brant');
    assert.ok(talia);
    assert.equal(talia.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('isolated quoted you outside accepted NPC activity remains rejected', () => {
    const identity = 'Nelda Hessel stands behind the Rimecross intake desk.';
    const quote = '"You should sign the blue column."';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I approach the desk.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: identity + '\n\n' + quote },
    };
    const result = applyScanResult(safeState('chat:v0526-unowned-you'), payloadFor({
        name: 'Nelda Hessel', identityExcerpt: identity, activityExcerpts: [identity], summaryExcerpts: [identity, quote],
        summary: 'Nelda directs Lucien to sign the blue column.',
    }), optionsFor(exchange));
    const nelda = result.state.npcs.find(row => row.name === 'Nelda Hessel');
    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('Scan and Refresh advertise POV-independent Current Dynamic binding through accepted exchange evidence', () => {
    const chat = [
        { id: 0, is_user: true, name: PLAYER, mes: 'I hand the clerk my form.' },
        { id: 1, is_user: false, name: 'Narrator', mes: 'Hesta Vale checks the form.' },
    ];
    const scan = buildScanPrompt({ state: safeState('chat:v0526-prompt'), chat, assistantMessageId: 1, playerName: PLAYER });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'hesta', name: 'Hesta Vale' }), chat, assistantMessageId: 1, playerName: PLAYER });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /POV-independent/i);
        assert.match(prompt, /first-person USER/i);
        assert.match(prompt, /accepted exchangeActive identity.*activity evidence/i);
        assert.match(prompt, /quoted you alone/i);
    }
});

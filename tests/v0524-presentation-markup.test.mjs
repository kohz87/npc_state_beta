import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { relationshipEvidenceExcerptMatch } from '../src/relationship-evidence.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const NELDA_PULL = 'A woman in a thick homespun smock reached across the threshold, caught your sleeve with firm fingers, and tugged you across the coir mat into the warmth of the hall.';
const NELDA_IDENTITY = '"Nelda Hessel. Guild intake for Rimecross post. Take the quill."';
const NELDA_AFTER_IDENTITY = 'She spun an open register across the planks. A dry iron nib and a clay inkpot clattered alongside the binding.';
const NELDA_REGISTER = '"Rhunwald frontier command pays the entry tally this season. We need boots on the lower tracks. Write your name across the fifth column."';
const CROSS_TAG_EXCERPT = `${NELDA_IDENTITY} ${NELDA_AFTER_IDENTITY}`;
const ASSISTANT = [
    NELDA_PULL,
    `<font color="#d97736">${NELDA_IDENTITY}</font>`,
    NELDA_AFTER_IDENTITY,
    `<font color="#d97736">${NELDA_REGISTER}</font>`,
].join('\n\n');

function safeState(key = 'chat:v0524') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function exchangeFor(assistantText = ASSISTANT) {
    return {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I enter the guild and follow the receptionist through registration.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', swipe_id: 0, mes: assistantText },
    };
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

function payload(summaryExcerpt = CROSS_TAG_EXCERPT) {
    return {
        exchangeActiveNpcIds: ['Nelda Hessel'],
        inChatNpcIds: ['Nelda Hessel'],
        worldActiveNpcIds: [],
        candidateAccounting: {},
        npcs: [{
            id: '',
            name: 'Nelda Hessel',
            identityKind: 'named',
            identityEvidence: {
                anchor: 'Nelda Hessel',
                excerpts: [CROSS_TAG_EXCERPT],
                explanation: 'Nelda introduces herself and continues the intake paperwork.',
            },
            activityEvidence: {
                exchangeActive: {
                    excerpts: [NELDA_PULL, CROSS_TAG_EXCERPT],
                    explanation: 'Nelda pulls Lucien inside and continues his registration.',
                },
                inChat: {
                    excerpts: [CROSS_TAG_EXCERPT],
                    explanation: 'Nelda remains at the counter handling the register.',
                },
            },
            role: 'Guild intake clerk',
            background: 'Adventurer Guild intake clerk stationed at the Rimecross post.',
            relationshipChange: {
                evaluated: true,
                impact: 'none',
                delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
                axisEvidence: {},
                reason: 'Routine professional intake with no relationship movement.',
            },
            relationshipSummary: 'Impatient, strictly professional guild intake clerk processing Lucien\'s registration and contract selection.',
            relationshipSummaryEvidence: {
                excerpts: [summaryExcerpt, NELDA_REGISTER],
                explanation: 'Nelda handles Lucien\'s registration as brisk procedural guild business.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

test('exact relationship evidence matches across supported font markup without treating narration as quoted dialogue', () => {
    const dialogueOnly = relationshipEvidenceExcerptMatch(NELDA_IDENTITY, [{ id: 'assistant-visible', kind: 'visible', text: ASSISTANT }]);
    assert.ok(dialogueOnly);
    assert.equal(dialogueOnly.insideQuotedDialogue, true);

    const match = relationshipEvidenceExcerptMatch(CROSS_TAG_EXCERPT, [{ id: 'assistant-visible', kind: 'visible', text: ASSISTANT }]);
    assert.ok(match);
    assert.equal(match.sourceId, 'assistant-visible');
    assert.equal(match.kind, 'visible');
    assert.equal(match.insideQuotedDialogue, false);
});

test('cross-font excerpt works consistently for identity, activity, and Current Dynamic application', () => {
    const exchange = exchangeFor();
    const result = applyScanResult(safeState(), payload(), optionsFor(exchange));
    const nelda = result.state.npcs.find(npc => npc.name === 'Nelda Hessel');

    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, 'Impatient, strictly professional guild intake clerk processing Lucien\'s registration and contract selection.');
    assert.deepEqual(nelda.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(nelda.relationshipHistory.length, 0);
    assert.equal(nelda.relationshipEvidenceHistory.length, 0);
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
});

test('presentation normalization does not make fabricated cross-tag text valid', () => {
    const fabricated = `${NELDA_IDENTITY} She handed Lucien a silver badge that never appeared in the source.`;
    assert.equal(relationshipEvidenceExcerptMatch(fabricated, [{ id: 'assistant-visible', kind: 'visible', text: ASSISTANT }]), null);

    const exchange = exchangeFor();
    const result = applyScanResult(safeState('chat:v0524-fabricated'), payload(fabricated), optionsFor(exchange));
    const nelda = result.state.npcs.find(npc => npc.name === 'Nelda Hessel');
    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
});

test('structural/custom tags are not stripped to manufacture an exact evidence match', () => {
    const source = 'Alpha <Blocks><World_State>Beta</World_State></Blocks> Gamma';
    const excerpt = 'Alpha Beta Gamma';
    assert.equal(relationshipEvidenceExcerptMatch(excerpt, [{ id: 'assistant-visible', kind: 'visible', text: source }]), null);
});

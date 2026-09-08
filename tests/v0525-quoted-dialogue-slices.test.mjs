import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { relationshipEvidenceExcerptMatch } from '../src/relationship-evidence.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const DIRECT = 'Maren Cole caught your sleeve and steered you to the guild counter before releasing you beside the open ledger.';
const FULL_DIALOGUE = '"Name goes on the line. First name, clan name, whatever you answer to when the watch calls the gate. Then pick the paper you want. The turnip farmers are screaming at the bailiff every morning. Those tusks need clearing before nightfall."';
const SHORT_PREFIX = '"Name goes on the line. First name, clan name, whatever you answer to when the watch calls the gate. Then pick the paper you want."';
const SHORT_MIDDLE = '"First name, clan name, whatever you answer to when the watch calls the gate."';
const ASSISTANT = [DIRECT, `<font color="#ff9933">${FULL_DIALOGUE}</font>`, 'Maren tapped the pen against the desk.'].join('\n\n');

function source(text = ASSISTANT) {
    return [{ id: 'assistant-visible', kind: 'visible', text }];
}

function exchangeFor(assistantText = ASSISTANT) {
    return {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I glance at the clerk and ask, "What now?"' },
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

function payload(summaryDialogue = SHORT_PREFIX) {
    return {
        exchangeActiveNpcIds: ['Maren Cole'],
        inChatNpcIds: ['Maren Cole'],
        worldActiveNpcIds: [],
        candidateAccounting: {},
        npcs: [{
            id: '',
            name: 'Maren Cole',
            identityKind: 'named',
            identityEvidence: {
                anchor: 'Maren Cole',
                excerpts: [DIRECT],
                explanation: 'Narration directly identifies Maren while she handles Lucien at the counter.',
            },
            activityEvidence: {
                exchangeActive: {
                    excerpts: [DIRECT, summaryDialogue],
                    explanation: 'Maren physically handles Lucien and gives him the registration instructions.',
                },
                inChat: {
                    excerpts: [DIRECT],
                    explanation: 'Maren remains the clerk directly interacting with Lucien.',
                },
            },
            role: 'Guild intake clerk',
            relationshipChange: {
                evaluated: true,
                impact: 'none',
                delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
                axisEvidence: {},
                reason: 'Initial procedural intake does not warrant numeric movement.',
            },
            relationshipSummary: 'Strictly transactional and authoritative guild intake: Maren treats Lucien as an applicant who must be registered and put to work.',
            relationshipSummaryEvidence: {
                excerpts: [DIRECT, summaryDialogue],
                explanation: 'Maren handles Lucien directly in a brisk clerk-to-applicant exchange.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

test('wholly quoted verbatim slices of one longer dialogue segment match generically', () => {
    for (const excerpt of [SHORT_PREFIX, SHORT_MIDDLE]) {
        const match = relationshipEvidenceExcerptMatch(excerpt, source());
        assert.ok(match, excerpt);
        assert.equal(match.sourceId, 'assistant-visible');
        assert.equal(match.insideQuotedDialogue, true);
    }
});

test('quoted-slice matching stays exact and bounded to one dialogue segment', () => {
    assert.equal(relationshipEvidenceExcerptMatch('"Name goes on the line. Then take the silver badge."', source()), null);

    const splitSource = '"Alpha beta." She checked the ledger. "Gamma delta."';
    assert.equal(relationshipEvidenceExcerptMatch('"Alpha beta. Gamma delta."', source(splitSource)), null);
    assert.equal(relationshipEvidenceExcerptMatch('"Alpha beta. She checked the ledger."', source(splitSource)), null);

    const structuralSource = '"Alpha <Blocks><World_State>Beta</World_State></Blocks> Gamma"';
    assert.equal(relationshipEvidenceExcerptMatch('"Alpha Beta Gamma"', source(structuralSource)), null);
});

test('production application accepts shortened dialogue evidence for activity and neutral Current Dynamic', () => {
    const exchange = exchangeFor();
    const state = createEmptyState('chat:v0525-dialogue-slice');
    state.branchSafety = { status: 'safe' };
    const result = applyScanResult(state, payload(), optionsFor(exchange));
    const maren = result.state.npcs.find(npc => npc.name === 'Maren Cole');

    assert.ok(maren);
    assert.equal(maren.relationshipSummary, 'Strictly transactional and authoritative guild intake: Maren treats Lucien as an applicant who must be registered and put to work.');
    assert.deepEqual(maren.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(maren.relationshipHistory.length, 0);
    assert.equal(maren.relationshipEvidenceHistory.length, 0);
    assert.ok(result.state.activeNpcIds.includes(maren.id));
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
});

test('production application rejects a fabricated shortened dialogue proposal without mutating Current Dynamic', () => {
    const exchange = exchangeFor();
    const state = createEmptyState('chat:v0525-dialogue-fabricated');
    state.branchSafety = { status: 'safe' };
    const result = applyScanResult(state, payload('"Name goes on the line. Then take the silver badge."'), optionsFor(exchange));
    const maren = result.state.npcs.find(npc => npc.name === 'Maren Cole');

    assert.ok(maren);
    assert.equal(maren.relationshipSummary, '');
    assert.deepEqual(maren.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
});

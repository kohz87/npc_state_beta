import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { SCAN_OUTPUT_EXAMPLE_SCENES, scanOutputContract, scanOutputExamples } from '../src/scan-contract.js';
import { applyRelationshipSummaryProjection } from '../src/scan-relationships.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt, parseScanJson } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';

const ZERO_REL = Object.freeze({
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'Routine professional intake; no numeric relationship shift.',
});

const VRENA_INTERACTION = 'The intake clerk gripped your sleeve before your second step crossed the threshold, swinging you toward the counter with practiced efficiency.';
const VRENA_IDENTITY = '"Vrena Tolk. Intake, records, contract dispatch."';
const VRENA_CONTIGUOUS = 'The clerk let go of your coat, smoothed a coarse sheet of parchment against the counter, and set a brass-ferruled quill beside a stone inkpot. "Vrena Tolk. Intake, records, contract dispatch."';
const VRENA_ASSISTANT = [
    VRENA_INTERACTION,
    'She stood half a head shorter than you, dressed in a dark homespun bodice over an unbleached linen shift, her cuffs tied back to the elbows with leather thongs to keep the dark stain of oak gall ink from creeping up the fabric.',
    VRENA_CONTIGUOUS,
    'She dipped the quill herself, turning the wooden board until the bottom margin pointed toward your chest.',
    '"Write your name on line three. Mark a cross if you lack letters. The Imperial branch waives provisional entry fees this month."',
].join('\n\n');

function safeState(key = 'chat:v0522') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function exchangeFor(assistantText = VRENA_ASSISTANT, userText = 'I step into the guild to register.') {
    return {
        user: { id: 0, is_user: true, name: 'Lucien Noctis', mes: userText },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: assistantText },
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

function vrenaPatch({
    interaction = VRENA_INTERACTION,
    identity = VRENA_IDENTITY,
    summaryExcerpts = [VRENA_INTERACTION, VRENA_IDENTITY],
    explanation = 'Vrena establishes an immediate businesslike and procedural relationship with Lucien.',
    activityExcerpts = [VRENA_INTERACTION, VRENA_IDENTITY],
    identityExcerpts = [VRENA_INTERACTION, VRENA_IDENTITY],
} = {}) {
    return {
        id: '',
        name: 'Vrena Tolk',
        identityKind: 'named',
        identityEvidence: { anchor: 'Vrena Tolk', excerpts: identityExcerpts, explanation: 'The intake role is contextually bound to Vrena’s self-introduction.' },
        activityEvidence: {
            exchangeActive: { excerpts: activityExcerpts, explanation: 'The resolved intake clerk directly handles Lucien during registration.' },
            inChat: { excerpts: [identity], explanation: 'Vrena remains at the intake counter.' },
        },
        role: 'Guild registrar and intake clerk',
        relationshipChange: structuredClone(ZERO_REL),
        relationshipSummary: "Professional and transactional intake official processing Lucien's provisional guild registration and contract dispatch.",
        relationshipSummaryEvidence: { excerpts: summaryExcerpts, explanation },
    };
}

function vrenaPayload(patch = vrenaPatch()) {
    return {
        exchangeActiveNpcIds: ['Vrena Tolk'],
        inChatNpcIds: ['Vrena Tolk'],
        worldActiveNpcIds: [],
        npcs: [patch],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

test('split coherent Vrena evidence reuses accepted identity/activity binding and persists zero-score Current Dynamic', () => {
    const exchange = exchangeFor();
    const result = applyScanResult(safeState(), JSON.stringify(vrenaPayload()), currentOptions(exchange));
    const vrena = result.state.npcs.find(npc => npc.name === 'Vrena Tolk');
    assert.ok(vrena);
    assert.equal(vrena.relationshipSummary, "Professional and transactional intake official processing Lucien's provisional guild registration and contract dispatch.");
    assert.deepEqual(vrena.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(vrena.relationshipHistory.length, 0);
    assert.equal(vrena.relationshipEvidenceHistory.length, 0);
    const diag = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diag?.status, 'applied');
});

test('target-bound multi-sentence evidence accepts a legitimate paraphrased explanation without lexical copying', () => {
    const npc = normalizeNpc({ id: 'npc-vrena', name: 'Vrena Tolk' });
    const diagnostics = [];
    const next = applyRelationshipSummaryProjection(npc, {
        relationshipSummary: 'Professional intake official handling Lucien through guild registration.',
        relationshipSummaryEvidence: {
            excerpts: [VRENA_CONTIGUOUS],
            explanation: 'Vrena handles Lucien through a procedural, businesslike guild intake.',
        },
        relationshipChange: structuredClone(ZERO_REL),
    }, {
        playerName: 'Lucien Noctis',
        otherNpcNames: [],
        relationshipEvidenceSources: [{ id: 'assistant-visible', kind: 'visible', text: VRENA_CONTIGUOUS }],
        relationshipSummaryDiagnostics: diagnostics,
    });
    assert.equal(next.relationshipSummary, 'Professional intake official handling Lucien through guild registration.');
    assert.equal(diagnostics.at(-1)?.status, 'applied');
});

test('font-wrapped dialogue and narrator second-person keep valid Current Dynamic binding', () => {
    const wrappedIdentity = '<font color="#c9653b">"Vrena Tolk. Intake, records, contract dispatch."</font>';
    const assistant = `${VRENA_INTERACTION}\n\n${wrappedIdentity}\n\nShe turns the ledger until the signature line points toward your hand.`;
    const exchange = exchangeFor(assistant);
    const patch = vrenaPatch({
        identity: VRENA_IDENTITY,
        summaryExcerpts: [VRENA_INTERACTION, VRENA_IDENTITY],
        activityExcerpts: [VRENA_INTERACTION, VRENA_IDENTITY],
        identityExcerpts: [VRENA_INTERACTION, VRENA_IDENTITY],
    });
    const result = applyScanResult(safeState('chat:v0522-font'), JSON.stringify(vrenaPayload(patch)), currentOptions(exchange));
    assert.equal(result.state.npcs.find(npc => npc.name === 'Vrena Tolk')?.relationshipSummary,
        "Professional and transactional intake official processing Lucien's provisional guild registration and contract dispatch.");
});

test('contextual summary bridge rejects competing speaker, unrelated activity, and ambiguous unbound role evidence', () => {
    const npc = normalizeNpc({ id: 'npc-vrena', name: 'Vrena Tolk' });
    const attempt = ({ sources, excerpts, otherNpcNames = [], activityEvidenceExcerpts, identityEvidenceAccepted = true, identityEvidenceExcerpts = [] }) => {
        const diagnostics = [];
        const next = applyRelationshipSummaryProjection(npc, {
            relationshipSummary: 'Professional intake relationship with Lucien.',
            relationshipSummaryEvidence: { excerpts, explanation: 'Vrena handles Lucien through intake.' },
            relationshipChange: structuredClone(ZERO_REL),
        }, {
            playerName: 'Lucien Noctis',
            otherNpcNames,
            relationshipEvidenceSources: [{ id: 'assistant-visible', kind: 'visible', text: sources }],
            relationshipSummaryDiagnostics: diagnostics,
            relationshipSummaryTargetBinding: {
                npcId: 'npc-vrena',
                identityAccepted: true,
                exchangeActiveAccepted: true,
                activityEvidenceAccepted: true,
                activityEvidenceExcerpts,
                identityEvidenceAccepted,
                identityEvidenceExcerpts,
            },
        });
        return { next, diagnostics };
    };

    const competing = 'Morwen Cole, the other clerk, gripped your sleeve and pulled you to her desk. "Vrena Tolk. Intake, records, contract dispatch."';
    const wrongSpeaker = attempt({
        sources: competing,
        excerpts: ['Morwen Cole, the other clerk, gripped your sleeve and pulled you to her desk.', VRENA_IDENTITY],
        otherNpcNames: ['Morwen Cole'],
        activityEvidenceExcerpts: ['Morwen Cole, the other clerk, gripped your sleeve and pulled you to her desk.', VRENA_IDENTITY],
        identityEvidenceExcerpts: ['Morwen Cole, the other clerk, gripped your sleeve and pulled you to her desk.', VRENA_IDENTITY],
    });
    assert.equal(wrongSpeaker.next.relationshipSummary, '');
    assert.equal(wrongSpeaker.diagnostics.at(-1)?.reason, 'wrong-summary-target');

    const unrelated = `${VRENA_INTERACTION} Vrena Tolk sorts a separate ledger by the window.`;
    const unrelatedActivity = attempt({
        sources: unrelated,
        excerpts: [VRENA_INTERACTION, 'Vrena Tolk sorts a separate ledger by the window.'],
        activityEvidenceExcerpts: ['Vrena Tolk sorts a separate ledger by the window.'],
        identityEvidenceExcerpts: ['Vrena Tolk sorts a separate ledger by the window.'],
    });
    assert.equal(unrelatedActivity.next.relationshipSummary, '');
    assert.equal(unrelatedActivity.diagnostics.at(-1)?.reason, 'wrong-summary-target');

    const unrelatedIdentity = `${VRENA_INTERACTION} Vrena Tolk won a bookkeeping prize last winter. ${VRENA_IDENTITY}`;
    const borrowedIdentity = attempt({
        sources: unrelatedIdentity,
        excerpts: [VRENA_INTERACTION, 'Vrena Tolk won a bookkeeping prize last winter.'],
        activityEvidenceExcerpts: [VRENA_INTERACTION],
        identityEvidenceExcerpts: [VRENA_IDENTITY],
    });
    assert.equal(borrowedIdentity.next.relationshipSummary, '');
    assert.equal(borrowedIdentity.diagnostics.at(-1)?.reason, 'wrong-summary-target');

    const ambiguous = `${VRENA_INTERACTION} ${VRENA_IDENTITY}`;
    const unboundRole = attempt({
        sources: ambiguous,
        excerpts: [VRENA_INTERACTION, VRENA_IDENTITY],
        activityEvidenceExcerpts: [VRENA_INTERACTION],
        identityEvidenceAccepted: false,
        identityEvidenceExcerpts: [],
    });
    assert.equal(unboundRole.next.relationshipSummary, '');
    assert.equal(unboundRole.diagnostics.at(-1)?.reason, 'wrong-summary-target');
});


test('contextual summary bridge rejects one ambiguous role-only activity excerpt claimed by competing NPC patches', () => {
    const interaction = 'The intake clerk gripped your sleeve and swung you toward the counter.';
    const vrenaIdentity = '"Vrena Tolk. Intake, records, contract dispatch."';
    const morwenIdentity = '"Morwen Cole. Intake, records, contract dispatch."';
    const assistantText = [interaction, vrenaIdentity, morwenIdentity].join('\n\n');
    const exchange = exchangeFor(assistantText);
    const makePatch = (name, identity) => ({
        id: '', name, identityKind: 'named',
        identityEvidence: { anchor: name, excerpts: [identity], explanation: `${name} states the name and intake role.` },
        activityEvidence: {
            exchangeActive: { excerpts: [interaction], explanation: 'The intake clerk physically handles Lucien.' },
            inChat: { excerpts: [identity], explanation: `${name} remains at the intake desk.` },
        },
        relationshipChange: structuredClone(ZERO_REL),
        relationshipSummary: `Professional intake relationship with Lucien.`,
        relationshipSummaryEvidence: { excerpts: [interaction, identity], explanation: `${name} handles Lucien through intake.` },
    });
    const result = applyScanResult(safeState('chat:v0522-ambiguous-role'), {
        exchangeActiveNpcIds: ['Vrena Tolk', 'Morwen Cole'],
        inChatNpcIds: ['Vrena Tolk', 'Morwen Cole'],
        worldActiveNpcIds: [],
        npcs: [makePatch('Vrena Tolk', vrenaIdentity), makePatch('Morwen Cole', morwenIdentity)],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    }, currentOptions(exchange));

    for (const npc of result.state.npcs) assert.equal(npc.relationshipSummary, '');
    const rejected = result.semanticDiagnostics.filter(row => row.field === 'relationshipSummary');
    assert.equal(rejected.length, 2);
    assert.equal(rejected.every(row => row.status === 'rejected-proposal' && row.reason === 'wrong-summary-target'), true);
});

test('quoted second person addressed to another NPC and fabricated summary excerpts remain rejected', () => {
    const npc = normalizeNpc({ id: 'npc-vrena', name: 'Vrena Tolk' });
    for (const [source, excerpt, expectedReason] of [
        ['Vrena Tolk told Mira Vale, “You should take the quill.”', 'Vrena Tolk told Mira Vale, “You should take the quill.”', 'wrong-summary-target'],
        ['Vrena Tolk waits beside Lucien.', 'Vrena Tolk hands Lucien a forged document.', 'out-of-scope-summary-evidence'],
    ]) {
        const diagnostics = [];
        const next = applyRelationshipSummaryProjection(npc, {
            relationshipSummary: 'Direct professional interaction with Lucien.',
            relationshipSummaryEvidence: { excerpts: [excerpt], explanation: 'Vrena handles Lucien professionally.' },
            relationshipChange: structuredClone(ZERO_REL),
        }, {
            playerName: 'Lucien Noctis', otherNpcNames: ['Mira Vale'],
            relationshipEvidenceSources: [{ id: 'assistant-visible', kind: 'visible', text: source }],
            relationshipSummaryDiagnostics: diagnostics,
        });
        assert.equal(next.relationshipSummary, '');
        assert.equal(diagnostics.at(-1)?.reason, expectedReason);
    }
});

test('descriptive Current Dynamic path does not bypass numeric scoring or same-source replay protection', () => {
    const visible = 'Sanna Karr tells Lucien she trusts him more after he kept his promise.';
    const state = safeState('chat:v0522-numeric');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', present: true, relationship: { trust: 10, affection: 0, desire: 0, tension: 0 } })];
    const patch = {
        id: 'sanna', name: 'Sanna Karr',
        relationshipChange: {
            evaluated: true, impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],
            axisEvidence: { trust: { excerpts: [visible], explanation: 'Sanna explicitly expresses increased trust after Lucien kept his promise.' } },
            reason: 'Trust increased.',
        },
        relationshipSummary: 'Sanna now regards Lucien as somewhat more reliable.',
        relationshipSummaryEvidence: { excerpts: [visible], explanation: 'Her view of Lucien has become more trusting and professionally reliable.' },
    };
    const payload = { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
    const first = applyScanResult(state, payload, {
        sourceMessageId: 1, turn: 1, playerName: 'Lucien', currentAdmissionText: visible, profileContext: visible,
        relationshipContext: visible, applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true,
    });
    assert.equal(first.state.npcs[0].relationship.trust, 11);
    assert.equal(first.state.npcs[0].relationshipHistory.length, 1);
    assert.equal(first.state.npcs[0].relationshipSummary, 'Sanna now regards Lucien as somewhat more reliable.');

    const second = applyScanResult(first.state, payload, {
        sourceMessageId: 1, turn: 1, playerName: 'Lucien', currentAdmissionText: visible, profileContext: visible,
        relationshipContext: visible, applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true,
    });
    assert.equal(second.state.npcs[0].relationship.trust, 11);
    assert.equal(second.state.npcs[0].relationshipHistory.length, 1);
});

test('full fictional example is source-coherent when parsed and applied with explicit starting state', () => {
    const example = scanOutputExamples().populated;
    const parsed = parseScanJson(JSON.stringify(example));
    const scene = `${SCAN_OUTPUT_EXAMPLE_SCENES.nia}\n${SCAN_OUTPUT_EXAMPLE_SCENES.ivo}`;
    const exchange = {
        user: { id: 0, is_user: true, name: 'Ari', mes: 'I wait at the registry desk.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: scene },
    };
    const state = safeState('chat:v0522-example');
    state.npcs = [normalizeNpc({ id: 'npc-ivo', name: 'Ivo', appearance: 'Brown eyes.', present: true })];
    const result = applyScanResult(state, parsed, currentOptions(exchange, {
        playerName: 'Ari',
        coverageNpcIds: ['npc-ivo'],
        requireCandidateAccounting: true,
        requireDossierCoverage: true,
    }));

    const nia = result.state.npcs.find(npc => npc.name === 'Nia');
    const ivo = result.state.npcs.find(npc => npc.id === 'npc-ivo');
    assert.ok(nia && ivo);
    assert.equal(nia.appearance, 'Blue coat.');
    assert.equal(nia.personality, '');
    assert.equal(nia.background, 'Clerk of the South Quay Registry.');
    assert.equal(nia.relationshipSummary, 'Professional clerk-applicant interaction.');
    assert.equal(ivo.appearance, 'Green eyes.');
    assert.equal(ivo.status, '');
    assert.equal(ivo.relationshipSummary, '');
    assert.equal(ivo.profileEvolutionEvidence.some(row => row.concept === 'Brief factual correction replies.'), true);
    assert.equal(ivo.present, false);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-candidate-accounting'), false);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'incomplete-evaluation'), false);
});

test('diagnostics distinguish explicit insufficient, omitted field coverage, and rejected Current Dynamic', () => {
    const visible = 'Bessa Vond waits at the desk. Mira Vale welcomes Ari and processes Ari’s paperwork.';
    const state = safeState('chat:v0522-diagnostics');
    state.npcs = [normalizeNpc({ id: 'bessa', name: 'Bessa Vond' }), normalizeNpc({ id: 'mira', name: 'Mira Vale' })];
    const insufficient = DOSSIER_SEMANTIC_FIELDS.filter(field => field !== 'background');
    const patch = {
        id: 'bessa', name: 'Bessa Vond', evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'],
        fieldEvaluations: { unchanged: [], insufficient, unavailable: [] },
        relationshipChange: structuredClone(ZERO_REL),
        relationshipSummary: 'Professional intake relationship with Ari.',
        relationshipSummaryEvidence: {
            excerpts: ['Mira Vale welcomes Ari and processes Ari’s paperwork.'],
            explanation: 'Bessa handles Ari through registration.',
        },
    };
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['bessa'], inChatNpcIds: ['bessa'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    }, {
        sourceMessageId: 1, turn: 1, playerName: 'Ari', currentAdmissionText: visible, profileContext: visible, semanticEvidenceContext: visible,
        relationshipContext: visible, applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true, requireDossierCoverage: true,
    });
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'mannerisms' && row.status === 'insufficient-evidence'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'rejected-proposal' && row.reason === 'wrong-summary-target'), true);
    const missing = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.ok(missing?.missingFields?.includes('background'));
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.ok(summary.insufficient > 0);
    assert.ok(summary.omitted > 0);
    assert.ok(summary.rejected > 0);
});

test('Scan and Refresh describe coherent-set Current Dynamic evidence without adding a second grounding authority', () => {
    const chat = [
        { is_user: true, name: 'Lucien Noctis', mes: 'I enter the guild.' },
        { is_user: false, name: 'Narrator', mes: VRENA_ASSISTANT },
    ];
    const scan = buildScanPrompt({ state: safeState('chat:v0522-prompt'), chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'npc-vrena', name: 'Vrena Tolk' }), chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    const contract = scanOutputContract();
    for (const prompt of [scan, refresh, contract]) {
        assert.match(prompt, /small coherent set/i);
        assert.match(prompt, /accepted identity\/activity evidence/i);
        assert.match(prompt, /explanation interprets the evidence/i);
        assert.doesNotMatch(prompt, /must itself visibly bind/i);
    }
});

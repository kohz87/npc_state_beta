import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { scanOutputContract, scanOutputExamples } from '../src/scan-contract.js';
import { parseScanJson } from '../src/scan-payload.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { withHost } from './helpers/host-harness.mjs';

const EMPTY = { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };

function stateWithNpc(extra = {}) {
    const state = createEmptyState('chat:v0517');
    state.npcs = [normalizeNpc({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.', ...extra })];
    return state;
}

function completePatch({ updates = [], observations = [] } = {}) {
    const proposed = new Set(updates.map(update => update.field));
    return {
        id: 'vrena', name: 'Vrena Tolk', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: {
            unchanged: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)),
            insufficient: [], unavailable: [],
        },
        semanticUpdates: updates,
        profileObservations: observations,
    };
}

function observation(concept, excerpt, messageId = 1, observationText = concept) {
    return {
        field: 'speech', observation: observationText, concept,
        sources: [{ messageId, excerpt }], explanation: 'Grounded speech observation.',
    };
}

function sourceOptions({ user = 'Ari asks what to sign.', assistant = 'Vrena Tolk answers with clipped practical instructions.' } = {}) {
    return {
        sourceMessageId: 1,
        turn: 1,
        profileContext: `${user}\n${assistant}`,
        currentAdmissionText: `${user}\n${assistant}`,
        sourceEventKey: 'source:assistant',
        sourceEventKeys: { 0: 'source:user', 1: 'source:assistant' },
        semanticSourceContextsByMessageId: {
            0: { profileContext: user, semanticWorldContext: '', semanticPrivateContext: '' },
            1: { profileContext: assistant, semanticWorldContext: '', semanticPrivateContext: '' },
        },
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
    };
}

function apply(state, patch, options = sourceOptions()) {
    return applyScanResult(state, { ...EMPTY, npcs: [patch] }, options);
}

test('shared prompt advertises profileObservations as an array and the literal contract example is parser-valid', () => {
    const state = stateWithNpc();
    const chat = [{ is_user: true, mes: 'Ari asks what to sign.' }, { is_user: false, mes: 'Vrena Tolk answers with clipped practical instructions.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, candidateNpcIds: ['vrena'] });
    assert.match(prompt, /profileObservations:\[\{field,observation,concept\?,sources:\[\{messageId,excerpt\}\],explanation\?\}\]/);
    assert.doesNotMatch(prompt, /profileObservations:\{field,observation/);
    const contract = scanOutputContract();
    assert.match(contract, /profileObservations:\[\{/);
    const example = scanOutputExamples().populated;
    const ivo = example.npcs.find(npc => npc.id === 'npc-ivo');
    assert.ok(Array.isArray(ivo.profileObservations));
    assert.equal(ivo.profileObservations.length, 1);
    const parsed = parseScanJson(JSON.stringify(example), { requireLifeStateUpdates: true });
    assert.ok(Array.isArray(parsed.npcs.find(npc => npc.id === 'npc-ivo').profileObservations));
});

test('profileObservations object shape is rejected structurally instead of being advertised then silently ignored', () => {
    const example = scanOutputExamples().minimal;
    example.npcs = [{ id: 'vrena', name: 'Vrena Tolk', profileObservations: { field: 'speech' } }];
    assert.throws(() => parseScanJson(JSON.stringify(example), { requireLifeStateUpdates: true }), error =>
        error.code === 'invalid-structure' && /profileObservations: expected array/.test(error.message));
});

test('observation-only scan followed by related applied rescan keeps one source-owned evidence record', () => {
    const assistant = 'Vrena Tolk answers with clipped practical instructions.';
    const opts = sourceOptions({ assistant });
    let state = stateWithNpc();
    const first = apply(state, completePatch({ observations: [observation('Clipped practical instruction.', assistant)] }), opts);
    assert.equal(first.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(first.state.npcs[0].profileEvolutionEvidence[0].kind, 'observation');

    const update = {
        field: 'speech', operation: 'replace', value: 'Clipped, formal, and practical.',
        sources: [{ messageId: 1, excerpt: assistant }], explanation: 'The same source now supports a durable refinement.',
    };
    const second = apply(first.state, completePatch({ updates: [update] }), { ...opts, turn: 2 });
    assert.equal(second.state.npcs[0].speech, 'Clipped, formal, and practical.');
    assert.equal(second.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(second.state.npcs[0].profileEvolutionEvidence[0].kind, 'observation');
});

test('same-payload observation plus applied refinement also remains one record because observation collection precedes mutation', () => {
    const assistant = 'Vrena Tolk answers with clipped practical instructions.';
    const update = {
        field: 'speech', operation: 'replace', value: 'Clipped, formal, and practical.',
        sources: [{ messageId: 1, excerpt: assistant }], explanation: 'Grounded refinement.',
    };
    const result = apply(stateWithNpc(), completePatch({
        observations: [observation('Clipped practical instruction.', assistant)], updates: [update],
    }), sourceOptions({ assistant }));
    assert.equal(result.state.npcs[0].speech, 'Clipped, formal, and practical.');
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 1);
});

test('two distinct observations in the same field may share one excerpt when their concepts differ', () => {
    const assistant = 'Vrena Tolk says, “Sign here. Next line.” without softening either instruction.';
    const observations = [
        observation('Brief directive phrasing.', assistant, 1, 'Uses very short directives.'),
        observation('Little social padding.', assistant, 1, 'Omits conversational softening around instructions.'),
    ];
    const result = apply(stateWithNpc(), completePatch({ observations }), sourceOptions({ assistant }));
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(result.state.npcs[0].profileEvolutionEvidence.map(row => row.concept), ['Brief directive phrasing.', 'Little social padding.']);
});

test('distinct same-excerpt observations survive a related applied update without creating a third evidence record', () => {
    const assistant = 'Vrena Tolk says, “Sign here. Next line.” without softening either instruction.';
    const update = {
        field: 'speech', operation: 'replace', value: 'Brief, directive, and low on social padding.',
        sources: [{ messageId: 1, excerpt: assistant }], explanation: 'The same sentence supports the applied speech refinement.',
    };
    const result = apply(stateWithNpc(), completePatch({
        observations: [
            observation('Brief directive phrasing.', assistant, 1, 'Uses very short directives.'),
            observation('Little social padding.', assistant, 1, 'Omits conversational softening around instructions.'),
        ],
        updates: [update],
    }), sourceOptions({ assistant }));
    assert.equal(result.state.npcs[0].speech, 'Brief, directive, and low on social padding.');
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(result.state.npcs[0].profileEvolutionEvidence.map(row => row.concept), ['Brief directive phrasing.', 'Little social padding.']);
});

test('exact same source-owned concept retries mechanically dedupe while the same concept in a later source remains independent', () => {
    const firstText = 'Vrena Tolk says, “Sign here.”';
    const firstOpts = sourceOptions({ assistant: firstText });
    let state = apply(stateWithNpc(), completePatch({ observations: [observation('Brief directive phrasing.', firstText)] }), firstOpts).state;
    state = apply(state, completePatch({ observations: [observation('Brief directive phrasing.', firstText)] }), { ...firstOpts, turn: 2 }).state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 1);

    const secondText = 'Later, Vrena Tolk says, “Next line.”';
    const secondOpts = {
        ...sourceOptions({ user: 'Ari returns later.', assistant: secondText }),
        sourceMessageId: 3,
        sourceEventKey: 'source:assistant-later',
        sourceEventKeys: { 2: 'source:user-later', 3: 'source:assistant-later' },
        semanticSourceContextsByMessageId: {
            2: { profileContext: 'Ari returns later.', semanticWorldContext: '', semanticPrivateContext: '' },
            3: { profileContext: secondText, semanticWorldContext: '', semanticPrivateContext: '' },
        },
        turn: 3,
    };
    state = apply(state, completePatch({ observations: [observation('Brief directive phrasing.', secondText, 3)] }), secondOpts).state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(state.npcs[0].profileEvolutionEvidence.map(row => row.sourceEventKey), ['source:assistant', 'source:assistant-later']);
});

test('an excerpt claimed from the preceding user message is rejected when it exists only in the assistant message', () => {
    const user = 'Ari asks which line to sign.';
    const assistant = 'Vrena Tolk says, “Sign the lower line.”';
    const opts = sourceOptions({ user, assistant });
    const wrong = observation('Brief directive phrasing.', 'Vrena Tolk says, “Sign the lower line.”', 0);
    const result = apply(stateWithNpc(), completePatch({ observations: [wrong] }), opts);
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 0);
    assert.equal(result.semanticDiagnostics.some(row => row.channel === 'profile-observation' && row.reason === 'out-of-scope-source'), true);
});

test('semantic updates validate excerpts against their claimed message before deriving source ownership', () => {
    const user = 'Ari asks which line to sign.';
    const assistant = 'Vrena Tolk says, “Sign the lower line.”';
    const opts = sourceOptions({ user, assistant });
    const wrongUpdate = {
        field: 'speech', operation: 'replace', value: 'Clipped and directive.',
        sources: [{ messageId: 0, excerpt: assistant }], explanation: 'Misassigned assistant quote.',
    };
    const rejected = apply(stateWithNpc(), completePatch({ updates: [wrongUpdate] }), opts);
    assert.equal(rejected.state.npcs[0].speech, 'Formal.');
    assert.equal(rejected.state.npcs[0].profileEvolutionEvidence.length, 0);
    assert.equal(rejected.semanticDiagnostics.some(row => row.field === 'speech' && row.reason === 'out-of-scope-source'), true);

    const correctUpdate = { ...wrongUpdate, sources: [{ messageId: 1, excerpt: assistant }] };
    const accepted = apply(stateWithNpc(), completePatch({ updates: [correctUpdate] }), opts);
    assert.equal(accepted.state.npcs[0].speech, 'Clipped and directive.');
    assert.equal(accepted.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(accepted.state.npcs[0].profileEvolutionEvidence[0].sourceEventKey, 'source:assistant');
});

test('messageId null means the owned current message when per-message source contexts are available', () => {
    const user = 'Vrena Tolk says, “This quote appears only in the user message.”';
    const assistant = 'Vrena Tolk silently points to the form.';
    const opts = sourceOptions({ user, assistant });
    const wrongCurrent = observation('Brief directive phrasing.', user, null);
    const result = apply(stateWithNpc(), completePatch({ observations: [wrongCurrent] }), opts);
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 0);
    assert.equal(result.semanticDiagnostics.some(row => row.reason === 'out-of-scope-source'), true);
});


test('automatic Scan validates an observation excerpt against the claimed exchange message, not the pooled exchange text', () => {
    const initial = stateWithNpc({ present: true });
    return withHost(async h => {
        const user = 'Ari asks which line to sign.';
        const assistant = 'Vrena Tolk says, “Sign the lower line.”';
        h.context.chat = [
            { is_user: true, name: 'Ari', mes: user },
            { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistant },
        ];
        h.context.generateRaw = async () => JSON.stringify({
            ...EMPTY,
            candidateAccounting: { vrena: 'evaluated' },
            npcs: [completePatch({ observations: [observation('Brief directive phrasing.', assistant, 0)] })],
        });
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, true);
        assert.equal(h.persisted().npcs[0].profileEvolutionEvidence.length, 0);
        assert.equal(result.semanticDiagnostics.some(row => row.channel === 'profile-observation' && row.reason === 'out-of-scope-source'), true);
    }, { state: initial });
});

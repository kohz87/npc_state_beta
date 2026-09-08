import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { applyRelationshipSummaryProjection } from '../src/scan-relationships.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';

const EMPTY = { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
const ZERO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No score movement.' };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function bessaState(overrides = {}) {
    const state = createEmptyState('chat:test');
    state.npcs = [normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond', role: 'Front desk clerk', ...overrides })];
    return state;
}

function semanticPatch(id, updates) {
    const proposed = new Set(updates.map(update => update.field));
    return {
        id, name: 'Bessa Vond', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)), unavailable: [] },
        semanticUpdates: updates, relationshipChange: structuredClone(ZERO_REL),
    };
}

test('real assistant completion while another scanner request is pending is queued and scanned, not suppressed as scanner-generation', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'First turn.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'The first response.' },
    ];
    const entered = deferred(), release = deferred();
    let calls = 0;
    h.context.generateRaw = async () => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) { entered.resolve(); await release.promise; }
        return JSON.stringify(EMPTY);
    };
    const first = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat.push({ is_user: true, name: 'Ari', mes: 'Second turn.' });
    h.context.chat.push({ is_user: false, name: 'Assistant', swipe_id: 0, mes: 'The second response.' });
    let secondSettled = false;
    const second = h.entry.processCompletedAssistantResponse(3);
    second.finally(() => { secondSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(secondSettled, false);
    release.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.notEqual(secondResult.reason, 'scanner-generation');
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().lastScannedMessageId, 3);
}));

test('routine Scan includes a uniquely short-mentioned inactive existing dossier', () => {
    const state = bessaState({ present: false, worldActive: false });
    const chat = [{ is_user: true, mes: 'I look toward the counter.' }, { is_user: false, mes: 'Bessa returns and opens the ledger.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    assert.match(prompt, /npc-bessa-vond/);
    assert.match(prompt, /Bessa Vond/);
});

test('routine Scan does not guess an ambiguous short identity', () => {
    const state = bessaState();
    state.npcs.push(normalizeNpc({ id: 'npc-bessa-hale', name: 'Bessa Hale' }));
    const chat = [{ is_user: true, mes: 'I wait.' }, { is_user: false, mes: 'Bessa returns and opens the ledger.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const relevant = prompt.split('RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):')[1].split('OLDER REFERENCE CONTEXT')[0];
    assert.doesNotMatch(relevant, /npc-bessa-vond/);
    assert.doesNotMatch(relevant, /npc-bessa-hale/);
});

test('explicitly mentioned archived deceased dossier remains available to resurrection extraction', () => {
    const state = bessaState({ archived: true, archiveReason: 'deceased', lifeState: 'dead', lifeStateCertainty: 'explicit' });
    const chat = [{ is_user: true, mes: 'I stare at the doorway.' }, { is_user: false, mes: 'Bessa Vond returns alive and steps through the doorway.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const relevant = prompt.split('RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):')[1].split('OLDER REFERENCE CONTEXT')[0];
    assert.match(relevant, /npc-bessa-vond/);
    assert.match(relevant, /dead/);
});

test('retry of a partial automatic scan forces a same-boundary semantic rescan instead of relabeling already-scanned as complete', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'I approach the counter.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'Bessa Vond stands behind the counter. Her brow furrows as she studies the form.' },
    ];
    const firstPayload = {
        ...EMPTY, exchangeActiveNpcIds: ['Bessa Vond'], inChatNpcIds: ['Bessa Vond'],
        npcs: [{ id: '', name: 'Bessa Vond', identityKind: 'named',
            identityEvidence: { anchor: 'Bessa Vond', excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Named in current response.' },
            activityEvidence: { exchangeActive: { excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Directly present.' }, inChat: { excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Remains at counter.' } },
            appearance: 'A clerk behind the counter.', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], relationshipChange: structuredClone(ZERO_REL) }],
    };
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload); };
    const first = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(first.ok, true);
    assert.equal(h.api.scanStatus().status, 'partial');
    const id = h.persisted().npcs[0].id;
    const secondPayload = { ...EMPTY, exchangeActiveNpcIds: [id], inChatNpcIds: [id], npcs: [semanticPatch(id, [{
        field: 'mood', operation: 'establish', value: 'Focused and mildly concerned.',
        sources: [{ messageId: 1, excerpt: 'Her brow furrows as she studies the form.' }], explanation: 'Current visible expression establishes mood.'
    }])] };
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(secondPayload); };
    const retry = await h.api.retryAutoScan();
    assert.equal(retry.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().npcs[0].mood, 'Focused and mildly concerned.');
    assert.equal(h.api.scanStatus().status, 'complete');
    assert.deepEqual(h.persisted().npcs[0].relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(h.persisted().npcs[0].relationshipHistory.length, 0);
}));

test('successful manual Scan adopts the same failed automatic boundary and unblocks next generation', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'I approach the counter.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'Bessa Vond stands behind the counter.' },
    ];
    h.context.generateRaw = async () => { h.metrics.generations += 1; throw new Error('automatic fixture failure'); };
    const failed = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(failed.ok, false);
    assert.equal(h.api.scanStatus().status, 'failed');
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(EMPTY); };
    const manual = await h.api.scan();
    assert.equal(manual.ok, true);
    assert.notEqual(h.api.scanStatus().status, 'failed');
    h.context.chat.push({ is_user: true, name: 'Ari', mes: 'I continue.' });
    let aborted = false;
    await h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, () => { aborted = true; });
    assert.equal(aborted, false);
}));

test('shortened quoted second-person Current Dynamic evidence keeps its original dialogue context and is rejected', () => {
    const npc = normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond' });
    const patch = {
        relationshipSummary: 'A direct professional exchange with Ari.',
        relationshipSummaryEvidence: { excerpts: ['Bessa, you should take the quill.'], explanation: 'Bessa directly addresses the player.' },
        relationshipChange: structuredClone(ZERO_REL),
    };
    const diagnostics = [];
    const updated = applyRelationshipSummaryProjection(npc, patch, {
        playerName: 'Ari', otherNpcNames: ['Mira Vale'], relationshipSummaryDiagnostics: diagnostics,
        relationshipEvidenceSources: [{ id: 'assistant:1', kind: 'visible', text: 'Mira Vale told Bessa Vond, “Bessa, you should take the quill.”' }],
    });
    assert.equal(updated.relationshipSummary, '');
    assert.equal(diagnostics.at(-1)?.reason, 'wrong-summary-target');
});

test('narrator second-person Current Dynamic evidence outside dialogue remains valid', () => {
    const npc = normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond' });
    const text = 'Bessa Vond nudged the quill into your fingers.';
    const updated = applyRelationshipSummaryProjection(npc, {
        relationshipSummary: 'A direct professional clerk-applicant interaction.',
        relationshipSummaryEvidence: { excerpts: [text], explanation: text }, relationshipChange: structuredClone(ZERO_REL),
    }, { playerName: 'Ari', otherNpcNames: [], relationshipEvidenceSources: [{ id: 'assistant:1', kind: 'visible', text }] });
    assert.equal(updated.relationshipSummary, 'A direct professional clerk-applicant interaction.');
});

test('applied profile semantic updates accumulate bounded source-owned evolution evidence across exchanges without retry duplication', () => {
    let state = bessaState({ speech: 'Formal and terse.' });
    const firstText = 'Bessa Vond now answers with clipped practical instructions.';
    let applied = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'speech', operation: 'replace', value: 'Clipped and practical.', sources: [{ messageId: 1, excerpt: firstText }], explanation: 'Later speech is directly established.'
    }])] }, {
        sourceMessageId: 1, turn: 1, profileContext: firstText, currentAdmissionText: firstText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    state = applied.state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(state.npcs[0].profileEvolutionEvidence[0].field, 'speech');
    assert.equal(state.npcs[0].profileEvolutionEvidence[0].sourceMessageId, 1);
    const secondText = 'Bessa Vond taps the ledger twice before answering difficult questions.';
    applied = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'mannerisms', operation: 'establish', changes: [{ action: 'add', value: 'Observed tapping the ledger twice before difficult answers.' }], sources: [{ messageId: 3, excerpt: secondText }], explanation: 'A new observed gesture is recorded narrowly.'
    }])] }, {
        sourceMessageId: 3, turn: 2, profileContext: secondText, currentAdmissionText: secondText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    state = applied.state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(state.npcs[0].profileEvolutionEvidence.map(row => row.sourceMessageId), [1, 3]);
    const replay = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'mannerisms', operation: 'establish', changes: [{ action: 'add', value: 'Observed tapping the ledger twice before difficult answers.' }], sources: [{ messageId: 3, excerpt: secondText }], explanation: 'Retry of same observation.'
    }])] }, {
        sourceMessageId: 3, turn: 3, profileContext: secondText, currentAdmissionText: secondText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    assert.equal(replay.state.npcs[0].profileEvolutionEvidence.length, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { emptyScanPayload, scanOutputExamples } from '../src/scan-contract.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const wrap = raw => `<npc_state_v1>${raw}</npc_state_v1>`;
const visible = 'Nia greets Ari. Nia has auburn hair and hazel eyes. Nia works with Ivo and checks the station ledger.';
const chatFor = raw => [
    { is_user: true, name: 'Ari', mes: 'Hello.' },
    { is_user: false, swipe_id: 0, swipe_info: [{ extra: {} }], mes: visible + '\n' + wrap(raw) },
];
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function existingPayload(update) {
    const payload = emptyScanPayload();
    payload.exchangeActiveNpcIds = ['npc-nia'];
    payload.inChatNpcIds = ['npc-nia'];
    payload.npcs = [{
        id: 'npc-nia', name: 'Nia', evaluatedGroups: ['canon', 'profile', 'memory', 'npcRelationships'],
        semanticUpdates: [update],
        relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'No shift.' },
    }];
    return payload;
}

const source = excerpt => [{ messageId: null, excerpt }];

test('superseded malformed-capture fallback cannot consume a newer valid capture boundary', () => withHost(async h => {
    const entered = deferred();
    const release = deferred();
    h.context.generateRaw = async () => { h.metrics.generations += 1; entered.resolve(); return release.promise; };
    h.context.chat = chatFor('{broken}');
    const oldFallback = h.entry.processEmbeddedScan(1);
    await entered.promise;

    const payload = scanOutputExamples().populated;
    payload.npcs = [payload.npcs[0]];
    payload.npcs[0].appearance = 'Auburn hair and hazel eyes.';
    h.context.chat[1].mes = visible + '\n' + wrap(JSON.stringify(payload));
    const newerCapture = h.entry.processEmbeddedScan(1);
    await Promise.resolve();

    release.resolve(JSON.stringify(emptyScanPayload()));
    const oldResult = await oldFallback;
    const newResult = await newerCapture;
    assert.equal(oldResult.ok, false);
    assert.equal(oldResult.discarded, true);
    assert.equal(newResult.ok, true);
    assert.notEqual(newResult.skipped, true);
    assert.equal(h.persisted().npcs.find(npc => npc.name === 'Nia')?.appearance, 'Auburn hair and hazel eyes.');
    const fallbackOperation = h.api.operationDiagnostics().find(row => row.type === 'automatic-scan');
    assert.ok(fallbackOperation?.source?.captureId);
    assert.equal(fallbackOperation.status, 'discarded');
}, { settings: { fallbackScan: true } }));

test('new bootstrap rejects object scalar input instead of storing [object Object]', () => withHost(async h => {
    const payload = scanOutputExamples().populated;
    payload.npcs = [payload.npcs[0]];
    payload.npcs[0].appearance = { hair: 'auburn', eyes: 'hazel' };
    h.context.chat = chatFor(JSON.stringify(payload));
    const result = await h.entry.processEmbeddedScan(1);
    assert.equal(result.ok, true);
    assert.equal(h.persisted().npcs[0]?.appearance, '');
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'appearance'
        && row.channel === 'bootstrap' && row.status === 'rejected-proposal'
        && row.reason === 'invalid-value-type:expected-string-value'));
    assert.ok(h.api.operationDiagnostics().at(-1).proposals.rejected >= 1);
}));

test('semantic scalar object input is rejected and preserves the established value', () => {
    const state = createEmptyState('unused');
    state.npcs = [normalizeNpc({ id: 'npc-nia', name: 'Nia', appearance: 'Brown hair.' })];
    return withHost(async h => {
        const payload = existingPayload({ field: 'appearance', operation: 'replace', value: { hair: 'auburn', eyes: 'hazel' }, sources: source('Nia has auburn hair and hazel eyes.'), explanation: 'Visible appearance.' });
        h.context.chat = chatFor(JSON.stringify(payload));
        const result = await h.entry.processEmbeddedScan(1);
        assert.equal(result.ok, true);
        assert.equal(h.persisted().npcs[0].appearance, 'Brown hair.');
        assert.ok(result.semanticDiagnostics.some(row => row.field === 'appearance' && row.status === 'rejected-proposal' && row.reason === 'invalid-value-type:expected-string-value'));
    }, { state });
});

test('numeric age compatibility remains supported while non-age scalar coercion is rejected', () => withHost(async h => {
    const payload = scanOutputExamples().populated;
    payload.npcs = [payload.npcs[0]];
    Object.assign(payload.npcs[0], { age: 24, apparentAge: 24, role: ['clerk'], speech: true });
    h.context.chat = chatFor(JSON.stringify(payload));
    const result = await h.entry.processEmbeddedScan(1);
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(npc.age, '24');
    assert.equal(npc.apparentAge, '~24');
    assert.equal(npc.role, '');
    assert.equal(npc.speech, '');
    for (const field of ['role', 'speech']) assert.ok(result.semanticDiagnostics.some(row => row.field === field && row.status === 'rejected-proposal' && row.reason.startsWith('invalid-value-type:')));
}));

test('supported collection object compatibility is retained without object-string coercion', () => {
    const state = createEmptyState('unused');
    state.npcs = [normalizeNpc({ id: 'npc-nia', name: 'Nia' })];
    const updates = [
        { field: 'behaviorProfile', value: [{ behavior: 'Checks the station ledger.' }] },
        { field: 'mannerisms', value: [{ mannerism: 'Taps the ledger.' }] },
        { field: 'memories', value: [{ memory: 'Met Ari at the station.' }] },
        { field: 'keyRelationships', value: [{ name: 'Ivo', relation: 'coworker' }] },
    ];
    return withHost(async h => {
        const payload = emptyScanPayload();
        payload.exchangeActiveNpcIds = ['npc-nia']; payload.inChatNpcIds = ['npc-nia'];
        payload.npcs = [{ id: 'npc-nia', name: 'Nia', evaluatedGroups: ['profile', 'memory', 'npcRelationships'], relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'No shift.' }, semanticUpdates: updates.map(row => ({ ...row, operation: 'replace', sources: source(visible), explanation: visible })) }];
        h.context.chat = chatFor(JSON.stringify(payload));
        const result = await h.entry.processEmbeddedScan(1);
        assert.equal(result.ok, true);
        const npc = h.persisted().npcs[0];
        assert.deepEqual(npc.behaviorProfile, ['Checks the station ledger.']);
        assert.deepEqual(npc.mannerisms, ['Taps the ledger.']);
        assert.deepEqual(npc.memories, ['Met Ari at the station.']);
        assert.deepEqual(npc.keyRelationships, ['Ivo - coworker']);
        assert.equal(JSON.stringify(npc).includes('[object Object]'), false);
    }, { state });
});

test('mixed invalid collection members reject the field atomically and keep valid stored values', () => {
    const state = createEmptyState('unused');
    state.npcs = [normalizeNpc({ id: 'npc-nia', name: 'Nia', mannerisms: ['Keeps her hands folded.'] })];
    return withHost(async h => {
        const payload = existingPayload({ field: 'mannerisms', operation: 'replace', value: ['Taps the ledger.', { nested: { gesture: 'shrug' } }], sources: source(visible), explanation: visible });
        h.context.chat = chatFor(JSON.stringify(payload));
        const result = await h.entry.processEmbeddedScan(1);
        assert.equal(result.ok, true);
        assert.deepEqual(h.persisted().npcs[0].mannerisms, ['Keeps her hands folded.']);
        assert.ok(result.semanticDiagnostics.some(row => row.field === 'mannerisms' && row.reason.includes('member-1-expected-string-or-supported-object')));
    }, { state });
});

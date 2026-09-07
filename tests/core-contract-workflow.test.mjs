import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { dossierFieldDefinition, dossierFieldManualProtected } from '../src/model/dossier-fields.js';
import { applyScanResult } from '../src/scanner.js';
import { createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

function payloadForMood(messageId, excerpt, value = 'Alert.') {
    return {
        exchangeActiveNpcIds: ['sora'], finalPresentNpcIds: ['sora'], worldActiveNpcIds: ['sora'],
        npcs: [{ id: 'sora', name: 'Sora', evaluatedGroups: ['live'], semanticUpdates: [{ field: 'mood', operation: 'replace', value, durability: 'temporary', sources: [{ messageId, excerpt }], explanation: 'Current evidence.' }], relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function makeHarness({ deferredFirstWrite = false } = {}) {
    const key = 'core-contract-chat';
    const chat = [{ is_user: true, mes: 'Lucien calls to Sora.' }, { mes: 'Sora looks up, alert and attentive.' }];
    const initial = createEmptyState(key);
    initial.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Drowsy.', location: 'Shelter.', goal: 'Rest.', status: 'Resting.' })];
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initial, 1);
    let postCount = 0;
    let releaseFirstWrite;
    let firstWriteStartedResolve;
    const firstWriteStarted = new Promise(resolve => { firstWriteStartedResolve = resolve; });
    const context = { chat };
    const engine = createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: false, scanAfterEachResponse: false }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async () => JSON.stringify(payloadForMood(1, context.chat[1].mes)),
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                postCount += 1;
                const body = JSON.parse(options.body);
                const nextSaved = Buffer.from(body.data, 'base64').toString('utf8');
                if (deferredFirstWrite && postCount === 1) {
                    firstWriteStartedResolve();
                    await new Promise(resolve => { releaseFirstWrite = resolve; });
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: 'core-contract-test',
    });
    return {
        key, context, engine,
        firstWriteStarted,
        releaseFirstWrite: () => releaseFirstWrite?.(),
        persisted: () => decodeV3Payload(saved, key).state,
        postCount: () => postCount,
    };
}

test('ordinary field registry exposes normalization, evidence, operations, first-pass and manual ownership contracts', () => {
    const mood = dossierFieldDefinition('mood');
    assert.equal(mood.kind, 'scalar');
    assert.equal(mood.durability, 'live');
    assert.equal(mood.normalization, 'text:240');
    assert.equal(mood.evidence, 'visible-narrative|npc-inner-chatter');
    assert.equal(mood.firstPass, true);
    assert.deepEqual(mood.operations, ['establish', 'refine', 'replace', 'remove']);
    assert.match(mood.manualOwnership, /manualOverrides/);
});

test('explicit manual override metadata prevents later automatic semantic rewrite', () => {
    const state = createEmptyState('manual-ownership');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'User pinned calm.', manualOverrides: { mood: 'User pinned calm.' } })];
    assert.equal(dossierFieldManualProtected(state.npcs[0], 'mood'), true);
    const evidence = 'Sora looks furious now.';
    const result = applyScanResult(state, payloadForMood(1, evidence, 'Furious.'), {
        sourceMessageId: 1,
        turn: 1,
        profileContext: evidence,
        semanticPrivateContext: evidence,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    assert.equal(result.state.npcs[0].mood, 'User pinned calm.');
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'manually-protected'));
});

test('operation diagnostic ledger is bounded, hashes history, and never invents unchanged evaluation from omission', () => {
    const log = createOperationDiagnostics({ limit: 8, now: (() => { let n = 10; return () => ++n; })() });
    const id = log.start({ chatKey: 'chat', type: 'scan', source: { messageId: 3, history: operationHistoryIdentity(['a', 'b']) } });
    const proposals = summarizeProposalDiagnostics(
        [{ status: 'applied' }, { status: 'no-change-proposed' }, { status: 'invalid-source-reference', reason: 'out-of-scope-source' }],
        [{ status: 'incomplete-evaluation', missingGroups: ['live', 'memory'] }],
    );
    log.patch(id, { proposals, selectedNpcIds: ['sora'] });
    log.finish(id, { status: 'committed', persistence: { status: 'committed', revision: 7 } });
    const rows = log.records('chat');
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].proposals, { accepted: 1, rejected: 1, unchanged: 1, omitted: 2, reasons: ['invalid-source-reference: out-of-scope-source', 'incomplete-evaluation: live,memory'] });
    assert.equal(rows[0].source.history.hash.length > 0, true);
    assert.equal(log.summary('chat').latest.revision, 7);

    const bounded = createOperationDiagnostics({ limit: 8, now: (() => { let n = 100; return () => ++n; })() });
    for (let i = 0; i < 11; i += 1) {
        const op = bounded.start({ chatKey: 'bounded', type: 'scan', source: { messageId: i } });
        bounded.finish(op, { status: 'committed' });
    }
    assert.equal(bounded.records('bounded').length, 8);
    assert.equal(bounded.summary('bounded').count, 8);
});

test('successful Scan records authoritative proposal and persistence diagnostics', async () => {
    const harness = makeHarness();
    const result = await harness.engine.scan(1, { manual: true, force: true });
    assert.equal(result.ok, true);
    const rows = harness.engine.operationDiagnostics(harness.key);
    const scan = rows.find(row => row.type === 'scan-current-cast');
    assert.ok(scan);
    assert.equal(scan.status, 'committed');
    assert.equal(scan.source.messageId, 1);
    assert.equal(scan.source.fingerprint.length > 0, true);
    assert.equal(scan.prompt.chars > 0, true);
    assert.equal(scan.prompt.tokenEstimate > 0, true);
    assert.equal(scan.persistence.status, 'committed');
    assert.equal(scan.persistence.revision, harness.persisted().revision);
    assert.equal(JSON.stringify(scan).includes('Sora looks up, alert and attentive.'), false, 'diagnostics must not retain chat/prompt content');
});

test('history changed during asynchronous persistence is not reported as a current commit and reload stays blocked', async () => {
    const harness = makeHarness({ deferredFirstWrite: true });
    const running = harness.engine.scan(1, { manual: true, force: true });
    await harness.firstWriteStarted;
    harness.context.chat[1].mes = 'Replacement swipe content with a different history identity.';
    harness.engine.invalidate(harness.key);
    harness.releaseFirstWrite();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'history-changed-during-persist');
    assert.equal(result.state.branchSafety.status, 'rebase-required');
    assert.equal(result.state.branchSafety.kind, 'commit-history-changed');
    assert.equal(harness.postCount() >= 2, true, 'the completed unowned write should be followed by a persisted blocked marker');
    const persisted = harness.persisted();
    assert.equal(persisted.branchSafety.kind, 'commit-history-changed');
    assert.equal(persisted.npcs[0].present, false);
    const diag = harness.engine.operationDiagnostics(harness.key).at(-1);
    assert.equal(diag.status, 'discarded');
    assert.match(diag.persistence.status, /^saved-unowned/);
});


test('manual editor mutation records diagnostics and persists explicit ownership', async () => {
    const harness = makeHarness();
    await harness.engine.loadChat(harness.key);
    const result = await harness.engine.updateNpc('Sora', { mood: 'User pinned calm.' });
    assert.equal(result.ok, true);
    assert.equal(result.needsReconcile, false);
    assert.equal(harness.persisted().npcs[0].mood, 'User pinned calm.');
    assert.equal(harness.persisted().npcs[0].manualOverrides.mood, 'User pinned calm.');
    const row = harness.engine.operationDiagnostics(harness.key).at(-1);
    assert.equal(row.type, 'manual-update');
    assert.equal(row.status, 'committed');
    assert.equal(row.persistence.status, 'committed');
    assert.deepEqual(row.selectedNpcIds, ['sora']);
});

test('history shift during a manual save preserves the user edit but blocks its old narrative boundary', async () => {
    const harness = makeHarness({ deferredFirstWrite: true });
    await harness.engine.loadChat(harness.key);
    const running = harness.engine.updateNpc('Sora', { goal: 'User pinned goal.' });
    await harness.firstWriteStarted;
    harness.context.chat[1].mes = 'A replacement response arrives while the manual edit is saving.';
    harness.engine.invalidate(harness.key);
    harness.releaseFirstWrite();
    const result = await running;
    assert.equal(result.ok, true, 'explicit user intent remains durable');
    assert.equal(result.needsReconcile, true);
    assert.equal(result.state.branchSafety.kind, 'commit-history-changed');
    assert.equal(harness.persisted().npcs[0].goal, 'User pinned goal.');
    assert.equal(harness.persisted().npcs[0].manualOverrides.goal, 'User pinned goal.');
    const row = harness.engine.operationDiagnostics(harness.key).at(-1);
    assert.equal(row.status, 'committed-needs-reconcile');
    assert.equal(row.source.historyChangedDuringSave, true);
});

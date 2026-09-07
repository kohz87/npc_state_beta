import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { bestCheckpoint, ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch, retargetCheckpointOwnership } from '../src/branches.js';
import { applyScanResult } from '../src/scanner.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const axes = trust => ({ trust, affection: 0, desire: 0, tension: 0 });

function moodPayload(messageId, excerpt, value) {
    return {
        exchangeActiveNpcIds: ['sora'], finalPresentNpcIds: ['sora'], worldActiveNpcIds: ['sora'],
        npcs: [{
            id: 'sora', name: 'Sora', evaluatedGroups: ['live'],
            semanticUpdates: [{ field: 'mood', operation: 'replace', value, durability: 'temporary', sources: [{ messageId, excerpt }], explanation: 'Current evidence.' }],
            relationshipChange: { evaluated: true, impact: 'none', delta: axes(0), priority: [], axisEvidence: {}, evidence: '', reason: '' },
        }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function engineHarness(initialState, visibleChat, { generate, branchRescan = false, deferPredicate = null } = {}) {
    const key = initialState.chatKey;
    const context = { chat: structuredClone(visibleChat) };
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initialState, 1);
    let deferred = false;
    let releaseDeferred;
    let startedResolve;
    const deferredStarted = new Promise(resolve => { startedResolve = resolve; });
    const publications = [];
    const engine = createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan, scanAfterEachResponse: false }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: generate || (async () => JSON.stringify(moodPayload(1, context.chat[1]?.mes || '', 'Alert.'))),
        onStateChanged: (_chatKey, state) => { if (state) publications.push(structuredClone(state)); },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                const payload = JSON.parse(nextSaved);
                if (!deferred && deferPredicate?.(payload)) {
                    deferred = true;
                    startedResolve();
                    await new Promise(resolve => { releaseDeferred = resolve; });
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: 'v071-regression-session',
    });
    return {
        key, context, engine, publications, deferredStarted,
        releaseDeferred: () => releaseDeferred?.(),
        persisted: () => decodeV3Payload(saved, key).state,
    };
}

function checkpointedStory(chat, key = 'v071-recovery') {
    let state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Initial.', relationship: axes(0) })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state.npcs[0].mood = 'After one.';
    state.turn = 1;
    state.lastScannedMessageId = 1;
    state = recordCheckpoint(state, chat.slice(0, 2), 1, 'embedded-foreground');
    if (chat.length >= 4) {
        state.npcs[0].mood = 'After two.';
        state.turn = 2;
        state.lastScannedMessageId = 3;
        state = recordCheckpoint(state, chat.slice(0, 4), 3, 'embedded-foreground');
    }
    if (chat.length >= 6) {
        state.npcs[0].mood = 'After three.';
        state.turn = 3;
        state.lastScannedMessageId = 5;
        state = recordCheckpoint(state, chat, 5, 'embedded-foreground');
    }
    return state;
}

test('saving unchanged dossier values does not create locks/overrides and explicit override clear works', async () => {
    const chat = [{ is_user: true, mes: 'Lucien calls Sora.' }, { mes: 'Sora looks alert now.' }];
    const state = createEmptyState('v071-editor');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Drowsy.', location: 'Shelter.', relationship: axes(0) })];
    const h = engineHarness(state, chat, { generate: async () => JSON.stringify(moodPayload(1, chat[1].mes, 'Alert.')) });
    await h.engine.loadChat(h.key);
    const before = h.persisted().npcs[0];
    await h.engine.updateNpc('Sora', {
        mood: before.mood,
        location: before.location,
        relationship: structuredClone(before.relationship),
        manualProfileFields: [],
    });
    assert.deepEqual(h.persisted().npcs[0].manualOverrides, {});

    await h.engine.updateNpc('Sora', { mood: 'User correction.' });
    assert.equal(h.persisted().npcs[0].manualOverrides.mood, 'User correction.');
    assert.ok(Number(h.persisted().npcs[0].manualOverrideMeta.mood.at) > 0);
    await h.engine.updateNpc('Sora', { manualOverrides: {} });
    assert.deepEqual(h.persisted().npcs[0].manualOverrides, {});
    assert.deepEqual(h.persisted().npcs[0].manualOverrideMeta, {});

    const scanned = await h.engine.scan(1, { manual: true, force: true });
    assert.equal(scanned.ok, true);
    assert.equal(h.persisted().npcs[0].mood, 'Alert.');
});

test('manual relationship correction already inside the surviving checkpoint does not replace later story score', () => {
    const chat = [
        { is_user: true, mes: 'u1' }, { mes: 'a1' },
        { is_user: true, mes: 'u2' }, { mes: 'a2' },
        { is_user: true, mes: 'u3' }, { mes: 'a3 unrelated later response' },
    ];
    const manual = { impact: 'manual', delta: axes(12), evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId: 1, turn: 1, at: 100 };
    let state = createEmptyState('v071-relationship');
    state.npcs = [normalizeNpc({
        id: 'sora', name: 'Sora', relationship: axes(12), relationshipHistory: [manual], lastRelationshipChange: manual,
        manualOverrides: { relationship: axes(12) }, manualOverrideMeta: { relationship: { at: 100, sourceMessageId: 1 } },
    })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat.slice(0, 2), 1, 'manual-edit');
    const story = { impact: 'ordinary', delta: axes(1), evidence: 'a2', reason: 'Story trust gain.', sourceMessageId: 3, turn: 2, at: 200 };
    state.npcs[0].relationship = axes(13);
    state.npcs[0].relationshipHistory = [manual, story];
    state.npcs[0].lastRelationshipChange = story;
    state = recordCheckpoint(state, chat.slice(0, 4), 3, 'embedded-foreground');
    state = recordCheckpoint(state, chat, 5, 'embedded-foreground');

    const result = reconcileToCurrentBranch(state, chat.slice(0, 4));
    assert.equal(result.needsRecovery, false);
    assert.equal(result.state.npcs[0].relationship.trust, 13);
});

test('chat rename retargets checkpoint, baseline, backup and snapshot ownership', () => {
    const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = checkpointedStory(chat, 'old-chat-key');
    state.rebaseBackup = { createdAt: 1, relationshipMode: 'preserve', divergenceMessageId: null, sourceLastScannedMessageId: 1, sourceLineage: [], snapshot: structuredClone(state.checkpoints[0].snapshot) };
    const renamed = retargetCheckpointOwnership(state, 'new-chat-key');
    assert.equal(renamed.chatKey, 'new-chat-key');
    assert.equal(renamed.branchBase.chatKey, 'new-chat-key');
    assert.equal(renamed.branchBase.snapshot.chatKey, 'new-chat-key');
    assert.ok(renamed.checkpoints.every(row => row.chatKey === 'new-chat-key' && row.snapshot.chatKey === 'new-chat-key'));
    assert.equal(renamed.rebaseBackup.snapshot.chatKey, 'new-chat-key');
    assert.ok(bestCheckpoint(renamed, chat));
});

test('invalid semantic proposal is rejected rather than counted as unchanged', () => {
    const state = createEmptyState('v071-diagnostics');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Calm.' })];
    const evidence = 'Sora remains present in the scene.';
    const applied = applyScanResult(state, moodPayload(1, evidence, ''), {
        sourceMessageId: 1,
        turn: 1,
        profileContext: evidence,
        semanticPrivateContext: evidence,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    const mood = applied.semanticDiagnostics.find(row => row.field === 'mood');
    assert.equal(mood.status, 'rejected-proposal');
    assert.equal(mood.reason, 'invalid-value');
    const summary = summarizeProposalDiagnostics(applied.semanticDiagnostics, applied.coverageDiagnostics);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.unchanged, 0);
    assert.ok(summary.reasons.some(reason => reason.includes('invalid-value')));
});

test('unowned candidate is never published as safe while post-save ownership is being rejected', async () => {
    const chat = [{ is_user: true, mes: 'Lucien calls Sora.' }, { mes: 'Sora looks alert now.' }];
    const state = createEmptyState('v071-publish');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Drowsy.' })];
    const h = engineHarness(state, chat, {
        generate: async () => JSON.stringify(moodPayload(1, chat[1].mes, 'Alert.')),
        deferPredicate: () => true,
    });
    const running = h.engine.scan(1, { manual: true, force: true });
    await h.deferredStarted;
    h.context.chat[1].mes = 'A replacement swipe changes the owned history.';
    h.engine.invalidate(h.key);
    h.releaseDeferred();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.state.branchSafety.kind, 'commit-history-changed');
    assert.equal(h.publications.some(row => row.branchSafety.status === 'safe' && row.npcs[0]?.mood === 'Alert.'), false);
    assert.equal(h.publications.at(-1).branchSafety.kind, 'commit-history-changed');
});

test('historical recovery finalization uses guarded commit and rejects history changes during final save', async () => {
    const original = [
        { is_user: true, mes: 'u1' }, { mes: 'a1' },
        { is_user: true, mes: 'u2 deleted' }, { mes: 'a2 deleted' },
        { is_user: true, mes: 'u3 survives' }, { mes: 'a3 survives' },
    ];
    const state = checkpointedStory(original, 'v071-recovery-finalize');
    const surviving = [original[0], original[1], original[4], original[5]];
    const h = engineHarness(state, surviving, {
        branchRescan: true,
        generate: async ({ label }) => {
            const match = String(label || '').match(/historical-recovery-(\d+)/);
            const id = Number(match?.[1]);
            const excerpt = h.context.chat[id]?.mes || '';
            return JSON.stringify(moodPayload(id, excerpt, 'Recovered survivor.'));
        },
        deferPredicate: payload => payload?.state?.recovery?.status === 'complete' && payload?.state?.branchSafety?.status === 'safe',
    });
    await h.engine.loadChat(h.key);
    const running = h.engine.reconcileBranch();
    await h.deferredStarted;
    h.context.chat[3].mes = 'Changed surviving response while final save is in flight.';
    h.engine.invalidate(h.key);
    h.releaseDeferred();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(h.persisted().branchSafety.kind, 'commit-history-changed');
    assert.notEqual(result.recoveryResult?.complete, true);
    const finalization = h.engine.operationDiagnostics(h.key).find(row => row.type === 'historical-recovery-finalize');
    assert.ok(finalization);
    assert.equal(finalization.status, 'discarded');
});

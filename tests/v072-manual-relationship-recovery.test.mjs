import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const rel = (trust = 0, affection = 0, desire = 0, tension = 0) => ({ trust, affection, desire, tension });
const manualEvent = (delta, sourceMessageId = 1, at = 100) => ({
    impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId, turn: 1, at,
});
const storyEvent = (delta, sourceMessageId, at) => ({
    impact: 'ordinary', delta, evidence: 'story', reason: 'Story relationship gain.', sourceMessageId, turn: Math.ceil((sourceMessageId + 1) / 2), at,
});

function engineHarness(initialState, chat, { settings = {}, generate, deferPredicate = null, failPredicate = null } = {}) {
    const key = initialState.chatKey;
    const context = { chat: structuredClone(chat) };
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initialState, 1);
    let deferred = false;
    let releaseDeferred;
    let startedResolve;
    const deferredStarted = new Promise(resolve => { startedResolve = resolve; });
    let failCount = 0;
    const make = session => createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: true, scanAfterEachResponse: false, relationshipHistoryLimit: 8, ...settings }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: generate || (async () => JSON.stringify({ exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] })),
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                const payload = JSON.parse(nextSaved);
                if (!deferred && deferPredicate?.(payload)) {
                    deferred = true;
                    startedResolve();
                    await new Promise(resolve => { releaseDeferred = resolve; });
                }
                if (failPredicate?.(payload, failCount)) {
                    failCount += 1;
                    return { ok: false, status: 409, text: async () => 'simulated persistence conflict' };
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: session,
    });
    return {
        key, context, engine: make('v072-session-a'), reload: () => make('v072-session-b'),
        persisted: () => decodeV3Payload(saved, key).state,
        rawSaved: () => saved,
        deferredStarted, releaseDeferred: () => releaseDeferred?.(),
    };
}

function oneTurnState(key = 'v072-rel') {
    const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', relationship: rel(0) })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state.npcs[0].relationship = rel(1);
    state.npcs[0].relationshipHistory = [storyEvent(rel(1), 1, 10)];
    state = recordCheckpoint(state, chat, 1, 'story');
    return { chat, state };
}

test('manual correction survives visible history rotation', async () => {
    const { chat, state } = oneTurnState('v072-history-rotation');
    const h = engineHarness(state, chat, { settings: { relationshipHistoryLimit: 8 } });
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 12 } });
    let live = h.persisted();
    const correction = live.npcs[0].manualRelationshipCorrections.find(item => item.axis === 'trust');
    assert.equal(correction.value, 12);
    for (let i = 0; i < 9; i += 1) {
        live.npcs[0].relationship.trust += 1;
        live.npcs[0].relationshipHistory.push(storyEvent(rel(1), 3 + i * 2, 200 + i));
        live.npcs[0].relationshipHistory = live.npcs[0].relationshipHistory.slice(-8);
    }
    assert.equal(live.npcs[0].relationshipHistory.some(item => item.impact === 'manual'), false);
    const rolled = reconcileToCurrentBranch(normalizeState(live, h.key), []);
    assert.equal(rolled.state.npcs[0].relationship.trust, 12);
    assert.equal(rolled.state.branchSafety.status, 'safe');
});

test('absolute correction survives deletion of earlier narrative gain', async () => {
    const { chat, state } = oneTurnState('v072-absolute');
    const h = engineHarness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 20 } });
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.equal(rolled.state.npcs[0].relationship.trust, 20);
});

test('snapshot already containing correction preserves later surviving story gain', async () => {
    const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }, { is_user: true, mes: 'u3' }, { mes: 'a3' }];
    let state = createEmptyState('v072-surviving-gain');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', relationship: rel(0) })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    const h = engineHarness(state, chat.slice(0, 2));
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 12 } });
    state = h.persisted();
    state.npcs[0].relationship.trust = 13;
    state.npcs[0].relationshipHistory.push(storyEvent(rel(1), 3, 300));
    state = recordCheckpoint(state, chat.slice(0, 4), 3, 'story');
    state = recordCheckpoint(state, chat, 5, 'unrelated');
    const rolled = reconcileToCurrentBranch(state, chat.slice(0, 4));
    assert.equal(rolled.state.npcs[0].relationship.trust, 13);
});

test('multiple corrections preserve independent axes and later edits replace only their axis', async () => {
    const { chat, state } = oneTurnState('v072-multi-axis');
    const h = engineHarness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 20 } });
    await h.engine.updateNpc('Sora', { relationship: { affection: 7 } });
    await h.engine.updateNpc('Sora', { relationship: { trust: 25 } });
    const npc = h.persisted().npcs[0];
    assert.equal(npc.relationship.trust, 25);
    assert.equal(npc.relationship.affection, 7);
    const byAxis = Object.fromEntries(npc.manualRelationshipCorrections.map(item => [item.axis, item]));
    assert.equal(byAxis.trust.value, 25);
    assert.equal(byAxis.affection.value, 7);
    assert.ok(byAxis.trust.revision > byAxis.affection.revision);
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel(25, 7));
});

test('repeated rollback does not double-apply a correction', async () => {
    const { chat, state } = oneTurnState('v072-idempotent');
    const h = engineHarness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 20 } });
    const once = reconcileToCurrentBranch(h.persisted(), []);
    const twice = reconcileToCurrentBranch(once.state, []);
    assert.equal(once.state.npcs[0].relationship.trust, 20);
    assert.equal(twice.state.npcs[0].relationship.trust, 20);
});

test('explicit override clearing removes correction ownership and stale manual events cannot restore it', async () => {
    const { chat, state } = oneTurnState('v072-clear');
    const h = engineHarness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 20 } });
    const beforeClearRevision = h.persisted().npcs[0].manualRelationshipCorrectionRevision;
    await h.engine.updateNpc('Sora', { manualOverrides: {} });
    const cleared = h.persisted().npcs[0];
    assert.deepEqual(cleared.manualRelationshipCorrections, []);
    assert.ok(cleared.manualRelationshipCorrectionRevision > beforeClearRevision);
    assert.equal(Object.prototype.hasOwnProperty.call(cleared.manualOverrides, 'relationship'), false);
    assert.ok(cleared.relationshipHistory.some(item => item.impact === 'manual'));
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.equal(rolled.state.npcs[0].relationship.trust, 0);
    assert.equal(rolled.state.branchSafety.status, 'safe');
});

test('supported legacy correction is absolute while missing axis provenance is blocked honestly', () => {
    const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = createEmptyState('v072-legacy');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', relationship: rel(0) })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'story-before-manual-correction');
    const event = manualEvent(rel(19), 1, 100);
    state.npcs[0] = normalizeNpc({ ...state.npcs[0], relationship: rel(20), relationshipHistory: [event], lastRelationshipChange: event, manualOverrides: { relationship: rel(20) }, manualOverrideMeta: { relationship: { sourceMessageId: 1, at: 101 } } });
    const supported = reconcileToCurrentBranch(state, []);
    assert.equal(supported.state.npcs[0].relationship.trust, 20);
    assert.equal(supported.state.branchSafety.status, 'safe');

    const ambiguous = structuredClone(state);
    ambiguous.npcs[0].relationshipHistory = [];
    const limited = reconcileToCurrentBranch(ambiguous, []);
    assert.equal(limited.fullyRestored, false);
    assert.equal(limited.reason, 'manual-relationship-correction-uncertain');
    assert.equal(limited.state.branchSafety.kind, 'manual-relationship-correction-uncertain');
    assert.equal(limited.manualRelationshipLimitations[0].code, 'legacy-relationship-correction-missing-axis-provenance');

    const timestampOnly = structuredClone(state);
    timestampOnly.npcs[0].manualOverrideMeta.relationship.sourceMessageId = null;
    const timestampLimited = reconcileToCurrentBranch(timestampOnly, []);
    assert.equal(timestampLimited.reason, 'manual-relationship-correction-uncertain');
    assert.equal(timestampLimited.state.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('reload after correction-preserving rollback keeps the absolute correction', async () => {
    const { chat, state } = oneTurnState('v072-reload');
    const h = engineHarness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('Sora', { relationship: { trust: 20 } });
    h.context.chat.splice(0);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 20);
    const reloaded = h.reload();
    const loaded = await reloaded.loadChat(h.key);
    assert.equal(loaded.npcs[0].relationship.trust, 20);
});

function recoveryPayload(id, context) {
    const excerpt = String(context.chat[id]?.mes || '');
    return JSON.stringify({
        exchangeActiveNpcIds: ['sora'], finalPresentNpcIds: ['sora'], worldActiveNpcIds: ['sora'],
        npcs: [{ id: 'sora', name: 'Sora', evaluatedGroups: ['live'], semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Recovered ' + id, durability: 'temporary', sources: [{ messageId: id, excerpt }], explanation: 'recovery' }], relationshipChange: { evaluated: true, impact: 'none', delta: rel(), priority: [], axisEvidence: {}, evidence: '', reason: '' } }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    });
}

function checkpointedRecoveryState(chat, key) {
    let state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Initial.' })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state.npcs[0].mood = 'One.';
    state = recordCheckpoint(state, chat.slice(0, 2), 1, 'story');
    state.npcs[0].mood = 'Two.';
    state = recordCheckpoint(state, chat.slice(0, 4), 3, 'story');
    state.npcs[0].mood = 'Three.';
    state = recordCheckpoint(state, chat, 5, 'story');
    return state;
}

test('history change during recovery final save leaves recovery stale and branch blocked', async () => {
    const original = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2 deleted' }, { mes: 'a2 deleted' }, { is_user: true, mes: 'u3 survives' }, { mes: 'a3 survives' }];
    const surviving = [original[0], original[1], original[4], original[5]];
    const h = engineHarness(checkpointedRecoveryState(original, 'v072-final-race'), surviving, {
        generate: async ({ label }) => recoveryPayload(Number(String(label).match(/(\d+)$/)?.[1]), h.context),
        deferPredicate: payload => payload?.state?.recovery?.status === 'complete',
    });
    await h.engine.loadChat(h.key);
    const running = h.engine.reconcileBranch();
    await h.deferredStarted;
    h.context.chat[3].mes = 'changed survivor';
    h.engine.invalidate(h.key);
    h.releaseDeferred();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(h.persisted().branchSafety.status, 'rebase-required');
    assert.equal(h.persisted().recovery.status, 'stale');
});

test('resume and reload after rejected finalization cannot report false completion', async () => {
    const original = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2 deleted' }, { mes: 'a2 deleted' }, { is_user: true, mes: 'u3 survives' }, { mes: 'a3 survives' }];
    const surviving = [original[0], original[1], original[4], original[5]];
    const h = engineHarness(checkpointedRecoveryState(original, 'v072-resume-race'), surviving, {
        generate: async ({ label }) => recoveryPayload(Number(String(label).match(/(\d+)$/)?.[1]), h.context),
        deferPredicate: payload => payload?.state?.recovery?.status === 'complete',
    });
    await h.engine.loadChat(h.key);
    const running = h.engine.reconcileBranch();
    await h.deferredStarted;
    h.context.chat[3].mes = 'changed survivor';
    h.engine.invalidate(h.key);
    h.releaseDeferred();
    await running;
    const resumed = await h.engine.resumeHistoricalRecovery();
    assert.equal(resumed.ok, false);
    assert.equal(resumed.reason, 'restart-required');
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.equal(loaded.recovery.status, 'stale');
    const resumedAfterReload = await reload.resumeHistoricalRecovery();
    assert.equal(resumedAfterReload.ok, false);
    assert.equal(resumedAfterReload.reason, 'restart-required');
});

test('legitimately completed recovery with unchanged history resumes as complete', async () => {
    const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    const state = createEmptyState('v072-valid-complete');
    state.recovery = { version: 3, kind: 'historical', status: 'complete', relationshipMode: 'fresh', startMessageId: 1, endMessageId: 1, messageIds: [1], plannedLineage: ['u:' + 'x'], anchorLineage: [], completed: 1, total: 1, lastCompletedMessageId: 1, nextMessageId: null, reason: 'done', error: '', startedAt: 1, updatedAt: 1, completedAt: 1 };
    // Use a real lineage from a temporary checkpointed state instead of fabricating ownership.
    const owned = ensurePreUpdateBaseline(normalizeState(state, state.chatKey), chat, 1);
    state.recovery.plannedLineage = owned.branchBase.precedingLineage.concat([]);
    // plannedLineage must include the completed assistant; record then copy canonical lineage.
    const cp = recordCheckpoint(owned, chat, 1, 'owned');
    state.recovery.plannedLineage = cp.checkpoints.at(-1).lineage;
    state.branchSafety = { status: 'safe', kind: '', reason: '' };
    const h = engineHarness(normalizeState(state, state.chatKey), chat);
    await h.engine.loadChat(h.key);
    const result = await h.engine.resumeHistoricalRecovery();
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
});

test('blocking persistence failure after rejected finalization never returns a successful completion', async () => {
    const original = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2 deleted' }, { mes: 'a2 deleted' }, { is_user: true, mes: 'u3 survives' }, { mes: 'a3 survives' }];
    const surviving = [original[0], original[1], original[4], original[5]];
    let sawUnowned = false;
    const h = engineHarness(checkpointedRecoveryState(original, 'v072-block-failure'), surviving, {
        generate: async ({ label }) => recoveryPayload(Number(String(label).match(/(\d+)$/)?.[1]), h.context),
        deferPredicate: payload => payload?.state?.recovery?.status === 'complete',
        failPredicate: payload => {
            if (payload?.state?.recovery?.status === 'complete') { sawUnowned = true; return false; }
            return sawUnowned && payload?.state?.branchSafety?.kind === 'commit-history-changed';
        },
    });
    await h.engine.loadChat(h.key);
    const running = h.engine.reconcileBranch();
    await h.deferredStarted;
    h.context.chat[3].mes = 'changed survivor';
    h.engine.invalidate(h.key);
    h.releaseDeferred();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.recoveryResult?.complete, false);
    assert.equal(result.recoveryResult?.state?.recovery?.status, 'stale');
    assert.equal(result.recoveryResult?.state?.branchSafety?.status, 'rebase-required');
});

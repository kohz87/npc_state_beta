import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint } from '../src/branches.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const rel = (trust = 0, affection = 0, desire = 0, tension = 0) => ({ trust, affection, desire, tension });
const manualEvent = (delta, sourceMessageId = 1, at = 100) => ({ impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId, turn: 1, at });
const storyEvent = (delta, sourceMessageId, at) => ({ impact: 'ordinary', delta, evidence: 'story', reason: 'Story gain.', sourceMessageId, turn: 2, at });
const longChat = [
    { is_user: true, mes: 'u1' }, { mes: 'a1' },
    { is_user: true, mes: 'u2' }, { mes: 'a2' },
    { is_user: true, mes: 'u3' }, { mes: 'a3' },
];
const shortChat = longChat.slice(0, 2);

function legacyNpc({ values = rel(20), axis = 'trust', sourceMessageId = 1, at = 100, includeEvent = true, id = 'sora', name = 'Sora' } = {}) {
    const delta = rel();
    delta[axis] = values[axis];
    const event = manualEvent(delta, sourceMessageId, at);
    return normalizeNpc({
        id, name, relationship: values,
        relationshipHistory: includeEvent ? [event] : [], lastRelationshipChange: includeEvent ? event : null,
        manualOverrides: { relationship: values }, manualOverrideMeta: { relationship: { sourceMessageId, at: at + 1 } },
    });
}

function baselineState(key, chat = shortChat, npcs = [legacyNpc()]) {
    let state = createEmptyState(key);
    state.npcs = npcs.map(npc => normalizeNpc({ id: npc.id, name: npc.name, relationship: rel() }));
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'pre-correction');
    state.npcs = npcs.map(npc => normalizeNpc(npc));
    return state;
}

function stateWithLegacyStoryGain(key, { axis = 'trust', corrected = 20, gained = 21 } = {}) {
    const values = rel();
    values[axis] = corrected;
    let state = baselineState(key, shortChat, [legacyNpc({ values, axis })]);
    state = recordCheckpoint(state, shortChat, 1, 'legacy-correction');
    state.npcs[0].relationship[axis] = gained;
    const delta = rel();
    delta[axis] = gained - corrected;
    state.npcs[0].relationshipHistory.push(storyEvent(delta, 3, 200));
    state.npcs[0].lastRelationshipChange = storyEvent(delta, 3, 200);
    state = recordCheckpoint(state, longChat.slice(0, 4), 3, 'story-gain');
    return state;
}

function harness(initialState, chat, { settings = {}, deferPredicate = null, failPredicate = null } = {}) {
    const key = initialState.chatKey;
    const context = { chat: structuredClone(chat) };
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initialState, 1);
    let deferred = false;
    let releaseDeferred;
    let startedResolve;
    const deferredStarted = new Promise(resolve => { startedResolve = resolve; });
    let failures = 0;
    const make = session => createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: false, scanAfterEachResponse: false, relationshipHistoryLimit: 8, ...settings }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async () => JSON.stringify({ exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }),
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                const payload = JSON.parse(nextSaved);
                if (!deferred && deferPredicate?.(payload)) {
                    deferred = true;
                    startedResolve();
                    await new Promise(resolve => { releaseDeferred = resolve; });
                }
                if (failPredicate?.(payload, failures)) {
                    failures += 1;
                    return { ok: false, status: 409, text: async () => 'simulated conflict' };
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: session,
    });
    return {
        key, context, engine: make('v074-a'), reload: () => make('v074-b'),
        persisted: () => decodeV3Payload(saved, key).state,
        deferredStarted, releaseDeferred: () => releaseDeferred?.(),
    };
}

function correctionMap(npc) { return Object.fromEntries((npc.manualRelationshipCorrections || []).map(item => [item.axis, item])); }
function unresolved(npc) { return npc.manualRelationshipCorrectionUnresolvedAxes || []; }

async function enterUncertainty(h) {
    await h.engine.loadChat(h.key);
    h.context.chat.splice(0);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.reason, 'manual-relationship-correction-uncertain');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    return result;
}

async function confirmAll(engine, reference = 'sora', values = rel(20, 5, 3, 2)) {
    for (const axis of ['trust', 'affection', 'desire', 'tension']) {
        const result = await engine.updateNpc(reference, { relationship: { [axis]: values[axis] } });
        assert.equal(result.ok, true);
    }
}

test('pre-migration checkpoint containing a legacy correction keeps later surviving story gain', async () => {
    const state = stateWithLegacyStoryGain('v074-legacy-gain');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    const edited = await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    assert.equal(edited.ok, true);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 20);
    assert.match(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, /^legacy-v1\|trust\|/);
    h.context.chat.splice(4);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 21);
    assert.equal(h.persisted().npcs[0].relationship.affection, 5);
});

test('checkpoint before the legacy correction still receives its absolute target', async () => {
    const state = baselineState('v074-before-correction', shortChat, [legacyNpc({ values: rel(20) })]);
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(0);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(20, 5));
});

test('a genuinely newer same-axis manual correction supersedes the migrated legacy correction', async () => {
    const state = stateWithLegacyStoryGain('v074-newer-wins');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    await h.engine.updateNpc('sora', { relationship: { trust: 25 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    assert.equal(h.persisted().npcs[0].relationship.trust, 25);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 25);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, undefined);
});

test('independent axes preserve legacy story gain across differing migration and edit order', async () => {
    const state = stateWithLegacyStoryGain('v074-axis-order', { axis: 'affection', corrected: 11, gained: 12 });
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 7 } });
    await h.engine.updateNpc('sora', { relationship: { desire: 3 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(7, 12, 3, 0));
});

test('legacy-to-modern rollback remains idempotent through repeated reconciliation and reload', async () => {
    const state = stateWithLegacyStoryGain('v074-idempotent');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    await h.engine.reconcileBranch();
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(21, 5));
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(loaded.npcs[0].relationship, rel(21, 5));
});

test('v0.7.3 migrated records without origin metadata are bridged conservatively and repaired', async () => {
    let state = stateWithLegacyStoryGain('v074-v073-bridge');
    const legacyCheckpointNpc = structuredClone(state.npcs[0]);
    const identityAt = legacyCheckpointNpc.manualOverrideMeta.relationship.at;
    const liveNpc = normalizeNpc({
        ...legacyCheckpointNpc,
        relationship: rel(21, 5),
        manualOverrides: {}, manualOverrideMeta: {},
        manualRelationshipCorrectionRevision: 2,
        manualRelationshipCorrections: [
            { axis: 'trust', value: 20, revision: 1, sourceMessageId: 1, at: identityAt },
            { axis: 'affection', value: 5, revision: 2, sourceMessageId: 5, at: 500 },
        ],
    });
    state.npcs = [liveNpc];
    state = recordCheckpoint(state, longChat, 5, 'v073-live');
    const h = harness(normalizeState(state, state.chatKey), longChat.slice(0, 4));
    await h.engine.loadChat(h.key);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 21);
    assert.match(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, /^legacy-v1\|trust\|/);
});

test('confirming all four ambiguous axes separately resolves the block and keeps every value', async () => {
    const state = baselineState('v074-all-confirmed', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    assert.deepEqual(unresolved(h.persisted().npcs[0]), ['trust', 'affection', 'desire', 'tension']);
    await confirmAll(h.engine);
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.status, 'safe');
    assert.deepEqual(persisted.npcs[0].relationship, rel(20, 5, 3, 2));
    assert.deepEqual(unresolved(persisted.npcs[0]), []);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.npcs[0].manualOverrides, 'relationship'), false);
    assert.deepEqual(Object.keys(correctionMap(persisted.npcs[0])).sort(), ['affection', 'desire', 'tension', 'trust']);
});

test('confirming an unchanged value still resolves exactly that ambiguous axis', async () => {
    const state = baselineState('v074-unchanged-confirm', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    const result = await h.engine.updateNpc('sora', { relationship: { trust: 0 } });
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(correctionMap(npc).trust.value, 0);
    assert.deepEqual(unresolved(npc), ['affection', 'desire', 'tension']);
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('partial confirmation keeps exact unresolved axes through persistence and reload', async () => {
    const state = baselineState('v074-partial-reload', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(unresolved(loaded.npcs[0]), ['affection', 'desire', 'tension']);
    assert.equal(loaded.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('current-format manual events and display-history trimming cannot erase remaining uncertainty', async () => {
    const state = baselineState('v074-history-independent', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat, { settings: { relationshipHistoryLimit: 1 } });
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const npc = h.persisted().npcs[0];
    assert.equal(npc.relationshipHistory.length <= 1, true);
    assert.deepEqual(unresolved(npc), ['desire', 'tension']);
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(unresolved(loaded.npcs[0]), ['desire', 'tension']);
});

test('resolving every axis for one NPC does not approve another unresolved NPC', async () => {
    const sora = legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false });
    const ryu = legacyNpc({ values: rel(9, 8, 7, 6), includeEvent: false, id: 'ryu', name: 'Ryu' });
    const state = baselineState('v074-other-npc', shortChat, [sora, ryu]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await confirmAll(h.engine, 'sora', rel(20, 5, 3, 2));
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'manual-relationship-correction-uncertain');
    assert.match(persisted.branchSafety.reason, /Ryu/);
    assert.deepEqual(unresolved(persisted.npcs.find(npc => npc.id === 'ryu')), ['trust', 'affection', 'desire', 'tension']);
});

test('completed correction remediation preserves surviving suffix recovery requirement', async () => {
    const surviving = longChat.slice(0, 4);
    const npc = legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false });
    let state = baselineState('v074-suffix', shortChat, [npc]);
    state.branchHeadLineage = ['stale'];
    const h = harness(state, surviving);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    await confirmAll(h.engine);
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'suffix-recovery-required');
    assert.equal(persisted.recovery?.status, 'paused');
    assert.deepEqual(persisted.npcs[0].relationship, rel(20, 5, 3, 2));
});

test('persistence conflict during axis confirmation leaves durable state at the prior uncertainty boundary', async () => {
    const state = baselineState('v074-confirm-conflict', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    let fail = false;
    const h = harness(state, shortChat, { failPredicate: () => fail });
    await enterUncertainty(h);
    fail = true;
    const result = await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'correction-remediation-persistence-failed');
    assert.equal(result.persistenceFailed, true);
    const persisted = h.persisted();
    assert.deepEqual(unresolved(persisted.npcs[0]), ['trust', 'affection', 'desire', 'tension']);
    assert.equal(correctionMap(persisted.npcs[0]).trust, undefined);
    assert.equal(persisted.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('history change during confirmation keeps the user correction but blocks the superseded timeline honestly', async () => {
    const state = baselineState('v074-confirm-history-shift', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    let defer = false;
    const h = harness(state, shortChat, { deferPredicate: payload => defer && payload?.state?.npcs?.[0]?.manualRelationshipCorrections?.some(item => item.axis === 'trust') });
    await enterUncertainty(h);
    defer = true;
    const pending = h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    await h.deferredStarted;
    h.context.chat.push({ is_user: true, mes: 'new branch' }, { mes: 'new assistant' });
    h.releaseDeferred();
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.needsReconcile, true);
    assert.equal(result.reason, 'history-changed-during-user-owned-save');
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'commit-history-changed');
    assert.equal(correctionMap(persisted.npcs[0]).trust.value, 20);
    assert.deepEqual(unresolved(persisted.npcs[0]), ['affection', 'desire', 'tension']);
});


test('persisted unresolved axes remain blocked if legacy compatibility metadata is absent', async () => {
    const current = normalizeNpc({
        id: 'sora', name: 'Sora', relationship: rel(),
        manualRelationshipCorrectionUnresolvedAxes: ['affection', 'tension'],
    });
    const state = baselineState('v074-unresolved-without-override', shortChat, [current]);
    const h = harness(state, []);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    assert.deepEqual(h.persisted().npcs[0].manualRelationshipCorrectionUnresolvedAxes, ['affection', 'tension']);
    assert.deepEqual(blocked.manualRelationshipLimitations[0].axes, ['affection', 'tension']);
});

test('explicit clear-all correction ownership remains distinct and cannot resurrect legacy state later', async () => {
    const state = baselineState('v074-clear-all', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    let persisted = h.persisted();
    assert.equal(persisted.branchSafety.status, 'safe');
    assert.deepEqual(persisted.npcs[0].manualRelationshipCorrections, []);
    assert.deepEqual(unresolved(persisted.npcs[0]), []);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.npcs[0].manualOverrides, 'relationship'), false);
    assert.deepEqual(persisted.npcs[0].relationship, rel());
    const reload = h.reload();
    await reload.loadChat(h.key);
    await reload.reconcileBranch();
    persisted = h.persisted();
    assert.deepEqual(persisted.npcs[0].relationship, rel());
    assert.deepEqual(persisted.npcs[0].manualRelationshipCorrections, []);
});

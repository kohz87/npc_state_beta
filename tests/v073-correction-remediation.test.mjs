import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';
import { manualRelationshipRemediationPatch } from '../src/ui.js';

const rel = (trust = 0, affection = 0, desire = 0, tension = 0) => ({ trust, affection, desire, tension });
const manualEvent = (delta, sourceMessageId = 1, at = 100) => ({ impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId, turn: 1, at });
const storyEvent = (delta, sourceMessageId, at) => ({ impact: 'ordinary', delta, evidence: 'story', reason: 'Story gain.', sourceMessageId, turn: 1, at });

function legacyNpc({ trust = 20, affection = 0, axis = 'trust', sourceMessageId = 1, at = 100, includeEvent = true } = {}) {
    const relationship = rel(trust, affection);
    const delta = rel();
    delta[axis] = relationship[axis];
    const event = manualEvent(delta, sourceMessageId, at);
    return normalizeNpc({
        id: 'sora', name: 'Sora', relationship,
        relationshipHistory: includeEvent ? [event] : [], lastRelationshipChange: includeEvent ? event : null,
        manualOverrides: { relationship }, manualOverrideMeta: { relationship: { sourceMessageId, at: at + 1 } },
    });
}

function baselineState(key, chat, npc = normalizeNpc({ id: 'sora', name: 'Sora', relationship: rel() })) {
    let state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: npc.id, name: npc.name, relationship: rel() })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'story-before-manual');
    state.npcs = [npc];
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
        key, context, engine: make('v073-a'), reload: () => make('v073-b'),
        persisted: () => decodeV3Payload(saved, key).state,
        deferredStarted, releaseDeferred: () => releaseDeferred?.(),
    };
}

function correctionMap(npc) { return Object.fromEntries((npc.manualRelationshipCorrections || []).map(item => [item.axis, item])); }

const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];

test('legacy trust correction is migrated before a modern affection edit', async () => {
    const state = baselineState('v073-mixed', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    const result = await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(npc.relationship.trust, 20);
    assert.equal(npc.relationship.affection, 5);
    const corrections = correctionMap(npc);
    assert.equal(corrections.trust.value, 20);
    assert.equal(corrections.affection.value, 5);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrides, 'relationship'), false);
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel(20, 5));
    assert.equal(rolled.fullyRestored, true);
});

test('inverse axis order and multiple independent corrections remain independent', async () => {
    const state = baselineState('v073-inverse', chat, legacyNpc({ trust: 0, affection: 11, axis: 'affection' }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 7 } });
    await h.engine.updateNpc('sora', { relationship: { desire: 3 } });
    const corrections = correctionMap(h.persisted().npcs[0]);
    assert.equal(corrections.affection.value, 11);
    assert.equal(corrections.trust.value, 7);
    assert.equal(corrections.desire.value, 3);
});

test('modern edit of the same legacy-owned axis supersedes the migrated correction', async () => {
    const state = baselineState('v073-same-axis', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 25 } });
    const corrections = correctionMap(h.persisted().npcs[0]);
    assert.equal(corrections.trust.value, 25);
    assert.equal(Object.prototype.hasOwnProperty.call(h.persisted().npcs[0].manualOverrides, 'relationship'), false);
});

test('legacy migration happens before old relationship override metadata can be overwritten', async () => {
    const state = baselineState('v073-preoverwrite', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const npc = h.persisted().npcs[0];
    assert.equal(correctionMap(npc).trust.sourceMessageId, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrideMeta, 'relationship'), false);
});

test('supported legacy evidence migrates while ambiguous evidence remains explicitly unresolved', async () => {
    const supported = baselineState('v073-supported', chat, legacyNpc({ trust: 20 }));
    const hs = harness(supported, chat);
    await hs.engine.loadChat(hs.key);
    await hs.engine.updateNpc('sora', { relationship: { affection: 2 } });
    assert.equal(Object.prototype.hasOwnProperty.call(hs.persisted().npcs[0].manualOverrides, 'relationship'), false);

    const ambiguous = baselineState('v073-ambiguous', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const ha = harness(ambiguous, chat);
    await ha.engine.loadChat(ha.key);
    await ha.engine.updateNpc('sora', { relationship: { affection: 2 } });
    assert.equal(Object.prototype.hasOwnProperty.call(ha.persisted().npcs[0].manualOverrides, 'relationship'), true);
    const rolled = reconcileToCurrentBranch(ha.persisted(), []);
    assert.equal(rolled.reason, 'manual-relationship-correction-uncertain');
    assert.equal(rolled.fullyRestored, false);
});

test('visible history rotation after migration cannot erase correction ownership', async () => {
    const state = baselineState('v073-rotation', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const live = h.persisted();
    for (let i = 0; i < 10; i += 1) live.npcs[0].relationshipHistory.push(storyEvent(rel(1), i + 3, 200 + i));
    live.npcs[0].relationshipHistory = live.npcs[0].relationshipHistory.slice(-8);
    assert.equal(live.npcs[0].relationshipHistory.some(item => item.impact === 'manual'), false);
    const rolled = reconcileToCurrentBranch(normalizeState(live, h.key), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel(20, 5));
});

test('explicit correction clearing does not resurrect legacy ownership', async () => {
    const state = baselineState('v073-clear', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    await h.engine.updateNpc('sora', { manualOverrides: {} });
    const npc = h.persisted().npcs[0];
    assert.deepEqual(npc.manualRelationshipCorrections, []);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrides, 'relationship'), false);
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel());
    assert.equal(rolled.state.branchSafety.status, 'safe');
});

test('repeated rollback and reload do not double-apply migrated corrections', async () => {
    const state = baselineState('v073-idempotent', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(0);
    const first = await h.engine.reconcileBranch();
    assert.equal(first.ok, true);
    const second = await h.engine.reconcileBranch();
    assert.equal(second.ok, true);
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(20, 5));
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(loaded.npcs[0].relationship, rel(20, 5));
});

test('surviving snapshot keeps story gain after a migrated correction', async () => {
    const longChat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }, { is_user: true, mes: 'u3' }, { mes: 'a3' }];
    let state = baselineState('v073-survivor', longChat.slice(0, 2), legacyNpc({ trust: 20 }));
    const h = harness(state, longChat.slice(0, 2));
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    state = h.persisted();
    state.npcs[0].relationship.trust = 21;
    state.npcs[0].relationshipHistory.push(storyEvent(rel(1), 3, 300));
    state = recordCheckpoint(state, longChat.slice(0, 4), 3, 'story');
    state = recordCheckpoint(state, longChat, 5, 'unrelated');
    const rolled = reconcileToCurrentBranch(state, longChat.slice(0, 4));
    assert.equal(rolled.state.npcs[0].relationship.trust, 21);
    assert.equal(rolled.state.npcs[0].relationship.affection, 5);
});

async function enterUncertainty(h) {
    await h.engine.loadChat(h.key);
    h.context.chat.splice(0);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
}

test('uncertainty block resolves through the supported updateNpc remediation path', async () => {
    const state = baselineState('v073-remediate', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    const patch = manualRelationshipRemediationPatch('trust', 20);
    const fixed = await h.engine.updateNpc('sora', patch);
    assert.equal(fixed.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 20);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 20);
    // Missing legacy axis provenance remains until explicitly cleared; confirming one axis
    // does not silently approve the others.
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    assert.equal(h.persisted().branchSafety.status, 'safe');
});

test('multiple unresolved NPCs remain blocked until each is remediated', async () => {
    let state = baselineState('v073-multi-unresolved', chat, legacyNpc({ trust: 20, includeEvent: false }));
    state.npcs.push(normalizeNpc({ ...legacyNpc({ trust: 0, affection: 9, axis: 'affection', includeEvent: false }), id: 'ryu', name: 'Ryu' }));
    state.branchBase.snapshot.npcs.push(normalizeNpc({ id: 'ryu', name: 'Ryu', relationship: rel() }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    assert.match(h.persisted().branchSafety.reason, /Ryu/);
    await h.engine.clearManualRelationshipCorrection('ryu');
    assert.equal(h.persisted().branchSafety.status, 'safe');
});

test('remediation preserves suffix recovery requirement instead of fabricating a safe checkpoint', async () => {
    const surviving = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2 survives' }, { mes: 'a2 survives' }];
    let state = baselineState('v073-suffix', surviving.slice(0, 2), legacyNpc({ trust: 20, includeEvent: false }));
    state.branchHeadLineage = ['stale'];
    const h = harness(state, surviving);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    assert.equal(h.persisted().branchSafety.kind, 'suffix-recovery-required');
    assert.equal(h.persisted().recovery?.status, 'paused');
});

test('unrelated mutations remain rejected while correction uncertainty is blocked', async () => {
    const state = baselineState('v073-unrelated', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    const update = await h.engine.updateNpc('sora', { mood: 'Should not write.' });
    assert.equal(update.ok, false);
    assert.equal(update.reason, 'correction-remediation-only');
    const add = await h.engine.addNpc('Nope');
    assert.equal(add.ok, false);
    assert.equal(add.reason, 'branch-unsafe');
    assert.equal(h.persisted().npcs.some(npc => npc.name === 'Nope'), false);
});

test('persistence conflict during remediation leaves persisted state blocked and reload honest', async () => {
    const state = baselineState('v073-conflict', chat, legacyNpc({ trust: 20, includeEvent: false }));
    let fail = false;
    const h = harness(state, chat, { failPredicate: () => fail });
    await enterUncertainty(h);
    fail = true;
    await assert.rejects(() => h.engine.clearManualRelationshipCorrection('sora'));
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.equal(loaded.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

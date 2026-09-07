import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensureBranchBase, recordCheckpoint, reconcileToCurrentBranch, rebaseToCurrentChat } from '../src/branches.js';
import { createNpcStateEngine } from '../src/engine.js';
import { encodeV3Payload, decodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const chat = [
    { is_user: true, mes: 'Lucien offers Sora help.' },
    { mes: 'Sora accepts the help.' },
    { is_user: true, mes: 'Lucien comforts Sora.' },
    { mes: 'Sora thanks Lucien and trusts him more.' },
];
const axes = (trust = 0) => ({ trust, affection: 0, desire: 0, tension: 0 });
const event = {
    sourceMessageId: 3, impact: 'ordinary', delta: axes(1),
    evidence: chat[3].mes, reason: 'Comfort increased trust.', at: 20, turn: 2,
};

function fixture() {
    let state = createEmptyState('deletion-test');
    state.npcs = [normalizeNpc({
        id: 'sora', name: 'Sora', relationship: axes(12), relationshipProgress: axes(0.25),
        relationshipSummary: 'Cautiously friendly.',
    })];
    state.lastScannedMessageId = 1;
    state = ensureBranchBase(state, chat.slice(0, 2));
    state = recordCheckpoint(state, chat.slice(0, 2), 1);
    const before = structuredClone(state.npcs[0]);
    Object.assign(state.npcs[0], {
        relationship: axes(13), relationshipProgress: axes(0.5),
        relationshipSummary: 'Warmer trust after the comfort.',
        relationshipHistory: [event], relationshipEvidenceHistory: [event],
        lastRelationshipChange: event,
        relationshipDiagnostics: [{ ...event, before: axes(12), after: axes(13), progressBefore: axes(0.25), progressAfter: axes(0.5) }],
    });
    state.lastScannedMessageId = 3;
    state = recordCheckpoint(state, chat, 3);
    return { state, before };
}

const relationshipFields = ['relationship', 'relationshipProgress', 'relationshipSummary', 'relationshipHistory', 'relationshipEvidenceHistory', 'relationshipDiagnostics', 'relationshipMilestones', 'lastRelationshipChange'];
function assertRelationships(actual, expected) {
    for (const field of relationshipFields) assert.deepEqual(actual[field], expected[field], field);
}

function harness(state, visibleChat) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(visibleChat) };
    let generations = 0;
    const adapters = {
        getContext: () => context, getChatKey: () => key, getSettings: () => normalizeSettings(),
        getPointer: () => pointer, setPointer: (_key, value) => { pointer = value; },
        generate: async () => { generations++; throw new Error('Deletion must not need a model request.'); },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
    };
    return { engine: createNpcStateEngine(adapters), reload: () => createNpcStateEngine(adapters), context,
        persisted: () => decodeV3Payload(saved, key).state, generations: () => generations };
}

test('deleting the latest exchange restores all relationship state and persists through reload', async () => {
    const { state, before } = fixture();
    const h = harness(state, chat);
    await h.engine.loadChat();
    h.context.chat.splice(2);
    const result = await h.engine.reconcileBranch({ rollbackDiscardedRelationships: true });
    assert.equal(result.ok, true);
    assertRelationships(result.state.npcs[0], before);
    assertRelationships(h.persisted().npcs[0], before);
    assertRelationships((await h.reload().loadChat()).npcs[0], before);
    assert.equal(h.generations(), 0);
});

test('deleting beyond retained full snapshots never performs a partial relationship-only rollback', async () => {
    const { state } = fixture();
    const before = normalizeState(state).npcs[0];
    const h = harness(state, chat);
    await h.engine.loadChat();
    h.context.chat.splice(1);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'recovery-required');
    assertRelationships(result.state.npcs[0], before);
    assert.equal(result.state.branchSafety.status, 'rebase-required');
    assert.equal(h.generations(), 0);
    const reloaded = h.reload();
    const loaded = await reloaded.loadChat();
    assertRelationships(loaded.npcs[0], before);
});

test('deleting all or rewriting before an untrusted legacy baseline retains recoverable state without invented rollback', () => {
    for (const remaining of [[], [chat[1], chat[2], chat[3]]]) {
        const { state } = fixture();
        const before = normalizeState(state).npcs[0];
        const result = reconcileToCurrentBranch(state, remaining);
        assert.equal(result.unsafeDivergence, true);
        assertRelationships(result.state.npcs[0], before);
        assert.equal(result.state.branchSafety.status, 'rebase-required');
    }
});

test('missing-baseline failure preserves identifiable manual relationship corrections instead of double-applying them', () => {
    const { state } = fixture();
    const manual = { ...event, impact: 'manual', delta: axes(27), reason: 'User correction.', at: 30 };
    state.npcs[0].relationship = axes(40);
    state.npcs[0].relationshipProgress = axes();
    state.npcs[0].relationshipHistory.push(manual);
    state.npcs[0].lastRelationshipChange = manual;
    const before = normalizeState(state).npcs[0];
    const result = reconcileToCurrentBranch(state, []);
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.state.npcs[0].relationship.trust, 40);
    assert.deepEqual(result.state.npcs[0].relationshipHistory, before.relationshipHistory);
    assert.equal(result.state.npcs[0].lastRelationshipChange.reason, 'User correction.');
});

test('explicit preserve rebase still retains relationship state', () => {
    const { state } = fixture();
    const blocked = reconcileToCurrentBranch(state, []);
    assertRelationships(blocked.state.npcs[0], normalizeState(state).npcs[0]);
    const result = rebaseToCurrentChat(blocked.state, [], { relationshipMode: 'preserve' });
    const before = normalizeState(state).npcs[0];
    for (const field of ['relationship', 'relationshipProgress', 'relationshipSummary', 'relationshipMilestones']) {
        assert.deepEqual(result.npcs[0][field], before[field], field);
    }
    assert.equal(result.npcs[0].relationshipHistory[0].reason, event.reason);
    assert.equal(result.npcs[0].lastRelationshipChange.reason, event.reason);
    assert.equal(result.npcs[0].relationshipHistory[0].timelineStatus, 'accepted-pre-rebase');
});

test('the deletion handler restores an exact surviving checkpoint without running a second scanner', async () => {
    const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
    const handlerSource = source.slice(source.indexOf('async function settledBranchReconcile('), source.indexOf('\nfunction runBoundedLifecycleEvent('));
    const { state, before } = fixture();
    const h = harness(state, chat);
    await h.engine.loadChat();
    h.context.chat.splice(2);
    const handler = runInNewContext(`(${handlerSource})`, {
        getChatKey: () => state.chatKey, engine: h.engine, sleep: async () => {},
        refreshSurfaces: () => {}, notify: () => {}, console,
    });
    await handler({ reason: 'message-deleted' });
    assert.deepEqual(h.persisted().npcs[0].relationship, before.relationship);
    assert.equal(h.generations(), 0);
});

test('missing historical provenance keeps stale-but-recoverable relationship state blocked instead of pretending exact repair', () => {
    const { state } = fixture();
    state.npcs[0].relationshipHistory = [];
    state.npcs[0].relationshipEvidenceHistory = [];
    state.npcs[0].relationshipDiagnostics = [];
    const before = structuredClone(state.npcs[0]);
    const result = reconcileToCurrentBranch(state, []);
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.state.npcs[0].lastRelationshipChange.reason, before.lastRelationshipChange.reason);
    assert.equal(result.state.npcs[0].relationshipSummary, before.relationshipSummary);
    assert.equal(result.state.npcs[0].relationship.trust, 13);
    assert.equal(result.state.branchSafety.status, 'rebase-required');
});

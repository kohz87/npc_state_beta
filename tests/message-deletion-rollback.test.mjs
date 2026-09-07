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

test('deleting beyond the oldest checkpoint removes known relationship changes while retaining recovery safety', async () => {
    const { state, before } = fixture();
    const h = harness(state, chat);
    await h.engine.loadChat();
    h.context.chat.splice(1);
    const result = await h.engine.reconcileBranch({ rollbackDiscardedRelationships: true });
    assert.equal(result.unsafeDivergence, true);
    const npc = result.state.npcs[0];
    assert.deepEqual(npc.relationship, before.relationship);
    assert.deepEqual(npc.relationshipProgress, before.relationshipProgress);
    assert.equal(npc.relationshipHistory.length, 0);
    assert.equal(npc.relationshipEvidenceHistory.length, 0);
    assert.equal(npc.relationshipDiagnostics.length, 0);
    assert.equal(npc.lastRelationshipChange.reason, '');
    assert.equal(npc.relationshipSummary, '');
    assert.equal(result.state.branchSafety.status, 'rebase-required');
    const reloaded = h.reload();
    await reloaded.loadChat();
    const again = await reloaded.reconcileBranch({ rollbackDiscardedRelationships: true });
    assertRelationships(again.state.npcs[0], npc);
    assertRelationships(h.persisted().npcs[0], npc);
    assert.equal(h.generations(), 0);
});

test('deleting all messages and a prebaseline middle message also retire discarded relationship reasons', () => {
    for (const remaining of [[], [chat[1], chat[2], chat[3]]]) {
        const { state, before } = fixture();
        const result = reconcileToCurrentBranch(state, remaining, { rollbackDiscardedRelationships: true });
        assert.equal(result.unsafeDivergence, true);
        assert.deepEqual(result.state.npcs[0].relationship, before.relationship);
        assert.equal(result.state.npcs[0].lastRelationshipChange.reason, '');
        assert.equal(result.state.npcs[0].relationshipHistory.length, 0);
    }
});

test('prebaseline deletion preserves manual relationship corrections', () => {
    const { state } = fixture();
    const manual = { ...event, impact: 'manual', delta: axes(27), reason: 'User correction.', at: 30 };
    state.npcs[0].relationship = axes(40);
    state.npcs[0].relationshipProgress = axes();
    state.npcs[0].relationshipHistory.push(manual);
    state.npcs[0].lastRelationshipChange = manual;
    const result = reconcileToCurrentBranch(state, [], { rollbackDiscardedRelationships: true });
    assert.equal(result.state.npcs[0].relationship.trust, 40);
    assert.equal(result.state.npcs[0].relationshipHistory.length, 1);
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

test('the deletion handler rolls back without rescanning an already-restored surviving response', async () => {
    // Execute the installed handler with host adapters so its default messageId and
    // deletion-specific engine options are covered without a browser dependency.
    const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
    const handlerSource = source.slice(source.indexOf('async function settledBranchReconcile('), source.indexOf('\nfunction runBoundedLifecycleEvent('));
    for (const length of [2, 1]) {
        const { state, before } = fixture();
        const h = harness(state, chat);
        await h.engine.loadChat();
        h.context.chat.splice(length);
        let scans = 0;
        const handler = runInNewContext(`(${handlerSource})`, {
            getChatKey: () => state.chatKey, engine: h.engine, sleep: async () => {},
            getContext: () => h.context, getSettings: () => normalizeSettings(),
            latestAssistantMessageId: messages => messages.findLastIndex(message => !message.is_user && !message.is_system),
            refreshSurfaces: () => {}, notify: () => {}, console,
            runSeparateRecoveryScan: async () => { scans++; },
        });
        await handler({ reason: 'message-deleted' });
        assert.equal(scans, 0);
        assert.deepEqual(h.persisted().npcs[0].relationship, before.relationship);
        assert.equal(h.persisted().npcs[0].lastRelationshipChange.reason, '');
    }
});

test('a deleted last-change reason cannot keep a stale summary when older history is unavailable', () => {
    const { state } = fixture();
    state.npcs[0].relationshipHistory = [];
    state.npcs[0].relationshipEvidenceHistory = [];
    state.npcs[0].relationshipDiagnostics = [];
    const result = reconcileToCurrentBranch(state, [], { rollbackDiscardedRelationships: true });
    assert.equal(result.state.npcs[0].lastRelationshipChange.reason, '');
    assert.equal(result.state.npcs[0].relationshipSummary, '');
    // No exact score ledger remains: do not invent an old score or mark the timeline safe.
    assert.equal(result.state.npcs[0].relationship.trust, 13);
    assert.equal(result.state.branchSafety.status, 'rebase-required');
});

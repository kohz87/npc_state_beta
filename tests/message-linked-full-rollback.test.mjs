import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_LIMIT, createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { chatLineage, ensureBranchBase, ensurePreUpdateBaseline, fingerprintMessage, recordCheckpoint, reconcileToCurrentBranch, rebaseToCurrentChat } from '../src/branches.js';
import { createNpcStateEngine } from '../src/engine.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const axes = trust => ({ trust, affection: 0, desire: 0, tension: 0 });

function npc(id, name, extra = {}) {
    return normalizeNpc({ id, name, relationship: axes(0), ...extra });
}

function storyProjection(state) {
    const normalized = normalizeState(state, state.chatKey);
    return {
        turn: normalized.turn,
        lastScannedMessageId: normalized.lastScannedMessageId,
        npcs: normalized.npcs.map(entry => ({
            id: entry.id,
            name: entry.name,
            memories: entry.memories,
            mood: entry.mood,
            location: entry.location,
            goal: entry.goal,
            status: entry.status,
            currentForm: entry.currentForm,
            personality: entry.personality,
            relationship: entry.relationship,
            relationshipProgress: entry.relationshipProgress,
            relationshipSummary: entry.relationshipSummary,
            relationshipHistory: entry.relationshipHistory,
            relationshipEvidenceHistory: entry.relationshipEvidenceHistory,
            relationshipDiagnostics: entry.relationshipDiagnostics,
            relationshipMilestones: entry.relationshipMilestones,
            lastRelationshipChange: entry.lastRelationshipChange,
            present: entry.present,
            worldActive: entry.worldActive,
            firstSeenMessageId: entry.firstSeenMessageId,
            lastSeenMessageId: entry.lastSeenMessageId,
            lastInteractionMessageId: entry.lastInteractionMessageId,
            seenCount: entry.seenCount,
        })),
        socialGraph: normalized.socialGraph,
        familySlots: normalized.familySlots,
        lastObservation: normalized.lastObservation,
        relationshipReplayBoundary: normalized.relationshipReplayBoundary,
    };
}

test('deleting the first tracked response restores its complete pre-update story snapshot', () => {
    const chat = [
        { is_user: true, mes: 'Lucien asks Sora to come outside.' },
        { mes: 'Sora follows him to the courtyard and confides in him.' },
    ];
    let state = createEmptyState('full-first-delete');
    state.npcs = [
        npc('sora', 'Sora', {
            memories: ['Lucien sheltered her during the storm.'],
            mood: 'Quiet.', location: 'Mountain shelter.', goal: 'Rest.', status: 'Sitting by the hearth.',
            personality: 'Curious and observant.', relationship: axes(4), relationshipProgress: axes(0.25),
            relationshipSummary: 'Cautiously trusts Lucien.',
        }),
        npc('ryu', 'Ryu', { location: 'Mountain shelter.' }),
    ];
    state = ensurePreUpdateBaseline(state, chat, 1);
    const before = storyProjection(state);

    const relationshipEvent = {
        impact: 'meaningful', delta: axes(2), evidence: chat[1].mes, reason: 'Sora confided in Lucien.',
        sourceMessageId: 1, turn: 1, at: 100,
    };
    const sora = state.npcs.find(entry => entry.id === 'sora');
    sora.memories = [...sora.memories, { text: 'Confided in Lucien in the courtyard.', sourceMessageId: 1 }];
    sora.mood = 'Relieved.';
    sora.location = 'Courtyard.';
    sora.goal = 'Stay near Lucien.';
    sora.status = 'Walking beside Lucien.';
    sora.currentForm = 'Human';
    sora.relationship = axes(6);
    sora.relationshipProgress = axes(0.5);
    sora.relationshipSummary = 'Openly warmer and more trusting.';
    sora.relationshipHistory = [relationshipEvent];
    sora.relationshipEvidenceHistory = [relationshipEvent];
    sora.relationshipDiagnostics = [{ ...relationshipEvent, before: axes(4), after: axes(6), progressBefore: axes(0.25), progressAfter: axes(0.5) }];
    sora.relationshipMilestones = [{ axis: 'trust', polarity: 1, threshold: 5, sourceMessageId: 1, reason: 'Trust crossed the first gate.' }];
    sora.lastRelationshipChange = relationshipEvent;
    sora.present = true;
    sora.worldActive = true;
    sora.firstSeenMessageId = 1;
    sora.lastSeenMessageId = 1;
    sora.lastInteractionMessageId = 1;
    sora.seenCount = 1;
    state.socialGraph = [{ fromId: 'sora', toId: 'ryu', type: 'sister', label: 'Sister', sourceMessageId: 1 }];
    state.lastObservation = { messageId: 1, exchangeActiveNpcIds: ['sora'], finalPresentNpcIds: ['sora'], worldActiveNpcIds: ['sora'], targetNpcIds: ['sora'] };
    state.turn = 1;
    state.lastScannedMessageId = 1;
    state = recordCheckpoint(state, chat, 1, 'embedded-foreground');

    const result = reconcileToCurrentBranch(state, []);
    assert.equal(result.unsafeDivergence, false, 'a valid pre-update baseline should remain usable after deleting the first tracked response');
    assert.deepEqual(storyProjection(result.state), before);
});

test('middle deletion restores only a verified prefix and marks the surviving suffix for ordered reconstruction', () => {
    const chat = [
        { is_user: true, mes: 'Turn one user.' },
        { mes: 'Turn one assistant.' },
        { is_user: true, mes: 'Turn two user.' },
        { mes: 'Turn two assistant.' },
        { is_user: true, mes: 'Turn three user.' },
        { mes: 'Turn three assistant.' },
    ];
    let state = createEmptyState('middle-delete');
    state.npcs = [npc('sora', 'Sora', { mood: 'Initial.' })];
    state = ensureBranchBase(state, chat.slice(0, 2));
    state.npcs[0].mood = 'After one.';
    state.turn = 1;
    state.lastScannedMessageId = 1;
    state = recordCheckpoint(state, chat.slice(0, 2), 1, 'embedded-foreground');
    state.npcs[0].mood = 'After two.';
    state.turn = 2;
    state.lastScannedMessageId = 3;
    state = recordCheckpoint(state, chat.slice(0, 4), 3, 'embedded-foreground');
    state.npcs[0].mood = 'After three.';
    state.turn = 3;
    state.lastScannedMessageId = 5;
    state = recordCheckpoint(state, chat, 5, 'embedded-foreground');

    const surviving = [chat[0], chat[1], chat[4], chat[5]];
    const result = reconcileToCurrentBranch(state, surviving);
    assert.equal(result.unsafeDivergence, false);
    assert.equal(result.needsRecovery, true, 'the later surviving exchange must be reconstructed against its changed preceding history');
    assert.notEqual(result.state.branchSafety.status, 'safe', 'a prefix-only restore must not advertise the whole timeline as current');
    assert.equal(result.state.npcs[0].mood, 'After one.');
});


function checkpointedState(chat, key = 'rollback-engine') {
    let state = createEmptyState(key);
    state.npcs = [npc('sora', 'Sora', { mood: 'Before story.', location: 'Shelter.', relationship: axes(2) })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state.npcs[0].mood = 'After one.';
    state.npcs[0].location = 'Courtyard.';
    state.lastScannedMessageId = 1;
    state.turn = 1;
    state = recordCheckpoint(state, chat.slice(0, 2), 1, 'embedded-foreground');
    if (chat.length >= 4) {
        state.npcs[0].mood = 'After two.';
        state.npcs[0].goal = 'Follow the second exchange.';
        state.lastScannedMessageId = 3;
        state.turn = 2;
        state = recordCheckpoint(state, chat.slice(0, 4), 3, 'embedded-foreground');
    }
    return state;
}

function engineHarness(initialState, visibleChat, { settings = {}, generate, failWrites = false } = {}) {
    const key = initialState.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initialState, 1);
    let writes = 0;
    let generations = 0;
    let shouldFailWrites = failWrites;
    const context = { chat: structuredClone(visibleChat) };
    const adapters = {
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: true, ...settings }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async args => {
            generations += 1;
            if (generate) return generate(args, context);
            throw new Error('Unexpected model generation.');
        },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                writes += 1;
                if (shouldFailWrites) return { ok: false, status: 409, text: async () => 'conflict' };
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: 'rollback-test-session',
    };
    const make = () => createNpcStateEngine(adapters);
    return {
        engine: make(), reload: make, context,
        persisted: () => decodeV3Payload(saved, key).state,
        generations: () => generations, writes: () => writes,
        failWrites: value => { shouldFailWrites = value; },
    };
}

function recoveryPayloadForMessage(id, context) {
    const excerpt = String(context.chat[id]?.mes || '');
    return JSON.stringify({
        exchangeActiveNpcIds: ['sora'], finalPresentNpcIds: ['sora'], worldActiveNpcIds: ['sora'],
        npcs: [{
            id: 'sora', name: 'Sora', evaluatedGroups: ['live'],
            semanticUpdates: [{ field: 'mood', operation: 'replace', value: `Recovered ${id}.`, durability: 'temporary', sources: [{ messageId: id, excerpt }], explanation: 'Rebuild the surviving exchange.' }],
        }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    });
}

test('multiple tail deletions restore successively older complete checkpoints and reconciliation is idempotent', () => {
    const chat3 = [
        { is_user: true, mes: 'u1' }, { mes: 'a1' },
        { is_user: true, mes: 'u2' }, { mes: 'a2' },
        { is_user: true, mes: 'u3' }, { mes: 'a3' },
    ];
    let state = checkpointedState(chat3);
    state.npcs[0].mood = 'After three.';
    state.turn = 3;
    state.lastScannedMessageId = 5;
    state = recordCheckpoint(state, chat3, 5, 'embedded-foreground');
    const afterTwo = reconcileToCurrentBranch(state, chat3.slice(0, 4));
    assert.equal(afterTwo.state.npcs[0].mood, 'After two.');
    assert.equal(afterTwo.needsRecovery, false);
    const again = reconcileToCurrentBranch(afterTwo.state, chat3.slice(0, 4));
    assert.equal(again.changed, false);
    const afterOne = reconcileToCurrentBranch(afterTwo.state, chat3.slice(0, 2));
    assert.equal(afterOne.state.npcs[0].mood, 'After one.');
    assert.equal(afterOne.needsRecovery, false);
});

test('deleting all messages restores a trustworthy pre-story boundary when tracking began with the first exchange', () => {
    const chat1 = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    const state = checkpointedState(chat1);
    const result = reconcileToCurrentBranch(state, []);
    assert.equal(result.unsafeDivergence, false);
    assert.equal(result.needsRecovery, false);
    assert.equal(result.state.npcs[0].mood, 'Before story.');
    assert.equal(result.state.npcs[0].location, 'Shelter.');
});

test('reused message IDs are owned by full fingerprints and changed preceding history invalidates later snapshots', () => {
    const chatA = [{ is_user: true, mes: 'u1' }, { mes: 'swipe A', swipe_id: 0 }];
    let state = checkpointedState(chatA);
    const snapshotA = structuredClone(state.npcs[0]);
    const chatB = [{ is_user: true, mes: 'u1' }, { mes: 'swipe B', swipe_id: 1 }];
    state.npcs[0].mood = 'Swipe B mood.';
    state = recordCheckpoint(state, chatB, 1, 'embedded-foreground');
    const back = reconcileToCurrentBranch(state, chatA);
    assert.equal(back.needsRecovery, false);
    assert.deepEqual(back.state.npcs[0].mood, snapshotA.mood);
    const edited = [{ is_user: true, mes: 'u1 changed' }, { mes: 'swipe A', swipe_id: 0 }];
    const changed = reconcileToCurrentBranch(state, edited);
    assert.notEqual(changed.checkpoint?.lineage?.join('|'), chatLineage(chatA).join('|'));
    assert.equal(changed.unsafeDivergence || changed.needsRecovery, true);
});

test('user-owned locks, portraits, explicit manual overrides, importance, and tombstones survive story rollback', () => {
    const chat1 = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = createEmptyState('manual-owned');
    state.npcs = [
        npc('sora', 'Sora', { personality: 'Story personality.', mood: 'Story mood.', memories: ['Story memory.'], importance: 10 }),
        npc('ryu', 'Ryu', { mood: 'Present.' }),
    ];
    state = ensurePreUpdateBaseline(state, chat1, 1);
    state.npcs[0].personality = 'Changed by story.';
    state.npcs[0].mood = 'Changed by story.';
    state = recordCheckpoint(state, chat1, 1, 'embedded-foreground');
    state.npcs[0].manualProfileFields = ['personality'];
    state.npcs[0].personality = 'User locked personality.';
    state.npcs[0].portrait = { dataUrl: 'data:image/png;base64,USER' };
    state.npcs[0].importance = 88;
    state.npcs[0].manualOverrides = { mood: 'User pinned mood.', memories: ['User-authored memory.'] };
    state.deletedNpcIds = ['ryu'];
    const result = reconcileToCurrentBranch(state, []);
    const sora = result.state.npcs.find(entry => entry.id === 'sora');
    assert.equal(sora.personality, 'User locked personality.');
    assert.equal(sora.mood, 'User pinned mood.');
    assert.deepEqual(sora.memories, ['User-authored memory.']);
    assert.equal(sora.importance, 88);
    assert.equal(sora.portrait.dataUrl, 'data:image/png;base64,USER');
    assert.equal(result.state.npcs.some(entry => entry.id === 'ryu'), false);
});

test('new NPCs and graph references created only by deleted history disappear with the restored snapshot', () => {
    const chat1 = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = createEmptyState('new-npc-rollback');
    state.npcs = [npc('sora', 'Sora')];
    state = ensurePreUpdateBaseline(state, chat1, 1);
    state.npcs.push(npc('mira', 'Mira', { memories: ['Met Sora in deleted history.'] }));
    state.socialGraph = [{ fromId: 'sora', toId: 'mira', type: 'friend', label: 'Friend', sourceMessageId: 1 }];
    state.familySlots = [{ ownerId: 'sora', relationType: 'sister', label: 'Sister', resolvedNpcIds: ['mira'] }];
    state = recordCheckpoint(state, chat1, 1, 'embedded-foreground');
    const result = reconcileToCurrentBranch(state, []);
    assert.deepEqual(result.state.npcs.map(entry => entry.id), ['sora']);
    assert.deepEqual(result.state.socialGraph, []);
    assert.deepEqual(result.state.familySlots, []);
});

test('checkpoint exhaustion reconstructs the surviving suffix from the retained trusted baseline in order', async () => {
    const longChat = [];
    for (let turn = 0; turn < CHECKPOINT_LIMIT + 8; turn += 1) {
        longChat.push({ is_user: true, mes: `u${turn}` }, { mes: `a${turn}` });
    }
    let state = createEmptyState('exhaustion');
    state.npcs = [npc('sora', 'Sora', { mood: 'Before story.' })];
    state = ensurePreUpdateBaseline(state, longChat, 1);
    for (let id = 1; id < longChat.length; id += 2) {
        state.npcs[0].mood = `Old ${id}.`;
        state.turn += 1;
        state.lastScannedMessageId = id;
        state = recordCheckpoint(state, longChat.slice(0, id + 1), id, 'embedded-foreground');
    }
    assert.equal(state.checkpoints.length <= CHECKPOINT_LIMIT, true);
    const surviving = longChat.slice(0, 4);
    const generatedIds = [];
    const h = engineHarness(state, surviving, {
        generate: ({ label }, context) => {
            const id = Number(String(label).match(/historical-recovery-(\d+)/)?.[1]);
            generatedIds.push(id);
            return recoveryPayloadForMessage(id, context);
        },
    });
    await h.engine.loadChat();
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, true);
    assert.equal(result.needsRecovery, false);
    assert.deepEqual(generatedIds, [1, 3]);
    assert.equal(result.state.branchSafety.status, 'safe');
    assert.equal(result.state.npcs[0].mood, 'Recovered 3.');
});

test('middle deletion rebuilds every surviving assistant suffix in order rather than scanning only the latest message', async () => {
    const original = [
        { is_user: true, mes: 'u1' }, { mes: 'a1' },
        { is_user: true, mes: 'u2' }, { mes: 'a2 deleted' },
        { is_user: true, mes: 'u3 survives' }, { mes: 'a3 survives' },
        { is_user: true, mes: 'u4 survives' }, { mes: 'a4 survives' },
    ];
    let state = checkpointedState(original);
    state.npcs[0].mood = 'After deleted turn.';
    state = recordCheckpoint(state, original.slice(0, 4), 3, 'embedded-foreground');
    state.npcs[0].mood = 'After old three.';
    state = recordCheckpoint(state, original.slice(0, 6), 5, 'embedded-foreground');
    state.npcs[0].mood = 'After old four.';
    state = recordCheckpoint(state, original, 7, 'embedded-foreground');
    const surviving = [original[0], original[1], original[4], original[5], original[6], original[7]];
    const generatedIds = [];
    const h = engineHarness(state, surviving, {
        generate: ({ label }, context) => {
            const id = Number(String(label).match(/historical-recovery-(\d+)/)?.[1]);
            generatedIds.push(id);
            return recoveryPayloadForMessage(id, context);
        },
    });
    await h.engine.loadChat();
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, true);
    assert.deepEqual(generatedIds, [3, 5]);
    assert.equal(result.state.npcs[0].mood, 'Recovered 5.');
    assert.equal(result.state.branchSafety.status, 'safe');
});

test('a fully matching surviving checkpoint persists and reloads without any model request', async () => {
    const two = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }];
    const state = checkpointedState(two);
    const h = engineHarness(state, two);
    await h.engine.loadChat();
    h.context.chat.splice(2);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, true);
    assert.equal(result.needsRecovery, false);
    assert.equal(h.generations(), 0);
    assert.equal(h.persisted().npcs[0].mood, 'After one.');
    const reloaded = await h.reload().loadChat();
    assert.equal(reloaded.npcs[0].mood, 'After one.');
});

test('checkpoint selection rejects an explicitly conflicting chat owner even when message lineage matches', () => {
    const visible = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];
    let state = createEmptyState('chat-owner-a');
    state.npcs = [npc('sora', 'Sora', { mood: 'Owned by A.' })];
    state = ensurePreUpdateBaseline(state, visible, 1);
    state.npcs[0].mood = 'Post update.';
    state = recordCheckpoint(state, visible, 1, 'embedded-foreground');
    state.branchBase = null;
    state.branchHeadLineage = chatLineage([{ is_user: true, mes: 'different past' }, { mes: 'different answer' }]);
    state.checkpoints[0].chatKey = 'chat-owner-b';
    const result = reconcileToCurrentBranch(state, visible);
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.needsRecovery, true);
});

test('legacy sidecars without checkpoint provenance remain loadable but do not gain fabricated baseline certainty', async () => {
    const visible = [{ is_user: true, mes: 'u1' }];
    let state = createEmptyState('legacy-sidecar');
    state.npcs = [npc('sora', 'Sora', { mood: 'Legacy retained.' })];
    state.branchHeadLineage = chatLineage([{ is_user: true, mes: 'u1' }, { mes: 'old a1' }]);
    state.branchBase = { messageId: 1, lineage: state.branchHeadLineage, createdAt: 1, snapshot: structuredClone(state) };
    const h = engineHarness(state, visible);
    const loaded = await h.engine.loadChat();
    assert.equal(loaded.branchBase.boundaryKind, '');
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, false);
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.state.npcs[0].mood, 'Legacy retained.');
});

test('persistence failure cannot claim rollback success or expose the timeline as safe', async () => {
    const two = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }];
    const state = checkpointedState(two);
    const h = engineHarness(state, two);
    await h.engine.loadChat();
    h.context.chat.splice(2);
    h.failWrites(true);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.ok, false);
    assert.equal(result.persistenceFailed, true);
    assert.equal(result.reason, 'rollback-persistence-failed');
    assert.equal(result.state.branchSafety.status, 'rebase-required');
    assert.equal(result.state.branchSafety.kind, 'rollback-save-failed');
});

test('a delayed scan result cannot commit after deletion invalidates its source history', async () => {
    const two = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }];
    const state = checkpointedState(two);
    let release;
    const generated = new Promise(resolve => { release = resolve; });
    const h = engineHarness(state, two, { generate: () => generated });
    await h.engine.loadChat();
    const pending = h.engine.scan(3, { manual: true, force: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    h.context.chat.splice(2);
    h.engine.invalidate(state.chatKey);
    release(JSON.stringify({ exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }));
    const result = await pending;
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'stale-operation');
    assert.equal(h.persisted().lastScannedMessageId, 3);
});

test('explicit preserve and rollback rebase modes remain distinct after snapshot rollback changes', () => {
    const current = [{ is_user: true, mes: 'u1 changed' }, { mes: 'a1 changed' }];
    let state = createEmptyState('rebase-regression');
    state.npcs = [npc('sora', 'Sora', { relationship: axes(12), relationshipProgress: axes(0.5) })];
    state.branchHeadLineage = chatLineage([{ is_user: true, mes: 'u1' }, { mes: 'a1' }]);
    const preserve = rebaseToCurrentChat(state, current, { relationshipMode: 'preserve' });
    const rollback = rebaseToCurrentChat(state, current, { relationshipMode: 'rollback' });
    assert.equal(preserve.npcs[0].relationship.trust, 12);
    assert.equal(preserve.rebaseBackup.relationshipMode, 'preserve');
    assert.equal(rollback.rebaseBackup.relationshipMode, 'rollback');
});

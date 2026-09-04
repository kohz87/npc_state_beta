import fs from 'node:fs';
import {
    buildQualifiedChatKey,
    characterOwnerRenamePairs,
    qualifiedChatKeysForOwner,
} from '../v03/identity.js';
import {
    TRANSIENT_WRITE_RETRY_DELAYS,
    encodeV3Payload,
    isTransientPersistenceStatus,
    writeV3Sidecar,
} from '../v03/storage.js';
import {
    CHECKPOINT_BYTE_LIMIT,
    checkpointStorageBytes,
    pruneCheckpointPressure,
} from '../v03/branches.js';
import { createEmptyState } from '../v03/schema.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// 4A: owner-qualified character lifecycle mapping must never borrow another owner/group.
const oldOwner = 'old-avatar.png';
const newOwner = 'new-avatar.png';
const oldA = buildQualifiedChatKey('chat', oldOwner, 'chat-a');
const oldB = buildQualifiedChatKey('chat', oldOwner, 'chat-b');
const other = buildQualifiedChatKey('chat', 'other-avatar.png', 'chat-a');
const group = buildQualifiedChatKey('group', oldOwner, 'chat-a');
const dataFiles = {
    [oldA]: { path: '/old-a.json', name: 'old-a.json' },
    [oldB]: { path: '/old-b.json', name: 'old-b.json' },
    [other]: { path: '/other.json', name: 'other.json' },
    [group]: { path: '/group.json', name: 'group.json' },
    [buildQualifiedChatKey('chat', oldOwner, 'no-path')]: { name: 'missing.json' },
};
const owned = qualifiedChatKeysForOwner(dataFiles, { kind: 'chat', ownerId: oldOwner });
assert(owned.length === 2 && owned.includes(oldA) && owned.includes(oldB), 'Owner-qualified key enumeration included the wrong owner/group or missed a live chat');
const pairs = characterOwnerRenamePairs(dataFiles, oldOwner, newOwner);
assert(pairs.length === 2, 'Character owner rename did not map every live owned chat');
assert(pairs.some(pair => pair.oldKey === oldA && pair.newKey === buildQualifiedChatKey('chat', newOwner, 'chat-a')), 'Character rename pair did not preserve chat-a identity');
assert(pairs.some(pair => pair.oldKey === oldB && pair.newKey === buildQualifiedChatKey('chat', newOwner, 'chat-b')), 'Character rename pair did not preserve chat-b identity');
assert(!pairs.some(pair => pair.oldKey === other || pair.oldKey === group), 'Character rename touched another owner or group namespace');

const indexSource = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
assert(indexSource.includes('events.CHARACTER_RENAMED'), 'CHARACTER_RENAMED lifecycle event is not registered');
assert(indexSource.includes('events.CHARACTER_DELETED'), 'CHARACTER_DELETED lifecycle event is not registered');
assert(indexSource.includes('handleCharacterRenameLifecycle(oldAvatar, newAvatar)'), 'Character rename handler does not use owner avatar pair');
assert(indexSource.includes('qualifiedChatKeysForOwner(getSettings().dataFiles'), 'Character deletion does not enumerate the exact owner namespace');
assert(indexSource.includes("runBoundedLifecycleEvent('character owner rename migration'"), 'Character rename is not time-bounded');

// 4B: only transient transport/status failures retry. Logical conflicts remain fail-closed.
assert(TRANSIENT_WRITE_RETRY_DELAYS.join(',') === '1000,2000,5000', 'Transient retry schedule changed unexpectedly');
for (const status of [408, 425, 429, 500, 502, 503, 504]) assert(isTransientPersistenceStatus(status), 'Expected transient status was not retryable: ' + status);
for (const status of [400, 401, 403, 404, 409, 422]) assert(!isTransientPersistenceStatus(status), 'Non-transient status was incorrectly retryable: ' + status);

const retryState = createEmptyState('chat:avatar:retry');
let retryCalls = 0;
const transientThenSuccess = async (url, init = {}) => {
    retryCalls += 1;
    assert(url === '/api/files/upload' && init.method === 'POST', 'Unexpected persistence request in transient retry test');
    if (retryCalls === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => ({ path: '/fake/retry.json' }) };
};
const retried = await writeV3Sidecar({
    chatKey: retryState.chatKey,
    state: retryState,
    fetchFn: transientThenSuccess,
    headers: {},
    retryDelays: [0],
});
assert(retryCalls === 2, 'Transient write did not retry exactly once before succeeding');
assert(retried.pointer?.path === '/fake/retry.json', 'Transient retry did not return successful pointer');

let badCalls = 0;
let badError = null;
try {
    await writeV3Sidecar({
        chatKey: 'chat:avatar:bad',
        state: createEmptyState('chat:avatar:bad'),
        fetchFn: async () => { badCalls += 1; return { ok: false, status: 400 }; },
        retryDelays: [0, 0, 0],
    });
} catch (error) { badError = error; }
assert(badError && badCalls === 1, 'Non-transient HTTP failure was retried');

const conflictKey = 'chat:avatar:conflict';
const conflictState = createEmptyState(conflictKey);
let conflictCalls = 0;
let conflictError = null;
try {
    await writeV3Sidecar({
        chatKey: conflictKey,
        state: conflictState,
        pointer: { name: 'conflict.json', path: '/fake/conflict.json', revision: 0 },
        fetchFn: async (url, init = {}) => {
            conflictCalls += 1;
            assert(init.method === 'GET', 'Revision conflict reached a mutation/retry request');
            return { ok: true, status: 200, text: async () => encodeV3Payload(conflictKey, conflictState, 1) };
        },
        retryDelays: [0, 0, 0],
    });
} catch (error) { conflictError = error; }
assert(conflictError?.code === 'NPC_STATE_V04_BETA_WRITE_CONFLICT', 'Revision mismatch did not fail with the logical conflict code');
assert(conflictCalls === 1, 'Logical revision conflict was retried as a transient transport failure');

const storageSource = fs.readFileSync(new URL('../v03/storage.js', import.meta.url), 'utf8');
assert(storageSource.includes("label: 'NPC State beta sidecar retirement', retryDelays"), 'Retirement mutation does not use transient retry helper');
assert(storageSource.includes("label: 'NPC State beta sidecar deletion', retryDelays"), 'Deletion mutation does not use transient retry helper');

// 4C: count bounds remain, with serialized UTF-8 pressure pruning oldest snapshots first.
assert(CHECKPOINT_BYTE_LIMIT === 4 * 1024 * 1024, 'Production checkpoint byte ceiling is not 4 MiB');
const pressureState = {
    branchBase: { createdAt: 0, lineage: ['root'], snapshot: { seed: 'small' } },
    checkpoints: [
        { messageId: 1, createdAt: 1, lineage: ['a'], snapshot: { payload: 'a'.repeat(40000) } },
        { messageId: 2, createdAt: 2, lineage: ['b'], snapshot: { payload: 'b'.repeat(40000) } },
        { messageId: 3, createdAt: 3, lineage: ['c'], snapshot: { payload: 'c'.repeat(40000) } },
    ],
};
const beforeBytes = checkpointStorageBytes(pressureState);
pruneCheckpointPressure(pressureState, 64 * 1024);
const afterBytes = checkpointStorageBytes(pressureState);
assert(beforeBytes > 64 * 1024, 'Pressure fixture did not exceed the byte ceiling');
assert(afterBytes < beforeBytes, 'Checkpoint byte pressure did not reduce serialized history');
assert(pressureState.checkpoints.length === 1, 'Byte pressure did not prune to the bounded recent snapshot set');
assert(pressureState.checkpoints[0].createdAt === 3, 'Byte pressure evicted the newest checkpoint instead of the oldest');
const branchesSource = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
assert(branchesSource.includes('pruneCheckpointPressure(next);'), 'recordCheckpoint does not invoke byte-pressure pruning');
assert(branchesSource.includes('next.checkpoints.length > CHECKPOINT_LIMIT'), 'Existing global checkpoint count bound disappeared');
assert(branchesSource.includes('const siblingLimit = 4'), 'Existing sibling checkpoint count bound disappeared');

console.log('NPC State 0.4.3 Phase 4 persistence hardening verification passed');

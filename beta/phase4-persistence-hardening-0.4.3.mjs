import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing Phase 4 marker: ' + label);
    return source.replace(from, to);
}

// 4A: owner-qualified character lifecycle helpers.
let identity = fs.readFileSync('v03/identity.js', 'utf8');
identity += `

export function qualifiedChatKeysForOwner(dataFiles = {}, { kind = 'chat', ownerId = '' } = {}) {
    const type = kind === 'group' ? 'group' : 'chat';
    const owner = String(ownerId || '').trim();
    if (!owner) return [];
    return Object.keys(dataFiles || {}).filter(key => {
        const parsed = parseQualifiedChatKey(key);
        return parsed?.kind === type && parsed.ownerId === owner && Boolean(dataFiles?.[key]?.path);
    }).sort();
}

export function characterOwnerRenamePairs(dataFiles = {}, oldOwnerId = '', newOwnerId = '') {
    const oldOwner = String(oldOwnerId || '').trim();
    const newOwner = String(newOwnerId || '').trim();
    if (!oldOwner || !newOwner || oldOwner === newOwner) return [];
    return qualifiedChatKeysForOwner(dataFiles, { kind: 'chat', ownerId: oldOwner }).map(oldKey => {
        const parsed = parseQualifiedChatKey(oldKey);
        const newKey = parsed ? buildQualifiedChatKey('chat', newOwner, parsed.chatId) : '';
        return { oldKey, newKey, chatId: parsed?.chatId || '', oldOwnerId: oldOwner, newOwnerId: newOwner };
    }).filter(pair => pair.newKey && pair.newKey !== pair.oldKey);
}
`;
fs.writeFileSync('v03/identity.js', identity);

let index = fs.readFileSync('v03/index.js', 'utf8');
index = replaceRequired(
    index,
    "import { getChatIdentity, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from './identity.js';",
    "import { characterOwnerRenamePairs, getChatIdentity, qualifiedChatKeysForOwner, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from './identity.js';",
    'identity imports',
);
index = replaceRequired(
    index,
`async function handleChatDeleteLifecycle(chatId, kind = 'chat') {
    const key = resolveLifecycleChatKey(getSettings().dataFiles, { kind, ownerId: '', chatId });
    if (!key) {
        console.info('[NPC State Beta] Ignoring chat deletion without a unique owner-qualified beta source.', { kind, chatId });
        return { ok: false, reason: 'unresolved-owner' };
    }
    const result = await engine.deleteChatKey(key);
    if (result?.ok && activeChatKey === key) activeChatKey = 'no-chat';
    refreshSurfaces();
    return result;
}
`,
`async function handleChatDeleteLifecycle(chatId, kind = 'chat') {
    const key = resolveLifecycleChatKey(getSettings().dataFiles, { kind, ownerId: '', chatId });
    if (!key) {
        console.info('[NPC State Beta] Ignoring chat deletion without a unique owner-qualified beta source.', { kind, chatId });
        return { ok: false, reason: 'unresolved-owner' };
    }
    const result = await engine.deleteChatKey(key);
    if (result?.ok && activeChatKey === key) activeChatKey = 'no-chat';
    refreshSurfaces();
    return result;
}

async function handleCharacterRenameLifecycle(oldAvatar, newAvatar) {
    const pairs = characterOwnerRenamePairs(getSettings().dataFiles, oldAvatar, newAvatar);
    if (!pairs.length) return { ok: true, moved: 0, failures: [] };
    const failures = [];
    let moved = 0;
    for (const pair of pairs) {
        try {
            const result = await engine.renameChatKey(pair.oldKey, pair.newKey);
            if (result?.ok) {
                moved += 1;
                if (activeChatKey === pair.oldKey) activeChatKey = pair.newKey;
            } else failures.push({ oldKey: pair.oldKey, newKey: pair.newKey, reason: result?.reason || 'rename-rejected' });
        } catch (error) {
            failures.push({ oldKey: pair.oldKey, newKey: pair.newKey, reason: error?.code || error?.message || 'rename-failed' });
        }
    }
    refreshSurfaces();
    if (failures.length) console.warn('[NPC State Beta] Character-owner rename migrated the safe chats and preserved failed sources for retry.', failures);
    return { ok: failures.length === 0, moved, failures };
}

async function handleCharacterDeleteLifecycle(eventData = {}) {
    const avatar = String(eventData?.character?.avatar || eventData?.avatar || (typeof eventData === 'string' ? eventData : '') || '').trim();
    if (!avatar) return { ok: false, reason: 'missing-owner' };
    const keys = qualifiedChatKeysForOwner(getSettings().dataFiles, { kind: 'chat', ownerId: avatar });
    const failures = [];
    let retired = 0;
    for (const key of keys) {
        try {
            const result = await engine.deleteChatKey(key);
            if (result?.ok) {
                retired += 1;
                if (activeChatKey === key) activeChatKey = 'no-chat';
            } else failures.push({ key, reason: result?.reason || 'delete-rejected' });
        } catch (error) {
            failures.push({ key, reason: error?.code || error?.message || 'delete-failed' });
        }
    }
    refreshSurfaces();
    if (failures.length) console.warn('[NPC State Beta] Character deletion retired the safe chats and preserved failed sources for retry.', failures);
    return { ok: failures.length === 0, retired, failures };
}
`,
    'character lifecycle handlers',
);
index = replaceRequired(
    index,
`    if (events.GROUP_CHAT_DELETED) source.on(events.GROUP_CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('group chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'group')));

    for (const event of [events.CHARACTER_MESSAGE_RENDERED, events.MESSAGE_UPDATED, events.MORE_MESSAGES_LOADED].filter(Boolean)) {
`,
`    if (events.GROUP_CHAT_DELETED) source.on(events.GROUP_CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('group chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'group')));
    // SillyTavern exposes the owner avatar pair on CHARACTER_RENAMED and the deleted
    // character/avatar payload on CHARACTER_DELETED. These events are owner-authoritative,
    // unlike filename-only CHAT_DELETED, so every beta sidecar in that character namespace
    // can be migrated/retired without borrowing the currently open chat as evidence.
    if (events.CHARACTER_RENAMED) source.on(events.CHARACTER_RENAMED, (oldAvatar, newAvatar) =>
        runBoundedLifecycleEvent('character owner rename migration', () => handleCharacterRenameLifecycle(oldAvatar, newAvatar), 20000));
    if (events.CHARACTER_DELETED) source.on(events.CHARACTER_DELETED, data =>
        runBoundedLifecycleEvent('character owner deletion retirement', () => handleCharacterDeleteLifecycle(data), 20000));

    for (const event of [events.CHARACTER_MESSAGE_RENDERED, events.MESSAGE_UPDATED, events.MORE_MESSAGES_LOADED].filter(Boolean)) {
`,
    'character lifecycle event registration',
);
fs.writeFileSync('v03/index.js', index);

// 4B: retry transient persistence transport failures, never logical revision conflicts.
let storage = fs.readFileSync('v03/storage.js', 'utf8');
storage = replaceRequired(
    storage,
`function wait(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))); }
`,
`function wait(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))); }

export const TRANSIENT_WRITE_RETRY_DELAYS = Object.freeze([1000, 2000, 5000]);
export function isTransientPersistenceStatus(status) {
    return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function fetchPersistenceMutation(fetchFn, url, init, { label = 'persistence mutation', retryDelays = TRANSIENT_WRITE_RETRY_DELAYS } = {}) {
    const delays = Array.isArray(retryDelays) ? retryDelays.map(value => Math.max(0, Number(value) || 0)).slice(0, 6) : [...TRANSIENT_WRITE_RETRY_DELAYS];
    let lastError = null;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        try {
            const response = await fetchFn(url, init);
            if (response?.ok || !isTransientPersistenceStatus(response?.status) || attempt >= delays.length) return response;
            lastError = new Error(label + ' received transient HTTP ' + response.status + '.');
            lastError.status = Number(response.status);
        } catch (error) {
            lastError = error;
            // Transport/network failures have no HTTP status and are retryable. Explicit
            // conflict/retired/missing-sidecar errors are raised before this helper and are
            // therefore never placed on the retry path.
            if (attempt >= delays.length) throw error;
        }
        if (attempt < delays.length) await wait(delays[attempt]);
    }
    throw lastError || new Error(label + ' failed.');
}
`,
    'transient mutation helper',
);
storage = replaceRequired(
    storage,
`export async function writeV3Sidecar({ chatKey, state, pointer = null, fetchFn = globalThis.fetch, headers = {} }) {
`,
`export async function writeV3Sidecar({ chatKey, state, pointer = null, fetchFn = globalThis.fetch, headers = {}, retryDelays = TRANSIENT_WRITE_RETRY_DELAYS }) {
`,
    'write retry option',
);
storage = replaceRequired(
    storage,
`        const response = await fetchFn('/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, data: toBase64(json) }),
        });
`,
`        const response = await fetchPersistenceMutation(fetchFn, '/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, data: toBase64(json) }),
        }, { label: 'NPC State beta sidecar write', retryDelays });
`,
    'write mutation retry',
);
storage = replaceRequired(
    storage,
`export async function retireV3Sidecar({ chatKey, pointer, reason = 'retired', redirectChatKey = '', fetchFn = globalThis.fetch, headers = {} }) {
`,
`export async function retireV3Sidecar({ chatKey, pointer, reason = 'retired', redirectChatKey = '', fetchFn = globalThis.fetch, headers = {}, retryDelays = TRANSIENT_WRITE_RETRY_DELAYS }) {
`,
    'retire retry option',
);
storage = replaceRequired(
    storage,
`        const response = await fetchFn('/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: pointer.name || makeV3FileName(chatKey), data: toBase64(json) }),
        });
`,
`        const response = await fetchPersistenceMutation(fetchFn, '/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: pointer.name || makeV3FileName(chatKey), data: toBase64(json) }),
        }, { label: 'NPC State beta sidecar retirement', retryDelays });
`,
    'retirement mutation retry',
);
storage = replaceRequired(
    storage,
`export async function deleteV3SidecarFile(pointer, { fetchFn = globalThis.fetch, headers = {} } = {}) {
`,
`export async function deleteV3SidecarFile(pointer, { fetchFn = globalThis.fetch, headers = {}, retryDelays = TRANSIENT_WRITE_RETRY_DELAYS } = {}) {
`,
    'delete retry option',
);
storage = replaceRequired(
    storage,
`    const response = await fetchFn('/api/files/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: pointer.path }),
    });
`,
`    const response = await fetchPersistenceMutation(fetchFn, '/api/files/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: pointer.path }),
    }, { label: 'NPC State beta sidecar deletion', retryDelays });
`,
    'delete mutation retry',
);
fs.writeFileSync('v03/storage.js', storage);

// 4C: retain count bounds and add serialized UTF-8 byte pressure.
let branches = fs.readFileSync('v03/branches.js', 'utf8');
branches = replaceRequired(
    branches,
`import { CHECKPOINT_LIMIT, normalizeState, snapshotForCheckpoint } from './schema.js';
`,
`import { CHECKPOINT_LIMIT, normalizeState, snapshotForCheckpoint } from './schema.js';

export const CHECKPOINT_BYTE_LIMIT = 4 * 1024 * 1024;

function utf8Bytes(value) {
    const text = String(value ?? '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    try { return unescape(encodeURIComponent(text)).length; } catch { return text.length * 2; }
}

export function checkpointStorageBytes(state = {}) {
    try { return utf8Bytes(JSON.stringify({ branchBase: state?.branchBase || null, checkpoints: state?.checkpoints || [] })); }
    catch { return Number.POSITIVE_INFINITY; }
}

export function pruneCheckpointPressure(state, byteLimit = CHECKPOINT_BYTE_LIMIT) {
    const next = state;
    const limit = Math.max(64 * 1024, Number(byteLimit) || CHECKPOINT_BYTE_LIMIT);
    if (!Array.isArray(next?.checkpoints)) return next;
    // Preserve at least the newest exact checkpoint plus the branch base. Oldest sibling/
    // ancestor snapshots yield first when serialized history grows too large.
    while (next.checkpoints.length > 1 && checkpointStorageBytes(next) > limit) {
        let oldest = 0;
        for (let i = 1; i < next.checkpoints.length; i += 1) {
            if (Number(next.checkpoints[i]?.createdAt || 0) < Number(next.checkpoints[oldest]?.createdAt || 0)) oldest = i;
        }
        next.checkpoints.splice(oldest, 1);
    }
    return next;
}
`,
    'checkpoint byte helpers',
);
branches = replaceRequired(
    branches,
`    if (next.checkpoints.length > CHECKPOINT_LIMIT) next.checkpoints.splice(0, next.checkpoints.length - CHECKPOINT_LIMIT);
    next.branchHeadLineage = chatLineage(chat);
`,
`    if (next.checkpoints.length > CHECKPOINT_LIMIT) next.checkpoints.splice(0, next.checkpoints.length - CHECKPOINT_LIMIT);
    pruneCheckpointPressure(next);
    next.branchHeadLineage = chatLineage(chat);
`,
    'checkpoint pressure pruning',
);
fs.writeFileSync('v03/branches.js', branches);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 4 restores owner-wide character lifecycle handling for SillyTavern CHARACTER_RENAMED/CHARACTER_DELETED, adds bounded 1s/2s/5s retries for transient network/408/425/429/5xx sidecar mutations without ever retrying logical revision conflicts, and adds a 4 MiB serialized checkpoint-history pressure ceiling on top of the existing 48-global/4-sibling count limits.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 4 persistence hardening');

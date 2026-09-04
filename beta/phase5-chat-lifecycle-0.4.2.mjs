import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-5 marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Identity helpers: lifecycle resolution never borrows whichever owner happens
// to be active. Missing owner proof is allowed only when the beta pointer map
// itself has exactly one owner-qualified match for that chat id.
// ---------------------------------------------------------------------------
let identity = read('v03/identity.js');
identity += `

export function parseQualifiedChatKey(value) {
    const match = String(value || '').match(/^(chat|group):([^:]+):(.+)$/);
    if (!match) return null;
    try {
        return { kind: match[1], ownerId: decodeURIComponent(match[2]), chatId: decodeURIComponent(match[3]) };
    } catch {
        return null;
    }
}

export function normalizeLifecycleChatId(value) {
    return String(value ?? '').replace(/\\.jsonl$/i, '').trim();
}

export function resolveLifecycleChatKey(dataFiles = {}, { kind = 'chat', ownerId = '', chatId = '' } = {}) {
    const type = kind === 'group' ? 'group' : 'chat';
    const id = normalizeLifecycleChatId(chatId);
    const owner = String(ownerId || '').trim();
    if (!id) return '';
    if (owner) {
        const exact = buildQualifiedChatKey(type, owner, id);
        return dataFiles?.[exact]?.path ? exact : '';
    }
    const matches = Object.keys(dataFiles || {}).filter(key => {
        const parsed = parseQualifiedChatKey(key);
        return parsed?.kind === type && normalizeLifecycleChatId(parsed.chatId) === id && dataFiles?.[key]?.path;
    });
    return matches.length === 1 ? matches[0] : '';
}

export function resolveRenameLifecycleKeys(dataFiles = {}, eventData = {}) {
    const oldId = normalizeLifecycleChatId(eventData?.oldFileName);
    const newId = normalizeLifecycleChatId(eventData?.newFileName);
    if (!oldId || !newId || oldId === newId) return null;
    const groupOwner = eventData?.groupId === undefined || eventData?.groupId === null ? '' : String(eventData.groupId).trim();
    const chatOwner = eventData?.avatarId === undefined || eventData?.avatarId === null ? '' : String(eventData.avatarId).trim();
    const kind = groupOwner ? 'group' : 'chat';
    const ownerId = groupOwner || chatOwner;
    const oldKey = resolveLifecycleChatKey(dataFiles, { kind, ownerId, chatId: oldId });
    if (!oldKey) return null;
    const parsed = parseQualifiedChatKey(oldKey);
    if (!parsed?.ownerId) return null;
    const newKey = buildQualifiedChatKey(kind, parsed.ownerId, newId);
    if (!newKey || newKey === oldKey) return null;
    return { kind, ownerId: parsed.ownerId, oldId, newId, oldKey, newKey };
}
`;
write('v03/identity.js', identity);

// ---------------------------------------------------------------------------
// Storage lifecycle primitives. A source is first retired under its revision
// lock, so a stale tab holding the old token cannot resurrect it. Physical
// deletion happens only after durable destination verification / pointer move.
// ---------------------------------------------------------------------------
let storage = read('v03/storage.js');
storage = replaceRequired(
    storage,
    "export function encodeV3Payload(chatKey, state, revision = 0) {",
    `export function encodeV3RetiredPayload(chatKey, revision = 0, { reason = 'retired', redirectChatKey = '' } = {}) {
    const empty = normalizeState({}, chatKey);
    empty.revision = Math.max(0, Math.trunc(Number(revision) || 0));
    return JSON.stringify({
        format: V3_FILE_FORMAT,
        formatVersion: V3_FILE_FORMAT_VERSION,
        appVersion: NPC_STATE_VERSION,
        chatKey: String(chatKey || ''),
        revision: empty.revision,
        updatedAt: new Date().toISOString(),
        retired: true,
        retireReason: String(reason || 'retired').slice(0, 160),
        redirectChatKey: String(redirectChatKey || ''),
        state: empty,
    }, null, 2);
}

export function encodeV3Payload(chatKey, state, revision = 0) {`,
    'retired payload encoder',
);
storage = replaceRequired(
    storage,
    "    const state = normalizeState(payload.state, payload.chatKey || expectedChatKey);\n    state.revision = Math.max(0, Math.trunc(Number(payload.revision) || state.revision || 0));\n    return { ...payload, revision: state.revision, state };",
    "    const state = normalizeState(payload.state, payload.chatKey || expectedChatKey);\n    state.revision = Math.max(0, Math.trunc(Number(payload.revision) || state.revision || 0));\n    return { ...payload, retired: payload?.retired === true, retireReason: String(payload?.retireReason || ''), redirectChatKey: String(payload?.redirectChatKey || ''), revision: state.revision, state };",
    'retired payload decode',
);
storage = replaceRequired(
    storage,
    "function writeV3PointerHint(chatKey, pointer, storage = globalThis.localStorage) {",
    `export function clearV3PointerHint(chatKey, storage = globalThis.localStorage) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try { storage.removeItem(pointerHintKey(chatKey)); return true; }
    catch { return false; }
}

function writeV3PointerHint(chatKey, pointer, storage = globalThis.localStorage) {`,
    'pointer hint clear',
);
storage = replaceRequired(
    storage,
    "            remoteRevision = remote.revision || 0;\n            if (expected === null)",
    "            if (remote.retired) {\n                const error = new Error('NPC State beta sidecar is retired and cannot accept writes.');\n                error.code = 'NPC_STATE_V04_BETA_RETIRED_SIDECAR';\n                error.redirectChatKey = remote.redirectChatKey || '';\n                throw error;\n            }\n            remoteRevision = remote.revision || 0;\n            if (expected === null)",
    'retired write refusal',
);
storage += `

export async function retireV3Sidecar({ chatKey, pointer, reason = 'retired', redirectChatKey = '', fetchFn = globalThis.fetch, headers = {} }) {
    if (!pointer?.path) return null;
    if (typeof fetchFn !== 'function') throw new Error('fetch() is unavailable for NPC State beta lifecycle persistence.');
    return withWriterLock(chatKey, async () => {
        const remote = await readV3Sidecar({ chatKey, pointer, fetchFn });
        if (!remote) {
            const error = new Error('NPC State beta sidecar disappeared before lifecycle retirement.');
            error.code = 'NPC_STATE_V04_BETA_MISSING_SIDECAR';
            throw error;
        }
        if (remote.retired) return { pointer: { ...pointer, revision: remote.revision, retired: true }, payload: remote };
        const expected = pointer?.revision == null ? null : Math.max(0, Math.trunc(Number(pointer.revision) || 0));
        if (expected === null || Number(remote.revision || 0) !== expected) {
            throw conflict('NPC State beta sidecar changed before lifecycle retirement. Reload/retry from its newest revision.', expected, remote.revision || 0);
        }
        const revision = expected + 1;
        const json = encodeV3RetiredPayload(chatKey, revision, { reason, redirectChatKey });
        const response = await fetchFn('/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: pointer.name || makeV3FileName(chatKey), data: toBase64(json) }),
        });
        if (!response?.ok) throw new Error('NPC State beta sidecar retirement failed with HTTP ' + (response?.status || 'error') + '.');
        const result = await response.json();
        if (!result?.path) throw new Error('NPC State beta sidecar retirement returned no path.');
        const retiredPointer = { name: pointer.name || makeV3FileName(chatKey), path: result.path, revision, updatedAt: Date.now(), retired: true };
        writeV3PointerHint(chatKey, retiredPointer);
        return { pointer: retiredPointer, payload: decodeV3Payload(json, chatKey) };
    });
}

export async function deleteV3SidecarFile(pointer, { fetchFn = globalThis.fetch, headers = {} } = {}) {
    if (!pointer?.path) return false;
    if (typeof fetchFn !== 'function') throw new Error('fetch() is unavailable for NPC State beta lifecycle persistence.');
    const response = await fetchFn('/api/files/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: pointer.path }),
    });
    if (response?.status === 404) return false;
    if (!response?.ok) throw new Error('NPC State beta sidecar delete failed with HTTP ' + (response?.status || 'error') + '.');
    return true;
}
`;
write('v03/storage.js', storage);

// ---------------------------------------------------------------------------
// Engine lifecycle transactions. Rename copies + verifies the newest source,
// then revision-retires the old key before publishing the destination pointer.
// Delete revision-retires first, then removes the pointer. Physical deletion is
// best-effort only after those logical safety steps succeed.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "import { readV3PointerHint, readV3Sidecar, writeV3Sidecar } from './storage.js';",
    "import { clearV3PointerHint, deleteV3SidecarFile, readV3PointerHint, readV3Sidecar, retireV3Sidecar, writeV3Sidecar } from './storage.js';",
    'lifecycle storage imports',
);
engine = replaceRequired(
    engine,
    "    const setPointer = adapters.setPointer || (() => {});\n    const getStablePointer",
    "    const setPointer = adapters.setPointer || (() => {});\n    const deletePointer = adapters.deletePointer || (() => {});\n    const getStablePointer",
    'delete pointer adapter',
);
engine = replaceRequired(
    engine,
    "    async function reconcileBranch({ rescan = false, rebase = false } = {}) {",
    `    async function withLifecycleKeys(keys, task) {
        const ordered = [...new Set((keys || []).filter(Boolean))].sort();
        const enter = async index => index >= ordered.length ? task() : exclusive(ordered[index], () => enter(index + 1));
        return enter(0);
    }

    async function renameChatKey(oldKey, newKey) {
        const sourceKey = String(oldKey || '');
        const targetKey = String(newKey || '');
        if (!sourceKey || !targetKey || sourceKey === targetKey || /-pending:/.test(sourceKey + targetKey)) return { ok: false, reason: 'invalid-lifecycle-key' };
        invalidate(sourceKey);
        invalidate(targetKey);
        return withLifecycleKeys([sourceKey, targetKey], async () => {
            let sourcePointer = getPointer(sourceKey);
            if (!sourcePointer?.path) return { ok: false, reason: 'source-untracked' };
            if (getPointer(targetKey)?.path) return { ok: false, reason: 'destination-exists' };
            let destinationPointer = null;
            let copiedState = null;
            let retiredPointer = null;
            try {
                for (let attempt = 0; attempt < 3; attempt += 1) {
                    const source = await readV3Sidecar({ chatKey: sourceKey, pointer: sourcePointer, fetchFn });
                    if (!source || source.retired) return { ok: false, reason: source?.retired ? 'source-retired' : 'source-missing' };
                    const sourceToken = { ...sourcePointer, revision: source.revision };
                    const nextState = normalizeState(source.state, targetKey);
                    const written = await writeV3Sidecar({ chatKey: targetKey, state: nextState, pointer: destinationPointer, fetchFn, headers: getHeaders() });
                    destinationPointer = written.pointer;
                    copiedState = written.state;
                    const verified = await readV3Sidecar({ chatKey: targetKey, pointer: destinationPointer, fetchFn });
                    if (!verified || verified.retired || verified.revision !== destinationPointer.revision || verified.state.chatKey !== targetKey) {
                        throw new Error('NPC State beta rename destination verification failed.');
                    }
                    try {
                        const retired = await retireV3Sidecar({ chatKey: sourceKey, pointer: sourceToken, reason: 'chat-renamed', redirectChatKey: targetKey, fetchFn, headers: getHeaders() });
                        retiredPointer = retired?.pointer || sourceToken;
                        break;
                    } catch (error) {
                        if (error?.code !== 'NPC_STATE_V04_BETA_WRITE_CONFLICT' || attempt >= 2) throw error;
                        sourcePointer = { ...sourcePointer, revision: Number(error.actualRevision) || sourceToken.revision };
                    }
                }
                if (!retiredPointer || !destinationPointer || !copiedState) throw new Error('NPC State beta rename did not reach a durable retirement boundary.');
                setPointer(targetKey, destinationPointer);
                deletePointer(sourceKey);
                persistSettings();
                cache.delete(sourceKey);
                hydration.delete(sourceKey);
                operationEpoch.delete(sourceKey);
                cache.set(targetKey, copiedState);
                hydration.set(targetKey, { status: 'ready', error: null });
                clearV3PointerHint(sourceKey);
                onStateChanged(targetKey, structuredClone(copiedState));
                try { await deleteV3SidecarFile(retiredPointer, { fetchFn, headers: getHeaders() }); }
                catch (error) { console.warn('[NPC State Beta] Retired rename source could not be physically deleted; it remains logically retired.', error); }
                return { ok: true, oldKey: sourceKey, newKey: targetKey, state: structuredClone(copiedState) };
            } catch (error) {
                if (destinationPointer?.path && !getPointer(targetKey)?.path) {
                    clearV3PointerHint(targetKey);
                    try { await deleteV3SidecarFile(destinationPointer, { fetchFn, headers: getHeaders() }); } catch {}
                }
                throw error;
            }
        });
    }

    async function deleteChatKey(chatKey) {
        const key = String(chatKey || '');
        if (!key || key === 'no-chat' || /-pending:/.test(key)) return { ok: false, reason: 'invalid-lifecycle-key' };
        invalidate(key);
        return exclusive(key, async () => {
            let pointer = getPointer(key);
            if (!pointer?.path) {
                deletePointer(key);
                clearV3PointerHint(key);
                cache.delete(key);
                hydration.delete(key);
                operationEpoch.delete(key);
                persistSettings();
                return { ok: true, missing: true, chatKey: key };
            }
            let retiredPointer = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const source = await readV3Sidecar({ chatKey: key, pointer, fetchFn });
                if (!source) break;
                if (source.retired) { retiredPointer = { ...pointer, revision: source.revision, retired: true }; break; }
                const token = { ...pointer, revision: source.revision };
                try {
                    const retired = await retireV3Sidecar({ chatKey: key, pointer: token, reason: 'chat-deleted', fetchFn, headers: getHeaders() });
                    retiredPointer = retired?.pointer || token;
                    break;
                } catch (error) {
                    if (error?.code !== 'NPC_STATE_V04_BETA_WRITE_CONFLICT' || attempt >= 2) throw error;
                    pointer = { ...pointer, revision: Number(error.actualRevision) || token.revision };
                }
            }
            deletePointer(key);
            clearV3PointerHint(key);
            cache.delete(key);
            hydration.delete(key);
            operationEpoch.delete(key);
            persistSettings();
            if (retiredPointer?.path) {
                try { await deleteV3SidecarFile(retiredPointer, { fetchFn, headers: getHeaders() }); }
                catch (error) { console.warn('[NPC State Beta] Retired deleted-chat sidecar could not be physically removed; it remains logically retired.', error); }
            }
            return { ok: true, chatKey: key };
        });
    }

    async function reconcileBranch({ rescan = false, rebase = false } = {}) {`,
    'engine lifecycle methods',
);
engine = replaceRequired(
    engine,
    "        importBundle,\n        reconcileBranch,\n        invalidate,",
    "        importBundle,\n        reconcileBranch,\n        renameChatKey,\n        deleteChatKey,\n        invalidate,",
    'engine lifecycle exports',
);
write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Index event adapter: narrow known SillyTavern events only. CHAT_DELETED and
// GROUP_CHAT_DELETED carry filenames, so they resolve only a unique owner-qualified
// beta key. CHAT_RENAMED prefers explicit avatarId/groupId and otherwise also
// requires a unique tracked source. No active-owner borrowing.
// ---------------------------------------------------------------------------
let index = read('v03/index.js');
index = replaceRequired(
    index,
    "import { getChatIdentity } from './identity.js';",
    "import { getChatIdentity, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from './identity.js';",
    'lifecycle identity imports',
);
index = replaceRequired(
    index,
    "function setV3Pointer(chatKey, pointer) {\n    getSettings().dataFiles[chatKey] = structuredClone(pointer);\n}\n",
    `function setV3Pointer(chatKey, pointer) {
    getSettings().dataFiles[chatKey] = structuredClone(pointer);
}

function deleteV3Pointer(chatKey) {
    if (!chatKey) return false;
    const files = getSettings().dataFiles || {};
    if (!Object.prototype.hasOwnProperty.call(files, chatKey)) return false;
    delete files[chatKey];
    return true;
}
`,
    'delete pointer function',
);
index = replaceRequired(
    index,
    "    setPointer: setV3Pointer,\n    getStablePointer:",
    "    setPointer: setV3Pointer,\n    deletePointer: deleteV3Pointer,\n    getStablePointer:",
    'delete pointer adapter wire',
);
index = replaceRequired(
    index,
    "function registerEvents() {",
    `function runBoundedLifecycleEvent(label, task, timeoutMs = 8000) {
    let timer = null;
    const work = Promise.resolve().then(task).catch(error => {
        console.error('[NPC State Beta] ' + label + ' failed safely', error);
        notify('error', label + ' failed safely; beta sidecar pointers were not guessed or partially replaced. ' + (error?.message || error));
        return { ok: false, reason: 'lifecycle-error', error };
    });
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve({ ok: false, reason: 'lifecycle-timeout' }), timeoutMs);
    });
    return Promise.race([work, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

async function handleChatRenameLifecycle(eventData = {}) {
    const settings = getSettings();
    const resolved = resolveRenameLifecycleKeys(settings.dataFiles, eventData);
    if (!resolved) {
        console.info('[NPC State Beta] Ignoring chat rename without unique owner-qualified beta source.', eventData);
        return { ok: false, reason: 'unresolved-owner' };
    }
    if (settings.dataFiles?.[resolved.newKey]?.path) {
        console.warn('[NPC State Beta] Refusing chat rename because destination already owns a beta sidecar.', resolved);
        return { ok: false, reason: 'destination-exists' };
    }
    const result = await engine.renameChatKey(resolved.oldKey, resolved.newKey);
    if (result?.ok && activeChatKey === resolved.oldKey) activeChatKey = resolved.newKey;
    refreshSurfaces();
    return result;
}

async function handleChatDeleteLifecycle(chatId, kind = 'chat') {
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

function registerEvents() {`,
    'lifecycle handler helpers',
);
index = replaceRequired(
    index,
    "    if (events.MESSAGE_SWIPE_DELETED) source.on(events.MESSAGE_SWIPE_DELETED, messageId => {\n        void settledBranchReconcile({ reason: 'swipe-deleted', messageId, preferStoredPayload: true });\n    });\n\n    for (const event of [events.CHARACTER_MESSAGE_RENDERED",
    `    if (events.MESSAGE_SWIPE_DELETED) source.on(events.MESSAGE_SWIPE_DELETED, messageId => {
        void settledBranchReconcile({ reason: 'swipe-deleted', messageId, preferStoredPayload: true });
    });

    if (events.CHAT_RENAMED) source.on(events.CHAT_RENAMED, eventData =>
        runBoundedLifecycleEvent('chat rename migration', () => handleChatRenameLifecycle(eventData || {})));
    if (events.CHAT_DELETED) source.on(events.CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'chat')));
    if (events.GROUP_CHAT_DELETED) source.on(events.GROUP_CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('group chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'group')));

    for (const event of [events.CHARACTER_MESSAGE_RENDERED`,
    'lifecycle event registration',
);
write('v03/index.js', index);

let changelog = read('CHANGELOG.md');
const line = '- Phase 5 restores owner-safe chat lifecycle hardening for CHAT_RENAMED, CHAT_DELETED, and GROUP_CHAT_DELETED. Rename copies and verifies the destination sidecar, revision-retires the source before pointer publication, and only then removes the retired file; deletion likewise retires before pointer removal. Filename-only delete events act only on a unique owner-qualified beta pointer, ambiguous same-name chats fail closed, no active owner is borrowed, stale-tab writes to retired sources are rejected, and lifecycle handlers are time-bounded so SillyTavern event delivery cannot hang indefinitely.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase-5 changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 5 chat lifecycle hardening');

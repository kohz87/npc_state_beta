import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { buildQualifiedChatKey, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from '../v03/identity.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { readV3Sidecar, writeV3Sidecar } from '../v03/storage.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

function response(status, body = '') {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => String(body),
        json: async () => typeof body === 'string' ? JSON.parse(body || '{}') : body,
    };
}

function makeFileServer() {
    const files = new Map();
    const calls = [];
    const fetchFn = async (url, options = {}) => {
        const target = String(url);
        calls.push({ url: target, method: options.method || 'GET' });
        if (target === '/api/files/upload') {
            const body = JSON.parse(String(options.body || '{}'));
            const path = '/user/files/' + body.name;
            files.set(path, Buffer.from(String(body.data || ''), 'base64').toString('utf8'));
            return response(200, { path });
        }
        if (target === '/api/files/delete') {
            const body = JSON.parse(String(options.body || '{}'));
            const existed = files.delete(String(body.path || ''));
            return response(existed ? 200 : 404, {});
        }
        if ((options.method || 'GET') === 'GET') {
            return files.has(target) ? response(200, files.get(target)) : response(404, '');
        }
        return response(400, '');
    };
    return { files, calls, fetchFn };
}

async function seed(server, pointers, chatKey, label = 'Mira') {
    const state = createEmptyState(chatKey);
    state.npcs = [normalizeNpc({ id: 'npc-' + label.toLowerCase(), name: label, personality: 'Patient.' })];
    const written = await writeV3Sidecar({ chatKey, state, pointer: null, fetchFn: server.fetchFn, headers: {} });
    pointers[chatKey] = written.pointer;
    return written;
}

function makeEngine(server, pointers, currentKeyRef) {
    const ctx = { chat: [], generateRaw: async () => '{}' };
    return createNpcStateEngine({
        getContext: () => ctx,
        getChatKey: () => currentKeyRef.value,
        getSettings: () => ({ relationshipCaps: {}, dossierLimits: {}, staleManagementEnabled: false }),
        getPointer: key => pointers[key] || null,
        setPointer: (key, pointer) => { pointers[key] = structuredClone(pointer); },
        deletePointer: key => { delete pointers[key]; },
        getStablePointer: () => null,
        persistSettings: () => {},
        getHeaders: () => ({}),
        fetchFn: server.fetchFn,
        generate: async () => '{}',
        onStateChanged: () => {},
        notify: () => {},
    });
}

// Owner-qualified resolution: explicit owner wins, filename-only events act only when unique.
{
    const a = buildQualifiedChatKey('chat', 'avatar-a.png', 'same-name');
    const b = buildQualifiedChatKey('chat', 'avatar-b.png', 'same-name');
    const group = buildQualifiedChatKey('group', 'group-7', 'same-name');
    const files = { [a]: { path: '/a' }, [b]: { path: '/b' }, [group]: { path: '/g' } };
    assert(resolveLifecycleChatKey(files, { kind: 'chat', ownerId: 'avatar-a.png', chatId: 'same-name.jsonl' }) === a, 'Explicit owner did not resolve exact chat key');
    assert(resolveLifecycleChatKey(files, { kind: 'chat', chatId: 'same-name' }) === '', 'Ambiguous filename-only chat deletion did not fail closed');
    assert(resolveLifecycleChatKey({ [a]: files[a], [group]: files[group] }, { kind: 'chat', chatId: 'same-name' }) === a, 'Unique filename-only chat did not resolve safely');
    assert(resolveLifecycleChatKey(files, { kind: 'group', chatId: 'same-name' }) === group, 'Group deletion did not stay in the group namespace');

    const renamed = resolveRenameLifecycleKeys(files, { avatarId: 'avatar-a.png', oldFileName: 'same-name.jsonl', newFileName: 'renamed.jsonl' });
    assert(renamed?.oldKey === a && renamed?.newKey === buildQualifiedChatKey('chat', 'avatar-a.png', 'renamed'), 'CHAT_RENAMED explicit-owner resolution is wrong');
    assert(resolveRenameLifecycleKeys(files, { oldFileName: 'same-name', newFileName: 'renamed' }) === null, 'Ownerless ambiguous rename did not fail closed');
}

// Rename is transactional: destination exists and verifies before source retirement/pointer move.
{
    const server = makeFileServer();
    const pointers = {};
    const oldKey = buildQualifiedChatKey('chat', 'avatar-a.png', 'old-chat');
    const newKey = buildQualifiedChatKey('chat', 'avatar-a.png', 'new-chat');
    const seeded = await seed(server, pointers, oldKey, 'Mira');
    const staleOldPointer = structuredClone(seeded.pointer);
    const ref = { value: oldKey };
    const engine = makeEngine(server, pointers, ref);
    const result = await engine.renameChatKey(oldKey, newKey);
    assert(result.ok === true, 'Chat rename transaction did not succeed');
    assert(!pointers[oldKey] && pointers[newKey]?.path, 'Chat rename did not atomically move beta pointer ownership');
    const moved = await readV3Sidecar({ chatKey: newKey, pointer: pointers[newKey], fetchFn: server.fetchFn });
    assert(moved?.state?.npcs?.some(item => item.name === 'Mira'), 'Renamed sidecar lost dossier state');
    assert(moved.state.chatKey === newKey, 'Renamed sidecar retained old chat key');
    assert(!server.files.has(staleOldPointer.path), 'Retired rename source was not physically removed after destination verification');

    let staleWriteBlocked = false;
    try {
        await writeV3Sidecar({ chatKey: oldKey, state: createEmptyState(oldKey), pointer: staleOldPointer, fetchFn: server.fetchFn, headers: {} });
    } catch (error) {
        staleWriteBlocked = ['NPC_STATE_V04_BETA_MISSING_SIDECAR', 'NPC_STATE_V04_BETA_RETIRED_SIDECAR', 'NPC_STATE_V04_BETA_WRITE_CONFLICT'].includes(error?.code);
    }
    assert(staleWriteBlocked, 'A stale tab could write the retired/removed rename source');
}

// Destination collision fails closed and does not retire either side.
{
    const server = makeFileServer();
    const pointers = {};
    const oldKey = buildQualifiedChatKey('chat', 'avatar-a.png', 'old');
    const newKey = buildQualifiedChatKey('chat', 'avatar-a.png', 'new');
    await seed(server, pointers, oldKey, 'OldNpc');
    await seed(server, pointers, newKey, 'NewNpc');
    const oldPath = pointers[oldKey].path;
    const newPath = pointers[newKey].path;
    const engine = makeEngine(server, pointers, { value: oldKey });
    const result = await engine.renameChatKey(oldKey, newKey);
    assert(result.ok === false && result.reason === 'destination-exists', 'Rename destination collision was not rejected');
    assert(pointers[oldKey]?.path === oldPath && pointers[newKey]?.path === newPath, 'Rejected rename mutated pointer ownership');
    assert(server.files.has(oldPath) && server.files.has(newPath), 'Rejected rename physically removed durable data');
}

// Delete retires before pointer removal and then removes the retired physical file.
{
    const server = makeFileServer();
    const pointers = {};
    const key = buildQualifiedChatKey('chat', 'avatar-a.png', 'delete-me');
    const seeded = await seed(server, pointers, key, 'DeleteMe');
    const stalePointer = structuredClone(seeded.pointer);
    const engine = makeEngine(server, pointers, { value: key });
    const result = await engine.deleteChatKey(key);
    assert(result.ok === true, 'Chat delete lifecycle did not succeed');
    assert(!pointers[key], 'Chat delete left beta pointer live');
    assert(!server.files.has(stalePointer.path), 'Deleted chat sidecar remained physically live');
    let blocked = false;
    try {
        await writeV3Sidecar({ chatKey: key, state: createEmptyState(key), pointer: stalePointer, fetchFn: server.fetchFn, headers: {} });
    } catch (error) {
        blocked = Boolean(error?.code);
    }
    assert(blocked, 'Stale deleted-chat pointer could recreate state');
}

// Runtime wiring uses only known SillyTavern lifecycle events and a bounded handler.
{
    const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    const storage = fs.readFileSync(new URL('../v03/storage.js', import.meta.url), 'utf8');
    const identity = fs.readFileSync(new URL('../v03/identity.js', import.meta.url), 'utf8');
    assert(index.includes('events.CHAT_RENAMED') && index.includes('events.CHAT_DELETED') && index.includes('events.GROUP_CHAT_DELETED'), 'Known chat lifecycle events are not registered');
    assert(index.includes('runBoundedLifecycleEvent'), 'Lifecycle event handler is not time-bounded');
    assert(!index.includes('getCharacterOwnerId(getContext())'), 'Lifecycle code borrowed the currently active character as owner proof');
    assert(engine.includes('renameChatKey') && engine.includes('deleteChatKey'), 'Engine lifecycle transaction methods missing');
    assert(engine.includes("error.code = 'NPC_STATE_V04_BETA_RETIRED_SIDECAR'"), 'Retired sidecar hydration does not fail closed');
    assert(storage.includes('retireV3Sidecar') && storage.includes("'/api/files/delete'"), 'Storage retirement/delete primitives missing');
    assert(identity.includes('matches.length === 1 ? matches[0]'), 'Ambiguous filename-only lifecycle resolution is not fail-closed');
}

console.log('NPC State 0.4.2 phase 5 chat lifecycle verification passed');

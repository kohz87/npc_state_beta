import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bestCheckpoint, ensureBranchBase, fingerprintMessage } from '../v03/branches.js';
import { createNpcStateEngine } from '../v03/engine.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { encodeV3Payload } from '../v03/storage.js';

const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const scannerSource = fs.readFileSync('v03/scanner.js', 'utf8');
assert(scannerSource.includes('POST-RESPONSE DOSSIER COMPLETENESS PASS'), 'Completeness prompt contract missing');
assert(scannerSource.includes('supplementalPass !== true && presentIds.includes'), 'Completeness must not increment seen counters');
assert(scannerSource.includes('PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE') && scannerSource.includes('normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Completeness and ordinary scans must share durable memory merge semantics');
assert(engineSource.includes('preservePresence: true'), 'Completeness must preserve committed presence');
assert(engineSource.includes('preserveObservation: true'), 'Completeness must preserve committed observation');
assert(engineSource.includes('applyRelationship: false'), 'Completeness must hard-disable relationship scoring');
assert(engineSource.includes('completenessGeneration(chatKey) !== startCompletenessGeneration'), 'Completeness must reject newer incompatible work');
assert(engineSource.includes('liveSwipeId !== startSwipeId'), 'Completeness must bind active swipe identity');
assert(engineSource.includes('fingerprintMessage(liveMessage) !== startFingerprint'), 'Completeness must bind source content identity');

const EMPTY_SCAN = Object.freeze({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });
function settings(overrides = {}) { return {
    enabled: true, autoScan: true, scanAfterEachResponse: true, scanDepth: 8, scannerResponseTokens: 7000,
    scanConnectionProfileId: '', newNpcAdmissionMode: 'balanced', relationshipCriteria: '',
    relationshipCaps: { ordinary: 1, meaningful: 2, major: 5, extreme: 10 }, relationshipHistoryLimit: 8,
    memoryCriteria: '', dossierLimits: { memories: 8, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 },
    birthdayFillMode: 'off', birthdayRandomCalendar: '', birthdayRandomDaysPerMonth: 30,
    staleManagementEnabled: true, staleArchiveAfter: 1, staleDeleteAfter: 2, branchRescan: true, ...overrides,
}; }
function response(status, body = '') { return { ok: status >= 200 && status < 300, status, async text() { return String(body); }, async json() { return typeof body === 'string' ? JSON.parse(body || '{}') : body; } }; }
function makeServer() {
    const pointers = new Map(); const files = new Map(); const uploads = []; let uploadId = 0;
    const fetchFn = async (url, init = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'GET') return files.has(url) ? response(200, files.get(url)) : response(404, '');
        if (url === '/api/files/upload' && method === 'POST') {
            const body = JSON.parse(String(init.body || '{}'));
            const text = Buffer.from(String(body.data || ''), 'base64').toString('utf8');
            const path = '/uploaded/' + (++uploadId) + '/' + String(body.name || 'npc.json');
            files.set(path, text); uploads.push({ path, text }); return response(200, { path });
        }
        if (method === 'DELETE') { files.delete(url); return response(200, {}); }
        throw new Error('Unexpected fake fetch: ' + method + ' ' + url);
    };
    return { pointers, files, uploads, fetchFn };
}
function seed(server, chatKey, state, revision = 3) {
    const pointer = { name: chatKey + '.json', path: '/seed/' + chatKey + '.json', revision, updatedAt: 1 };
    server.pointers.set(chatKey, structuredClone(pointer));
    server.files.set(pointer.path, encodeV3Payload(chatKey, state, revision));
}
function makeEngine({ server, active, chats, generate, resolveGenerationRoute = () => ({ kind: 'current' }), getSettings = () => settings() }) {
    return createNpcStateEngine({
        getContext: () => ({ chat: chats.get(active.key) || [] }), getChatKey: () => active.key, getSettings,
        getPointer: key => server.pointers.get(key) || null, setPointer: (key, value) => server.pointers.set(key, structuredClone(value)),
        deletePointer: key => server.pointers.delete(key), getStablePointer: () => null, persistSettings: () => {}, getHeaders: () => ({}),
        fetchFn: server.fetchFn, generate, resolveGenerationRoute, notify: () => {}, onStateChanged: () => {}, recoverySessionId: 'phase86-session',
    });
}
function seededState(key, chat) {
    let state = createEmptyState(key); state.turn = 7; state.lastScannedMessageId = 1;
    state.lastObservation = { messageId: 1, exchangeActiveNpcIds: ['npc-mira'], finalPresentNpcIds: ['npc-mira'], worldActiveNpcIds: [], targetNpcIds: ['npc-mira'] };
    state.npcs = [
        normalizeNpc({ id: 'npc-mira', name: 'Mira', role: 'Innkeeper', personality: 'Reserved', behaviorProfile: ['Careful'], memories: ['Existing memory'], seenCount: 4, lastSeenMessageId: 1, lastInteractionMessageId: 1, present: true, relationship: { trust: 5, affection: 1, desire: 0, tension: 0 }, relationshipHistory: [{ sourceMessageId: 1, reason: 'Embedded relationship event', delta: { trust: 1, affection: 0, desire: 0, tension: 0 } }], relationshipEvidenceHistory: [{ sourceMessageId: 1, axis: 'trust', evidence: 'Earlier embedded evidence' }], profileEvolutionEvidence: [{ field: 'personality', mode: 'gradual', concept: 'warmer', evidence: 'Mira smiles warmly at Lucien.', sourceMessageId: 1, turn: 7, at: 1 }], updatedAt: 100 }),
        normalizeNpc({ id: 'npc-stale', name: 'Stale NPC', role: 'Scout', lastActivityTurn: 0, archived: false, updatedAt: 50 }),
    ];
    state = ensureBranchBase(state, chat); state.lastScannedMessageId = 1; state.branchSafety = { status: 'safe', kind: '', reason: '' }; return state;
}
function completenessPayload() { return {
    exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
    npcs: [{ id: 'npc-mira', name: 'Mira', aliases: [], role: 'Innkeeper', personality: 'Warmer and more open', profileChanges: [{ field: 'personality', mode: 'gradual', concept: 'warmer', evidence: 'Mira smiles warmly at Lucien.' }], memories: ['Existing memory', 'New missing memory'], relationshipChange: { evaluated: true, impact: 'extreme', delta: { trust: 10, affection: 10, desire: 0, tension: 0 }, priority: ['trust', 'affection'], axisEvidence: {}, evidence: 'Mira smiles warmly at Lucien.', reason: 'Must be ignored in supplemental mode.' } }],
    socialEdges: [], familyFacts: [], lifeStateUpdates: [],
}; }
function fixture(key = 'phase86-completeness') {
    const server = makeServer(); const active = { key };
    const chat = [{ is_user: true, mes: 'Lucien asks Mira about the cellar route.' }, { is_user: false, mes: 'Mira smiles warmly at Lucien. She says the cellar route is safe and reminds him of her promise.', swipe_id: 0 }];
    const chats = new Map([[key, chat]]); seed(server, key, seededState(key, chat)); return { server, active, chats, chat };
}

{
    const f = fixture('phase86-route-retry'); const route = { kind: 'profile', profileId: 'p', profileName: 'P', profileSignature: 'sig' };
    let routeCalls = 0; const seenRoutes = []; let generateCalls = 0;
    const engine = makeEngine({ ...f, resolveGenerationRoute: () => { routeCalls += 1; return route; }, generate: async options => { seenRoutes.push(options.route); generateCalls += 1; return generateCalls === 1 ? 'malformed' : JSON.stringify(EMPTY_SCAN); } });
    const result = await engine.scan(1, { manual: true, force: true });
    assert.equal(result.ok, true); assert.equal(routeCalls, 1); assert.equal(generateCalls, 2); assert.equal(seenRoutes[0], route); assert.equal(seenRoutes[1], route, 'JSON retry did not reuse the exact captured route object');
}

{
    const f = fixture('phase86-route-failure'); let generateCalls = 0;
    const engine = makeEngine({ ...f, resolveGenerationRoute: () => { const error = new Error('missing profile'); error.code = 'NPC_STATE_SCAN_PROFILE_MISSING'; throw error; }, generate: async () => { generateCalls += 1; return JSON.stringify(EMPTY_SCAN); } });
    await assert.rejects(() => engine.scan(1, { manual: true, force: true }), error => error?.code === 'NPC_STATE_SCAN_PROFILE_MISSING');
    assert.equal(generateCalls, 0); assert.equal(f.server.uploads.length, 0, 'Profile resolution failure partially persisted state');
}

{
    const f = fixture('phase86-completeness-safe'); const engine = makeEngine({ ...f, generate: async () => JSON.stringify(completenessPayload()) });
    const before = await engine.loadChat(f.active.key); const beforeObservation = structuredClone(before.lastObservation);
    const result = await engine.completenessScan(1, { expectedFingerprint: fingerprintMessage(f.chat[1]), expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    const after = engine.getState(f.active.key); const mira = after.npcs.find(npc => npc.id === 'npc-mira'); const stale = after.npcs.find(npc => npc.id === 'npc-stale');
    assert.deepEqual(mira.memories, ['Existing memory', 'New missing memory'], 'Supplemental memory merge duplicated or erased entries');
    assert.deepEqual(mira.relationship, { trust: 5, affection: 1, desire: 0, tension: 0 }, 'Completeness replayed relationship gains');
    assert.equal(mira.relationshipHistory.length, 1); assert.equal(mira.relationshipEvidenceHistory.length, 1);
    assert.equal(mira.personality, 'Reserved', 'Same-message gradual evidence incorrectly satisfied a multi-message progression gate');
    assert.equal(mira.profileEvolutionEvidence.length, 1, 'Same-message progression evidence was counted twice');
    assert.equal(mira.seenCount, 4, 'Completeness counted the same response as another sighting');
    assert.equal(after.turn, 7, 'Completeness advanced narrative turn'); assert.deepEqual(after.lastObservation, beforeObservation, 'Completeness replaced the committed observation');
    assert.equal(stale.archived, false, 'Completeness ran stale lifecycle aging'); assert.equal(after.lastScannedMessageId, 1);
    assert(after.checkpoints.some(checkpoint => checkpoint.messageId === 1 && checkpoint.reason === 'completeness-pass'), 'Completeness did not update the same-message rollback checkpoint');
    const reloader = makeEngine({ ...f, generate: async () => JSON.stringify(EMPTY_SCAN) }); const reloaded = await reloader.loadChat(f.active.key);
    assert(reloaded.npcs.find(npc => npc.id === 'npc-mira').memories.includes('New missing memory'), 'Completeness update did not survive reload');
    const checkpoint = bestCheckpoint(reloaded, f.chat); assert(checkpoint?.snapshot?.npcs?.find(npc => npc.id === 'npc-mira')?.memories?.includes('New missing memory'), 'Branch checkpoint did not retain completeness update');
}

{
    const f = fixture('phase86-manual-wins'); let release; let startedResolve; const started = new Promise(resolve => { startedResolve = resolve; });
    const engine = makeEngine({ ...f, generate: async () => { startedResolve(); await new Promise(resolve => { release = resolve; }); return JSON.stringify(completenessPayload()); } });
    const initial = await engine.loadChat(f.active.key); const expectedUpdatedAt = initial.npcs.find(npc => npc.id === 'npc-mira').updatedAt;
    const pending = engine.completenessScan(1, { expectedSwipeId: 0 }); await started;
    const pendingEdit = engine.updateNpc('npc-mira', { role: 'Manually edited role' }, { expectedUpdatedAt }); release();
    const completion = await pending; assert.equal(completion.discarded, true); assert.equal(completion.reason, 'stale-completeness');
    const edit = await pendingEdit; assert.equal(edit.ok, true); assert.equal(engine.getState(f.active.key).npcs.find(npc => npc.id === 'npc-mira').role, 'Manually edited role');
    assert(!engine.getState(f.active.key).npcs.find(npc => npc.id === 'npc-mira').memories.includes('New missing memory'), 'Discarded slow completeness overwrote newer manual edit');
}

async function staleCase(name, mutateSource) {
    const f = fixture(name); let release; let startedResolve; const started = new Promise(resolve => { startedResolve = resolve; });
    const engine = makeEngine({ ...f, generate: async () => { startedResolve(); await new Promise(resolve => { release = resolve; }); return JSON.stringify(completenessPayload()); } });
    const pending = engine.completenessScan(1, { expectedSwipeId: 0 }); await started; mutateSource(f, engine); release(); const result = await pending;
    assert.equal(result.discarded, true, name + ' did not invalidate slow completeness'); assert.equal(f.server.uploads.length, 0, name + ' persisted a stale completeness result');
}
await staleCase('phase86-source-edit', (f, engine) => { f.chat[1].mes += ' EDITED'; engine.invalidate(f.active.key); });
await staleCase('phase86-source-swipe', f => { f.chat[1].swipe_id = 1; });
await staleCase('phase86-source-delete', (f, engine) => { f.chat.splice(1, 1); engine.invalidate(f.active.key); });
await staleCase('phase86-chat-switch', f => { f.active.key = 'another-chat'; });

assert(engineSource.includes('invalidateCompleteness(chatKey);\n        return exclusive(chatKey'), 'Manual scan/refresh paths must cancel stale completeness work');
assert(engineSource.includes('invalidateCompleteness(chatKey);\n        const chatChanged'), 'Manual mutation request must invalidate running completeness before queueing');
assert(engineSource.includes('startHistoricalRecovery') && engineSource.includes('invalidate(chatKey);'), 'Recovery/reset invalidation contract unexpectedly missing');
console.log('PASS v0.4.42 completeness engine safety');

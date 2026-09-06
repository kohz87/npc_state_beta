import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { chatLineage, ensureBranchBase } from '../v03/branches.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { encodeV3Payload } from '../v03/storage.js';

const schemaSource = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
const MARKER = 'PHASE64_REBASE_STATE_BOUNDARIES';
if (!schemaSource.includes(MARKER)) {
    console.log('NPC State phase64 rebase-state-boundary verification skipped on pre-transform source checkout');
    process.exit(0);
}

const EMPTY_SCAN = Object.freeze({
    exchangeActiveNpcIds: [],
    inChatNpcIds: [],
    worldActiveNpcIds: [],
    npcs: [],
    socialEdges: [],
    familyFacts: [],
});

function settings() {
    return {
        enabled: true,
        autoScan: true,
        scanDepth: 8,
        scannerResponseTokens: 7000,
        newNpcAdmissionMode: 'balanced',
        relationshipCriteria: '',
        relationshipCaps: { ordinary: 1, meaningful: 2, major: 5, extreme: 10 },
        relationshipHistoryLimit: 8,
        memoryCriteria: '',
        dossierLimits: { memories: 5, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 },
        birthdayFillMode: 'off',
        birthdayRandomCalendar: '',
        birthdayRandomDaysPerMonth: 30,
        staleManagementEnabled: true,
        staleArchiveAfter: 30,
        staleDeleteAfter: 50,
        branchRescan: true,
    };
}

function response(status, body = '') {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() { return String(body); },
        async json() { return typeof body === 'string' ? JSON.parse(body || '{}') : body; },
    };
}

function makeServer() {
    const pointers = new Map();
    const files = new Map();
    const uploads = [];
    let uploadId = 0;
    let failUploads = 0;
    let delayedGet = null;
    let delayedGetStartedResolve = null;
    let delayedGetRelease = null;

    const fetchFn = async (url, init = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'GET') {
            if (delayedGet && delayedGet === url) {
                const target = delayedGet;
                delayedGet = null;
                delayedGetStartedResolve?.();
                await new Promise(resolve => { delayedGetRelease = resolve; });
                delayedGetRelease = null;
                return files.has(target) ? response(200, files.get(target)) : response(404, '');
            }
            return files.has(url) ? response(200, files.get(url)) : response(404, '');
        }
        if (url === '/api/files/upload' && method === 'POST') {
            if (failUploads > 0) {
                failUploads -= 1;
                // Use a non-transient response so this test exercises the engine's
                // fail-closed state publication without spending time in storage retries.
                return response(400, 'synthetic sidecar upload failure');
            }
            const body = JSON.parse(String(init.body || '{}'));
            const text = Buffer.from(String(body.data || ''), 'base64').toString('utf8');
            const path = '/uploaded/' + (++uploadId) + '/' + String(body.name || 'npc.json');
            files.set(path, text);
            uploads.push({ path, name: body.name, text });
            return response(200, { path });
        }
        if (method === 'DELETE') {
            files.delete(url);
            return response(200, {});
        }
        throw new Error('Unexpected fake fetch: ' + method + ' ' + url);
    };

    return {
        pointers,
        files,
        uploads,
        fetchFn,
        failNextUpload() { failUploads += 1; },
        delayNextGet(path) {
            let resolveStarted;
            const started = new Promise(resolve => { resolveStarted = resolve; });
            delayedGet = path;
            delayedGetStartedResolve = resolveStarted;
            return started;
        },
        releaseDelayedGet() { delayedGetRelease?.(); },
    };
}

function seed(server, chatKey, state, revision = 3) {
    const pointer = { name: chatKey + '.json', path: '/seed/' + chatKey + '.json', revision, updatedAt: 1 };
    server.pointers.set(chatKey, structuredClone(pointer));
    server.files.set(pointer.path, encodeV3Payload(chatKey, state, revision));
    return pointer;
}

function makeEngine({ server, active, chats, generate, onStateChanged = () => {} }) {
    return createNpcStateEngine({
        getContext: () => ({ chat: chats.get(active.key) || [] }),
        getChatKey: () => active.key,
        getSettings: settings,
        getPointer: key => server.pointers.get(key) || null,
        setPointer: (key, value) => server.pointers.set(key, structuredClone(value)),
        deletePointer: key => server.pointers.delete(key),
        getStablePointer: () => null,
        persistSettings: () => {},
        getHeaders: () => ({}),
        fetchFn: server.fetchFn,
        generate,
        notify: () => {},
        onStateChanged,
        recoverySessionId: 'phase64-session',
    });
}

function baseNpc() {
    return normalizeNpc({
        id: 'npc-clara',
        name: 'Clara',
        role: 'Innkeeper',
        relationship: { trust: 1, affection: 0, desire: 0, tension: 0 },
        relationshipProgress: { trust: 0, affection: 0, desire: 0, tension: 0 },
        relationshipSummary: 'Clara has begun to trust Lucien.',
    });
}

function branchState(chatKey, oldChat) {
    const state = createEmptyState(chatKey);
    state.npcs = [baseNpc()];
    state.lastScannedMessageId = oldChat.length - 1;
    const based = ensureBranchBase(state, oldChat);
    based.branchHeadLineage = chatLineage(oldChat);
    based.branchSafety = { status: 'safe', kind: '', reason: '' };
    based.branchFingerprintVersion = 3;
    return based;
}

const TRUST_QUOTE = 'Clara said, "I trust you."';
function relationshipScan() {
    return {
        exchangeActiveNpcIds: ['npc-clara'],
        inChatNpcIds: ['npc-clara'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-clara',
            name: 'Clara',
            identityKind: 'named',
            aliases: [],
            role: 'Innkeeper',
            species: '',
            activityEvidence: {
                exchangeActive: { excerpts: [TRUST_QUOTE], explanation: 'Clara speaks directly in the current exchange.' },
                inChat: { excerpts: [TRUST_QUOTE], explanation: 'Clara remains the active conversational partner.' },
                worldActive: { excerpts: [], explanation: '' },
            },
            relationshipChange: {
                evaluated: true,
                impact: 'ordinary',
                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
                priority: ['trust'],
                axisEvidence: {
                    trust: { excerpts: [TRUST_QUOTE], explanation: 'Clara explicitly expresses a small new increase in confidence in Lucien.' },
                },
                evidence: TRUST_QUOTE,
                reason: 'A small new increase in trust.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
    };
}

function unsafeChats() {
    return {
        oldChat: [
            { is_user: true, mes: 'Old opening on the western road.' },
            { is_user: false, mes: 'Clara watches Lucien carefully.' },
        ],
        rewrittenChat: [
            { is_user: true, mes: 'Completely rewritten opening at the harbor.' },
            { is_user: false, mes: 'Clara watches Lucien carefully.' },
        ],
    };
}

// Unsafe divergence is published and persisted, so a following scan cannot consult stale
// cached `safe` state and mutate dossiers before the timeline is accepted/repaired.
{
    const { oldChat, rewrittenChat } = unsafeChats();
    const server = makeServer();
    const active = { key: 'v0431-unsafe-published' };
    const chats = new Map([[active.key, rewrittenChat]]);
    seed(server, active.key, branchState(active.key, oldChat));
    let generateCalls = 0;
    const engine = makeEngine({ server, active, chats, generate: async () => { generateCalls += 1; return JSON.stringify(relationshipScan()); } });
    const result = await engine.reconcileBranch();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rebase-required');
    assert.equal(result.unsafeDivergence, true);
    assert.equal(result.persistenceFailed, false);
    assert.equal(engine.getState(active.key).branchSafety.status, 'rebase-required', 'Unsafe state was not published to live cache');
    const blockedScan = await engine.scan(1, { manual: true, force: true });
    assert.equal(blockedScan.reason, 'branch-unsafe', 'Unsafe branch did not block a subsequent scan');
    assert.equal(generateCalls, 0, 'Blocked scan still invoked the model');
}

// Even if persisting the blocked state fails, the live cache stays fail-closed.
{
    const { oldChat, rewrittenChat } = unsafeChats();
    const server = makeServer();
    const active = { key: 'v0431-unsafe-write-failure' };
    const chats = new Map([[active.key, rewrittenChat]]);
    seed(server, active.key, branchState(active.key, oldChat));
    const engine = makeEngine({ server, active, chats, generate: async () => JSON.stringify(relationshipScan()) });
    await engine.loadChat(active.key);
    server.failNextUpload();
    const result = await engine.reconcileBranch();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'rebase-required');
    assert.equal(result.persistenceFailed, true, 'Synthetic blocked-state write failure was not reported');
    assert.equal(engine.getState(active.key).branchSafety.status, 'rebase-required', 'Persistence failure re-enabled the stale safe cache');
    assert.equal((await engine.scan(1, { manual: true, force: true })).reason, 'branch-unsafe');
}

// A rebase queued behind another operation belongs to its origin chat. Switching chats while
// it waits must abort before another chat's context can become the saved baseline.
{
    const server = makeServer();
    const active = { key: 'v0431-queue-a' };
    const chatA = [
        { is_user: true, mes: 'A opening.' },
        { is_user: false, mes: 'A assistant exchange.' },
    ];
    const chatB = [
        { is_user: true, mes: 'B PRIVATE TIMELINE.' },
        { is_user: false, mes: 'B assistant exchange.' },
    ];
    const chats = new Map([[active.key, chatA], ['v0431-queue-b', chatB]]);
    seed(server, active.key, branchState(active.key, chatA));
    let releaseScan;
    let scanStartedResolve;
    const scanStarted = new Promise(resolve => { scanStartedResolve = resolve; });
    const engine = makeEngine({
        server,
        active,
        chats,
        generate: async () => new Promise(resolve => {
            releaseScan = () => resolve(JSON.stringify(EMPTY_SCAN));
            scanStartedResolve();
        }),
    });
    const pendingScan = engine.scan(1, { manual: true, force: true });
    await scanStarted;
    const pendingRebase = engine.reconcileBranch({ rebase: true, rescan: true, relationshipMode: 'preserve' });
    active.key = 'v0431-queue-b';
    releaseScan();
    const scanResult = await pendingScan;
    assert.equal(scanResult.reason, 'stale-operation');
    const rebaseResult = await pendingRebase;
    assert.equal(rebaseResult.reason, 'chat-changed');
    assert.equal(rebaseResult.stage, 'after-queue');
    const stateA = engine.getState('v0431-queue-a');
    assert.equal(stateA.rebaseBackup, null, 'Queued rebase mutated the origin chat after switching away');
    assert.notDeepEqual(stateA.branchHeadLineage, chatLineage(chatB), 'Chat B lineage became chat A baseline');
}

// Preview has the same origin-chat ownership rule across an async hydration boundary.
{
    const server = makeServer();
    const active = { key: 'v0431-preview-a' };
    const chatA = [{ is_user: true, mes: 'Preview A.' }, { is_user: false, mes: 'Preview A assistant.' }];
    const chatB = [{ is_user: true, mes: 'Preview B.' }, { is_user: false, mes: 'Preview B assistant.' }];
    const chats = new Map([[active.key, chatA], ['v0431-preview-b', chatB]]);
    const pointer = seed(server, active.key, branchState(active.key, chatA));
    const getStarted = server.delayNextGet(pointer.path);
    const engine = makeEngine({ server, active, chats, generate: async () => JSON.stringify(EMPTY_SCAN) });
    const pending = engine.previewRebase({ relationshipMode: 'rollback' });
    await getStarted;
    active.key = 'v0431-preview-b';
    server.releaseDelayedGet();
    const result = await pending;
    assert.equal(result.reason, 'chat-changed');
    assert.equal(result.stage, 'preview-after-load');
}

function replayFixture(key) {
    const oldChat = [
        { is_user: true, mes: 'Old branch introduction.' },
        { is_user: false, mes: TRUST_QUOTE },
    ];
    const acceptedChat = [
        { is_user: true, mes: 'Accepted rewritten introduction.' },
        { is_user: false, mes: TRUST_QUOTE },
    ];
    const server = makeServer();
    const active = { key };
    const chats = new Map([[key, acceptedChat]]);
    seed(server, key, branchState(key, oldChat));
    return { server, active, chats, acceptedChat };
}

async function failPreserveRefresh(fixture) {
    let calls = 0;
    const engine = makeEngine({
        ...fixture,
        generate: async () => {
            calls += 1;
            if (calls === 1) throw new Error('synthetic preserve refresh failure');
            return JSON.stringify(relationshipScan());
        },
    });
    await assert.rejects(
        () => engine.reconcileBranch({ rebase: true, rescan: true, relationshipMode: 'preserve' }),
        /synthetic preserve refresh failure/,
    );
    const state = engine.getState(fixture.active.key);
    assert.equal(state.npcs[0].relationship.trust, 1);
    assert.equal(state.lastScannedMessageId, null, 'Divergent preserve rebase unexpectedly retained the old scan marker');
    assert.equal(state.relationshipReplayBoundary?.throughMessageId, 1, 'Accepted relationship replay boundary was not persisted before refresh');
    assert.deepEqual(state.relationshipReplayBoundary?.lineage, chatLineage(fixture.acceptedChat, 1));
    return engine;
}

// Immediate manual retry after a failed preserve refresh cannot award the accepted event again.
// A genuinely new exchange after the boundary can still progress, even with identical dialogue.
{
    const fixture = replayFixture('v0431-replay-immediate');
    const engine = await failPreserveRefresh(fixture);
    const retry = await engine.scan(1, { manual: true, force: true });
    assert.equal(retry.ok, true);
    assert.equal(engine.getState(fixture.active.key).npcs[0].relationship.trust, 1, 'Accepted event was double-awarded after failed refresh');

    fixture.acceptedChat.push(
        { is_user: true, mes: 'Lucien asks again on a later exchange.' },
        { is_user: false, mes: TRUST_QUOTE },
    );
    const newEvent = await engine.scan(3, { manual: true, force: true });
    assert.equal(newEvent.ok, true);
    assert.equal(engine.getState(fixture.active.key).npcs[0].relationship.trust, 2, 'New post-boundary relationship event was incorrectly suppressed');
}

// The accepted relationship boundary survives a full engine reload before the retry.
{
    const fixture = replayFixture('v0431-replay-reload');
    await failPreserveRefresh(fixture);
    const reloaded = makeEngine({ ...fixture, generate: async () => JSON.stringify(relationshipScan()) });
    const loaded = await reloaded.loadChat(fixture.active.key);
    assert.equal(loaded.relationshipReplayBoundary?.throughMessageId, 1, 'Replay boundary disappeared on reload');
    const retry = await reloaded.scan(1, { manual: true, force: true });
    assert.equal(retry.ok, true);
    assert.equal(reloaded.getState(fixture.active.key).npcs[0].relationship.trust, 1, 'Reloaded retry double-awarded the accepted event');
}

// A branch rollback after rebase must keep the durable pre-rebase backup even though checkpoint
// snapshots intentionally omit it.
{
    const fixture = replayFixture('v0431-backup-retention');
    const engine = makeEngine({ ...fixture, generate: async () => JSON.stringify(EMPTY_SCAN) });
    const rebased = await engine.reconcileBranch({ rebase: true, rescan: false, relationshipMode: 'preserve' });
    assert.equal(rebased.ok, true);
    const backupBefore = structuredClone(engine.getState(fixture.active.key).rebaseBackup);
    assert(backupBefore?.snapshot, 'Rebase did not create a backup for rollback-retention test');

    fixture.acceptedChat.push(
        { is_user: true, mes: 'A later exchange that will be removed.' },
        { is_user: false, mes: 'Clara nods and the scene continues.' },
    );
    assert.equal((await engine.scan(3, { manual: true, force: true })).ok, true);
    fixture.acceptedChat.splice(2, 2);
    const rolled = await engine.reconcileBranch({ rescan: false });
    assert.equal(rolled.ok, true);
    assert.equal(rolled.changed, true);
    const backupAfter = engine.getState(fixture.active.key).rebaseBackup;
    assert(backupAfter?.snapshot, 'Checkpoint rollback deleted rebaseBackup');
    assert.equal(backupAfter.createdAt, backupBefore.createdAt);
    assert.equal(backupAfter.relationshipMode, backupBefore.relationshipMode);
    assert.deepEqual(backupAfter.snapshot.npcs[0].relationship, backupBefore.snapshot.npcs[0].relationship);
}

const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
const branchesSource = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
assert(engineSource.includes('relationshipReplayProtected(state, chat = [], messageId = null)'), 'Engine replay-boundary helper missing');
assert(engineSource.includes("reason: 'rebase-required'"), 'Unsafe reconciliation does not publish explicit rebase-required reason');
assert(engineSource.includes("stage: 'preview-after-load'"), 'Preview chat ownership guard missing');
assert(engineSource.includes("chatChanged('after-queue')"), 'Queued rebase chat ownership guard missing');
assert(engineSource.includes('applyRelationship: relationshipApplyRequested && !replayProtectedRelationship'), 'Manual/full scan path is not replay protected');
assert(engineSource.includes('applyRelationship: !relationshipReplayProtected(state, chat, messageId)'), 'Embedded scan path is not replay protected');
assert(branchesSource.includes('restored.rebaseBackup = structuredClone(normalized.rebaseBackup || null)'), 'Checkpoint restore does not retain rebase backup');
assert(branchesSource.includes("next.relationshipReplayBoundary = mode === 'preserve'"), 'Preserve rebase does not establish replay boundary');

console.log('NPC State v0.4.31 phase64 rebase state and operation-boundary hardening verified');

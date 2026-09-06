import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { chatLineage, ensureBranchBase, rebaseToCurrentChat } from '../v03/branches.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { encodeV3Payload } from '../v03/storage.js';

const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
const branchesSource = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
if (!engineSource.includes("chatChanged('mutation-after-queue')") || !branchesSource.includes('retainValidRelationshipReplayBoundary')) {
    console.log('NPC State v0.4.32 operation-context verification skipped on pre-transform source checkout');
    process.exit(0);
}

const EMPTY_SCAN = Object.freeze({
    exchangeActiveNpcIds: [],
    inChatNpcIds: [],
    worldActiveNpcIds: [],
    npcs: [],
    socialEdges: [],
    familyFacts: [],
    lifeStateUpdates: [],
});

function settings() {
    return {
        enabled: true,
        autoScan: true,
        scanDepth: 8,
        scannerResponseTokens: 15000,
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

function makeEngine({ server, active, chats, generate, getSettings = settings }) {
    return createNpcStateEngine({
        getContext: () => ({ chat: chats.get(active.key) || [] }),
        getChatKey: () => active.key,
        getSettings,
        getPointer: key => server.pointers.get(key) || null,
        setPointer: (key, value) => server.pointers.set(key, structuredClone(value)),
        deletePointer: key => server.pointers.delete(key),
        getStablePointer: () => null,
        persistSettings: () => {},
        getHeaders: () => ({}),
        fetchFn: server.fetchFn,
        generate,
        notify: () => {},
        onStateChanged: () => {},
        recoverySessionId: 'phase66-session',
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
        updatedAt: 100,
    });
}

function branchState(chatKey, chat) {
    const state = createEmptyState(chatKey);
    state.npcs = [baseNpc()];
    state.lastScannedMessageId = chat.length - 1;
    const based = ensureBranchBase(state, chat);
    based.branchHeadLineage = chatLineage(chat);
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
        lifeStateUpdates: [],
    };
}

// A manual edit queued behind a scan must remain owned by chat A. Switching to chat B before
// the queue opens aborts the edit instead of checkpointing B's lineage into A.
{
    const server = makeServer();
    const keyA = 'v0432-mutate-queue-a';
    const keyB = 'v0432-mutate-queue-b';
    const active = { key: keyA };
    const chatA = [{ is_user: true, mes: 'A opening.' }, { is_user: false, mes: 'A assistant.' }];
    const chatB = [{ is_user: true, mes: 'B PRIVATE TIMELINE.' }, { is_user: false, mes: 'B assistant.' }];
    const chats = new Map([[keyA, chatA], [keyB, chatB]]);
    const initial = branchState(keyA, chatA);
    seed(server, keyA, initial);

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
    const pendingEdit = engine.updateNpc('npc-clara', { role: 'Edited in A' }, { expectedUpdatedAt: initial.npcs[0].updatedAt });
    active.key = keyB;
    releaseScan();
    assert.equal((await pendingScan).reason, 'stale-operation');
    const edit = await pendingEdit;
    assert.equal(edit.reason, 'chat-changed');
    assert.equal(edit.stage, 'mutation-after-queue');
    const stateA = engine.getState(keyA);
    assert.equal(stateA.npcs[0].role, 'Innkeeper', 'Queued edit mutated chat A after switching to chat B');
    assert.equal(server.uploads.length, 0, 'Queued cross-chat edit persisted a sidecar write');
    assert.notDeepEqual(stateA.branchHeadLineage, chatLineage(chatB), 'Chat B lineage became chat A branch history');
}

// The same ownership rule applies when a mutation switches chats while hydrating its state.
{
    const server = makeServer();
    const keyA = 'v0432-mutate-load-a';
    const keyB = 'v0432-mutate-load-b';
    const active = { key: keyA };
    const chatA = [{ is_user: true, mes: 'Load A.' }, { is_user: false, mes: 'Load A assistant.' }];
    const chatB = [{ is_user: true, mes: 'Load B.' }, { is_user: false, mes: 'Load B assistant.' }];
    const chats = new Map([[keyA, chatA], [keyB, chatB]]);
    const initial = branchState(keyA, chatA);
    const pointer = seed(server, keyA, initial);
    const getStarted = server.delayNextGet(pointer.path);
    const engine = makeEngine({ server, active, chats, generate: async () => JSON.stringify(EMPTY_SCAN) });
    const pending = engine.updateNpc('npc-clara', { role: 'Should not apply' }, { expectedUpdatedAt: initial.npcs[0].updatedAt });
    await getStarted;
    active.key = keyB;
    server.releaseDelayedGet();
    const result = await pending;
    assert.equal(result.reason, 'chat-changed');
    assert.equal(result.stage, 'mutation-after-load');
    assert.equal(engine.getState(keyA).npcs[0].role, 'Innkeeper');
    assert.equal(server.uploads.length, 0);
}

// A chat switch that occurs during a synchronous mutator is caught before checkpoint/persist.
// The mutator's source-message metadata is also derived from its explicitly supplied A context.
{
    const server = makeServer();
    const keyA = 'v0432-mutate-before-commit-a';
    const keyB = 'v0432-mutate-before-commit-b';
    const active = { key: keyA };
    const chatA = [{ is_user: true, mes: 'Commit A.' }, { is_user: false, mes: 'Commit A assistant.' }];
    const chatB = [{ is_user: true, mes: 'Commit B.' }, { is_user: false, mes: 'Commit B assistant.' }];
    const chats = new Map([[keyA, chatA], [keyB, chatB]]);
    const initial = branchState(keyA, chatA);
    seed(server, keyA, initial);
    let scheduled = false;
    const getSettings = () => {
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(() => { active.key = keyB; });
        }
        return settings();
    };
    const engine = makeEngine({ server, active, chats, generate: async () => JSON.stringify(EMPTY_SCAN), getSettings });
    const result = await engine.updateNpc('npc-clara', { relationship: { trust: 2 } }, { expectedUpdatedAt: initial.npcs[0].updatedAt });
    assert.equal(result.reason, 'chat-changed');
    assert.equal(result.stage, 'mutation-before-commit');
    assert.equal(engine.getState(keyA).npcs[0].relationship.trust, 1, 'Discarded mutation leaked into cached state');
    assert.equal(server.uploads.length, 0, 'Discarded mutation persisted after chat switch');
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

// Preserve -> new scored exchange -> remove exchange -> explicit rollback must roll 2 -> 1 and
// keep the old accepted exchange protected during the automatic rollback refresh.
{
    const fixture = replayFixture('v0432-preserve-then-rollback');
    const engine = makeEngine({ ...fixture, generate: async () => JSON.stringify(relationshipScan()) });
    assert.equal((await engine.reconcileBranch({ rebase: true, rescan: false, relationshipMode: 'preserve' })).ok, true);
    assert.equal(engine.getState(fixture.active.key).relationshipReplayBoundary?.throughMessageId, 1);

    fixture.acceptedChat.push(
        { is_user: true, mes: 'A later exchange that will be removed.' },
        { is_user: false, mes: TRUST_QUOTE },
    );
    assert.equal((await engine.scan(3, { manual: true, force: true })).ok, true);
    assert.equal(engine.getState(fixture.active.key).npcs[0].relationship.trust, 2);

    fixture.acceptedChat.splice(2, 2);
    const preview = await engine.previewRebase({ relationshipMode: 'rollback' });
    assert.equal(preview.ok, true);
    assert.equal(preview.affectedNpcs.length, 1);
    assert.equal(preview.affectedNpcs[0].before.trust, 2);
    assert.equal(preview.affectedNpcs[0].after.trust, 1);

    const rolled = await engine.reconcileBranch({ rebase: true, rescan: true, relationshipMode: 'rollback' });
    assert.equal(rolled.ok, true);
    const after = engine.getState(fixture.active.key);
    assert.equal(after.npcs[0].relationship.trust, 1, 'Rollback refresh re-awarded the old accepted relationship event');
    assert.equal(after.relationshipReplayBoundary?.throughMessageId, 1, 'Rollback discarded the still-valid accepted-history boundary');
    assert.deepEqual(after.relationshipReplayBoundary?.lineage, chatLineage(fixture.acceptedChat, 1));

    fixture.acceptedChat.push(
        { is_user: true, mes: 'A genuinely new later exchange.' },
        { is_user: false, mes: TRUST_QUOTE },
    );
    assert.equal((await engine.scan(3, { manual: true, force: true })).ok, true);
    assert.equal(engine.getState(fixture.active.key).npcs[0].relationship.trust, 2, 'New post-rollback event was incorrectly suppressed');
}

// Preserve refresh failure followed by explicit rollback has no rollback delta to preview, but
// the accepted old event must still remain protected during the rollback refresh.
{
    const fixture = replayFixture('v0432-failed-preserve-then-rollback');
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
    assert.equal(engine.getState(fixture.active.key).relationshipReplayBoundary?.throughMessageId, 1);
    const preview = await engine.previewRebase({ relationshipMode: 'rollback' });
    assert.equal(preview.ok, true);
    assert.equal(preview.affectedNpcs.length, 0, 'Failed preserve refresh unexpectedly created rollback relationship changes');
    const rolled = await engine.reconcileBranch({ rebase: true, rescan: true, relationshipMode: 'rollback' });
    assert.equal(rolled.ok, true);
    assert.equal(engine.getState(fixture.active.key).npcs[0].relationship.trust, 1, 'Rollback after failed preserve refresh re-awarded accepted event');
    assert.equal(engine.getState(fixture.active.key).relationshipReplayBoundary?.throughMessageId, 1);
}

// If only part of the old accepted boundary still matches after a rewrite, rollback retains only
// the matching prefix through the last assistant exchange. The rewritten suffix stays scorable.
{
    const key = 'v0432-boundary-prefix';
    const accepted = [
        { is_user: true, mes: 'Accepted opening.' },
        { is_user: false, mes: 'Accepted assistant one.' },
        { is_user: true, mes: 'Accepted user two.' },
        { is_user: false, mes: 'Accepted assistant two.' },
    ];
    const rewritten = [
        accepted[0],
        accepted[1],
        { is_user: true, mes: 'Rewritten user two.' },
        { is_user: false, mes: 'Rewritten assistant two.' },
    ];
    const source = branchState(key, accepted);
    source.relationshipReplayBoundary = {
        throughMessageId: 3,
        lineage: chatLineage(accepted, 3),
        acceptedAt: 12345,
    };
    const rebased = rebaseToCurrentChat(source, rewritten, { relationshipMode: 'rollback' });
    assert.equal(rebased.relationshipReplayBoundary?.throughMessageId, 1);
    assert.deepEqual(rebased.relationshipReplayBoundary?.lineage, chatLineage(accepted, 1));
    assert.equal(rebased.relationshipReplayBoundary?.acceptedAt, 12345);
}

assert(engineSource.includes("chatChanged('mutation-after-queue')"), 'Queued mutation ownership guard missing');
assert(engineSource.includes("chatChanged('mutation-after-load')"), 'Post-hydration mutation ownership guard missing');
assert(engineSource.includes("chatChanged('mutation-before-apply')"), 'Pre-mutation ownership guard missing');
assert(engineSource.includes("chatChanged('mutation-before-persist')"), 'Pre-persistence ownership guard missing');
assert(engineSource.includes('const result = await mutator(state, chat);'), 'Mutators do not receive the origin chat context');
assert(engineSource.includes("return mutate('update', (state, chat) =>"), 'updateNpc is not wired to origin chat context');
assert(engineSource.includes('sourceMessageId: latestAssistantMessageId(chat)'), 'Manual relationship metadata still reads global visible context');
assert(branchesSource.includes('function retainValidRelationshipReplayBoundary(boundary, chat = [])'), 'Rollback replay-boundary retention helper missing');
assert(branchesSource.includes(': retainValidRelationshipReplayBoundary(source.relationshipReplayBoundary, chat);'), 'Rollback still clears accepted relationship replay boundary');

console.log('NPC State v0.4.32 operation-context and rollback replay-boundary verification passed');

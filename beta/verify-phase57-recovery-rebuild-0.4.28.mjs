import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { createEmptyState } from '../v03/schema.js';
import { encodeV3Payload } from '../v03/storage.js';

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

function makeHarness({ chatKey, chat, generate, pointer = null, files = new Map() }) {
    const pointers = new Map();
    if (pointer) pointers.set(chatKey, structuredClone(pointer));
    const uploads = [];
    let uploadId = 0;
    const notices = [];
    const fetchFn = async (url, init = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'GET') {
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
    const context = { chat };
    const engine = createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => chatKey,
        getSettings: settings,
        getPointer: key => pointers.get(key) || null,
        setPointer: (key, value) => pointers.set(key, structuredClone(value)),
        deletePointer: key => pointers.delete(key),
        getStablePointer: () => null,
        persistSettings: () => {},
        getHeaders: () => ({}),
        fetchFn,
        generate,
        notify: (kind, message) => notices.push({ kind, message }),
        onStateChanged: () => {},
    });
    return { engine, context, pointers, files, uploads, notices };
}

function simpleChat() {
    return [
        { is_user: true, mes: 'Lucien enters the first room.' },
        { is_user: false, mes: 'The first exchange ends quietly.' },
        { is_user: true, mes: 'Lucien walks onward. FUTURE_SENTINEL' },
        { is_user: false, mes: 'The second exchange contains FUTURE_SENTINEL.' },
    ];
}

function relationshipScan() {
    const quote = 'Clara said, "I trust you."';
    return {
        exchangeActiveNpcIds: ['Clara'],
        inChatNpcIds: ['Clara'],
        worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Clara', identityKind: 'named', aliases: [], role: 'Innkeeper', species: '',
            activityEvidence: {
                exchangeActive: { excerpts: [quote], explanation: 'Clara speaks directly in the current exchange.' },
                inChat: { excerpts: [quote], explanation: 'Clara remains the active conversational partner at the end.' },
                worldActive: { excerpts: [], explanation: '' },
            },
            relationshipChange: {
                evaluated: true,
                impact: 'ordinary',
                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
                priority: ['trust'],
                axisEvidence: {
                    trust: { excerpts: [quote], explanation: 'Clara explicitly expresses increased confidence in Lucien.' },
                },
                evidence: quote,
                reason: 'A small new increase in trust.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
    };
}

// Missing beta pointer recovery bypasses the failed load and swaps pointers only after
// a new recovery sidecar upload succeeds.
{
    const chatKey = 'v0428-missing-file';
    const oldPointer = { name: 'missing.json', path: '/missing.json', revision: 7, updatedAt: 1 };
    const h = makeHarness({ chatKey, chat: simpleChat(), pointer: oldPointer, generate: async () => JSON.stringify(EMPTY_SCAN) });
    await assert.rejects(() => h.engine.loadChat(chatKey), error => error?.code === 'NPC_STATE_V04_BETA_MISSING_SIDECAR');
    const recovered = await h.engine.initializeFresh();
    assert.equal(recovered.ok, true);
    assert.notEqual(h.pointers.get(chatKey)?.path, oldPointer.path, 'Missing pointer was not replaced');
    assert.equal(h.uploads.length, 1, 'Fresh recovery should upload exactly one replacement file');
    assert.equal(h.engine.hydrationStatus(chatKey).status, 'ready');
}

// A readable source sidecar is never replaced unless the caller explicitly confirms it.
{
    const chatKey = 'v0428-healthy-protection';
    const oldState = createEmptyState(chatKey);
    const oldPointer = { name: 'healthy.json', path: '/healthy.json', revision: 3, updatedAt: 1 };
    const files = new Map([[oldPointer.path, encodeV3Payload(chatKey, oldState, 3)]]);
    const h = makeHarness({ chatKey, chat: simpleChat(), pointer: oldPointer, files, generate: async () => JSON.stringify(EMPTY_SCAN) });
    await assert.rejects(() => h.engine.initializeFresh(), error => error?.code === 'NPC_STATE_V04_BETA_RECOVERY_SOURCE_EXISTS');
    assert.equal(h.pointers.get(chatKey).path, oldPointer.path, 'Healthy pointer changed without confirmation');
    const replaced = await h.engine.initializeFresh({ allowExisting: true });
    assert.equal(replaced.ok, true);
    assert.notEqual(h.pointers.get(chatKey).path, oldPointer.path);
    assert.equal(files.has(oldPointer.path), true, 'Healthy source file was deleted instead of preserved as a safety copy');
}

// Full chronological reconstruction uses one model call per assistant exchange and never
// leaks future messages into the prompt for an earlier historical exchange.
{
    const chatKey = 'v0428-prefix-only';
    const prompts = [];
    const labels = [];
    const h = makeHarness({
        chatKey,
        chat: simpleChat(),
        generate: async args => {
            prompts.push(args.prompt);
            labels.push(args.label);
            return JSON.stringify(EMPTY_SCAN);
        },
    });
    const result = await h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(prompts.length, 2, 'Expected one model call per processed assistant exchange');
    assert.equal(prompts[0].includes('FUTURE_SENTINEL'), false, 'Future message leaked into the first historical scan');
    assert.equal(prompts[1].includes('FUTURE_SENTINEL'), true, 'Second historical scan did not receive its own current exchange');
    assert.deepEqual(labels, ['historical-recovery-1', 'historical-recovery-3']);
    const state = h.engine.getState(chatKey);
    assert.equal(state.recovery.status, 'complete');
    assert.equal(state.recovery.completed, 2);
    assert.equal(state.lastScannedMessageId, 3);
    for (const checkpoint of state.checkpoints) {
        assert.equal(checkpoint.snapshot?.recovery ?? null, null, 'Recovery orchestration was recursively copied into a rollback checkpoint');
    }
}

// Relationship mode is real engine behavior, not merely a UI flag. Fresh leaves recovered
// meters at zero; re-evaluate runs the same valid historical proposal through normal scoring.
for (const relationshipMode of ['fresh', 're-evaluate']) {
    const chatKey = 'v0428-relationship-' + relationshipMode;
    const quote = 'Clara said, "I trust you."';
    const h = makeHarness({
        chatKey,
        chat: [{ is_user: true, mes: 'Lucien listens.' }, { is_user: false, mes: quote }],
        generate: async () => JSON.stringify(relationshipScan()),
    });
    const result = await h.engine.startHistoricalRecovery({ relationshipMode });
    assert.equal(result.ok, true);
    const clara = h.engine.getState(chatKey).npcs.find(npc => npc.name === 'Clara');
    assert(clara, 'Historical relationship fixture did not reconstruct Clara');
    assert.equal(clara.relationship.trust, relationshipMode === 're-evaluate' ? 1 : 0, 'Relationship recovery mode was not honored');
}

// Failed generation persists completed progress. Resume retries only the failed exchange,
// and an edit confined to the unprocessed suffix is safely replanned without replaying #1.
{
    const chatKey = 'v0428-failure-resume-suffix';
    const chat = simpleChat();
    const labels = [];
    let failSecond = true;
    const h = makeHarness({
        chatKey,
        chat,
        generate: async args => {
            labels.push(args.label);
            if (args.label === 'historical-recovery-3' && failSecond) throw new Error('synthetic model outage');
            return JSON.stringify(EMPTY_SCAN);
        },
    });
    const first = await h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    assert.equal(first.ok, false);
    assert.equal(first.failed, true);
    let state = h.engine.getState(chatKey);
    assert.equal(state.recovery.status, 'failed');
    assert.equal(state.recovery.completed, 1);
    assert.equal(state.recovery.lastCompletedMessageId, 1);
    const blocked = await h.engine.scan(3, { manual: true, force: true });
    assert.equal(blocked.reason, 'recovery-active', 'Normal scan interleaved with failed recovery chronology');

    failSecond = false;
    chat[3].mes = 'The edited second exchange replaces the old suffix safely.';
    const resumed = await h.engine.resumeHistoricalRecovery();
    assert.equal(resumed.ok, true);
    assert.equal(resumed.complete, true);
    state = h.engine.getState(chatKey);
    assert.equal(state.recovery.completed, 2);
    assert.equal(labels.filter(label => label === 'historical-recovery-1').length, 1, 'Completed historical exchange was replayed after suffix edit');
    assert.equal(labels.filter(label => label === 'historical-recovery-3').length, 2, 'Failed exchange was not retried exactly once');
}

// Editing already-completed recovery history fails closed. No completed work is replayed
// against a changed past.
{
    const chatKey = 'v0428-completed-prefix-edit';
    const chat = simpleChat();
    let failSecond = true;
    let calls = 0;
    const h = makeHarness({
        chatKey,
        chat,
        generate: async args => {
            calls += 1;
            if (args.label === 'historical-recovery-3' && failSecond) throw new Error('synthetic second-step failure');
            return JSON.stringify(EMPTY_SCAN);
        },
    });
    await h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    const callsBeforeResume = calls;
    failSecond = false;
    chat[1].mes = 'The already-completed first exchange was edited.';
    const resumed = await h.engine.resumeHistoricalRecovery();
    assert.equal(resumed.ok, false);
    assert.equal(resumed.reason, 'restart-required');
    assert.equal(h.engine.getState(chatKey).recovery.status, 'stale');
    assert.equal(calls, callsBeforeResume, 'Model was called after completed recovery history changed');
}

// Cancellation during an in-flight model call invalidates that operation. The model result is
// discarded, completed progress does not advance, and the durable state ends cancelled.
{
    const chatKey = 'v0428-cancel-inflight';
    let release;
    let startedResolve;
    const started = new Promise(resolve => { startedResolve = resolve; });
    const h = makeHarness({
        chatKey,
        chat: [{ is_user: true, mes: 'Lucien waits.' }, { is_user: false, mes: 'A quiet exchange.' }],
        generate: async () => new Promise(resolve => {
            release = () => resolve(JSON.stringify(EMPTY_SCAN));
            startedResolve();
        }),
    });
    const run = h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    await started;
    const cancel = await h.engine.cancelHistoricalRecovery();
    assert.equal(cancel.ok, true);
    release();
    const result = await run;
    assert.equal(result.cancelled, true);
    const state = h.engine.getState(chatKey);
    assert.equal(state.recovery.status, 'cancelled');
    assert.equal(state.recovery.completed, 0, 'Cancelled in-flight exchange was committed');
    assert.equal(state.lastScannedMessageId, null);
}

// Source markers protect the two orchestration invariants that are difficult to express as a
// single-state fixture: future-free prefix scans and deferred stale deletion.
{
    const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
    const indexSource = fs.readFileSync('v03/index.js', 'utf8');
    const uiSource = fs.readFileSync('v03/branch-recovery-ui.js', 'utf8');
    assert(engineSource.includes('historicalChat = liveChat.slice(0, nextMessageId + 1)'), 'Historical scan prefix boundary disappeared');
    assert(engineSource.includes('staleDeleteAfter: 1000000000'), 'Stale deletion is no longer deferred during reconstruction');
    assert(engineSource.includes("applyRelationship: working.recovery?.relationshipMode === 're-evaluate'"), 'Relationship recovery mode is not wired to normal scoring');
    assert(indexSource.includes('recoveryPending'), 'Continuity injection is not suppressed during incomplete recovery');
    assert(uiSource.includes('RECOVERY_REBUILD_UI_VERSION'), 'Recovery UI is missing');
    assert(uiSource.includes('All surviving exchanges') && uiSource.includes('Latest exchange only') && uiSource.includes('Custom message IDs'), 'Recovery range UI is incomplete');
    assert(uiSource.includes('Start meters fresh') && uiSource.includes('Re-evaluate history'), 'Relationship mode UI is incomplete');
}

console.log('NPC State 0.4.28 recovery/rebuild behavior verified');

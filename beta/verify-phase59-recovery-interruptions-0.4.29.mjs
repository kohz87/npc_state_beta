import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateEngine } from '../v03/engine.js';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import { createEmptyState } from '../v03/schema.js';
import { encodeV3Payload } from '../v03/storage.js';

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
    const fetchFn = async (url, init = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'GET') return files.has(url) ? response(200, files.get(url)) : response(404, '');
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
    return { pointers, files, uploads, fetchFn };
}

function makeEngine({ server, active, chats, generate, sessionId, now = { value: 100000 } }) {
    const notices = [];
    const engine = createNpcStateEngine({
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
        notify: (kind, message) => notices.push({ kind, message }),
        onStateChanged: () => {},
        recoverySessionId: sessionId,
        recoveryLeaseMs: 30000,
        recoveryNow: () => now.value,
    });
    return { engine, notices, now };
}

function simpleChat(prefix = 'A') {
    return [
        { is_user: true, mes: prefix + ' user one.' },
        { is_user: false, mes: prefix + ' assistant one.' },
        { is_user: true, mes: prefix + ' user two.' },
        { is_user: false, mes: prefix + ' assistant two.' },
    ];
}

function relationshipScan(id = '') {
    const quote = 'Clara said, "I trust you."';
    return {
        exchangeActiveNpcIds: [id || 'Clara'],
        inChatNpcIds: [id || 'Clara'],
        worldActiveNpcIds: [],
        npcs: [{
            id,
            name: 'Clara',
            identityKind: 'named',
            aliases: [],
            role: 'Innkeeper',
            species: '',
            activityEvidence: {
                exchangeActive: { excerpts: [quote], explanation: 'Clara speaks directly in the current exchange.' },
                inChat: { excerpts: [quote], explanation: 'Clara remains the active conversational partner.' },
                worldActive: { excerpts: [], explanation: '' },
            },
            relationshipChange: {
                evaluated: true,
                impact: 'ordinary',
                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
                priority: ['trust'],
                axisEvidence: {
                    trust: { excerpts: [quote], explanation: 'Clara expresses a small new increase in confidence in Lucien.' },
                },
                evidence: quote,
                reason: 'A small new increase in trust.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

// Switching chats while generation is pending pauses the ORIGINAL reconstruction. The
// in-flight result is discarded, its plan is retained, and no automatic call is made using
// the newly opened chat. Explicitly returning to the original chat can resume it.
{
    const server = makeServer();
    const active = { key: 'v0429-chat-a' };
    const chats = new Map([
        ['v0429-chat-a', simpleChat('CHAT_A')],
        ['v0429-chat-b', [
            { is_user: true, mes: 'CHAT_B_PRIVATE_SENTINEL user.' },
            { is_user: false, mes: 'CHAT_B_PRIVATE_SENTINEL assistant.' },
        ]],
    ]);
    const prompts = [];
    const labels = [];
    let firstRelease;
    let firstStartedResolve;
    const firstStarted = new Promise(resolve => { firstStartedResolve = resolve; });
    let call = 0;
    const h = makeEngine({
        server, active, chats, sessionId: 'switch-session',
        generate: async args => {
            prompts.push(args.prompt);
            labels.push(args.label);
            call += 1;
            if (call === 1) {
                return new Promise(resolve => {
                    firstRelease = () => resolve(JSON.stringify(EMPTY_SCAN));
                    firstStartedResolve();
                });
            }
            return JSON.stringify(EMPTY_SCAN);
        },
    });
    const run = h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    await firstStarted;
    active.key = 'v0429-chat-b';
    firstRelease();
    const switched = await run;
    assert.equal(switched.paused, true, 'Chat switch did not pause the originating recovery');
    assert.equal(switched.reason, 'chat-switched');
    const aState = h.engine.getState('v0429-chat-a');
    assert.equal(aState.recovery.status, 'paused');
    assert.equal(aState.recovery.completed, 0, 'Discarded in-flight result advanced completed progress');
    assert.deepEqual(aState.recovery.messageIds, [1, 3], 'Original recovery plan was not preserved');
    assert.equal(prompts.length, 1, 'Recovery automatically restarted after switching chats');
    assert.equal(prompts.some(prompt => prompt.includes('CHAT_B_PRIVATE_SENTINEL')), false, 'Other chat content entered the original recovery prompt');

    active.key = 'v0429-chat-a';
    const resumed = await h.engine.resumeHistoricalRecovery();
    assert.equal(resumed.ok, true);
    assert.equal(resumed.complete, true);
    assert.deepEqual(labels, ['historical-recovery-1', 'historical-recovery-1', 'historical-recovery-3']);
    assert.equal(prompts.some(prompt => prompt.includes('CHAT_B_PRIVATE_SENTINEL')), false, 'Other chat content leaked after explicit resume');
}

// A second tab observes a live owner lease instead of converting running -> paused. It cannot
// resume/pause/cancel the foreign run, and the original tab can still commit without a write conflict.
{
    const server = makeServer();
    const active = { key: 'v0429-two-tabs' };
    const chats = new Map([[active.key, [{ is_user: true, mes: 'Lucien waits.' }, { is_user: false, mes: 'The exchange remains pending.' }]]]);
    const now = { value: 200000 };
    let release;
    let startedResolve;
    const started = new Promise(resolve => { startedResolve = resolve; });
    const a = makeEngine({
        server, active, chats, sessionId: 'tab-a', now,
        generate: async () => new Promise(resolve => {
            release = () => resolve(JSON.stringify(EMPTY_SCAN));
            startedResolve();
        }),
    });
    const run = a.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    await started;
    const pointerBefore = structuredClone(server.pointers.get(active.key));
    assert(pointerBefore?.path, 'First tab did not create its recovery sidecar');

    const b = makeEngine({ server, active, chats, sessionId: 'tab-b', now, generate: async () => JSON.stringify(EMPTY_SCAN) });
    const loaded = await b.engine.loadChat(active.key);
    assert.equal(loaded.recovery.status, 'running', 'Observer tab rewrote active recovery status');
    const observed = b.engine.recoveryStatus(active.key);
    assert.equal(observed.activeElsewhere, true, 'Observer tab did not recognize the foreign live lease');
    assert.equal(server.pointers.get(active.key).revision, pointerBefore.revision, 'Observer hydration performed an unexpected write');
    assert.equal((await b.engine.resumeHistoricalRecovery()).reason, 'recovery-owned-elsewhere');
    assert.equal((await b.engine.pauseHistoricalRecovery()).reason, 'recovery-owned-elsewhere');
    assert.equal((await b.engine.cancelHistoricalRecovery()).reason, 'recovery-owned-elsewhere');

    release();
    const completed = await run;
    assert.equal(completed.ok, true);
    assert.equal(completed.complete, true, 'Original owner could not finish after observer hydration');
    assert.equal(a.engine.getState(active.key).recovery.status, 'complete');
}

// An expired persisted owner is treated as abandoned and becomes resumable rather than being
// mistaken for a still-live foreign tab.
{
    const server = makeServer();
    const active = { key: 'v0429-expired-lease' };
    const chats = new Map([[active.key, [{ is_user: true, mes: 'Lucien waits.' }, { is_user: false, mes: 'A resumable exchange.' }]]]);
    const state = createEmptyState(active.key);
    state.recovery = {
        version: 2,
        status: 'running',
        ownerSessionId: 'dead-tab',
        leaseUntil: 1000,
        relationshipMode: 'fresh',
        startMessageId: 1,
        endMessageId: 1,
        messageIds: [1],
        plannedLineage: [],
        completed: 0,
        total: 1,
        lastCompletedMessageId: null,
        nextMessageId: 1,
        reason: '',
        error: '',
        startedAt: 1,
        updatedAt: 1,
        completedAt: null,
    };
    const pointer = { name: 'expired.json', path: '/expired.json', revision: 4, updatedAt: 1 };
    server.pointers.set(active.key, pointer);
    server.files.set(pointer.path, encodeV3Payload(active.key, state, pointer.revision));
    const now = { value: 50000 };
    const b = makeEngine({ server, active, chats, sessionId: 'new-tab', now, generate: async () => JSON.stringify(EMPTY_SCAN) });
    const loaded = await b.engine.loadChat(active.key);
    assert.equal(loaded.recovery.status, 'paused');
    assert.equal(loaded.recovery.ownerSessionId, '', 'Expired owner was not released');
    assert.match(loaded.recovery.reason, /abandoned|expired/i);
    const resumed = await b.engine.resumeHistoricalRecovery();
    assert.equal(resumed.ok, true);
    assert.equal(resumed.complete, true, 'Expired recovery lease was not resumable');
}

// Cancellation wins even when the pending generation rejects. Committed progress is retained,
// the terminal status is cancelled rather than failed, and ordinary scanning is unblocked.
{
    const server = makeServer();
    const active = { key: 'v0429-cancel-reject' };
    const chats = new Map([[active.key, [{ is_user: true, mes: 'Lucien waits.' }, { is_user: false, mes: 'A quiet exchange.' }]]]);
    let rejectPending;
    let startedResolve;
    let calls = 0;
    const started = new Promise(resolve => { startedResolve = resolve; });
    const h = makeEngine({
        server, active, chats, sessionId: 'cancel-session',
        generate: async () => {
            calls += 1;
            if (calls === 1) return new Promise((resolve, reject) => { rejectPending = reject; startedResolve(); });
            return JSON.stringify(EMPTY_SCAN);
        },
    });
    const run = h.engine.startHistoricalRecovery({ relationshipMode: 'fresh' });
    await started;
    const cancel = await h.engine.cancelHistoricalRecovery();
    assert.equal(cancel.ok, true);
    rejectPending(new Error('synthetic rejected request after cancel'));
    const result = await run;
    assert.equal(result.cancelled, true);
    const state = h.engine.getState(active.key);
    assert.equal(state.recovery.status, 'cancelled', 'Rejected request overwrote cancellation with failure');
    assert.equal(state.recovery.completed, 0);
    const scan = await h.engine.scan(1, { manual: true, force: true });
    assert.notEqual(scan.reason, 'recovery-active', 'Cancelled recovery continued blocking ordinary scanning');
}

// Invalid custom ranges are rejected before replacement-sidecar upload or pointer mutation.
// A valid custom range reports the actual number of assistant exchanges selected.
{
    const server = makeServer();
    const active = { key: 'v0429-range-validation' };
    const chats = new Map([[active.key, simpleChat('RANGE')]]);
    const h = makeEngine({ server, active, chats, sessionId: 'range-session', generate: async () => JSON.stringify(EMPTY_SCAN) });
    assert.throws(() => h.engine.recoveryRange({ startMessageId: 100, endMessageId: 200 }), error => error?.code === 'NPC_STATE_V04_BETA_RECOVERY_RANGE');
    await assert.rejects(
        () => h.engine.startHistoricalRecovery({ startMessageId: 100, endMessageId: 200, relationshipMode: 'fresh' }),
        error => error?.code === 'NPC_STATE_V04_BETA_RECOVERY_RANGE',
    );
    assert.equal(server.uploads.length, 0, 'Invalid range uploaded a replacement sidecar');
    assert.equal(server.pointers.has(active.key), false, 'Invalid range installed a replacement pointer');
    const valid = h.engine.recoveryRange({ startMessageId: 0, endMessageId: 2 });
    assert.equal(valid.assistantExchangeCount, 1);
    assert.equal(valid.startMessageId, 0);
    assert.equal(valid.endMessageId, 2);
}

// Two distinct exchanges may contain identical quotations and still be separately judged by
// the LLM. The same source event remains idempotent when replayed with identical branch evidence.
{
    const server = makeServer();
    const active = { key: 'v0429-event-dedupe' };
    const quote = 'Clara said, "I trust you."';
    const chat = [
        { is_user: true, mes: 'Lucien listens the first time.' },
        { is_user: false, mes: quote },
        { is_user: true, mes: 'Lucien listens the second time.' },
        { is_user: false, mes: quote },
    ];
    const chats = new Map([[active.key, chat]]);
    const h = makeEngine({ server, active, chats, sessionId: 'relationship-session', generate: async () => JSON.stringify(relationshipScan()) });
    const recovered = await h.engine.startHistoricalRecovery({ relationshipMode: 're-evaluate' });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.complete, true);
    const state = h.engine.getState(active.key);
    const clara = state.npcs.find(npc => npc.name === 'Clara');
    assert(clara, 'Relationship fixture did not reconstruct Clara');
    assert.equal(clara.relationship.trust, 2, 'Identical quotation in a distinct exchange was wrongly deduplicated');
    assert.equal(clara.relationshipEvidenceHistory.length, 2);
    const eventKeys = clara.relationshipEvidenceHistory.map(event => event.sourceEventKey).filter(Boolean);
    assert.equal(eventKeys.length, 2, 'Accepted relationship events did not persist source-event identity');
    assert.notEqual(eventKeys[0], eventKeys[1], 'Distinct exchanges collapsed to the same source-event key');

    const exchange = { user: chat[2], assistant: chat[3] };
    const policy = buildExchangeEvidencePolicy(exchange);
    const replayPayload = relationshipScan(clara.id);
    const replay = applyScanResult(state, replayPayload, {
        sourceMessageId: 3,
        turn: state.turn,
        relationshipCaps: settings().relationshipCaps,
        relationshipContext: [chat[2].mes, chat[3].mes].join('\n'),
        relationshipEvidenceSources: policy.relationshipSources,
        evidencePolicy: policy,
        currentAdmissionText: [chat[2].mes, chat[3].mes].join('\n'),
        admissionMode: 'balanced',
        dossierLimits: settings().dossierLimits,
        applyReturnedNpcPatches: true,
        applyRelationship: true,
    });
    const replayClara = replay.state.npcs.find(npc => npc.id === clara.id);
    assert.equal(replayClara.relationship.trust, 2, 'Reapplying the same source event moved relationship twice');
    assert((replayClara.relationshipDiagnostics || []).some(event => event.reasons?.includes('trust:duplicate')), 'Same-event replay did not report duplicate protection');
}

// Preserve deterministic relationship mechanics and the LLM semantic boundary while changing
// only duplicate identity.
{
    const scanner = fs.readFileSync('v03/scanner.js', 'utf8');
    const policy = fs.readFileSync('v03/relationship-policy.js', 'utf8');
    const schema = fs.readFileSync('v03/schema.js', 'utf8');
    assert(scanner.includes('relationshipInertiaFactor'));
    assert(scanner.includes('relationshipMilestoneUnlocked'));
    assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'));
    assert(schema.includes('RELATIONSHIP_MILESTONE_THRESHOLDS'));
    assert(policy.includes('relationshipJudgmentRubricPrompt'));
    assert.equal(scanner.includes('DESIRE_EVIDENCE_CUES'), false);
    assert.equal(scanner.includes('relationshipEvidenceGrounding('), false);
    assert.equal(scanner.includes('relationshipEvidencePolarityConflict('), false);
    assert(scanner.includes('relationshipSourceEventKey'));
    assert.equal(scanner.includes('previousEvidence && previousEvidence === currentEvidence'), false);
}

console.log('NPC State 0.4.29 recovery interruption, concurrency, range, and event-dedupe behavior verified');

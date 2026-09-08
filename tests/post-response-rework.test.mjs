import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult } from '../src/scanner.js';
import { applyRelationshipSummaryProjection } from '../src/scan-relationships.js';
import { createPostResponseCoordinator } from '../src/post-response-coordinator.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { buildForegroundInjection } from '../src/injection.js';
import { foregroundContract } from '../src/foreground-contract.js';

const BESSA_ASSISTANT = [
    '“Dip the quill first. Right there on the blotter.”',
    'Bessa Vond. Front desk clerk, Intake Officer when the marshal is out, which is always.',
    'Bessa nudged the bone-handled quill into your fingers.',
    'Bessa processed Lucien Noctis’s registration behind the pine counter and spread the available work across the desk.',
    'Bessa looked from the frost on your pack to the metal staff. Her brow furrowed, though her mouth remained practical.',
    '“Return the tusks to the yard scale. Do not bring the carcasses into the hall.”',
].join(' ');
const BESSA_USER = 'I approach the registry counter and give my name as Lucien Noctis.';
const ZERO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'Routine intake.' };

function identityEvidence() {
    return { anchor: 'Bessa Vond', excerpts: ['Bessa Vond. Front desk clerk, Intake Officer when the marshal is out, which is always.'], explanation: 'The current response names Bessa Vond.' };
}
function activityEvidence() {
    const excerpt = 'Bessa processed Lucien Noctis’s registration behind the pine counter and spread the available work across the desk.';
    return { exchangeActive: { excerpts: [excerpt], explanation: 'Bessa acts directly in the exchange.' }, inChat: { excerpts: [excerpt], explanation: 'Bessa remains in the intake scene.' } };
}
function bessaPatch(fields = {}) {
    return { id: '', name: 'Bessa Vond', identityKind: 'named', identityEvidence: identityEvidence(), activityEvidence: activityEvidence(), relationshipChange: structuredClone(ZERO_REL), ...fields };
}
function payloadForBessa(fields = {}) {
    return { exchangeActiveNpcIds: ['Bessa Vond'], inChatNpcIds: ['Bessa Vond'], worldActiveNpcIds: [], npcs: [bessaPatch(fields)], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
}
function completeFields() {
    const direct = {
        role: 'Front desk clerk and acting intake officer',
        behaviorProfile: ['Keeps current intake work task-focused.'],
        speech: 'Clipped practical instructions and blunt questions.',
        mannerisms: ['Observed tapping the contract writing during intake.'],
        mood: 'Businesslike with brief curiosity about Lucien’s equipment.',
        location: 'Behind the Guild hall pine counter.',
        goal: 'Process Lucien’s registration and direct him toward available work.',
        status: 'Processing Lucien’s registration.',
        relationshipSummary: 'Professional clerk-applicant interaction.',
        relationshipSummaryEvidence: { excerpts: ['Bessa nudged the bone-handled quill into your fingers.'], explanation: 'Bessa nudged the bone-handled quill into your fingers.' },
    };
    const proposed = new Set(Object.keys(direct));
    return { ...direct, evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], fieldEvaluations: { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)), unavailable: [] } };
}
function installBessaChat(h) {
    h.context.name1 = 'Lucien Noctis';
    h.context.chat = [
        { is_user: true, name: 'Lucien Noctis', mes: BESSA_USER },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: BESSA_ASSISTANT },
    ];
}
function setProvider(h, payload, hook = null) {
    h.context.generateRaw = async args => {
        h.metrics.generations += 1;
        await hook?.(args);
        return typeof payload === 'function' ? payload(args) : JSON.stringify(payload);
    };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }


test('automatic post-response scan populates supported new dossier fields with one request and duplicate completion is idempotent', () => withHost(async h => {
    installBessaChat(h);
    setProvider(h, payloadForBessa(completeFields()));
    const first = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(first.ok, true);
    assert.equal(h.metrics.generations, 1);
    assert.equal(h.metrics.posts, 1);
    assert.equal(/<npc_state_v1/i.test(h.context.chat[1].mes), false);
    const bessa = h.persisted().npcs.find(npc => npc.name === 'Bessa Vond');
    assert.ok(bessa);
    for (const field of ['role', 'speech', 'mood', 'location', 'goal', 'status']) assert.equal(bessa[field], completeFields()[field], field);
    assert.deepEqual(bessa.mannerisms, completeFields().mannerisms);
    assert.equal(bessa.relationshipSummary, 'Professional clerk-applicant interaction.');
    assert.deepEqual(bessa.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(bessa.relationshipHistory.length, 0);
    assert.equal(bessa.age, '');
    assert.equal(bessa.background, '');
    assert.equal(h.api.scanStatus().status, 'complete');

    const second = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(second.ok, true);
    assert.equal(h.metrics.generations, 1);
    assert.equal(h.metrics.posts, 1);
}, { settings: { birthdayFillMode: 'off' } }));


test('sparse valid post-response payload persists supported facts but reports semantic partial coverage', () => withHost(async h => {
    installBessaChat(h);
    setProvider(h, payloadForBessa({ evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], appearance: 'Auburn hair and ink-stained fingertips.' }));
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.persisted().npcs[0].appearance, 'Auburn hair and ink-stained fingertips.');
    assert.equal(h.persisted().npcs[0].mood, '');
    assert.equal(h.api.scanStatus().status, 'partial');
    const row = h.api.operationDiagnostics().find(op => op.type === 'automatic-scan');
    assert.ok(row.proposals.omitted > 0);
    assert.ok(row.proposals.reasons.some(reason => reason.includes('fields=')));
}));


test('same-tick assistant revision invalidates the queued logical job before provider dispatch', () => withHost(async h => {
    installBessaChat(h);
    setProvider(h, payloadForBessa(completeFields()));
    const pending = h.entry.processCompletedAssistantResponse(1);
    h.context.chat[1].mes = 'A replacement assistant response at the same position.';
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'stale-source-before-queue');
    assert.equal(h.metrics.generations, 0);
    assert.equal(h.metrics.posts, 0);
}));


test('assistant revision during generation cannot commit the stale post-response scan', () => withHost(async h => {
    installBessaChat(h);
    const entered = deferred(), release = deferred();
    setProvider(h, payloadForBessa(completeFields()), async () => { entered.resolve(); await release.promise; });
    const pending = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat[1].mes = 'Revised while scanner generation was pending.';
    release.resolve();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(h.metrics.posts, 0);
    assert.equal(h.api.scanStatus().status, 'blocked');
}));


test('next-generation interceptor waits for preceding scan after user append and scanner quiet generation does not recurse', () => withHost(async h => {
    installBessaChat(h);
    const entered = deferred(), release = deferred();
    let nestedAborted = false;
    setProvider(h, payloadForBessa(completeFields()), async () => {
        entered.resolve();
        await h.entry.npcStateGenerationInterceptor([], 0, () => { nestedAborted = true; });
        await release.promise;
    });
    const pending = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat.push({ is_user: true, name: 'Lucien Noctis', mes: 'I take the contract.' });
    let aborted = false;
    let gateSettled = false;
    const gate = h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, () => { aborted = true; });
    gate.finally(() => { gateSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(gateSettled, false, 'ordinary next-turn interceptor must actually wait while the previous scan is pending');
    release.resolve();
    const [scan] = await Promise.all([pending, gate]);
    assert.equal(scan.ok, true);
    assert.equal(aborted, false);
    assert.equal(nestedAborted, false);
    assert.equal(h.metrics.generations, 1);
    assert.equal(h.persisted().lastScannedMessageId, 1);
}));


test('failed automatic scan blocks next generation and remains retryable', () => withHost(async h => {
    installBessaChat(h);
    h.context.generateRaw = async () => { h.metrics.generations += 1; throw new Error('fixture provider failed'); };
    const scan = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(scan.ok, false);
    assert.equal(h.api.scanStatus().status, 'failed');
    let aborted = false;
    await h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, immediate => { aborted = immediate === true; });
    assert.equal(aborted, true);
    assert.equal(h.api.scanStatus().status, 'failed');
}));


test('post-response coordinator aborts an overlong owning request at synchronization timeout', async () => {
    const source = { valid: true, chatKey: 'chat', messageId: 1, identity: 'chat|1|source' };
    let aborted = false;
    const coordinator = createPostResponseCoordinator({
        getSource: () => source, getLatestSource: () => source,
        getSettings: () => ({ enabled: true, autoScan: true }),
        runScan: (_id, { signal }) => new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve({ ok: false, discarded: true, reason: 'scan-cancelled' }); }, { once: true })),
    });
    coordinator.process(1);
    const result = await coordinator.settleLatest({ timeoutMs: 1 });
    assert.equal(result.reason, 'scan-wait-timeout');
    assert.equal(aborted, true);
    assert.equal(coordinator.status('chat').status, 'failed');
});



test('coordinator retires older completed revisions and ignores delayed duplicate completion events', async () => {
    let source = { valid: true, chatKey: 'chat', messageId: 1, identity: 'chat|1|a' };
    let calls = 0;
    const coordinator = createPostResponseCoordinator({
        getSource: () => source, getLatestSource: () => source,
        getSettings: () => ({ enabled: true, autoScan: true }),
        runScan: async id => { calls += 1; return { ok: true, messageId: id }; },
    });
    assert.equal((await coordinator.process(1)).ok, true);
    source = { valid: true, chatKey: 'chat', messageId: 3, identity: 'chat|3|b' };
    assert.equal((await coordinator.process(3)).ok, true);
    source = { valid: true, chatKey: 'chat', messageId: 1, identity: 'chat|1|a' };
    const delayed = await coordinator.process(1);
    assert.equal(delayed.reason, 'stale-completion');
    assert.equal(calls, 2);
});


test('same-position replacement and chat clear abort superseded coordinator work', async () => {
    let source = { valid: true, chatKey: 'chat', messageId: 1, identity: 'chat|1|old' };
    const aborted = [];
    const pending = [];
    const coordinator = createPostResponseCoordinator({
        getSource: () => source, getLatestSource: () => source,
        getSettings: () => ({ enabled: true, autoScan: true }),
        runScan: (_id, { signal, source: owned }) => new Promise(resolve => {
            pending.push(owned.identity);
            signal.addEventListener('abort', () => { aborted.push(owned.identity); resolve({ ok: false, discarded: true, reason: 'scan-cancelled' }); }, { once: true });
        }),
    });
    const old = coordinator.process(1);
    await Promise.resolve();
    source = { valid: true, chatKey: 'chat', messageId: 1, identity: 'chat|1|new' };
    const replacement = coordinator.process(1);
    await Promise.resolve();
    assert.deepEqual(aborted, ['chat|1|old']);
    coordinator.clearChat('chat');
    assert.deepEqual(aborted, ['chat|1|old', 'chat|1|new']);
    await Promise.all([old, replacement]);
    assert.deepEqual(pending, ['chat|1|old', 'chat|1|new']);
    assert.equal(coordinator.status('chat').status, 'idle');
});

function summaryAttempt(excerpt, { otherNpcNames = [], aliases = [], playerName = 'Lucien Noctis' } = {}) {
    const diagnostics = [];
    const npc = normalizeNpc({ id: 'bessa', name: 'Bessa Vond', aliases, relationshipSummary: '' });
    const next = applyRelationshipSummaryProjection(npc, {
        relationshipSummary: 'Professional clerk-applicant interaction.',
        relationshipSummaryEvidence: { excerpts: [excerpt], explanation: excerpt },
        relationshipChange: structuredClone(ZERO_REL),
    }, { playerName, otherNpcNames, relationshipEvidenceSources: [{ id: 'visible', kind: 'visible', text: excerpt }], relationshipSummaryDiagnostics: diagnostics });
    return { next, diagnostics };
}

test('Current Dynamic accepts unique short names and narrator second person but rejects ambiguity and quoted addressees', () => {
    for (const excerpt of [
        'Bessa nudged the bone-handled quill into your fingers.',
        'Bessa Vond nudged the bone-handled quill into your fingers.',
        'Bessa nudged the bone-handled quill into Lucien Noctis’s fingers.',
        "Bessa Vond nudged the quill into Lucien Noctis's fingers.",
    ]) assert.equal(summaryAttempt(excerpt).next.relationshipSummary, 'Professional clerk-applicant interaction.', excerpt);

    for (const [excerpt, others] of [
        ['Bessa nudged the quill into your fingers.', ['Bessa Orr']],
        ['Mira Vale nudged the quill into your fingers.', ['Mira Vale']],
        ['Bessa Vond told Mira Vale, “You should take the quill.”', ['Mira Vale']],
        ['Bessa Vond told Mira Vale, ‘You should take the quill.’', ['Mira Vale']],
        ["Bessa Vond told Mira Vale, 'You should take the quill.'", ['Mira Vale']],
        ['Bessa Vond told Mira Vale, "You should take the quill."', ['Mira Vale']],
    ]) {
        const result = summaryAttempt(excerpt, { otherNpcNames: others });
        assert.equal(result.next.relationshipSummary, '', excerpt);
        assert.equal(result.diagnostics.at(-1)?.reason, 'wrong-summary-target', excerpt);
    }
    assert.equal(summaryAttempt('Bee nudged the quill into your fingers.', { aliases: ['Bee'], otherNpcNames: ['Bee'] }).next.relationshipSummary, '');
});

function applyBessa(fields) {
    const state = createEmptyState('coverage'); state.branchSafety = { status: 'safe' };
    return applyScanResult(state, payloadForBessa(fields), {
        sourceMessageId: 1, turn: 1, currentAdmissionText: BESSA_ASSISTANT, profileContext: `${BESSA_USER}\n${BESSA_ASSISTANT}`,
        relationshipContext: `${BESSA_USER}\n${BESSA_ASSISTANT}`, playerName: 'Lucien Noctis', applyReturnedNpcPatches: true,
        requireDossierCoverage: true, applyRelationship: true, preservePresence: true, preserveObservation: true,
    });
}

test('group-only coverage remains compatible but records unaccounted fields instead of fabricated completeness', () => {
    const result = applyBessa({ evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], appearance: 'Auburn hair and ink-stained fingertips.' });
    const coverage = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.equal(coverage?.coverageKind, 'group-only');
    for (const field of ['mood', 'location', 'goal', 'speech']) assert.ok(coverage.missingFields.includes(field), field);
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.ok(summary.accepted >= 1);
    assert.ok(summary.omitted >= 4);
});

test('new-NPC collection bootstrap consumes only field-specific aliases', () => {
    const result = applyBessa({
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: { unchanged: [], insufficient: [], unavailable: [] },
        mannerisms: [{ memory: [{ bad: true }, 'garbage'], mannerism: 'Tapped the contract writing with a stained nail during intake.' }],
    });
    const bessa = result.state.npcs.find(npc => npc.name === 'Bessa Vond');
    assert.deepEqual(bessa.mannerisms, ['Tapped the contract writing with a stained nail during intake.']);
    assert.equal(JSON.stringify(bessa).includes('[object Object]'), false);
});

test('workflow settings migration retires obsolete automatic modes without changing explicit autoScan choice', () => {
    for (const autoScan of [true, false]) {
        const settings = normalizeSettings({ autoScan, scanAfterEachResponse: !autoScan, fallbackScan: true, newNpcHistoryEnrichment: true, scannerResponseTokens: 15000 });
        assert.equal(settings.autoScan, autoScan);
        assert.equal(settings.workflowMode, 'post-response-v1');
        assert.equal('scanAfterEachResponse' in settings, false);
        assert.equal('fallbackScan' in settings, false);
        assert.equal('newNpcHistoryEnrichment' in settings, false);
        assert.equal(settings.scannerResponseTokens, 15000);
    }
});

test('foreground is continuity-only and remains useful below the old extraction budget floor', () => {
    const state = createEmptyState('inject'); state.branchSafety = { status: 'safe' };
    state.npcs = [normalizeNpc({ id: 'bessa', name: 'Bessa Vond', role: 'Front desk clerk', personality: 'Practical', speech: 'Clipped', mood: 'Busy', location: 'Counter', goal: 'Process intake', status: 'Working', present: true })];
    state.lastObservation = { exchangeActiveNpcIds: ['bessa'], finalPresentNpcIds: ['bessa'], worldActiveNpcIds: [] };
    const built = buildForegroundInjection(state, { enabled: true, inject: true, injectBudgetTokens: 320, injectLimit: 6, dossierLimits: {} });
    assert.equal(built.diagnostics.selectedNpcCount, 1);
    assert.ok(built.diagnostics.totalTokenEstimate <= 320);
    assert.match(built.prompt, /Bessa Vond/);
    for (const forbidden of ['npc_state_v1', 'OUTPUT CONTRACT', 'fieldEvaluations', 'relationshipChange', 'same generation completeness']) assert.doesNotMatch(`${foregroundContract()}\n${built.prompt}`, new RegExp(forbidden, 'i'));
});

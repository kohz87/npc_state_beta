import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeNpcStateControl } from '../src/foreground.js';
import { buildForegroundInjection } from '../src/injection.js';
import { compactForegroundNpc } from '../src/foreground-context.js';
import { createNpcStateEngine } from '../src/engine.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const ALL_GROUPS = ['canon', 'profile', 'live', 'memory', 'npcRelationships'];
const LIVE_FIELDS = ['mood', 'location', 'goal', 'status'];

function liveState(overrides = {}) {
    const state = createEmptyState('chat:first-pass-live');
    state.branchSafety = { status: 'safe' };
    state.lastObservation = { exchangeActiveNpcIds: ['npc-sora'], finalPresentNpcIds: ['npc-sora'], worldActiveNpcIds: [] };
    state.npcs = [normalizeNpc({
        id: 'npc-sora', name: 'Sora', role: 'Companion',
        appearance: 'golden-blue hair and travel clothes '.repeat(50),
        personality: 'Curious, observant, affectionate, and quietly proud. '.repeat(20),
        speech: 'Animated, direct, and inquisitive. '.repeat(20),
        background: 'A long established background. '.repeat(60),
        behaviorProfile: Array.from({ length: 8 }, (_, i) => `Behavior ${i}: carefully studies unfamiliar situations before acting.`),
        mannerisms: Array.from({ length: 8 }, (_, i) => `Mannerism ${i}: taps one boot while thinking through a problem.`),
        memories: Array.from({ length: 8 }, (_, i) => `Memory ${i}: a distinct consequential event.`),
        keyRelationships: Array.from({ length: 8 }, (_, i) => `Person ${i} - ally`),
        mood: 'Nervous about the storm.', location: 'Inside the mountain shelter.',
        goal: 'Reach the southern gate before dark.', status: 'Preparing to leave the shelter.',
        present: true, ...overrides,
    })];
    return state;
}

function noRelationshipChange(reason = 'No player-relationship change.') {
    return {
        evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
        priority: [], axisEvidence: {}, evidence: '', reason,
    };
}

function payload(patch, active = true) {
    return {
        exchangeActiveNpcIds: active ? ['npc-sora'] : [],
        inChatNpcIds: active ? ['npc-sora'] : [],
        worldActiveNpcIds: [],
        npcs: patch ? [{ id: 'npc-sora', name: 'Sora', ...patch }] : [],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function foregroundContext(prompt) {
    const marker = 'FOREGROUND CONTEXT (selected once; collection refs are edit targets):\n';
    const at = prompt.indexOf(marker);
    assert.ok(at >= 0, 'foreground context marker');
    return JSON.parse(prompt.slice(at + marker.length));
}

function apply(state, result, context, extra = {}) {
    return applyScanResult(state, result, {
        sourceMessageId: 1, turn: 1,
        profileContext: context, semanticEvidenceContext: context,
        currentAdmissionText: context, relationshipContext: context,
        applyReturnedNpcPatches: true, applyRelationship: false,
        preservePresence: true, preserveObservation: true,
        ...extra,
    });
}

function engineHarness(state, chat, settingsOverrides = {}) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(chat) };
    let generations = 0;
    const settings = normalizeSettings({ scanAfterEachResponse: false, ...settingsOverrides });
    const adapters = {
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => settings,
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        getStablePointer: () => pointer,
        persistSettings: () => {},
        generate: async () => { generations += 1; throw new Error('First-pass embedded capture must not make another model request.'); },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
    };
    return {
        engine: createNpcStateEngine(adapters),
        reload: () => createNpcStateEngine(adapters),
        context,
        generations: () => generations,
        persisted: () => decodeV3Payload(saved, key).state,
    };
}

function consume(visible, scanPayload) {
    const message = `${visible}\n<npc_state_v1>${JSON.stringify(scanPayload)}</npc_state_v1>`;
    const consumed = consumeNpcStateControl(message, { requireLifeStateUpdates: true });
    assert.equal(consumed.errors.length, 0);
    assert.ok(consumed.parsed);
    return consumed;
}

test('minimum selected foreground dossier always retains the four first-pass live comparison values', () => {
    const state = liveState();
    const minimal = compactForegroundNpc(state.npcs[0], 4, { memories: 8, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 });
    assert.deepEqual(Object.fromEntries(LIVE_FIELDS.map(field => [field, minimal.live[field]])), {
        mood: 'Nervous about the storm.',
        location: 'Inside the mountain shelter.',
        goal: 'Reach the southern gate before dark.',
        status: 'Preparing to leave the shelter.',
    });

    const result = buildForegroundInjection(state, {
        enabled: true, autoScan: true, inject: true, injectLimit: 1, injectBudgetTokens: 1800,
        newNpcAdmissionMode: 'balanced', newNpcHistoryEnrichment: false,
        foregroundCurrentUserText: 'Sora checks the route.',
        dossierLimits: { memories: 8, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 },
    });
    assert.equal(result.diagnostics.selectedNpcCount, 1);
    assert.ok(result.diagnostics.totalTokenEstimate <= result.diagnostics.effectiveBudgetTokens);
    const dossier = foregroundContext(result.prompt).dossiers[0];
    for (const field of LIVE_FIELDS) assert.ok(dossier.live[field], field);
    assert.match(result.prompt, /live group specifically means every supplied first-pass live value/);
});

test('one completed embedded first pass changes all four fields, persists them, and needs no completeness request', async () => {
    const state = liveState();
    const visible = 'Sora exhales in relief. Sora walks into the market square. Sora decides to learn the city routes. Sora studies the posted map.';
    const semanticUpdates = [
        { field: 'mood', operation: 'replace', value: 'Relieved.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Sora exhales in relief.' }], explanation: 'Current mood changed.' },
        { field: 'location', operation: 'replace', value: 'Market square.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Sora walks into the market square.' }], explanation: 'Current location changed.' },
        { field: 'goal', operation: 'replace', value: 'Learn the city routes.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Sora decides to learn the city routes.' }], explanation: 'Current goal changed.' },
        { field: 'status', operation: 'replace', value: 'Studying the posted map.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Sora studies the posted map.' }], explanation: 'Current activity changed.' },
    ];
    const scan = payload({
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates,
        activityEvidence: {
            exchangeActive: { excerpts: ['Sora walks into the market square.'], explanation: 'Sora acts in this exchange.' },
            inChat: { excerpts: ['Sora studies the posted map.'], explanation: 'Sora remains in the scene.' },
        },
        relationshipChange: noRelationshipChange(),
    });
    const consumed = consume(visible, scan);
    const h = engineHarness(state, [{ is_user: true, mes: 'Sora, shall we head out?' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }]);
    await h.engine.loadChat();
    const result = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.coverageDiagnostics.length, 0);
    assert.equal(result.semanticDiagnostics.filter(row => LIVE_FIELDS.includes(row.field) && row.status === 'applied').length, 4);
    const dossier = h.engine.getDossierNpc('npc-sora');
    assert.equal(dossier.mood, 'Relieved.');
    assert.equal(dossier.location, 'Market square.');
    assert.equal(dossier.goal, 'Learn the city routes.');
    assert.equal(dossier.status, 'Studying the posted map.');
    assert.equal(h.persisted().npcs[0].location, 'Market square.');
    const reloaded = await h.reload().loadChat();
    assert.equal(reloaded.npcs[0].status, 'Studying the posted map.');
    assert.equal(h.generations(), 0);
});

test('supported direct compatibility values normalize once into the semantic validator and cannot override explicit semantic updates', () => {
    const state = liveState();
    const evidence = 'Sora | Mood: Relieved. | Location: Market square. | Goal: Learn city routes. | Status: Studying map.';
    const result = apply(state, payload({
        evaluatedGroups: ['live'],
        mood: 'Relieved.', location: 'Forbidden tower.', goal: 'Learn city routes.', status: 'Studying map.',
        semanticUpdates: [{
            field: 'location', operation: 'replace', value: 'Market square.', durability: 'temporary',
            sources: [{ messageId: 1, excerpt: 'Location: Market square.' }], explanation: 'Canonical semantic update wins.',
        }],
    }), evidence);
    const npc = result.state.npcs[0];
    assert.equal(npc.mood, 'Relieved.');
    assert.equal(npc.location, 'Market square.');
    assert.equal(npc.goal, 'Learn city routes.');
    assert.equal(npc.status, 'Studying map.');
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied' && LIVE_FIELDS.includes(row.field)).length, 4);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'location' && row.status === 'unsupported-direct-proposal'), false);
});

test('unsupported direct existing live proposals are diagnosed instead of silently disappearing', () => {
    const state = liveState();
    const evidence = 'Sora smiles and checks the door latch.';
    const result = apply(state, payload({
        evaluatedGroups: ['live'],
        mood: 'Relieved.', location: 'Market square.', goal: 'Learn the city routes.', status: 'Studying the posted map.',
        semanticUpdates: [],
    }), evidence);
    const npc = result.state.npcs[0];
    assert.equal(npc.mood, 'Nervous about the storm.');
    assert.equal(npc.location, 'Inside the mountain shelter.');
    assert.equal(npc.goal, 'Reach the southern gate before dark.');
    assert.equal(npc.status, 'Preparing to leave the shelter.');
    for (const field of LIVE_FIELDS) {
        const diagnostic = result.semanticDiagnostics.find(row => row.field === field && row.status === 'unsupported-direct-proposal');
        assert.equal(diagnostic?.reason, 'missing-field-specific-evidence', field);
    }
});

test('evaluated unchanged, omission, unknown live coverage, and explicit removal remain distinct', () => {
    const state = liveState();
    const context = 'Sora waits quietly; nothing about her current plan changes.';
    const checked = apply(state, payload({ evaluatedGroups: ALL_GROUPS, semanticUpdates: [] }), context, { requireDossierCoverage: true });
    assert.equal(checked.coverageDiagnostics.length, 0);
    assert.equal(checked.state.npcs[0].goal, 'Reach the southern gate before dark.');

    const omitted = apply(liveState(), payload(null), context, { requireDossierCoverage: true });
    assert.equal(omitted.coverageDiagnostics[0].status, 'missing-npc-patch');

    const unknown = apply(liveState(), payload({ evaluatedGroups: ['profile'], semanticUpdates: [] }), context, { requireDossierCoverage: true });
    assert.equal(unknown.coverageDiagnostics[0].status, 'incomplete-evaluation');
    assert.equal(unknown.coverageDiagnostics[0].missingGroups.includes('live'), true);

    const completed = 'Sora reaches the southern gate. Her travel objective is complete, with no new objective established.';
    const removed = apply(liveState(), payload({ evaluatedGroups: ['live'], semanticUpdates: [{
        field: 'goal', operation: 'remove', durability: 'temporary',
        sources: [{ messageId: 1, excerpt: 'Sora reaches the southern gate.' }], explanation: 'The goal ended without replacement.',
    }] }), completed);
    assert.equal(removed.state.npcs[0].goal, '');
    assert.equal(removed.semanticDiagnostics.some(row => row.field === 'goal' && row.operation === 'remove' && row.status === 'applied'), true);
});

test('manual locks and out-of-scope evidence reject live changes with useful diagnostics', () => {
    const state = liveState({ manualProfileFields: ['personality'] });
    const context = 'Sora walks toward the market.';
    const result = apply(state, payload({ evaluatedGroups: ['profile', 'live'], semanticUpdates: [
        { field: 'personality', operation: 'replace', value: 'Reckless.', durability: 'durable', sources: [{ messageId: 1, excerpt: 'Sora walks toward the market.' }], explanation: 'Locked stable field.' },
        { field: 'location', operation: 'replace', value: 'Market square.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Sora is already inside the royal palace.' }], explanation: 'Out of scope.' },
    ] }), context);
    assert.match(result.state.npcs[0].personality, /^Curious, observant/);
    assert.equal(result.state.npcs[0].location, 'Inside the mountain shelter.');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'personality' && row.status === 'manually-protected'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'location' && row.status === 'invalid-source-reference'), true);
});

test('structured evidence keeps World_State and NPC_Inner_Chatter authority field-scoped', () => {
    const state = liveState();
    const visible = 'Sora remains off-screen.';
    const world = 'Sora | Location: North gate | Status: Patrolling the north gate.';
    const inner = 'Sora | Mood: Quietly relieved | Goal: Protect Lucien.';
    const result = apply(state, payload({ evaluatedGroups: ['live'], semanticUpdates: [
        { field: 'location', operation: 'replace', value: 'North gate.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Location: North gate' }], explanation: 'World state location.' },
        { field: 'status', operation: 'replace', value: 'Patrolling the north gate.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Status: Patrolling the north gate' }], explanation: 'World state status.' },
        { field: 'mood', operation: 'replace', value: 'Quietly relieved.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Mood: Quietly relieved' }], explanation: 'Private mood.' },
        { field: 'goal', operation: 'replace', value: 'Protect Lucien.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Goal: Protect Lucien' }], explanation: 'Private goal.' },
        { field: 'mood', operation: 'replace', value: 'Patrolling.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Status: Patrolling the north gate' }], explanation: 'World state must not prove mood.' },
        { field: 'location', operation: 'replace', value: 'Protect Lucien.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Goal: Protect Lucien' }], explanation: 'Inner chatter must not prove location.' },
    ] }), visible, { semanticWorldContext: world, semanticPrivateContext: inner });
    const npc = result.state.npcs[0];
    assert.equal(npc.location, 'North gate.');
    assert.equal(npc.status, 'Patrolling the north gate.');
    assert.equal(npc.mood, 'Quietly relieved.');
    assert.equal(npc.goal, 'Protect Lucien.');
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'invalid-source-reference').length, 2);
});

test('duplicate embedded processing is idempotent and does not replay player relationship state', async () => {
    const state = liveState();
    const visible = 'Lucien keeps his promise to Sora. Sora thanks him and relies on him a little more.';
    const scan = payload({
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [],
        activityEvidence: {
            exchangeActive: { excerpts: ['Sora thanks him and relies on him a little more.'], explanation: 'Sora reacts in the exchange.' },
            inChat: { excerpts: ['Sora thanks him and relies on him a little more.'], explanation: 'Sora remains present.' },
        },
        relationshipChange: {
            evaluated: true, impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            priority: ['trust'],
            axisEvidence: { trust: { excerpts: ['Sora thanks him and relies on him a little more.'], explanation: 'Reliance increases trust.' } },
            evidence: 'Sora relies on Lucien more.', reason: 'A kept promise modestly increases trust.',
        },
    });
    const consumed = consume(visible, scan);
    const h = engineHarness(state, [{ is_user: true, mes: 'I kept my promise.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }]);
    await h.engine.loadChat();
    const first = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(first.ok, true);
    const afterFirst = h.engine.getDossierNpc('npc-sora');
    const relationshipSnapshot = structuredClone({
        relationship: afterFirst.relationship,
        relationshipProgress: afterFirst.relationshipProgress,
        relationshipHistory: afterFirst.relationshipHistory,
        relationshipEvidenceHistory: afterFirst.relationshipEvidenceHistory,
        lastRelationshipChange: afterFirst.lastRelationshipChange,
    });
    const second = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(second.ok, true);
    assert.equal(second.skipped, true);
    const afterSecond = h.engine.getDossierNpc('npc-sora');
    assert.deepEqual({
        relationship: afterSecond.relationship,
        relationshipProgress: afterSecond.relationshipProgress,
        relationshipHistory: afterSecond.relationshipHistory,
        relationshipEvidenceHistory: afterSecond.relationshipEvidenceHistory,
        lastRelationshipChange: afterSecond.lastRelationshipChange,
    }, relationshipSnapshot);
});

test('edited, deleted, and replaced-swipe responses cannot apply a stale embedded payload', async () => {
    const visible = 'Sora walks into the market square.';
    const scan = payload({ evaluatedGroups: ['live'], semanticUpdates: [{
        field: 'location', operation: 'replace', value: 'Market square.', durability: 'temporary',
        sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current location.',
    }], relationshipChange: noRelationshipChange() });

    const edited = engineHarness(liveState(), [{ is_user: true, mes: 'Go.' }, { is_user: false, mes: 'Sora stays in the shelter.', swipe_id: 0 }]);
    await edited.engine.loadChat();
    const editResult = await edited.engine.applyEmbeddedScan(1, scan, { expectedMessageText: visible, expectedSwipeId: 0 });
    assert.equal(editResult.discarded, true);
    assert.equal(edited.engine.getDossierNpc('npc-sora').location, 'Inside the mountain shelter.');

    const deleted = engineHarness(liveState(), [{ is_user: true, mes: 'Go.' }]);
    await deleted.engine.loadChat();
    const deleteResult = await deleted.engine.applyEmbeddedScan(1, scan, { expectedMessageText: visible, expectedSwipeId: 0 });
    assert.equal(deleteResult.ok, false);
    assert.equal(deleted.engine.getDossierNpc('npc-sora').location, 'Inside the mountain shelter.');

    const swiped = engineHarness(liveState(), [{ is_user: true, mes: 'Go.' }, { is_user: false, mes: visible, swipe_id: 1 }]);
    await swiped.engine.loadChat();
    const swipeResult = await swiped.engine.applyEmbeddedScan(1, scan, { expectedMessageText: visible, expectedSwipeId: 0 });
    assert.equal(swipeResult.discarded, true);
    assert.equal(swiped.engine.getDossierNpc('npc-sora').location, 'Inside the mountain shelter.');
});

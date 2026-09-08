import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { consumeNpcStateControl } from '../src/foreground.js';
import { foregroundContract } from '../src/foreground-contract.js';
import { buildForegroundInjection } from '../src/injection.js';
import { createNpcStateEngine } from '../src/engine.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const ALL_GROUPS = ['canon', 'profile', 'live', 'memory', 'npcRelationships'];

function noRelationshipChange() {
    return {
        evaluated: true,
        impact: 'none',
        delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
        priority: [], axisEvidence: {}, evidence: '', reason: 'No player-relationship change.',
    };
}

const MIRA_VISIBLE = [
    'Mira is a silver-haired human innkeeper.',
    'Mira smiles warmly behind the Lantern Inn counter.',
    'Mira says in a warm, measured voice that she will prepare Lucien’s room.',
    'Mira remains behind the Lantern Inn counter.',
    'Mira begins preparing Lucien’s room.',
    'Mira intends to have the room ready before dusk.',
].join(' ');

function semantic(field, operation, value, excerpt, durability) {
    return { field, operation, value, durability, sources: [{ messageId: 1, excerpt }], explanation: `Grounded ${field}.` };
}

function miraSemanticUpdates(operation = 'establish') {
    return [
        semantic('role', operation, 'Innkeeper', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('species', operation, 'Human', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('appearance', operation, 'Silver-haired woman with a warm smile.', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('speech', operation, 'Warm and measured.', 'Mira says in a warm, measured voice that she will prepare Lucien’s room.', 'durable'),
        semantic('mood', operation, 'Warmly welcoming.', 'Mira smiles warmly behind the Lantern Inn counter.', 'temporary'),
        semantic('location', operation, 'Behind the Lantern Inn counter.', 'Mira remains behind the Lantern Inn counter.', 'temporary'),
        semantic('status', operation, 'Preparing Lucien’s room.', 'Mira begins preparing Lucien’s room.', 'temporary'),
        semantic('goal', operation, 'Have Lucien’s room ready before dusk.', 'Mira intends to have the room ready before dusk.', 'temporary'),
    ];
}

function identityEvidence(name = 'Mira', excerpt = 'Mira is a silver-haired human innkeeper.') {
    return { anchor: name, excerpts: [excerpt], explanation: 'The current visible response identifies this NPC.' };
}

function activityEvidence(name = 'Mira') {
    return {
        exchangeActive: { excerpts: [`${name} begins preparing Lucien’s room.`], explanation: `${name} acts in this exchange.` },
        inChat: { excerpts: [`${name} remains behind the Lantern Inn counter.`], explanation: `${name} remains in the scene.` },
    };
}

function miraPatch({ id = '', semanticUpdates = miraSemanticUpdates(), direct = {} } = {}) {
    return {
        id,
        name: 'Mira',
        identityKind: 'named',
        identityEvidence: identityEvidence(),
        activityEvidence: activityEvidence(),
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates,
        relationshipChange: noRelationshipChange(),
        ...direct,
    };
}

function payload(patches, active = ['Mira'], present = active) {
    return {
        exchangeActiveNpcIds: active,
        inChatNpcIds: present,
        worldActiveNpcIds: [],
        npcs: patches,
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function apply(state, result, visible = MIRA_VISIBLE, extra = {}) {
    return applyScanResult(state, result, {
        sourceMessageId: 1,
        turn: 1,
        currentAdmissionText: visible,
        profileContext: visible,
        semanticEvidenceContext: visible,
        relationshipContext: visible,
        applyReturnedNpcPatches: true,
        requireDossierCoverage: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
        ...extra,
    });
}

function consume(visible, scanPayload) {
    const message = `${visible}\n<npc_state_v1>${JSON.stringify(scanPayload)}</npc_state_v1>`;
    const consumed = consumeNpcStateControl(message, { requireLifeStateUpdates: true });
    assert.deepEqual(consumed.errors, []);
    assert.ok(consumed.parsed);
    return consumed;
}

function engineHarness({ state, chat, settings = {}, generate = null, deferFirstWrite = false } = {}) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(chat) };
    let generations = 0;
    let postCount = 0;
    let releaseFirstWrite;
    let firstWriteStartedResolve;
    const firstWriteStarted = new Promise(resolve => { firstWriteStartedResolve = resolve; });
    const normalizedSettings = normalizeSettings({ scanAfterEachResponse: false, branchRescan: false, ...settings });
    const adapters = {
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizedSettings,
        getPointer: () => pointer,
        getStablePointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async (...args) => {
            generations += 1;
            if (!generate) throw new Error('Embedded first pass must not make a model request.');
            return generate(...args);
        },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                postCount += 1;
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                if (deferFirstWrite && postCount === 1) {
                    firstWriteStartedResolve();
                    await new Promise(resolve => { releaseFirstWrite = resolve; });
                }
                saved = nextSaved;
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
        postCount: () => postCount,
        persisted: () => decodeV3Payload(saved, key).state,
        firstWriteStarted,
        releaseFirstWrite: () => releaseFirstWrite?.(),
    };
}

function emptySafeState(key = 'chat:v075') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function assertMiraPopulated(npc) {
    assert.ok(npc);
    assert.equal(npc.role, 'Innkeeper');
    assert.equal(npc.species, 'Human');
    assert.equal(npc.appearance, 'Silver-haired woman with a warm smile.');
    assert.equal(npc.speech, 'Warm and measured.');
    assert.equal(npc.mood, 'Warmly welcoming.');
    assert.equal(npc.location, 'Behind the Lantern Inn counter.');
    assert.equal(npc.status, 'Preparing Lucien’s room.');
    assert.equal(npc.goal, 'Have Lucien’s room ready before dusk.');
}

test('new NPC with empty id applies complete semantic bootstrap through one accepted identity binding', () => {
    const result = apply(emptySafeState(), payload([miraPatch({ id: '' })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.match(mira.id, /^npc-mira(?:-|$)/);
    assert.equal(result.patchResolutions[0].status, 'accepted');
    assert.equal(result.patchResolutions[0].npcId, mira.id);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    const coverage = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.equal(coverage?.coverageKind, 'group-only');
    assert.ok(coverage?.missingFields?.includes('personality'));
});

test('unexpected nonempty model id is a transport hint and semantic updates follow the locally allocated id', () => {
    const result = apply(emptySafeState(), payload([miraPatch({ id: 'mira' })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.notEqual(mira.id, 'mira');
    assert.match(mira.id, /^npc-mira(?:-|$)/);
    assert.equal(result.patchResolutions[0].npcId, mira.id);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
});

test('supported direct new-dossier bootstrap fields still work alongside the identity handoff', () => {
    const state = emptySafeState('chat:direct-bootstrap');
    const direct = {
        role: 'Innkeeper', species: 'Human', appearance: 'Silver-haired woman with a warm smile.',
        speech: 'Warm and measured.', personality: 'Hospitable and attentive.',
        mood: 'Warmly welcoming.', location: 'Behind the Lantern Inn counter.',
        status: 'Preparing Lucien’s room.', goal: 'Have Lucien’s room ready before dusk.',
        behaviorProfile: ['Checks guest needs before preparing rooms.'], mannerisms: ['Smiles before answering a guest.'],
        memories: [], keyRelationships: [],
    };
    const result = apply(state, payload([miraPatch({ id: 'transport-mira', semanticUpdates: [], direct })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.equal(mira.personality, 'Hospitable and attentive.');
    assert.deepEqual(mira.behaviorProfile, ['Checks guest needs before preparing rooms.']);
    assert.deepEqual(mira.mannerisms, ['Smiles before answering a guest.']);
});

test('mixed existing and multiple new NPCs retain independent accepted bindings', () => {
    const state = emptySafeState('chat:mixed');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' })];
    const visible = MIRA_VISIBLE + ' Rhea greets Sora at the door. Rhea remains by the door. Sora wakes and waves.';
    const rhea = {
        id: 'model-rhea', name: 'Rhea', identityKind: 'named',
        identityEvidence: { anchor: 'Rhea', excerpts: ['Rhea greets Sora at the door.'], explanation: 'Named in current response.' },
        activityEvidence: {
            exchangeActive: { excerpts: ['Rhea greets Sora at the door.'], explanation: 'Acts now.' },
            inChat: { excerpts: ['Rhea remains by the door.'], explanation: 'Still present.' },
        },
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [semantic('role', 'establish', 'Courier', 'Rhea greets Sora at the door.', 'durable')],
        relationshipChange: noRelationshipChange(),
    };
    const sora = {
        id: 'sora', name: 'Sora', evaluatedGroups: ['live'],
        semanticUpdates: [semantic('mood', 'replace', 'Awake.', 'Sora wakes and waves.', 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const result = apply(state, payload([sora, miraPatch({ id: 'model-mira' }), rhea], ['sora', 'Mira', 'Rhea'], ['sora', 'Mira', 'Rhea']), visible);
    assert.equal(result.state.npcs.length, 3);
    assert.equal(result.state.npcs.find(npc => npc.id === 'sora').mood, 'Awake.');
    assertMiraPopulated(result.state.npcs.find(npc => npc.name === 'Mira'));
    const rheaNpc = result.state.npcs.find(npc => npc.name === 'Rhea');
    assert.equal(rheaNpc.role, 'Courier');
    assert.notEqual(rheaNpc.id, 'model-rhea');
    assert.deepEqual(result.patchResolutions.map(row => row.status), ['accepted', 'accepted', 'accepted']);
});

test('id/name conflict is rejected once and cannot mutate either NPC downstream', () => {
    const state = emptySafeState('chat:conflict');
    state.npcs = [
        normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' }),
        normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' }),
    ];
    const visible = 'Mira welcomes Lucien from behind the Lantern Inn counter.';
    const bad = {
        id: 'sora', name: 'Mira', identityKind: 'named',
        evaluatedGroups: ['live'],
        semanticUpdates: [semantic('mood', 'replace', 'Welcoming.', visible, 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const result = apply(state, payload([bad], ['Mira'], ['Mira']), visible);
    assert.equal(result.state.npcs.find(npc => npc.id === 'sora').mood, 'Sleepy.');
    assert.equal(result.state.npcs.find(npc => npc.id === 'mira').mood, 'Calm.');
    assert.equal(result.patchResolutions[0].status, 'rejected');
    assert.match(result.patchResolutions[0].reason, /^identity-conflict:/);
    assert.equal(result.semanticDiagnostics.some(row => row.status === 'identity-rejected' && row.proposedFields.includes('mood')), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), false);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'identity-rejected'), true);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
});

test('alias collision is rejected while supported stable-id rename remains valid', () => {
    const collisionState = emptySafeState('chat:alias-collision');
    collisionState.npcs = [
        normalizeNpc({ id: 'sora', name: 'Sora', aliases: ['Sunbird'], mood: 'Sleepy.' }),
        normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' }),
    ];
    const bad = {
        id: 'mira', name: 'Sunbird', identityKind: 'named', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Welcoming.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Mira welcomes Lucien.' }], explanation: 'Current mood.' }],
        relationshipChange: noRelationshipChange(),
    };
    const collision = apply(collisionState, payload([bad], ['mira'], ['mira']), 'Mira welcomes Lucien.');
    assert.equal(collision.patchResolutions[0].status, 'rejected');
    assert.equal(collision.state.npcs.find(npc => npc.id === 'mira').mood, 'Calm.');
    assert.equal(collision.state.npcs.find(npc => npc.id === 'sora').mood, 'Sleepy.');

    const renameState = emptySafeState('chat:rename');
    renameState.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' })];
    const visible = 'Sora introduces herself as Sora Storm and smiles.';
    const rename = apply(renameState, payload([{
        id: 'sora', name: 'Sora Storm', identityKind: 'named', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Cheerful.', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current mood.' }],
        relationshipChange: noRelationshipChange(),
    }], ['sora'], ['sora']), visible);
    const sora = rename.state.npcs[0];
    assert.equal(rename.patchResolutions[0].status, 'accepted');
    assert.equal(sora.name, 'Sora Storm');
    assert.equal(sora.aliases.includes('Sora'), true);
    assert.equal(sora.mood, 'Cheerful.');
});

test('diagnostics distinguish absent, unresolved, validation-rejected, applied, unchanged, and incomplete proposals', () => {
    const state = emptySafeState('chat:diagnostics');
    state.npcs = [normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' })];
    const visible = 'Mira welcomes Lucien.';

    const unresolvedVisible = 'A hooded figure watches silently.';
    const unresolved = apply(emptySafeState('chat:unresolved'), payload([{
        id: 'transport-ghost', name: 'Ghost', identityKind: 'named', evaluatedGroups: ['live'],
        activityEvidence: { exchangeActive: { excerpts: [unresolvedVisible], explanation: 'The figure acts now, but its claimed identity is not grounded.' } },
        semanticUpdates: [{ field: 'mood', operation: 'establish', value: 'Quiet.', durability: 'temporary', sources: [{ messageId: 1, excerpt: unresolvedVisible }], explanation: 'Mood.' }],
    }], ['Ghost'], []), unresolvedVisible);
    assert.equal(unresolved.semanticDiagnostics[0].status, 'identity-unresolved');
    assert.equal(unresolved.semanticDiagnostics[0].reason, 'identity-evidence-unresolved');

    const applied = apply(state, payload([{
        id: 'mira', name: 'Mira', evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Welcoming.', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current mood.' }],
    }], ['mira'], ['mira']), visible);
    assert.equal(applied.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), true);

    const invalid = apply(state, payload([{
        id: 'mira', name: 'Mira', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Angry.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'This sentence is not present.' }], explanation: 'Bad source.' }],
    }], ['mira'], ['mira']), visible);
    assert.equal(invalid.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'invalid-source-reference'), true);

    const checked = apply(state, payload([{ id: 'mira', name: 'Mira', evaluatedGroups: ALL_GROUPS, semanticUpdates: [] }], ['mira'], ['mira']), visible);
    assert.equal(checked.semanticDiagnostics.some(row => row.status === 'evaluated-groups' && row.evaluatedGroups.length === ALL_GROUPS.length), true);
    assert.equal(checked.semanticDiagnostics.some(row => row.status === 'evaluated-unchanged' && Array.isArray(row.evaluatedGroups)), false);
    assert.equal(checked.coverageDiagnostics[0]?.status, 'incomplete-evaluation');
    assert.equal(checked.coverageDiagnostics[0]?.coverageKind, 'group-only');

    const noProposal = apply(state, payload([{ id: 'mira', name: 'Mira', semanticUpdates: [] }], ['mira'], ['mira']), visible);
    assert.equal(noProposal.semanticDiagnostics.some(row => row.status === 'no-field-proposal'), true);
    assert.equal(noProposal.coverageDiagnostics[0].status, 'incomplete-evaluation');

    const absent = apply(state, payload([], ['mira'], ['mira']), visible);
    assert.equal(absent.coverageDiagnostics[0].status, 'missing-npc-patch');
});

test('identity failure is counted once in bounded operation summary even when semantic and coverage both report it', () => {
    const row = { patchIndex: 0, status: 'identity-rejected', reason: 'identity-conflict:Mira', proposedFields: ['mood'] };
    const summary = summarizeProposalDiagnostics([row], [{ ...row, npcId: 'mira' }]);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.reasons.filter(reason => reason.includes('identity-conflict:Mira')).length, 1);
});

test('unsupported evidence stays rejected and genuinely unsupported new fields remain Unknown', () => {
    const patch = miraPatch({ id: 'model-mira', semanticUpdates: [
        semantic('role', 'establish', 'Innkeeper', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('age', 'establish', '27', 'No age is stated here.', 'durable'),
    ] });
    const result = apply(emptySafeState('chat:unknown'), payload([patch]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assert.equal(mira.role, 'Innkeeper');
    assert.equal(mira.age, '');
    assert.equal(mira.personality, '');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'age' && row.status === 'invalid-source-reference'), true);
});

test('foreground and Scan share mandatory empty-id/bootstrap guidance, including under tight foreground budgets', () => {
    const foreground = foregroundContract({}, { capture: true });
    for (const phrase of ['NEW id=""', 'EXISTING/name-only: keep supplied id', '"name":"Nia","identityKind":"named"']) {
        assert.match(foreground, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    const state = emptySafeState('chat:prompt');
    const built = buildForegroundInjection(state, {
        enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1,
        injectLimit: 1, newNpcAdmissionMode: 'balanced', newNpcHistoryEnrichment: false,
    });
    assert.match(built.prompt, /NEW id=""/);
    assert.ok(built.diagnostics.effectiveBudgetTokens >= built.diagnostics.minimumBudgetTokens);

    const scan = buildScanPrompt({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: MIRA_VISIBLE }],
        assistantMessageId: 1,
    });
    assert.match(scan, /NEW id=""/);
    assert.match(scan, /EXISTING\/name-only: keep supplied id/);
});

test('real foreground parser-engine-persistence path enriches an existing name-only dossier with no extra generate call', async () => {
    const key = 'chat:existing-name-only';
    const state = emptySafeState(key);
    state.npcs = [normalizeNpc({ id: 'npc-mira-existing', name: 'Mira' })];
    const scan = payload([miraPatch({ id: 'npc-mira-existing', semanticUpdates: miraSemanticUpdates('establish') })]);
    const consumed = consume(MIRA_VISIBLE, scan);
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const result = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    assertMiraPopulated(h.engine.getDossierNpc('npc-mira-existing'));
    assertMiraPopulated(h.persisted().npcs.find(npc => npc.id === 'npc-mira-existing'));
    const reloaded = await h.reload().loadChat();
    assertMiraPopulated(reloaded.npcs.find(npc => npc.id === 'npc-mira-existing'));
    assert.equal(h.generations(), 0);
});

test('real foreground parser-engine-persistence path retains a complete new dossier when model emitted a nonempty transport id', async () => {
    const key = 'chat:new-unexpected-id';
    const state = emptySafeState(key);
    const scan = payload([miraPatch({ id: 'mira' })]);
    const consumed = consume(MIRA_VISIBLE, scan);
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const result = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.notEqual(mira.id, 'mira');
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    assert.equal(h.generations(), 0);
});

test('a follow-up Scan using the assigned stable id enriches the same NPC instead of duplicating it', () => {
    const first = apply(emptySafeState('chat:follow-up-scan'), payload([miraPatch({ id: 'model-mira' })]));
    const mira = first.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    const visible = MIRA_VISIBLE + ' Mira laughs softly as she hands Lucien the room key.';
    const secondPatch = {
        id: mira.id,
        name: 'Mira',
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [semantic('mood', 'replace', 'Cheerfully welcoming.', 'Mira laughs softly as she hands Lucien the room key.', 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const second = apply(first.state, payload([secondPatch], [mira.id], [mira.id]), visible, { sourceMessageId: 2, turn: 2 });
    assert.equal(second.state.npcs.filter(npc => npc.name === 'Mira').length, 1);
    assert.equal(second.state.npcs.find(npc => npc.name === 'Mira').id, mira.id);
    assert.equal(second.state.npcs.find(npc => npc.name === 'Mira').mood, 'Cheerfully welcoming.');
    assert.equal(second.patchResolutions[0].npcId, mira.id);
});

test('deleting the source response removes the populated newly admitted dossier through normal branch reconciliation', async () => {
    const key = 'chat:identity-delete';
    const state = emptySafeState(key);
    const consumed = consume(MIRA_VISIBLE, payload([miraPatch({ id: 'model-mira' })]));
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const applied = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(applied.ok, true);
    const mira = applied.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);

    h.context.chat.splice(1, 1);
    const reconciled = await h.engine.reconcileBranch({ rescan: false });
    assert.equal(reconciled.ok, true);
    assert.equal(reconciled.changed, true);
    assert.equal(reconciled.state.npcs.some(npc => npc.name === 'Mira'), false);
    assert.equal(h.persisted().npcs.some(npc => npc.name === 'Mira'), false);
});

test('history change during first-pass persistence cannot advertise the identity-bound dossier as current', async () => {
    const key = 'chat:identity-race';
    const state = emptySafeState(key);
    const consumed = consume(MIRA_VISIBLE, payload([miraPatch({ id: 'mira' })]));
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
        deferFirstWrite: true,
    });
    await h.engine.loadChat();
    const running = h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    await h.firstWriteStarted;
    h.context.chat[1].mes = 'A replacement swipe removes Mira from this response.';
    h.context.chat[1].swipe_id = 1;
    h.engine.invalidate(key);
    h.releaseFirstWrite();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'history-changed-during-persist');
    assert.equal(result.state.branchSafety.kind, 'commit-history-changed');
    assert.equal(h.persisted().branchSafety.kind, 'commit-history-changed');
    assert.ok(h.postCount() >= 2);
});

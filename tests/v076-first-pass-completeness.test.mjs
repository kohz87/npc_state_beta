import { citedFixture } from './helpers/cited-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { compactForegroundNpc } from '../src/foreground-context.js';
import { foregroundContract } from '../src/foreground-contract.js';
import { buildForegroundInjection } from '../src/injection.js';
import { createNpcStateEngine } from '../src/engine.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const ALL_GROUPS = ['canon', 'profile', 'live', 'memory', 'npcRelationships'];
const NO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'Routine professional intake does not justify numeric movement.' };
const SANNA_VISIBLE = [
    'Sanna Karr introduces herself as the desk clerk and acting intake officer while the master is in Rhunwald.',
    'Sanna Karr pulls Lucien through the doorway out of the mountain wind.',
    'Sanna Karr wears a dark homespun bodice over an unbleached linen shirt, with sleeves pinned above her wrists; pale brown hair is tied at her nape with a leather thong.',
    'Sanna Karr keeps her attention on the intake ledger rather than Lucien’s appearance.',
    'Sanna Karr gives Lucien short, practical commands, prepares registration paperwork, and taps the paper to direct him.',
    'Sanna Karr processes Lucien Noctis’s signature and issues Lucien a lead token bearing the Guild twin-peak seal.',
    'Sanna Karr presents Lucien three work postings and explains the boar bounty and Guild fee.',
].join(' ');

function safeState(key = 'chat:v076') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function sannaIdentity() {
    return {
        anchor: 'Sanna Karr',
        excerpts: ['Sanna Karr introduces herself as the desk clerk and acting intake officer while the master is in Rhunwald.'],
        explanation: 'The current visible response explicitly names Sanna Karr.',
    };
}

function sannaActivity() {
    return {
        exchangeActive: { excerpts: ['Sanna Karr gives Lucien short, practical commands, prepares registration paperwork, and taps the paper to direct him.'], explanation: 'Sanna acts directly in the exchange.' },
        inChat: { excerpts: ['Sanna Karr presents Lucien three work postings and explains the boar bounty and Guild fee.'], explanation: 'Sanna remains in the active intake scene.' },
    };
}

function sannaPatch(extra = {}) {
    return citedFixture({
        id: '', name: 'Sanna Karr', identityKind: 'named', identityEvidence: sannaIdentity(), activityEvidence: sannaActivity(),
        evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: [], insufficient: ['age', 'background', 'keyRelationships'], unavailable: [] },
        relationshipSummary: 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.',
        relationshipSummaryEvidence: {
            excerpts: ['Sanna Karr processes Lucien Noctis’s signature and issues Lucien a lead token bearing the Guild twin-peak seal.'],
            explanation: 'Sanna Karr processes Lucien Noctis’s signature and issues Lucien an official token during registration.',
        },
        relationshipChange: structuredClone(NO_REL),
        ...extra,
    }, { role: sannaIdentity().excerpts[0], appearance: SANNA_VISIBLE,
        behaviorProfile: SANNA_VISIBLE, mannerisms: { excerpt: SANNA_VISIBLE, establishment: 'reinforced' },
        memories: 'Sanna Karr processes Lucien Noctis’s signature and issues Lucien a lead token bearing the Guild twin-peak seal.',
        status: sannaActivity().inChat.excerpts[0],
    });
}

function payload(patch, active = ['Sanna Karr']) {
    return { exchangeActiveNpcIds: active, inChatNpcIds: active, worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
}

function apply(state, patch, visible = SANNA_VISIBLE, extra = {}) {
    return applyScanResult(state, payload(patch), {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible,
        semanticEvidenceContext: visible, relationshipContext: visible, playerName: 'Lucien',
        applyReturnedNpcPatches: true, requireDossierCoverage: true, applyRelationship: true,
        preservePresence: true, preserveObservation: true, ...extra,
    });
}

function engineHarness({ state, chat, generate = null } = {}) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(chat) };
    let generations = 0;
    const settings = normalizeSettings({ autoScan: true, branchRescan: false, birthdayFillMode: 'off' });
    const adapters = {
        getContext: () => context, getChatKey: () => key, getSettings: () => settings,
        getPointer: () => pointer, getStablePointer: () => pointer, setPointer: (_key, value) => { pointer = value; }, persistSettings: () => {},
        generate: async args => { generations += 1; if (!generate) throw new Error('unexpected generation'); return generate(args); },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
    };
    return { engine: createNpcStateEngine(adapters), context, generations: () => generations, persisted: () => decodeV3Payload(saved, key).state };
}

test('Sanna Karr first-pass bootstrap captures supported dossier facts and neutral Current Dynamic at zero scores', () => {
    const direct = {
        role: 'Desk clerk and acting intake officer',
        appearance: 'Wears a dark homespun bodice over an unbleached linen shirt with sleeves pinned above her wrists; pale brown hair is tied at her nape with a leather thong.',
        behaviorProfile: ['Practical and task-focused during intake; keeps attention on the ledger and paperwork.'],
        mannerisms: ['Taps the registration paper to direct Lucien during intake.'],
        profileEstablishment: { mannerisms: 'reinforced' },
        memories: ['Processed Lucien Noctis’s registration and issued his lead Guild token.'],
        status: 'Processing Lucien’s intake and explaining available postings.',
    };
    const result = apply(safeState(), sannaPatch(direct));
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.ok(sanna);
    assert.equal(sanna.role, direct.role);
    assert.equal(sanna.appearance, direct.appearance);
    assert.deepEqual(sanna.behaviorProfile, direct.behaviorProfile);
    assert.deepEqual(sanna.mannerisms, direct.mannerisms);
    assert.deepEqual(sanna.memories, direct.memories);
    assert.equal(sanna.relationshipSummary, 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.');
    assert.deepEqual(sanna.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal((sanna.relationshipHistory || []).length, 0);
    assert.equal(sanna.age, '');
    assert.equal(sanna.background, '');
    assert.deepEqual(sanna.keyRelationships, []);
    assert.ok(result.semanticDiagnostics.filter(row => row.operation === 'establish' && row.status === 'applied').length >= 6);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'applied'), true);
});

test('zero-delta Current Dynamic rejects wrong-target evidence instead of mutating the dossier', () => {
    const state = safeState('chat:wrong-summary');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', relationshipSummary: '' }), normalizeNpc({ id: 'mira', name: 'Mira' })];
    const visible = 'Sanna Karr stands by the desk. Mira welcomes Lucien and processes Lucien’s registration paperwork.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: [], insufficient: [], unavailable: [] }, semanticUpdates: [],
        relationshipSummary: 'Regards Lucien as a new applicant in a professional capacity.',
        relationshipSummaryEvidence: { excerpts: ['Mira welcomes Lucien and processes Lucien’s registration paperwork.'], explanation: 'Mira welcomes Lucien and processes Lucien’s registration paperwork.' },
        relationshipChange: structuredClone(NO_REL),
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, relationshipContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true, preserveObservation: true,
    });
    assert.equal(result.state.npcs.find(npc => npc.id === 'sanna').relationshipSummary, '');
    const diag = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diag?.status, 'rejected-proposal');
    assert.equal(diag?.reason, 'wrong-summary-target');
});

test('nonzero validated relationship proposals remain compatible with summary projection without new summary evidence', () => {
    const state = safeState('chat:nonzero-summary');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', relationship: { trust: 10, affection: 0, desire: 0, tension: 0 } })];
    const visible = 'Sanna Karr tells Lucien she trusts him after he kept his promise.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, semanticUpdates: [],
        relationshipSummary: 'Sanna now regards Lucien as somewhat more reliable.',
        relationshipChange: { evaluated: true, impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, priority: ['trust'], axisEvidence: { trust: { excerpts: [visible], explanation: 'Sanna explicitly trusts Lucien after his kept promise.' } }, evidence: visible, reason: 'Trust increased.' },
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, relationshipContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true, preserveObservation: true,
    });
    assert.equal(result.state.npcs[0].relationshipSummary, 'Sanna now regards Lucien as somewhat more reliable.');
});

test('direct bootstrap writes and summary decisions participate in bounded proposal accounting', () => {
    const result = apply(safeState('chat:diag-bootstrap'), sannaPatch({ role: 'Desk clerk', appearance: 'Pale brown hair tied at her nape.', memories: ['Issued Lucien a lead registration token.'] }));
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.ok(summary.accepted >= 4);
    assert.equal(summary.rejected, 0);
    assert.ok(summary.insufficient >= 3);
});

test('field evaluations distinguish unchanged, insufficient, unavailable, rejected, applied and omitted work', () => {
    const state = safeState('chat:eval-detail');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', role: 'Desk clerk', mood: 'Focused' })];
    const visible = 'Sanna Karr remains focused while Lucien waits.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: ['role'], insufficient: ['age'], unavailable: ['memories'] },
        semanticUpdates: [
            { field: 'mood', operation: 'replace', value: 'Attentive', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current focus.' },
            { field: 'species', operation: 'establish', value: 'Human', durability: 'durable', sources: [{ messageId: 1, excerpt: 'not in source' }], explanation: 'Unsupported.' },
        ], relationshipChange: structuredClone(NO_REL),
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, semanticEvidenceContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
        requireDossierCoverage: true,
    });
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'role' && row.status === 'evaluated-unchanged'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'age' && row.status === 'insufficient-evidence'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'memories' && row.status === 'context-unavailable'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'species' && row.status === 'invalid-source-reference'), true);
    const coverage = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.ok(coverage?.missingFields?.includes('appearance'));
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.equal(summary.accepted, 1);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.unchanged, 1);
    assert.equal(summary.insufficient, 1);
    assert.equal(summary.unavailable, 1);
    assert.ok(summary.omitted > 0);
});

test('legacy evaluatedGroups-only payload remains group-level compatible without invented field evaluations', () => {
    const state = safeState('chat:legacy-eval');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr' })];
    const patch = { id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: 'Sanna Karr waits at the desk.', profileContext: 'Sanna Karr waits at the desk.',
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true, requireDossierCoverage: true,
    });
    assert.equal(result.coverageDiagnostics[0]?.status, 'incomplete-evaluation');
    assert.equal(result.coverageDiagnostics[0]?.coverageKind, 'group-only');
    assert.ok(result.coverageDiagnostics[0]?.missingFields?.includes('mood'));
    const group = result.semanticDiagnostics.find(row => row.status === 'evaluated-groups' && Array.isArray(row.evaluatedGroups));
    assert.deepEqual(group?.evaluatedGroups, ALL_GROUPS);
    assert.equal(result.semanticDiagnostics.some(row => row.field && ['insufficient-evidence', 'context-unavailable'].includes(row.status)), false);
});

test('new direct field and semantic update for the same field use semantic authority once', () => {
    const patch = sannaPatch({
        appearance: 'Direct duplicate that must not bypass semantic evidence.',
        semanticUpdates: [{ field: 'appearance', operation: 'establish', value: 'Pale brown hair tied at her nape with a leather thong.', durability: 'durable', sources: [{ messageId: 1, excerpt: 'pale brown hair is tied at her nape with a leather thong.' }], explanation: 'Grounded appearance.' }],
    });
    const result = apply(safeState('chat:dedupe'), patch);
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.equal(sanna.appearance, 'Pale brown hair tied at her nape with a leather thong.');
    assert.equal(result.semanticDiagnostics.filter(row => row.field === 'appearance' && row.status === 'applied').length, 1);
});

test('scanner owns extraction/evaluation requirements while foreground is continuity-only', () => {
    const foreground = foregroundContract();
    const chat = [{ is_user: true, mes: 'Lucien enters.' }, { is_user: false, mes: SANNA_VISIBLE }];
    const scan = buildScanPrompt({ state: safeState('chat:prompt'), chat, assistantMessageId: 1, playerName: 'Lucien' });
    for (const marker of ['DOSSIER EXTRACTION MAP:', 'FIELD EVALUATION:', 'PRIVATE COMPLETENESS CHECK:']) assert.match(scan, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(scan, /relationshipSummaryEvidence/);
    assert.doesNotMatch(foreground, /DOSSIER EXTRACTION MAP:|FIELD EVALUATION:|PRIVATE COMPLETENESS CHECK:|relationshipSummaryEvidence|semanticUpdates|npc_state_v1/);
});

test('tight foreground compaction marks omitted stored fields unavailable instead of making them look empty', () => {
    const npc = normalizeNpc({ id: 'sanna', name: 'Sanna Karr', background: 'A long stored background.', memories: ['One memory'], keyRelationships: ['Mira - colleague'], appearanceForms: [{ name: 'Human', appearance: 'Human appearance' }], mood: '' });
    const compact = compactForegroundNpc(npc, 4, {});
    assert.ok(compact.contextCoverage.unavailable.includes('background'));
    assert.ok(compact.contextCoverage.unavailable.includes('memories'));
    assert.ok(compact.contextCoverage.unavailable.includes('keyRelationships'));
    assert.ok(compact.contextCoverage.unavailable.includes('appearanceForms'));
    assert.equal(compact.contextCoverage.unavailable.includes('mood'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(compact.live || {}, 'mood'), false);
    const injection = buildForegroundInjection({ ...safeState('chat:budget'), npcs: [npc] }, { injectBudgetTokens: 1600, injectLimit: 1, autoScan: true, inject: true });
    assert.match(injection.prompt, /contextCoverage/);
    assert.doesNotMatch(injection.prompt, /PRIVATE COMPLETENESS CHECK|semanticUpdates|npc_state_v1/);
});

test('random birthday filling remains independent from extraction evaluation metadata', () => {
    const result = apply(safeState('chat:birthday'), sannaPatch({ role: 'Desk clerk' }), SANNA_VISIBLE, {
        birthdayFill: { mode: 'random', calendar: 'Frost:30\nThaw:30', fallbackDays: 30 },
    });
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.match(sanna.birthday, /^\d+ (Frost|Thaw)$/);
    assert.equal(sanna.birthdayProvenance, 'generated');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'birthday' && row.channel === 'bootstrap'), false);
});

test('successful dedicated Sanna scan commits and persists the dossier', async () => {
    const key = 'chat:scan-sanna'; const state = safeState(key);
    const chat = [{ is_user: true, name: 'Lucien', mes: 'Lucien enters the Guild office.' }, { is_user: false, name: 'Assistant', mes: SANNA_VISIBLE, swipe_id: 0 }];
    const generated = payload(sannaPatch({ role: 'Desk clerk', appearance: 'Pale brown hair tied at her nape.', memories: ['Issued Lucien a lead registration token.'] }));
    const harness = engineHarness({ state, chat, generate: async () => JSON.stringify(generated) });
    await harness.engine.loadChat(key); const result = await harness.engine.scan(1, { manual: false });
    assert.equal(result.ok, true); assert.equal(harness.generations(), 1);
    const persisted = harness.persisted(); assert.equal(persisted.npcs.length, 1); assert.equal(persisted.npcs[0].name, 'Sanna Karr');
    assert.equal(persisted.npcs[0].relationshipSummary, 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.');
});

test('follow-up Scan uses the assigned stable id without duplicating Sanna or replaying relationship scoring', async () => {
    const key = 'chat:followup-sanna'; const state = safeState(key);
    const chat = [{ is_user: true, name: 'Lucien', mes: 'Lucien enters.' }, { is_user: false, name: 'Assistant', mes: SANNA_VISIBLE, swipe_id: 0 }];
    let assignedId = ''; let calls = 0;
    const harness = engineHarness({ state, chat, generate: async args => {
        calls += 1;
        if (calls === 1) return JSON.stringify(payload(sannaPatch({ role: 'Desk clerk' })));
        if (/FIRST-CONTACT COMPLETION CHECK/.test(args?.prompt || '')) {
            return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });
        }
        return JSON.stringify({ exchangeActiveNpcIds: [assignedId], inChatNpcIds: [assignedId], worldActiveNpcIds: [], npcs: [{ id: assignedId, name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, fieldEvaluations: { unchanged: ['role'], insufficient: [], unavailable: [] }, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });
    } });
    await harness.engine.loadChat(key); const first = await harness.engine.scan(1, { manual: false }); assignedId = first.state.npcs[0].id;
    const second = await harness.engine.scan(1, { manual: true, force: true }); assert.equal(second.ok, true); assert.equal(second.state.npcs.length, 1); assert.equal(second.state.npcs[0].id, assignedId);
    assert.deepEqual(second.state.npcs[0].relationship, { trust: 0, affection: 0, desire: 0, tension: 0 }); assert.equal((second.state.npcs[0].relationshipHistory || []).length, 0); assert.equal(harness.generations(), 2);
});

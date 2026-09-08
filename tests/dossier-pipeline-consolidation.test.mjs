import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { foregroundContract, FOREGROUND_CONTRACT_VERSION } from '../src/foreground-contract.js';
import {
    NPC_STATE_MODEL_CONTRACT_VERSION,
    prepareModelLedPayload,
    semanticUpdatePrompt,
} from '../src/model/semantic-updates.js';
import {
    DOSSIER_EVALUATION_GROUPS,
    DOSSIER_SEMANTIC_FIELDS,
} from '../src/model/dossier-fields.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function stateWithNpc(overrides = {}) {
    const state = createEmptyState('chat:consolidated');
    state.npcs = [normalizeNpc({
        id: 'npc-sora',
        name: 'Sora',
        role: 'Dependent',
        species: 'Stormcrown Thunderbird Chimera',
        age: '6',
        apparentAge: '~6',
        appearance: 'Small golden-blue-haired girl.',
        appearanceForms: [{ name: 'Human', appearance: 'Small golden-blue-haired girl.' }],
        currentForm: 'Human',
        personality: 'Quiet and dormant baseline post-emergence.',
        behaviorProfile: ['Observes before acting.'],
        speech: 'Soft-spoken.',
        mannerisms: ['Tilts her head while considering a question.'],
        mood: 'Calm.',
        location: 'Mountain shelter.',
        goal: 'Reach the village.',
        status: 'Packing supplies.',
        memories: ['Lucien sheltered her after emergence.'],
        keyRelationships: ['Ryu - sister'],
        present: true,
        ...overrides,
    })];
    return state;
}

function payload(patch, active = true) {
    return {
        exchangeActiveNpcIds: active ? ['npc-sora'] : [],
        inChatNpcIds: active ? ['npc-sora'] : [],
        worldActiveNpcIds: [],
        npcs: patch ? [{ id: 'npc-sora', name: 'Sora', ...patch }] : [],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

function apply(state, result, context, extra = {}) {
    return applyScanResult(state, result, {
        sourceMessageId: 12,
        turn: 1,
        profileContext: context,
        semanticEvidenceContext: context,
        relationshipContext: context,
        currentAdmissionText: context,
        applyReturnedNpcPatches: true,
        preservePresence: true,
        preserveObservation: true,
        applyRelationship: false,
        ...extra,
    });
}

test('0.5.12 uses one canonical semantic field registry', () => {
    assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 6);
    assert.equal(FOREGROUND_CONTRACT_VERSION, 8);
    for (const field of [
        'role', 'species', 'background', 'age', 'apparentAge', 'birthday', 'appearance', 'appearanceForms',
        'personality', 'behaviorProfile', 'speech', 'mannerisms',
        'mood', 'location', 'goal', 'status', 'currentForm', 'memories', 'keyRelationships',
    ]) assert.equal(DOSSIER_SEMANTIC_FIELDS.includes(field), true, field);
    assert.deepEqual(DOSSIER_EVALUATION_GROUPS, ['canon', 'profile', 'live', 'memory', 'npcRelationships']);
});

test('existing ordinary direct fields are stripped before deterministic core application', () => {
    const state = stateWithNpc();
    const prepared = prepareModelLedPayload(state, payload({
        personality: 'STALE DIRECT PERSONALITY',
        background: 'STALE DIRECT BACKGROUND',
        goal: 'STALE DIRECT GOAL',
        currentForm: 'Thunderbird',
    }));
    const patch = prepared.npcs[0];
    assert.equal(Object.hasOwn(patch, 'personality'), false);
    assert.equal(Object.hasOwn(patch, 'background'), false);
    assert.equal(Object.hasOwn(patch, 'goal'), false);
    assert.equal(Object.hasOwn(patch, 'currentForm'), false);
});

test('direct existing dossier replacements cannot bypass the semantic pipeline', () => {
    const state = stateWithNpc();
    const result = apply(state, payload({
        personality: 'Cruel and reckless.',
        goal: 'Abandon everyone.',
        currentForm: 'Thunderbird',
    }), 'Sora quietly checks her pack.');
    const npc = result.state.npcs[0];
    assert.equal(npc.personality, 'Quiet and dormant baseline post-emergence.');
    assert.equal(npc.goal, 'Reach the village.');
    assert.equal(npc.currentForm, 'Human');
});

test('one semantic update list applies durable, live, and current-form changes together', () => {
    const context = 'Sora laughs brightly and asks Lucien three questions. She explains that she was raised among the northern storm shrines. She reaches the village square and decides to study the guild noticeboard. Her Thunderbird form unfolds around her.';
    const sources = [{ messageId: 12, excerpt: context }];
    const result = apply(stateWithNpc({ appearanceForms: [
        { name: 'Human', appearance: 'Small golden-blue-haired girl.' },
        { name: 'Thunderbird', appearance: 'Golden-blue juvenile thunderbird.' },
    ] }), payload({
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        semanticUpdates: [
            { field: 'personality', operation: 'replace', value: 'Bright, curious, and proudly inquisitive.', durability: 'durable', sources, explanation: 'Current evidence establishes her actual baseline.' },
            { field: 'background', operation: 'replace', value: 'Raised among the northern storm shrines.', durability: 'durable', sources, explanation: 'Current evidence establishes durable background.' },
            { field: 'location', operation: 'replace', value: 'Village square.', durability: 'temporary', sources, explanation: 'She arrived.' },
            { field: 'goal', operation: 'replace', value: 'Study the guild noticeboard.', durability: 'temporary', sources, explanation: 'She chose a new goal.' },
            { field: 'status', operation: 'replace', value: 'Reading the guild noticeboard.', durability: 'temporary', sources, explanation: 'Current activity.' },
            { field: 'currentForm', operation: 'replace', value: 'Thunderbird', durability: 'temporary', sources, explanation: 'Current physical form changed.' },
        ],
    }), context, { requireDossierCoverage: true });
    const npc = result.state.npcs[0];
    assert.equal(npc.personality, 'Bright, curious, and proudly inquisitive.');
    assert.equal(npc.background, 'Raised among the northern storm shrines.');
    assert.equal(npc.location, 'Village square.');
    assert.equal(npc.goal, 'Study the guild noticeboard.');
    assert.equal(npc.status, 'Reading the guild noticeboard.');
    assert.equal(npc.currentForm, 'Thunderbird');
    const coverage = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.equal(coverage?.coverageKind, 'group-only');
    assert.ok(coverage?.missingFields?.includes('speech'));
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 6);
});

test('legacy profile/live response shapes are adapted once at the boundary then applied semantically', () => {
    const context = 'Sora speaks animatedly and keeps asking practical questions while walking into the market square.';
    const result = apply(stateWithNpc(), payload({
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        personality: 'Animated, practical, and inquisitive.',
        profileChanges: [{ field: 'personality', mode: 'explicit', evidence: context, concept: 'active curiosity' }],
        location: 'Market square.',
    }), context);
    const npc = result.state.npcs[0];
    assert.equal(npc.personality, 'Animated, practical, and inquisitive.');
    assert.equal(npc.location, 'Market square.');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'personality' && row.status === 'applied'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'location' && row.status === 'applied'), true);
});

test('coverage diagnostics distinguish a missing NPC patch from a checked unchanged dossier', () => {
    const missing = apply(stateWithNpc(), payload(null), 'Sora answers Lucien.', { requireDossierCoverage: true });
    assert.deepEqual(missing.coverageDiagnostics, [{ npcId: 'npc-sora', status: 'missing-npc-patch', missingGroups: [...DOSSIER_EVALUATION_GROUPS] }]);

    const checked = apply(stateWithNpc(), payload({
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No player-relationship shift.' },
    }), 'Sora answers Lucien.', { requireDossierCoverage: true });
    assert.equal(checked.coverageDiagnostics[0]?.status, 'incomplete-evaluation');
    assert.equal(checked.coverageDiagnostics[0]?.coverageKind, 'group-only');
    assert.ok(checked.coverageDiagnostics[0]?.missingFields?.includes('mood'));
    assert.equal(checked.semanticDiagnostics.some(row => row.status === 'evaluated-groups'), true);
});

test('coverage diagnostics report exactly which dossier groups were not evaluated', () => {
    const result = apply(stateWithNpc(), payload({ evaluatedGroups: ['profile', 'live'] }), 'Sora answers Lucien.', { requireDossierCoverage: true });
    assert.equal(result.coverageDiagnostics.length, 1);
    assert.equal(result.coverageDiagnostics[0].status, 'incomplete-evaluation');
    assert.deepEqual(result.coverageDiagnostics[0].missingGroups, ['canon', 'memory', 'npcRelationships']);
});

test('Full Scan semantic appendix uses a compact edit index instead of serializing every dossier twice', () => {
    const state = stateWithNpc();
    const chat = [
        { is_user: true, mes: 'Sora, what do you think?' },
        { is_user: false, mes: 'Sora answers in detail.' },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8 });
    for (const phrase of ['Quiet and dormant baseline post-emergence.', 'Soft-spoken.', 'Mountain shelter.']) {
        assert.equal(prompt.split(phrase).length - 1, 1, phrase);
    }
    assert.match(prompt, /SEMANTIC EDIT INDEX/);
    assert.match(prompt, /ONE ordinary mutation channel: semanticUpdates/);
    assert.match(prompt, /evaluatedGroups/);
});

test('foreground contract is continuity-only while scanner retains the one-pipeline rule', () => {
    const foreground = foregroundContract();
    assert.match(foreground, /CONTINUITY CONTEXT/);
    assert.doesNotMatch(foreground, /semanticUpdates|evaluatedGroups|OUTPUT CONTRACT/);
    const scan = buildScanPrompt({ state: stateWithNpc(), chat: [{ is_user: true, mes: 'Sora?' }, { is_user: false, mes: 'Sora answers.' }], assistantMessageId: 1 });
    assert.match(scan, /SINGLE-PIPELINE INVARIANT/);
    assert.match(scan, /evaluatedGroups/);
});

test('routine Scan validates new profile evidence against the exact exchange while explicit modes keep window helpers', () => {
    const engine = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
    assert.match(engine, /profileContext:\s*profileContextForExchange\(exchange\)/);
    assert.match(engine, /profileContextForWindow/);
    assert.doesNotMatch(engine, /buildCompletenessPrompt|completenessScan/);
});

test('compact semantic prompt does not duplicate stored scalar prose', () => {
    const state = stateWithNpc();
    const prompt = semanticUpdatePrompt({ npcs: state.npcs, mode: 'scan', allowedSourceIds: [1, 2], compactContext: true });
    assert.doesNotMatch(prompt, /Quiet and dormant baseline post-emergence\./);
    assert.match(prompt, /entry:behaviorProfile:/);
    assert.match(prompt, /manualProfileFields/);
});


test('structured evidence authority stays inside the one semantic validator and is field-scoped', () => {
    const state = stateWithNpc({
        personality: 'Quiet and cautious.',
        mood: 'Neutral.',
        location: 'Mountain shelter.',
        goal: 'Wait for dawn.',
        status: 'Resting.',
    });
    const world = 'Sora | Location: North gate | Status: Patrolling the north gate.';
    const inner = 'Sora privately resolves to protect Lucien and feels quietly relieved.';
    const result = payload({ evaluatedGroups: DOSSIER_EVALUATION_GROUPS, semanticUpdates: [
        { field: 'location', operation: 'replace', value: 'North gate.', durability: 'temporary', sources: [{ messageId: 20, excerpt: 'Location: North gate' }], explanation: 'World_State supplies live location.' },
        { field: 'status', operation: 'replace', value: 'Patrolling the north gate.', durability: 'temporary', sources: [{ messageId: 20, excerpt: 'Status: Patrolling the north gate' }], explanation: 'World_State supplies live status.' },
        { field: 'goal', operation: 'replace', value: 'Protect Lucien.', durability: 'temporary', sources: [{ messageId: 20, excerpt: 'privately resolves to protect Lucien' }], explanation: 'Private chatter supplies private goal.' },
        { field: 'mood', operation: 'replace', value: 'Quietly relieved.', durability: 'temporary', sources: [{ messageId: 20, excerpt: 'feels quietly relieved' }], explanation: 'Private chatter supplies private mood.' },
        { field: 'personality', operation: 'replace', value: 'Fearless.', durability: 'durable', sources: [{ messageId: 20, excerpt: 'feels quietly relieved' }], explanation: 'Private chatter must not rewrite durable profile.' },
        { field: 'currentForm', operation: 'replace', value: 'Thunderbird', durability: 'temporary', sources: [{ messageId: 20, excerpt: 'Location: North gate' }], explanation: 'World_State must not rewrite physical form.' },
    ] });
    const applied = apply(state, result, 'Sora remains off-screen.', {
        sourceMessageId: 20,
        semanticWorldContext: world,
        semanticPrivateContext: inner,
    });
    const npc = applied.state.npcs[0];
    assert.equal(npc.location, 'North gate.');
    assert.equal(npc.status, 'Patrolling the north gate.');
    assert.equal(npc.goal, 'Protect Lucien.');
    assert.equal(npc.mood, 'Quietly relieved.');
    assert.equal(npc.personality, 'Quiet and cautious.');
    assert.notEqual(npc.currentForm, 'Thunderbird');
    assert.equal(applied.semanticDiagnostics.filter(row => row.status === 'applied').length, 4);
    assert.equal(applied.semanticDiagnostics.filter(row => row.status === 'invalid-source-reference').length, 2);
});

test('new NPC bootstrap remains complete while later existing-dossier changes stay semantic-only', () => {
    const state = createEmptyState('chat:new-bootstrap');
    const narrative = 'Rhea, a wolfkin courier, arrives at the south gate. She is alert, speaks briskly, and wants to deliver the sealed letter.';
    const result = {
        exchangeActiveNpcIds: ['Rhea'],
        finalPresentNpcIds: ['Rhea'],
        worldActiveNpcIds: [],
        npcs: [{
            name: 'Rhea', identityKind: 'named', role: 'Courier', species: 'Wolfkin', background: 'Courier from the southern road.',
            age: '19', apparentAge: '~19', appearance: 'Lean young woman with grey wolf ears.', currentForm: 'Base',
            personality: 'Alert and dutiful.', behaviorProfile: ['Checks seals before accepting a parcel.'], speech: 'Brisk and practical.',
            mannerisms: ['Touches the satchel clasp before speaking about deliveries.'], memories: ['Arrived at the south gate carrying a sealed letter.'],
            mood: 'Alert.', location: 'South gate.', goal: 'Deliver the sealed letter.', status: 'Waiting at the gate.',
            keyRelationships: [], evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'], semanticUpdates: [],
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'First meeting.' },
        }], socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
    const applied = applyScanResult(state, result, {
        sourceMessageId: 20,
        turn: 1,
        profileContext: narrative,
        currentAdmissionText: narrative,
        applyReturnedNpcPatches: true,
        preservePresence: true,
        preserveObservation: true,
    });
    const npc = applied.state.npcs.find(row => row.name === 'Rhea');
    assert.ok(npc);
    assert.equal(npc.role, 'Courier');
    assert.equal(npc.species, 'Wolfkin');
    assert.equal(npc.background, 'Courier from the southern road.');
    assert.equal(npc.personality, 'Alert and dutiful.');
    assert.equal(npc.speech, 'Brisk and practical.');
    assert.equal(npc.location, 'South gate.');
    assert.equal(npc.goal, 'Deliver the sealed letter.');
    assert.equal(npc.status, 'Waiting at the gate.');
    assert.deepEqual(npc.memories, ['Arrived at the south gate carrying a sealed letter.']);
});

test('scanner core no longer contains duplicate existing-dossier semantic decision engines', () => {
    const source = fs.readFileSync(path.join(root, 'src/scan-application.js'), 'utf8');
    for (const oldName of ['applyStablePatch', 'applyDynamicPatch', 'profileEvolutionDecision', 'durableCanonDecision', 'explicitAgeChange', 'mergeAppearanceFormPatch']) {
        assert.doesNotMatch(source, new RegExp('function\\s+' + oldName + '\\b'), oldName);
    }
    assert.match(source, /function applyIdentityAndBootstrapPatch\b/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt, relevantNpcsForExchange } from '../src/scanner.js';
import { currentExchange } from '../src/scan-helpers.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';

const EMPTY = { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
const ZERO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No score movement.' };

function stateWith(...rows) {
    const state = createEmptyState('chat:test');
    state.npcs = rows.map(row => normalizeNpc(row));
    return state;
}

function completePatch(id, name, { updates = [], observations = [], relationship = false } = {}) {
    const proposed = new Set(updates.map(update => update.field));
    return {
        id,
        name,
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: {
            unchanged: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)),
            insufficient: [],
            unavailable: [],
        },
        semanticUpdates: updates,
        ...(observations !== undefined ? { profileObservations: observations } : {}),
        ...(relationship ? { relationshipChange: structuredClone(ZERO_REL), relationshipSummary: '' } : {}),
    };
}

function observation(field, excerpt, concept = 'observed pattern', messageId = 1) {
    return { field, observation: concept, concept, sources: [{ messageId, excerpt }], explanation: 'Grounded current observation.' };
}

function apply(state, payload, context, options = {}) {
    return applyScanResult(state, payload, {
        sourceMessageId: options.sourceMessageId ?? 1,
        turn: options.turn ?? 1,
        profileContext: context,
        currentAdmissionText: context,
        relationshipContext: context,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
        ...options,
    });
}

test('independent candidate coverage reports an omitted relevant NPC instead of grading only returned activity', () => {
    const state = stateWith(
        { id: 'vrena', name: 'Vrena Tolk', present: true },
        { id: 'maren', name: 'Maren Holt', present: true },
    );
    const text = 'Vrena Tolk opens the ledger while Maren Holt checks the seal.';
    const payload = {
        ...EMPTY,
        candidateAccounting: { vrena: 'evaluated' },
        npcs: [completePatch('vrena', 'Vrena Tolk')],
    };
    const result = apply(state, payload, text, {
        coverageNpcIds: ['vrena', 'maren'], requireDossierCoverage: true, requireCandidateAccounting: true,
    });
    assert.equal(result.coverageDiagnostics.some(row => row.npcId === 'maren' && row.status === 'missing-candidate-accounting'), true);
    assert.equal(result.coverageDiagnostics.some(row => row.npcId === 'vrena' && row.status === 'missing-npc-patch'), false);
});

test('mentioned/inactive candidate accounting is coverage-only and player/ambiguous short identities stay out of candidate selection', () => {
    const state = stateWith(
        { id: 'vrena', name: 'Vrena Tolk', present: false, worldActive: false },
        { id: 'ari', name: 'Ari', present: true },
        { id: 'bessa-vond', name: 'Bessa Vond', present: false },
        { id: 'bessa-hale', name: 'Bessa Hale', present: false },
    );
    const chat = [{ is_user: true, name: 'Ari', mes: 'I wait.' }, { is_user: false, mes: 'Vrena Tolk is mentioned in the notice. Bessa may return later. Ari reads it.' }];
    const exchange = currentExchange(chat, 1);
    const ids = relevantNpcsForExchange(state, exchange, 12, 'Ari').map(npc => npc.id);
    assert.deepEqual(ids, ['vrena']);
    const result = apply(state, { ...EMPTY, candidateAccounting: { vrena: 'mentioned' } }, chat[1].mes, {
        coverageNpcIds: ['vrena'], requireDossierCoverage: true, requireCandidateAccounting: true,
    });
    assert.equal(result.coverageDiagnostics.length, 0);
    assert.equal(result.state.npcs.find(npc => npc.id === 'vrena').present, false);
    assert.equal(result.state.npcs.find(npc => npc.id === 'vrena').worldActive, false);
});

test('candidate evaluated accounting does not bypass ordinary field completeness', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk' });
    const result = apply(state, {
        ...EMPTY,
        candidateAccounting: { vrena: 'evaluated' },
        npcs: [{ id: 'vrena', name: 'Vrena Tolk', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], semanticUpdates: [] }],
    }, 'Vrena Tolk checks the ledger.', { coverageNpcIds: ['vrena'], requireDossierCoverage: true, requireCandidateAccounting: true });
    const incomplete = result.coverageDiagnostics.find(row => row.npcId === 'vrena' && row.status === 'incomplete-evaluation');
    assert.ok(incomplete);
    assert.ok(incomplete.missingFields.length > 0);
});

test('grounded profile observation persists without changing the dossier field and survives state normalization', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal and concise.' });
    const text = 'Vrena Tolk answers with a clipped instruction and points to the signature line.';
    const payload = {
        ...EMPTY,
        candidateAccounting: { vrena: 'evaluated' },
        npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', text, 'Clipped practical instruction.')] })],
    };
    const result = apply(state, payload, text, { coverageNpcIds: ['vrena'], requireDossierCoverage: true, requireCandidateAccounting: true });
    const npc = result.state.npcs[0];
    assert.equal(npc.speech, 'Formal and concise.');
    assert.equal(npc.profileEvolutionEvidence.length, 1);
    assert.equal(npc.profileEvolutionEvidence[0].field, 'speech');
    assert.equal(npc.profileEvolutionEvidence[0].kind, 'observation');
    assert.equal(npc.profileEvolutionEvidence[0].evidence, text);
    assert.equal(normalizeNpc(npc).profileEvolutionEvidence.length, 1);
    assert.equal(result.semanticDiagnostics.some(row => row.status === 'observation-recorded'), true);
});

test('independent later observation accumulates but same-source retry does not duplicate it', () => {
    let state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal and concise.' });
    const first = 'Vrena Tolk answers with a clipped instruction.';
    state = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', first, 'Clipped practical instruction.', 1)] })] }, first, { sourceMessageId: 1, turn: 1 }).state;
    const replay = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', first, 'Same wording retried.', 1)] })] }, first, { sourceMessageId: 1, turn: 2 });
    assert.equal(replay.state.npcs[0].profileEvolutionEvidence.length, 1);
    const second = 'Vrena Tolk again keeps her answer to two blunt practical sentences.';
    const independent = apply(replay.state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', second, 'Clipped practical instruction.', 3)] })] }, second, { sourceMessageId: 3, turn: 3 });
    assert.equal(independent.state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(independent.state.npcs[0].profileEvolutionEvidence.map(row => row.sourceMessageId), [1, 3]);
});

test('mechanical observation dedupe uses source-event identity rather than numeric message position alone', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.' });
    const text = 'Vrena Tolk answers with clipped practical instructions.';
    const payload = { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', text, 'Clipped practical instruction.')] })] };
    const first = apply(state, payload, text, { sourceMessageId: 1, sourceEventKey: 'source:event-a' });
    assert.equal(first.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(first.state.npcs[0].profileEvolutionEvidence[0].sourceEventKey, 'source:event-a');
    const revisedSamePosition = apply(first.state, payload, text, { sourceMessageId: 1, sourceEventKey: 'source:event-b' });
    assert.equal(revisedSamePosition.state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(revisedSamePosition.state.npcs[0].profileEvolutionEvidence.map(row => row.sourceEventKey), ['source:event-a', 'source:event-b']);
});

test('an observation and related applied refinement using the same source fact count once', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.' });
    const text = 'Vrena Tolk answers with clipped practical instructions.';
    const update = { field: 'speech', operation: 'replace', value: 'Clipped, formal, and practical.', sources: [{ messageId: 1, excerpt: text }], explanation: 'Later speech is established.' };
    const result = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', {
        updates: [update], observations: [observation('speech', text, 'Clipped practical instruction.')],
    })] }, text);
    assert.equal(result.state.npcs[0].speech, 'Clipped, formal, and practical.');
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(result.semanticDiagnostics.some(row => row.reason === 'duplicate-owned-observation'), true);
});

test('distinct facts in one owned source are not collapsed merely because their message id matches', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk' });
    const a = 'Vrena Tolk answers in two short sentences.';
    const b = 'She drums the iron nib twice against the ledger before difficult answers.';
    const context = `${a} ${b}`;
    const result = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [
        observation('speech', a, 'Short professional answers.'),
        observation('mannerisms', b, 'Observed nib tapping before difficult answers.'),
    ] })] }, context);
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(new Set(result.state.npcs[0].profileEvolutionEvidence.map(row => row.field)), new Set(['speech', 'mannerisms']));
});

test('malformed observation siblings do not block a valid ordinary semantic update and rejected identity cannot write observations', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', mood: 'Neutral.' });
    const text = 'Vrena Tolk frowns at the damaged ledger.';
    const update = { field: 'mood', operation: 'replace', value: 'Annoyed.', durability: 'temporary', sources: [{ messageId: 1, excerpt: text }], explanation: 'Visible current mood.' };
    const malformed = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update], observations: [{ field: 'speech', observation: { nope: true }, sources: [{ messageId: 1, excerpt: text }] }] })] }, text);
    assert.equal(malformed.state.npcs[0].mood, 'Annoyed.');
    assert.equal(malformed.state.npcs[0].profileEvolutionEvidence.length, 0);
    assert.equal(malformed.semanticDiagnostics.some(row => row.channel === 'profile-observation' && row.status === 'rejected-proposal'), true);

    const conflictedState = stateWith({ id: 'vrena', name: 'Vrena Tolk' }, { id: 'maren', name: 'Maren Holt' });
    const rejected = apply(conflictedState, { ...EMPTY, npcs: [{ ...completePatch('vrena', 'Maren Holt', { observations: [observation('speech', text)] }) }] }, text);
    assert.equal(rejected.state.npcs.every(npc => npc.profileEvolutionEvidence.length === 0), true);
    assert.equal(rejected.semanticDiagnostics.some(row => row.reason === 'observation-target-not-accepted'), true);
});

test('normal automatic scan uses one provider request, reports omitted candidate coverage as partial, and still commits valid sibling work', () => {
    const initial = stateWith(
        { id: 'vrena', name: 'Vrena Tolk', present: true, mood: 'Neutral.' },
        { id: 'maren', name: 'Maren Holt', present: true },
    );
    return withHost(async h => {
        const text = 'Vrena Tolk frowns at the ledger while Maren Holt checks the seal.';
        h.context.chat = [{ is_user: true, name: 'Ari', mes: 'I wait at the desk.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: text }];
        const update = { field: 'mood', operation: 'replace', value: 'Annoyed.', durability: 'temporary', sources: [{ messageId: 1, excerpt: text }], explanation: 'Visible current mood.' };
        h.context.generateRaw = async () => {
            h.metrics.generations += 1;
            return JSON.stringify({ ...EMPTY, candidateAccounting: { vrena: 'evaluated' }, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update] })] });
        };
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, true);
        assert.equal(h.metrics.generations, 1);
        assert.equal(h.persisted().npcs.find(npc => npc.id === 'vrena').mood, 'Annoyed.');
        assert.equal(h.api.scanStatus().status, 'partial');
        assert.equal(result.coverageDiagnostics.some(row => row.npcId === 'maren' && row.status === 'missing-candidate-accounting'), true);
    }, { state: initial });
});

test('failed save cannot expose an observation-only update as committed', () => {
    const initial = stateWith({ id: 'vrena', name: 'Vrena Tolk', present: true, speech: 'Formal.' });
    return withHost(async h => {
        const text = 'Vrena Tolk gives a clipped practical instruction.';
        h.context.chat = [{ is_user: true, name: 'Ari', mes: 'I ask what to sign.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: text }];
        h.context.generateRaw = async () => {
            h.metrics.generations += 1;
            return JSON.stringify({ ...EMPTY, candidateAccounting: { vrena: 'evaluated' }, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', text, 'Clipped practical instruction.')] })] });
        };
        h.beforeWrite = () => ({ ok: false, status: 409, text: async () => 'fixture write conflict' });
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, false);
        assert.equal(h.api.scanStatus().status, 'failed');
        assert.equal(h.persisted().npcs[0].profileEvolutionEvidence.length, 0);
    }, { state: initial });
});

test('deleting or switching the source swipe restores profile evidence and derived profile state from exact checkpoints', () => {
    const chatA = [{ is_user: true, mes: 'Ask for directions.' }, { is_user: false, swipe_id: 0, mes: 'Vrena Tolk answers with clipped practical instructions.' }];
    let state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.' });
    state = ensurePreUpdateBaseline(state, chatA, 1);
    const update = { field: 'speech', operation: 'replace', value: 'Clipped and practical.', sources: [{ messageId: 1, excerpt: chatA[1].mes }], explanation: 'Grounded speech refinement.' };
    state = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update], observations: [observation('speech', chatA[1].mes, 'Clipped practical instruction.')] })] }, chatA[1].mes).state;
    state.lastScannedMessageId = 1;
    state.turn = 1;
    state = recordCheckpoint(state, chatA, 1, 'scan');
    assert.equal(state.npcs[0].speech, 'Clipped and practical.');
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 1);

    const deleted = reconcileToCurrentBranch(state, []);
    assert.equal(deleted.unsafeDivergence, false);
    assert.equal(deleted.state.npcs[0].speech, 'Formal.');
    assert.equal(deleted.state.npcs[0].profileEvolutionEvidence.length, 0);

    const chatB = [{ is_user: true, mes: 'Ask for directions.' }, { is_user: false, swipe_id: 1, mes: 'Vrena Tolk gives a long, patient explanation.' }];
    const switched = reconcileToCurrentBranch(state, chatB);
    assert.equal(switched.unsafeDivergence, false);
    assert.equal(switched.needsRecovery, true);
    assert.equal(switched.state.npcs[0].speech, 'Formal.');
    assert.equal(switched.state.npcs[0].profileEvolutionEvidence.length, 0);

    const back = reconcileToCurrentBranch(state, chatA);
    assert.equal(back.needsRecovery, false);
    assert.equal(back.state.npcs[0].speech, 'Clipped and practical.');
    assert.equal(back.state.npcs[0].profileEvolutionEvidence.length, 1);
});

test('middle-history divergence drops observations from the changed prefix before surviving-suffix reconstruction', () => {
    const chat = [
        { is_user: true, mes: 'u1' }, { is_user: false, swipe_id: 0, mes: 'Vrena Tolk speaks tersely.' },
        { is_user: true, mes: 'u2' }, { is_user: false, swipe_id: 0, mes: 'Vrena Tolk opens the gate.' },
    ];
    let state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.' });
    state = ensurePreUpdateBaseline(state, chat, 1);
    const update = { field: 'speech', operation: 'replace', value: 'Terse.', sources: [{ messageId: 1, excerpt: chat[1].mes }], explanation: 'Grounded speech.' };
    state = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update], observations: [observation('speech', chat[1].mes, 'Terse answers.')] })] }, chat[1].mes).state;
    state.lastScannedMessageId = 1; state.turn = 1; state = recordCheckpoint(state, chat.slice(0, 2), 1, 'scan');
    state.npcs[0].mood = 'Busy.'; state.lastScannedMessageId = 3; state.turn = 2; state = recordCheckpoint(state, chat, 3, 'scan');
    const surviving = [{ is_user: true, mes: 'u1 changed' }, chat[1], chat[2], chat[3]];
    const result = reconcileToCurrentBranch(state, surviving);
    assert.equal(result.needsRecovery || result.unsafeDivergence, true);
    if (result.needsRecovery) {
        assert.equal(result.state.npcs[0].speech, 'Formal.');
        assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 0);
    }
});


test('observation-only automatic commit persists through the sidecar decode path', () => {
    const initial = stateWith({ id: 'vrena', name: 'Vrena Tolk', present: true, speech: 'Formal.' });
    return withHost(async h => {
        const text = 'Vrena Tolk gives a clipped practical instruction.';
        h.context.chat = [{ is_user: true, name: 'Ari', mes: 'I ask what to sign.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: text }];
        h.context.generateRaw = async () => {
            h.metrics.generations += 1;
            return JSON.stringify({ ...EMPTY, candidateAccounting: { vrena: 'evaluated' }, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', text, 'Clipped practical instruction.')] })] });
        };
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, true);
        assert.equal(h.metrics.generations, 1);
        assert.equal(h.metrics.posts, 1);
        const persisted = h.persisted().npcs[0];
        assert.equal(persisted.speech, 'Formal.');
        assert.equal(persisted.profileEvolutionEvidence.length, 1);
        assert.equal(persisted.profileEvolutionEvidence[0].kind, 'observation');
        assert.match(persisted.profileEvolutionEvidence[0].sourceEventKey, /^source:/);
        assert.equal(persisted.profileEvolutionEvidence[0].evidence, text);
    }, { state: initial });
});

test('manual profile lock blocks mutation without turning observation evidence into an unlock', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Formal.', manualProfileFields: ['speech'] });
    const text = 'Vrena Tolk gives a clipped practical instruction.';
    const update = { field: 'speech', operation: 'replace', value: 'Clipped and practical.', sources: [{ messageId: 1, excerpt: text }], explanation: 'Observed speech.' };
    const result = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update], observations: [observation('speech', text, 'Clipped practical instruction.')] })] }, text);
    assert.equal(result.state.npcs[0].speech, 'Formal.');
    assert.deepEqual(result.state.npcs[0].manualProfileFields, ['speech']);
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'speech' && row.status === 'manually-protected'), true);
});

test('collection consolidation can replace/remove overlapping entries at capacity without evicting unrelated behavior', () => {
    const original = [
        'Pushes forms briskly across the counter.',
        'Slaps ledgers into place.',
        'Keeps her voice low around frightened children.',
        'Double-checks seal numbers before filing.',
        'Refuses to skip required signatures.',
        'Steps between arguing teamsters.',
        'Counts coin twice before closing a purse.',
        'Waits for a direct answer before moving on.',
    ];
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', behaviorProfile: original });
    const text = 'Vrena Tolk again shoves the form and ledger into position with the same brisk physical efficiency.';
    const update = {
        field: 'behaviorProfile', operation: 'refine',
        changes: [
            { action: 'replace', expected: original[0], value: 'Handles paperwork with brisk, forceful physical efficiency.' },
            { action: 'remove', expected: original[1] },
        ],
        sources: [{ messageId: 1, excerpt: text }], explanation: 'Consolidates two overlapping established paperwork patterns.',
    };
    const result = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update] })] }, text, { dossierLimits: { behaviorProfile: 8 } });
    const profile = result.state.npcs[0].behaviorProfile;
    assert.equal(profile.includes(original[0]), false);
    assert.equal(profile.includes(original[1]), false);
    assert.equal(profile.includes('Handles paperwork with brisk, forceful physical efficiency.'), true);
    for (const distinct of original.slice(2)) assert.equal(profile.includes(distinct), true, distinct);
    assert.equal(profile.length, 7);
});

test('later grounded characterization can replace a temporary sleeping speech placeholder', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', speech: 'Unvoiced; currently sleeping.' });
    const text = 'Awake at the desk, Vrena Tolk says, "Sign here. Next line. Do not skip the seal."';
    const update = { field: 'speech', operation: 'replace', value: 'Direct, clipped, and practical in professional exchanges.', sources: [{ messageId: 1, excerpt: text }], explanation: 'Awake dialogue establishes actual speech behavior.' };
    const result = apply(state, { ...EMPTY, npcs: [completePatch('vrena', 'Vrena Tolk', { updates: [update], observations: [observation('speech', text, 'Clipped directive speech.')] })] }, text);
    assert.equal(result.state.npcs[0].speech, 'Direct, clipped, and practical in professional exchanges.');
    assert.equal(result.state.npcs[0].profileEvolutionEvidence.length, 1);
});

test('chat/source revision changing while observation scan is pending cannot leak evidence into another timeline', () => {
    const initial = stateWith({ id: 'vrena', name: 'Vrena Tolk', present: true, speech: 'Formal.' });
    return withHost(async h => {
        const text = 'Vrena Tolk gives a clipped practical instruction.';
        h.context.chat = [{ is_user: true, name: 'Ari', mes: 'I ask what to sign.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: text }];
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let entered;
        const started = new Promise(resolve => { entered = resolve; });
        h.context.generateRaw = async () => {
            h.metrics.generations += 1;
            entered();
            await gate;
            return JSON.stringify({ ...EMPTY, candidateAccounting: { vrena: 'evaluated' }, npcs: [completePatch('vrena', 'Vrena Tolk', { observations: [observation('speech', text, 'Clipped practical instruction.')] })] });
        };
        const pending = h.entry.processCompletedAssistantResponse(1);
        await started;
        h.context.chat[1].swipe_id = 1;
        h.context.chat[1].mes = 'Replacement swipe with patient, elaborate directions.';
        release();
        const result = await pending;
        assert.equal(result.ok, false);
        assert.equal(result.discarded, true);
        assert.equal(h.persisted().npcs[0].profileEvolutionEvidence.length, 0);
    }, { state: initial });
});

test('shared prompts describe model-led consolidation without reintroducing automatic backfill or embedded extraction', () => {
    const state = stateWith({ id: 'vrena', name: 'Vrena Tolk', present: true, mannerisms: ['Slides forms briskly.', 'Pushes ledgers toward applicants.'] });
    const chat = [{ is_user: true, name: 'Ari', mes: 'I wait.' }, { is_user: false, mes: 'Vrena Tolk shoves the contract toward Ari.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, candidateNpcIds: ['vrena'] });
    assert.match(prompt, /PROFILE CONSOLIDATION:/);
    assert.match(prompt, /profileObservations/);
    assert.match(prompt, /candidateAccounting/);
    assert.doesNotMatch(prompt, /targeted dossier backfill extractor|Full scan every turn|<npc_state_v1>/i);
});

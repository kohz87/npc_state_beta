import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { semanticEditIndex } from '../src/model/semantic-updates.js';
import { normalizeNpc, createEmptyState, PROFILE_EVOLUTION_EVIDENCE_LIMIT } from '../src/schema.js';
import { DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { scanPromptMeasurementMatrix } from '../scripts/measure-scan-prompts.mjs';

// Exact relevant excerpts/returned profile values from the supplied Sariel captures.
// Scene context is deliberately reduced to profile evidence; later synthesized proposals
// below are authored test responses, not claims about live provider compliance.
const q = {
    identity: 'Sariel Vael had already caught your wrist before the latch settled into its strike.',
    behavior: 'She pulled you forward two paces, kicked a three-legged stool out of the walkway, and slapped a dry reed pen into your fingers',
    personality: 'slapped a dry reed pen into your fingers with the flat efficiency of a clerk clearing an entryway before the snow drifted over the sill.',
    speech: 'Name on the bottom line. Thumbprint next to it if you cannot write.',
    paper: 'Her hands moved across the paper strips, shuffling them flat with quick, rhythmic slaps of her palm.',
    tusks: 'Her thumb flicked each of the four tusk pairs where they sat on the heartwood counter, checking the root cavities for fractures.',
    reach: "Sariel's right hand dropped beneath the desk lip, where the edge of a heavy iron measuring rule poked through the shelf.",
    slam: 'Her right hand came up from beneath the desk shelf, bringing a flat, three-foot bar of iron down against the timber with a sound like a splitting log.',
    refusal: 'Five cords were rotten birch. Master Garek refused the tally mark. You brought swamp scrub to the post yard.',
    return: 'Behind the counter, Sariel slid the iron yard-rule back onto its hidden shelf beneath the counter lip.',
    calm: 'Her dark hair had strayed from the linen kerchief around her temples, but her breathing remained even.',
    contracts: 'Two contracts are open. The charcoal burners reported a pair of crag-cats along the upper timber road. Forty-five Gold for the pelts.',
    tap: 'Her finger tapped the upper parchment nailed to the rough fir post.',
};
const behavior = 'Steers incoming travelers straight to the counter and briskly dictates intake procedures.';
const paperConcept = 'Rhythmic paper slapping and counter tapping';
const source = (messageId, excerpt) => ({ messageId, excerpt });
const observation = (messageId, excerpt, concept) => ({ field: 'mannerisms', observation: concept, concept, sources: [source(messageId, excerpt)] });
const paperObservation = {
    ...observation(2, q.paper, paperConcept),
    observation: 'Shuffles contract sheets flat with quick, rhythmic slaps of her palm and taps parchment until the wood rattles.',
};
const slamObservation = {
    ...observation(14, q.slam, 'Threatening desk-slam with an iron yard-rule.'),
    observation: 'Brings down a three-foot iron yard-rule against the desk and points it toward unruly visitors to enforce order.',
};
function envelope(id, semanticUpdates = [], profileObservations = []) {
    return {
        exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
        npcs: [{ id, name: 'Sariel Vael', semanticUpdates, profileObservations,
            evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'],
            fieldEvaluations: { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(f => !semanticUpdates.some(u => u.field === f)), unavailable: [] },
        }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: id ? { [id]: 'evaluated' } : {},
    };
}
function initialResponse() {
    const result = envelope('', [
        { field: 'personality', operation: 'establish', value: 'Brisk, assertive, and bluntly efficient, focused on rapid processing without social pleasantries.', sources: [source(2, q.personality)] },
        { field: 'behaviorProfile', operation: 'establish', changes: [{ action: 'add', value: behavior }], sources: [source(2, q.behavior)] },
        { field: 'speech', operation: 'establish', value: 'Clipped, commanding, and rapid-fire instructions detailing regulations and contract bounties.', sources: [source(2, q.speech)] },
    ], [paperObservation]);
    const evidence = { excerpts: [q.identity], explanation: 'Sariel physically guides Lucien to the intake counter.' };
    Object.assign(result.npcs[0], { identityKind: 'named', identityEvidence: { anchor: 'Sariel Vael', ...evidence }, activityEvidence: { exchangeActive: evidence, inChat: evidence }, relationshipSummary: '', relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'Professional intake.' } });
    result.exchangeActiveNpcIds = ['Sariel Vael']; result.inChatNpcIds = ['Sariel Vael'];
    return result;
}
const scenes = {
    2: [q.identity, q.behavior + ' with the flat efficiency of a clerk clearing an entryway before the snow drifted over the sill.', q.speech, q.paper].join('\n'),
    6: 'Sariel Vael checks your turn-in.\n' + q.tusks,
    12: q.reach,
    14: ['Sariel Vael did not blink.', q.slam, q.refusal, q.return, q.calm, q.contracts, q.tap].join('\n'),
};
function chatThrough(last) {
    return Array.from({ length: last + 1 }, (_, id) => ({
        is_user: id % 2 === 1, name: id % 2 === 1 ? 'Lucien Noctis' : 'Narrator', swipe_id: 0,
        mes: scenes[id] || (id % 2 === 1 ? 'I approach Sariel at the guild counter.' : 'The road is quiet.'),
    }));
}
const enrichment = [
    { field: 'behaviorProfile', operation: 'refine', changes: [{ action: 'add', value: 'Enforces guild requirements firmly during counter disputes, then promptly returns to practical business.' }], sources: [source(14, q.refusal), source(14, q.calm), source(14, q.contracts)], explanation: 'Compatible detail about her established direct approach to guild work.' },
    { field: 'mannerisms', operation: 'establish', establishment: 'reinforced', changes: [{ action: 'add', value: 'Uses emphatic hand gestures on contract papers while explaining available work.' }], sources: [source(14, q.tap)], explanation: 'The earlier paperwork observation and this new contract gesture support a narrow work-related pattern.' },
];
function applyCurrent(state, updates = [], observations = [], extra = {}) {
    return applyScanResult(state, envelope(state.npcs[0].id, updates, observations), {
        sourceMessageId: 14, turn: 7, playerName: 'Lucien Noctis', sourceEventKey: 'current-owned-revision',
        sourceEventKeys: { 14: 'current-owned-revision' },
        semanticSourceContextsByMessageId: { 14: { profileContext: scenes[14], semanticWorldContext: 'World-only habitual bell ringing.' } },
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, ...extra,
    });
}

test('Sariel evidence survives production persistence and reaches the next scan with its concepts', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis';
    let response = initialResponse();
    h.context.generateRaw = async () => { h.metrics.generations++; return JSON.stringify(response); };
    h.context.chat = chatThrough(2);
    assert.equal((await h.entry.processCompletedAssistantResponse(2)).ok, true);
    let npc = h.persisted().npcs[0];
    assert.equal(npc.profileEvolutionEvidence.length, 4);
    assert.deepEqual(npc.mannerisms, []);
    for (const [id, excerpt] of [[6, q.tusks], [12, q.reach]]) {
        h.context.chat = chatThrough(id);
        response = envelope(npc.id, [], [observation(id, excerpt, excerpt)]);
        assert.equal((await h.entry.processCompletedAssistantResponse(id)).ok, true);
    }
    const state = h.persisted(); npc = state.npcs[0];
    assert.equal(npc.profileEvolutionEvidence.length, 6);
    const first = npc.profileEvolutionEvidence[0];
    assert.equal(first.concept, paperConcept); assert.equal(first.evidence, q.paper);
    assert.match(first.sourceEventKey, /^source:/);
    // The former last-four projection reproduces the reported missing observation.
    assert.equal(npc.profileEvolutionEvidence.slice(-4).some(r => r.concept === paperConcept), false);
    const prompt = buildScanPrompt({ state, chat: chatThrough(14), assistantMessageId: 14, playerName: 'Lucien Noctis' });
    assert.match(prompt, /Rhythmic paper slapping and counter tapping/);
    const index = semanticEditIndex(npc).recentProfileEvidence;
    assert.equal(index.length, 6); assert.equal(index[0].sourceMessageId, 2); assert.equal(index[0].kind, 'observation');

    // The supplied third response proposed an observation and left profile fields unchanged.
    // Even several encounters never trigger automatic promotion of unrelated gestures.
    const observed = applyCurrent(state, [], [slamObservation]);
    assert.deepEqual(observed.state.npcs[0].mannerisms, []);
    assert.deepEqual(observed.state.npcs[0].behaviorProfile, [behavior]);
    const replay = applyCurrent(observed.state, [], [slamObservation]);
    assert.equal(replay.state.npcs[0].profileEvolutionEvidence.length, observed.state.npcs[0].profileEvolutionEvidence.length);

    // Authored source-cited synthesis: runtime can persist enrichment without replacing
    // unrelated existing detail or requiring a contradictory character transformation.
    h.context.chat = chatThrough(14); response = envelope(npc.id, enrichment, [slamObservation]);
    assert.equal((await h.entry.processCompletedAssistantResponse(14)).ok, true);
    const saved = h.persisted().npcs[0];
    assert.deepEqual(saved.behaviorProfile, [behavior, enrichment[0].changes[0].value]);
    assert.deepEqual(saved.mannerisms, [enrichment[1].changes[0].value]);
    assert.equal(saved.profileEvolutionEvidence.filter(r => r.concept === paperConcept).length, 1);
    assert.deepEqual(saved.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.deepEqual(saved.relationshipHistory, []);
    assert.equal(h.metrics.generations, 4);
}));

test('enrichment keeps locks, establishment metadata, source authority and temporary-profile guards', () => {
    const state = createEmptyState('test'); state.npcs = [normalizeNpc({ id: 'sariel', name: 'Sariel Vael', behaviorProfile: [behavior] })];
    const trials = [
        { update: { ...enrichment[1], establishment: undefined }, reason: 'profile-establishment-basis-required' },
        { update: { ...enrichment[1], sources: [source(2, q.paper)] }, reason: 'invalid-source-reference' },
        { update: { ...enrichment[1], sources: [source(14, 'World-only habitual bell ringing.')] }, reason: 'out-of-scope-source' },
        { update: { ...enrichment[1], durability: 'temporary' }, reason: 'temporary-evidence-cannot-rewrite-durable-canon' },
    ];
    for (const { update, reason } of trials) {
        const result = applyCurrent(state, [update]);
        assert.deepEqual(result.state.npcs[0].mannerisms, []);
        assert.ok(result.semanticDiagnostics.some(r => r.reason === reason), reason);
    }
    state.npcs[0].manualProfileFields = ['behaviorProfile', 'mannerisms'];
    const locked = applyCurrent(state, enrichment);
    assert.deepEqual(locked.state.npcs[0].behaviorProfile, [behavior]);
    assert.deepEqual(locked.state.npcs[0].mannerisms, []);
    assert.equal(locked.semanticDiagnostics.filter(r => r.status === 'manually-protected').length, 2);
});

test('all extraction modes distinguish establishment/enrichment from contradictory development', () => {
    for (const { name, prompt } of scanPromptMeasurementMatrix()) {
        assert.match(prompt, /establishing blanks and enriching compatible detail do not require character transformation/, name);
        assert.match(prompt, /Contradictory lasting change needs explicit sustained development/, name);
        assert.match(prompt, /Reconsider supplied observations with new current support/, name);
        assert.match(prompt, /continued narration of one action is not independent recurrence/, name);
        assert.match(prompt, /In routine scans, saved observations are context: cite new current excerpts/, name);
        assert.match(prompt, /establishment:explicit\|reinforced/, name);
    }
});

test('scanner evidence window remains bounded without changing stored retention or mutating state', () => {
    const npc = normalizeNpc({ id: 'sariel', name: 'Sariel Vael', profileEvolutionEvidence: Array.from({ length: 20 }, (_, i) => ({ field: 'mannerisms', kind: 'observation', concept: `Concept ${i}`, evidence: `Exact source ${i}`, sourceMessageId: i, sourceEventKey: `owned:${i}` })) });
    const before = structuredClone(npc);
    assert.equal(npc.profileEvolutionEvidence.length, PROFILE_EVOLUTION_EVIDENCE_LIMIT);
    assert.equal(PROFILE_EVOLUTION_EVIDENCE_LIMIT, 12);
    assert.deepEqual(semanticEditIndex(npc).recentProfileEvidence.map(r => r.sourceMessageId), [14, 15, 16, 17, 18, 19]);
    assert.deepEqual(npc, before);
});

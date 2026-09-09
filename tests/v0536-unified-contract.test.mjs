import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt, parseScanJson } from '../src/scanner.js';
import { buildExchangeEvidencePolicy, profileEvidenceText } from '../src/evidence-adapter.js';
import { createEmptyState, normalizeNpc, normalizeMemoryEntries } from '../src/schema.js';
import { DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { scanOutputExamples } from '../src/scan-contract.js';
import { prepareModelLedPayload } from '../src/model/semantic-updates.js';

const captured = JSON.parse(fs.readFileSync(new URL('./fixtures/v0536-maren-captured.json', import.meta.url)));
const marenChat = () => [
    { is_user: true, name: 'Lucien Noctis', mes: captured.user },
    { is_user: false, name: 'Narrator', swipe_id: 0, mes: `${captured.visible}\n<Blocks><World_State>${captured.world}</World_State><NPC_Inner_Chatter>${captured.inner}</NPC_Inner_Chatter></Blocks>` },
];
const quote = (field, value, excerpt, messageId = 1, extra = {}) => ({ field, operation: 'establish', value, sources: [{ messageId, excerpt }], ...extra });
function modernMaren() {
    const result = structuredClone(captured.response);
    const patch = result.npcs[0];
    const userScene = captured.user.split('\n\n');
    const assistantScene = captured.visible.split('\n\n');
    const values = {
        role: patch.role, background: patch.background, apparentAge: patch.apparentAge,
        appearance: patch.appearance, personality: patch.personality,
        behaviorProfile: ['Efficiently moves new arrivals through registration and available work.'],
        speech: patch.speech, mood: patch.mood, location: patch.location,
        goal: 'Have Lucien select an available contract.', status: patch.status,
        memories: ["Processed Lucien Noctis's provisional guild registration."],
    };
    patch.semanticUpdates = [
        quote('role', values.role, userScene[2], 0),
        quote('background', values.background, userScene[1] + '\n\n' + userScene[2], 0),
        quote('apparentAge', values.apparentAge, userScene[2], 0),
        quote('appearance', values.appearance, assistantScene[2]),
        quote('personality', values.personality, userScene[2], 0),
        quote('behaviorProfile', values.behaviorProfile, userScene[2], 0),
        quote('speech', values.speech, patch.activityEvidence.exchangeActive.excerpts[0]),
        quote('mood', values.mood, userScene[2], 0),
        quote('location', values.location, captured.world.split('\n')[0]),
        quote('goal', values.goal, assistantScene[7]),
        quote('status', values.status, 'She lifted her knuckle, leaving the parchment free.'),
        quote('memories', values.memories, patch.activityEvidence.exchangeActive.excerpts[1]),
    ];
    for (const field of DOSSIER_SEMANTIC_FIELDS) delete patch[field];
    patch.fieldEvaluations.insufficient.push('mannerisms');
    patch.profileObservations = [{ field: 'mannerisms', observation: 'Dealt slips like cards in this exchange.', sources: [{ messageId: 1, excerpt: 'She dealt four slips of coarse grey rag-paper across the grain of the oak like a dealer turning cards in a taproom.' }] }];
    patch.relationshipSummaryEvidence.excerpts.push(patch.activityEvidence.exchangeActive.excerpts[1]);
    return { result, values };
}

test('captured Maren source-cited first pass persists all reviewed fields and observations with zero relationship movement', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis'; h.context.chat = marenChat();
    const { result: response, values } = modernMaren();
    h.context.generateRaw = async () => { h.metrics.generations++; return JSON.stringify(response); };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 1);
    const npc = h.persisted().npcs[0];
    for (const [field, value] of Object.entries(values)) {
        if (field === 'apparentAge') assert.match(npc[field], /^~2\d$/);
        else assert.deepEqual(npc[field], value, field);
        assert.ok(result.semanticDiagnostics.some(row => row.field === field && row.status === 'applied'), field);
    }
    assert.equal(npc.age, ''); assert.equal(npc.species, ''); assert.equal(npc.currentForm, '');
    assert.deepEqual(npc.mannerisms, []);
    assert.ok(npc.profileEvolutionEvidence.some(row => row.kind === 'observation' && row.field === 'mannerisms'));
    assert.equal(npc.relationshipSummary, response.npcs[0].relationshipSummary);
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.deepEqual(npc.relationshipProgress, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.deepEqual(npc.relationshipHistory, []);
    assert.deepEqual(npc.relationshipMilestones, []);
    assert.equal(h.api.scanStatus().status, 'complete');
}));

test('captured legacy-flat response requests bounded ordinary repair without fabricated citations or focused replay', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis'; h.context.chat = marenChat();
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations++;
        if (h.metrics.generations === 1) return JSON.stringify(captured.response);
        assert.match(prompt, /CONTRACT FORMAT REPAIR/);
        const id = prompt.match(/"id":"([^"]+)","name":"Maren Voss"/)[1];
        const response = modernMaren().result;
        response.npcs[0].id = id;
        // The repair sanitizer must exclude these focused channels.
        response.npcs[0].relationshipSummary = 'Invented intimacy';
        response.lifeStateUpdates = [{ id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Invented death.' }];
        return JSON.stringify(response);
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true); assert.equal(h.metrics.generations, 2);
    const npc = h.persisted().npcs[0];
    assert.equal(npc.background, modernMaren().values.background);
    assert.equal(npc.goal, 'Have Lucien select an available contract.');
    assert.equal(npc.lifeState, 'unknown'); assert.equal(npc.relationshipSummary, '');
    assert.deepEqual(npc.relationshipHistory, []);
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'background' && row.status === 'repaired-proposal'));
}));

const visible = 'Linnea Brand hands Ari the registration form, explains each entry, checks the completed answers, and seals the registration. Linnea wears bleached linen sleeves. Linnea taps the parchment once.';
function simpleChat(extra = '') {
    return [{ is_user: true, name: 'Ari', mes: 'I approach Linnea.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: visible + extra }];
}
function simplePayload(updates = [], extra = {}) {
    const evidence = { excerpts: [visible], explanation: 'Linnea handles Ari registration.' };
    return { exchangeActiveNpcIds: ['Linnea Brand'], inChatNpcIds: ['Linnea Brand'], worldActiveNpcIds: [], npcs: [{
        id: '', name: 'Linnea Brand', identityKind: 'named', identityEvidence: { anchor: 'Linnea Brand', ...evidence },
        activityEvidence: { exchangeActive: evidence, inChat: evidence }, semanticUpdates: updates,
        evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'],
        relationshipSummary: '', fieldEvaluations: { insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !updates.some(update => update.field === field)) }, ...extra,
    }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} };
}
function apply(response, chat = simpleChat(), state = createEmptyState('test'), extra = {}) {
    const exchange = { user: { ...chat[0], id: 0 }, assistant: { ...chat[1], id: 1 } };
    const evidencePolicy = buildExchangeEvidencePolicy(exchange);
    return applyScanResult(state, response, { sourceMessageId: 1, turn: 1, playerName: 'Ari',
        currentAdmissionText: evidencePolicy.visibleText, profileContext: evidencePolicy.visibleText,
        evidencePolicy, semanticSourceContextsByMessageId: {
            0: { semanticEvidenceContext: profileEvidenceText(chat[0].mes) },
            1: { semanticEvidenceContext: profileEvidenceText(chat[1].mes), semanticWorldContext: evidencePolicy.worldStateText, semanticPrivateContext: evidencePolicy.innerChatterText },
        }, applyReturnedNpcPatches: true, ...extra });
}

test('authorized field sources survive disallowed repetition while structured-only canon stays rejected', () => {
    const world = 'Linnea Brand | location: East Registry | status: at desk | Personality: Brisk | Background: Royal Court | Appearance: silk cape';
    const inner = 'Linnea Brand: I am impatient and want Ari to choose a contract.';
    const chat = simpleChat(`<Blocks><World_State>${world}</World_State><NPC_Inner_Chatter>${inner}</NPC_Inner_Chatter><Control>${world}\n${inner}\nbleached linen sleeves</Control></Blocks>`);
    const positive = [
        quote('personality', 'Brisk and practical.', visible),
        quote('background', 'Registration clerk.', visible),
        quote('appearance', 'Bleached linen sleeves.', 'Linnea wears bleached linen sleeves.'),
        quote('location', 'East Registry', world), quote('status', 'At desk', world),
        quote('mood', 'Impatient', inner), quote('goal', 'Have Ari choose a contract.', inner),
    ];
    const result = apply(simplePayload(positive), chat);
    for (const update of positive) assert.equal(result.state.npcs[0][update.field], update.value, update.field);
    const nextAction = 'Linnea hands Ari the available contracts and asks him to choose one.';
    const visibleLive = apply(simplePayload([
        quote('mood', 'Brisk and businesslike.', visible),
        quote('goal', 'Have Ari choose an available contract.', nextAction),
    ]), simpleChat('\n' + nextAction + `<Blocks><World_State>Mood: Brisk; Agenda: Choose an available contract.</World_State></Blocks>`));
    assert.equal(visibleLive.state.npcs[0].mood, 'Brisk and businesslike.');
    assert.equal(visibleLive.state.npcs[0].goal, 'Have Ari choose an available contract.');
    for (const [field, excerpt, value] of [['background', world, 'Royal Court'], ['appearance', world, 'Silk cape'], ['personality', world, 'Brisk'], ['speech', inner, 'Impatient speech'], ['behaviorProfile', inner, ['Directs applicants impatiently.']]]) {
        const rejected = apply(simplePayload([quote(field, value, excerpt)]), chat);
        assert.ok(rejected.semanticDiagnostics.some(row => row.field === field && row.status === 'invalid-source-reference'), field);
        assert.deepEqual(rejected.state.npcs[0][field], Array.isArray(value) ? [] : '');
    }
});

test('flat Species and named-preferred Role cannot borrow generic registration evidence', () => {
    for (const [field, value] of [['species', 'Elf'], ['role', 'Secret Royal Assassin']]) {
        const result = apply(simplePayload([], { [field]: value }), simpleChat(), undefined, { admissionMode: 'named_preferred' });
        assert.equal(result.state.npcs[0][field], '');
        assert.ok(result.semanticDiagnostics.some(row => row.field === field && row.reason === 'source-cited-update-required'));
    }
});

test('one-off mannerism cannot evade establishment through Recheck; explicit or reinforced proposals share the same validator', () => withHost(async h => {
    h.context.chat = simpleChat();
    const update = quote('mannerisms', ['Habitually taps parchment.'], 'Linnea taps the parchment once.');
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations++;
        const response = simplePayload([update]);
        const id = prompt.match(/"id":"([^"]+)","name":"Linnea Brand"/)?.[1];
        if (id) response.npcs[0].id = id;
        return JSON.stringify(response);
    };
    await h.entry.processCompletedAssistantResponse(1);
    assert.equal(h.metrics.generations, 2);
    const npc = h.persisted().npcs[0]; assert.deepEqual(npc.mannerisms, []);
    const recheck = await h.api.recheckMissingDetails(npc.id);
    assert.deepEqual(h.persisted().npcs[0].mannerisms, []);
    assert.ok(recheck.semanticDiagnostics.some(row => row.reason === 'profile-establishment-basis-required'));
    for (const establishment of ['explicit', 'reinforced']) {
        const supported = 'Linnea habitually squares the papers before each registration.';
        const result = apply(simplePayload([quote('mannerisms', ['Squares papers before registration.'], supported, 1, { establishment })]), simpleChat('\n' + supported));
        assert.deepEqual(result.state.npcs[0].mannerisms, ['Squares papers before registration.']);
    }
}));

test('malformed retry consumes the repair budget; exhausted flat output retains identity and partial diagnostics', () => withHost(async h => {
    h.context.chat = simpleChat();
    h.context.generateRaw = async () => { h.metrics.generations++; return h.metrics.generations === 1 ? '{' : JSON.stringify(simplePayload([], { species: 'Elf' })); };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(h.metrics.generations, 2); assert.equal(result.ok, true);
    assert.equal(h.persisted().npcs[0].species, '');
    assert.equal(h.api.scanStatus().status, 'partial');
    assert.equal(h.api.operationDiagnostics({ limit: 1 }).at(-1).followUp.status, 'skipped-budget');
}));

test('format repair with follow-up Off rejects edited, swiped, and switched-chat responses before persistence', async t => {
    for (const kind of ['edit', 'swipe', 'chat']) await t.test(kind, () => withHost(async h => {
        h.context.chat = simpleChat();
        h.context.generateRaw = async ({ prompt }) => {
            h.metrics.generations++;
            if (h.metrics.generations === 1) return JSON.stringify(simplePayload([], { personality: 'Practical.' }));
            assert.match(prompt, /CONTRACT FORMAT REPAIR/);
            const id = prompt.match(/"id":"([^"]+)","name":"Linnea Brand"/)[1];
            if (kind === 'edit') h.context.chat[1].mes += ' Edited during repair.';
            if (kind === 'swipe') h.context.chat[1].swipe_id = 1;
            if (kind === 'chat') h.context.chatId = 'another-chat';
            return JSON.stringify(simplePayload([quote('personality', 'Practical.', visible)], { id }));
        };
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(h.metrics.generations, 2);
        assert.equal(result.discarded, true);
        assert.equal(result.reason, 'stale-operation');
        assert.equal(h.persisted().npcs.length, 0);
        assert.equal(h.metrics.posts, 0);
    }));
});

test('source-cited birthday establishment supersedes generated fallback but preserves explicit birthdays and manual locks', () => {
    const excerpt = 'Linnea celebrates her birthday on 12 Redleaf.';
    for (const [provenance, locked, expected] of [['generated', false, '12 Redleaf'], ['explicit', false, '27 Goldfall'], ['generated', true, '27 Goldfall']]) {
        const state = createEmptyState('test');
        state.npcs = [normalizeNpc({ id: 'linnea', name: 'Linnea Brand', birthday: '27 Goldfall', birthdayProvenance: provenance, manualProfileFields: locked ? ['birthday'] : [] })];
        const response = simplePayload([quote('birthday', '12 Redleaf', excerpt)], { id: 'linnea' });
        const npc = apply(response, simpleChat('\n' + excerpt), state).state.npcs[0];
        assert.equal(npc.birthday, expected);
        assert.equal(npc.birthdayProvenance, expected === '12 Redleaf' ? 'explicit' : provenance);
    }
});

test('rejected repair cannot be reported resolved through contradictory insufficient evaluation', () => withHost(async h => {
    h.context.chat = simpleChat();
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations++;
        if (h.metrics.generations === 1) return JSON.stringify(simplePayload([], { species: 'Elf' }));
        const id = prompt.match(/"id":"([^"]+)","name":"Linnea Brand"/)[1];
        return JSON.stringify(simplePayload([quote('species', 'Elf', 'Fabricated citation.')], { id, fieldEvaluations: { insufficient: ['species'] } }));
    };
    await h.entry.processCompletedAssistantResponse(1);
    assert.equal(h.persisted().npcs[0].species, '');
    assert.equal(h.api.operationDiagnostics({ limit: 1 }).at(-1).followUp.remainingOutcomes, 1);
    assert.equal(h.api.scanStatus().status, 'partial');
}));

test('modern proposals stay intact through preparation and duplicate flat fields cannot write twice', () => {
    const update = quote('personality', 'Practical.', visible);
    const response = simplePayload([update], { personality: 'Unsupported flat alternative.' });
    const prepared = prepareModelLedPayload(createEmptyState('test'), response);
    assert.equal(prepared.npcs[0].personality, undefined);
    assert.deepEqual(prepared.npcs[0].semanticUpdates, [update]);
    const result = apply(response);
    assert.equal(result.state.npcs[0].personality, 'Practical.');
    assert.equal(result.semanticDiagnostics.filter(row => row.field === 'personality' && row.status === 'applied').length, 1);
});

test('typed message ownership rejects wrong USER source, malformed source IDs, and fabricated text', () => {
    for (const source of [{ messageId: 0, excerpt: visible }, { messageId: '1', excerpt: visible }, { messageId: 1, excerpt: 'Fabricated.' }]) {
        const result = apply(simplePayload([{ field: 'personality', operation: 'establish', value: 'Practical.', sources: [source] }]));
        assert.equal(result.state.npcs[0].personality, '');
        assert.ok(result.semanticDiagnostics.some(row => row.status === 'invalid-source-reference'));
    }
});

test('literal NEW example and assembled prompt express source-cited fields only', () => {
    const example = scanOutputExamples().populated;
    parseScanJson(JSON.stringify(example));
    for (const patch of example.npcs) {
        for (const field of DOSSIER_SEMANTIC_FIELDS) assert.equal(Object.hasOwn(patch, field), false, field);
        for (const update of patch.semanticUpdates) assert.ok(update.sources.length);
    }
    const prompt = buildScanPrompt({ state: createEmptyState('test'), chat: simpleChat(), assistantMessageId: 1 });
    assert.doesNotMatch(prompt, /legacy flat NEW|NEW ordinary fields are flat|NEW: flat|profileEstablishment/);
    assert.match(prompt, /NEW\/EXISTING dossiers have ONE ordinary mutation channel/);
    assert.match(prompt, /reuse an exact activityEvidence.exchangeActive excerpt/);
});

test('memory normalization preserves different events and explicit refinement remains model-owned', () => {
    const a = 'Lucien rescued Maren from the flooded quarry on Redleaf 15.';
    const b = 'Lucien rescued Maren from the flooded quarry on Goldfall 27.';
    assert.deepEqual(normalizeMemoryEntries([a, b, a]), [a, b]);
    const shared = 'During the evacuation of the flooded quarry, Lucien helped Maren lead the injured workers safely through the eastern tunnels and arranged shelter for their families in the guild hall. ';
    assert.deepEqual(normalizeMemoryEntries([shared + a, shared + b]), [shared + a, shared + b]);
    const state = createEmptyState('test'); state.npcs = [normalizeNpc({ id: 'linnea', name: 'Linnea Brand', memories: [a, b] })];
    const response = simplePayload([{ field: 'memories', operation: 'refine', changes: [{ action: 'replace', expected: a, value: a + ' She promised repayment.' }], sources: [{ messageId: 1, excerpt: visible }] }], { id: 'linnea' });
    const result = apply(response, simpleChat(), state);
    assert.deepEqual(result.state.npcs[0].memories, [a + ' She promised repayment.', b]);
});

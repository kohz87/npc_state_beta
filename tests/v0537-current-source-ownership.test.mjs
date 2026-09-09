import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withHost } from './helpers/host-harness.mjs';
import { validateSemanticSourceReference, semanticSourceEventKey } from '../src/model/semantic-updates.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const captured = JSON.parse(fs.readFileSync(new URL('./fixtures/v0537-vrena-captured.json', import.meta.url)));
const chat = () => [
    { is_user: false, name: 'Narrator', mes: 'Older unrelated scene.' },
    { is_user: true, name: 'Lucien Noctis', mes: captured.user },
    { is_user: false, name: 'Narrator', swipe_id: 0, mes: `${captured.visible}\n<Blocks><World_State>${captured.world}</World_State><NPC_Inner_Chatter>${captured.inner}</NPC_Inner_Chatter></Blocks>` },
];

test('captured Vrena null USER citation persists apparent age and all accepted siblings in one production scan', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis'; h.context.chat = chat();
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations++;
        assert.match(prompt, /SOURCE IDS: USER=1 ASSISTANT=2/);
        return JSON.stringify(captured.response);
    };
    const result = await h.entry.processCompletedAssistantResponse(2);
    assert.equal(result.ok, true); assert.equal(h.metrics.generations, 1);
    const npc = h.persisted().npcs[0];
    assert.match(npc.apparentAge, /^~2\d$/);
    for (const row of captured.response.npcs[0].semanticUpdates) {
        assert.ok(result.semanticDiagnostics.some(d => d.field === row.field && d.status === 'applied'), row.field);
        if (row.field !== 'apparentAge') assert.deepEqual(npc[row.field], row.value ?? row.changes.map(c => c.value), row.field);
    }
    assert.equal(npc.age, ''); assert.equal(npc.goal, ''); assert.deepEqual(npc.mannerisms, []);
    assert.equal(npc.profileEvolutionEvidence.filter(row => row.kind === 'observation').length, 1);
    assert.equal(npc.relationshipSummary, captured.response.npcs[0].relationshipSummary);
    for (const key of ['relationship', 'relationshipProgress']) assert.deepEqual(npc[key], { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.deepEqual(npc.relationshipHistory, []); assert.deepEqual(npc.relationshipMilestones, []);
    assert.equal(h.api.scanStatus().status, 'complete');
}));

test('Vrena explicit wrong assistant ID is rejected without borrowing USER evidence or running repair', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis'; h.context.chat = chat();
    const response = structuredClone(captured.response);
    response.npcs[0].semanticUpdates.find(row => row.field === 'apparentAge').sources[0].messageId = 2;
    h.context.generateRaw = async () => { h.metrics.generations++; return JSON.stringify(response); };
    const result = await h.entry.processCompletedAssistantResponse(2);
    assert.equal(h.persisted().npcs[0].apparentAge, '');
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'apparentAge' && row.reason === 'out-of-scope-source'));
    assert.equal(h.metrics.generations, 1); assert.equal(h.api.scanStatus().status, 'partial');
    const npcId = h.persisted().npcs[0].id;
    const recheckResponse = structuredClone(captured.response);
    recheckResponse.npcs[0].id = npcId;
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations++;
        assert.match(prompt, /SOURCE IDS: USER=1 ASSISTANT=2/);
        return JSON.stringify(recheckResponse);
    };
    const recheck = await h.api.recheckMissingDetails(npcId);
    assert.equal(recheck.ok, true); assert.equal(h.metrics.generations, 2);
    assert.match(h.persisted().npcs[0].apparentAge, /^~2\d$/);
}));

const options = {
    sourceMessageId: 2, currentExchangeSourceIds: [1, 2],
    sourceEventKey: 'assistant-revision-1', sourceEventKeys: { 0: 'historical', 1: 'user-revision-1', 2: 'assistant-revision-1' },
    semanticSourceContextsByMessageId: {
        0: { profileContext: 'Older source only.' },
        1: { profileContext: 'User-only observation. Shared quotation. First half', semanticWorldContext: 'World-only silk sleeves.' },
        2: { profileContext: 'Assistant-only observation. Shared quotation. second half', semanticWorldContext: 'World-only silk sleeves.', semanticPrivateContext: 'Private impatience.' },
    },
};
const validate = (excerpt, messageId = null, field = 'personality', extra = {}) => validateSemanticSourceReference({ field, sources: [{ messageId, excerpt }] }, { ...options, ...extra });

test('null citations require one current authorized source; explicit IDs retain exact message authority', () => {
    const user = validate('User-only observation.');
    assert.equal(user.ok, true); assert.equal(user.rows[0].messageId, 1);
    assert.equal(semanticSourceEventKey(user.rows, options), 'user-revision-1');
    assert.equal(validate('Assistant-only observation.').rows[0].messageId, 2);
    assert.equal(validate('Shared quotation.').reason, 'ambiguous-current-source');
    assert.equal(validate('Shared quotation.', 1).ok, true);
    assert.equal(validate('Shared quotation.', 2).ok, true);
    for (const excerpt of ['Older source only.', 'First half second half', 'Fabricated quotation.', 'World-only silk sleeves.', 'Private impatience.']) assert.equal(validate(excerpt).ok, false, excerpt);
    assert.equal(validate('Older source only.', 0).ok, true); // Explicitly permitted Refresh history remains usable.
    assert.equal(validate('User-only observation.', 2).ok, false);
    assert.equal(validate('User-only observation.', '1').reason, 'invalid-source-shape');
    assert.equal(validate('User-only observation.', 3).reason, 'future-source-reference');
    assert.equal(validate('Private impatience.', null, 'mood').ok, true);
    assert.equal(validate('Private impatience.', null, 'goal').ok, true);
    assert.equal(validate('World-only silk sleeves.', null, 'appearance').ok, false);
    assert.equal(validate('World-only silk sleeves.', null, 'location').reason, 'ambiguous-current-source');
    assert.equal(validate('World-only silk sleeves.', 2, 'location').ok, true);
    // Repetition in a field-unauthorized block cannot poison an authorized USER source.
    assert.equal(validate('User-only observation.', null, 'personality', { semanticSourceContextsByMessageId: { ...options.semanticSourceContextsByMessageId, 2: { semanticWorldContext: 'User-only observation.' } } }).rows[0].messageId, 1);
    assert.equal(validate('User-only observation.', null, 'personality', { currentExchangeSourceIds: [] }).ok, false);
});

test('USER observation null/numeric citations deduplicate by the resolved source and distinguish revisions', () => {
    const state = createEmptyState('test'); state.npcs = [normalizeNpc({ id: 'vrena', name: 'Vrena Karr' })];
    const payload = messageId => ({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [], npcs: [{ id: 'vrena', name: 'Vrena Karr', profileObservations: [{ field: 'mannerisms', observation: 'One observed gesture.', sources: [{ messageId, excerpt: 'User-only observation.' }] }] }] });
    const apply = (s, id, extra = {}) => applyScanResult(s, payload(id), { ...options, applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, ...extra });
    const first = apply(state, null).state;
    assert.equal(first.npcs[0].profileEvolutionEvidence[0].sourceEventKey, 'user-revision-1');
    const again = apply(first, 1).state;
    assert.equal(again.npcs[0].profileEvolutionEvidence.length, 1);
    const revised = apply(again, null, { sourceEventKeys: { ...options.sourceEventKeys, 1: 'user-revision-2' } }).state;
    assert.equal(revised.npcs[0].profileEvolutionEvidence.length, 2);
});

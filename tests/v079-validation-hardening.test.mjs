import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { applyModelLedSemanticUpdates } from '../src/model/semantic-updates.js';
import { dossierFieldValueIssue } from '../src/model/dossier-fields.js';
import { createEmptyState, normalizeNpc, normalizeKeyRelationshipEntries } from '../src/schema.js';
import { encodeV3Payload, decodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const visible = 'Nia shifts into her human form. Her human body has auburn hair.';

function semanticState() {
    const state = createEmptyState('v079-semantic');
    state.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', appearanceForms: [] })];
    return state;
}

function applySemantic(update) {
    return applyModelLedSemanticUpdates(semanticState(), {
        npcs: [{ id: 'nia', name: 'Nia', semanticUpdates: [{
            ...update,
            sources: [{ messageId: 1, excerpt: visible }],
            explanation: 'Visible evidence.',
        }] }],
    }, { sourceMessageId: 1, profileContext: visible, semanticEvidenceContext: visible });
}

test('appearanceForms rejects non-string selectors before form-name normalization', () => {
    const result = applySemantic({
        field: 'appearanceForms', operation: 'establish',
        scope: { form: { name: 'Human' } },
        value: 'A human body with auburn hair.',
    });
    assert.deepEqual(result.state.npcs[0].appearanceForms, []);
    assert.ok(result.diagnostics.some(row => row.field === 'appearanceForms'
        && row.status === 'rejected-proposal'
        && row.reason === 'invalid-value-type:scope.form-expected-string'));
    assert.equal(JSON.stringify(result.state).includes('[object Object]'), false);
});


test('appearanceForms rejects malformed selector aliases for all operations', () => {
    const cases = [
        { scope: { form: ['Human'] } },
        { targetForm: { name: 'Human' } },
        { expected: ['Human'] },
        { ref: { id: 'appearanceForms:human' } },
    ];
    for (const selectors of cases) {
        const result = applySemantic({
            field: 'appearanceForms', operation: 'establish', ...selectors,
            value: 'A human body with auburn hair.',
        });
        assert.deepEqual(result.state.npcs[0].appearanceForms, []);
        assert.ok(result.diagnostics.some(row => row.field === 'appearanceForms'
            && row.status === 'rejected-proposal'
            && row.reason.startsWith('invalid-value-type:')));
    }
    const remove = applySemantic({
        field: 'appearanceForms', operation: 'remove', targetForm: { name: 'Human' },
    });
    assert.ok(remove.diagnostics.some(row => row.reason === 'invalid-value-type:targetForm-expected-string'));
});

test('appearanceForms preserves supported string selectors and form objects', () => {
    const stringTarget = applySemantic({
        field: 'appearanceForms', operation: 'establish', scope: { form: 'Human' },
        value: 'A human body with auburn hair.',
    });
    assert.deepEqual(stringTarget.state.npcs[0].appearanceForms, [{ name: 'Human', appearance: 'A human body with auburn hair.' }]);

    const objectValue = applySemantic({
        field: 'appearanceForms', operation: 'establish',
        value: { name: 'Human', appearance: 'A human body with auburn hair.' },
    });
    assert.deepEqual(objectValue.state.npcs[0].appearanceForms, [{ name: 'Human', appearance: 'A human body with auburn hair.' }]);
});

test('collection object validation rejects malformed recognized properties even when a sibling property is valid', () => {
    const cases = [
        ['keyRelationships', [{ name: [{ first: 'Mira' }, 'Tara'], relation: 'Sisters' }]],
        ['memories', [{ memory: 'Met Ari at the gate.', text: ['shadow text'] }]],
        ['mannerisms', [{ mannerism: 'Taps the desk.', label: false }]],
        ['behaviorProfile', [{ behavior: 'Keeps careful records.', summary: { nested: true } }]],
    ];
    for (const [field, value] of cases) {
        assert.ok(dossierFieldValueIssue(field, value), `${field} accepted malformed nested value`);
    }
    assert.deepEqual(normalizeKeyRelationshipEntries(cases[0][1]), []);
});

test('documented collection object aliases remain supported', () => {
    const cases = [
        ['behaviorProfile', [{ behavior: 'Keeps careful records.' }]],
        ['mannerisms', [{ mannerism: 'Taps the desk.' }]],
        ['memories', [{ memory: 'Met Ari at the gate.' }]],
        ['keyRelationships', [{ name: 'Mira', relation: 'Sister', summary: 'Trusted family.' }]],
    ];
    for (const [field, value] of cases) assert.equal(dossierFieldValueIssue(field, value), '', field);
    assert.deepEqual(normalizeKeyRelationshipEntries(cases.at(-1)[1]), ['Mira - Sister: Trusted family.']);
});

function manualHarness() {
    const key = 'v079-manual';
    const context = { chat: [{ is_user: true, mes: 'Ari waits.' }, { mes: 'Nia remains at the desk.' }] };
    const initial = createEmptyState(key);
    initial.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', relationship: { trust: 20, affection: 0, desire: 0, tension: 0 } })];
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initial, 1);
    const engine = createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: false, scanAfterEachResponse: false }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async () => '',
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: 'v079-manual',
    });
    return { engine, persisted: () => decodeV3Payload(saved, key).state };
}

test('manual relationship scores reject coercive non-number types without side effects', async () => {
    const h = manualHarness();
    await h.engine.loadChat('v079-manual');
    for (const invalid of [null, false, [], [7], {}, '', '   ', Infinity, 'Infinity']) {
        const before = structuredClone(h.persisted().npcs[0]);
        const result = await h.engine.updateNpc('nia', { relationship: { trust: invalid } });
        assert.equal(result.ok, false, `accepted ${JSON.stringify(invalid)}`);
        assert.match(result.reason, /^invalid-value-type:relationship:trust:/);
        const after = h.persisted().npcs[0];
        assert.equal(after.relationship.trust, 20);
        assert.deepEqual(after.manualRelationshipCorrections, before.manualRelationshipCorrections);
        assert.deepEqual(after.relationshipHistory, before.relationshipHistory);
    }
});


test('persisted manual relationship overrides reject coercive axis values but retain valid numeric strings', () => {
    const invalid = normalizeNpc({
        id: 'nia', name: 'Nia', relationship: { trust: 20 },
        manualOverrides: { relationship: { trust: null, affection: 2 } },
    });
    assert.deepEqual(invalid.manualOverrides, {});

    const valid = normalizeNpc({
        id: 'nia', name: 'Nia', relationship: { trust: 20 },
        manualOverrides: { relationship: { trust: '12.4', affection: 2 } },
    });
    assert.deepEqual(valid.manualOverrides.relationship, { trust: '12.4', affection: 2 });
});

test('manual relationship scores preserve finite numbers and nonempty finite numeric strings', async () => {
    const h = manualHarness();
    await h.engine.loadChat('v079-manual');
    assert.equal((await h.engine.updateNpc('nia', { relationship: { trust: 7 } })).ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 7);
    assert.equal((await h.engine.updateNpc('nia', { relationship: { trust: '12.4' } })).ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 12);
});

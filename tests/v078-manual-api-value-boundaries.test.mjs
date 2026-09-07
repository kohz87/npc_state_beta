import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { encodeV3Payload, decodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

function harness() {
    const key = 'v078-manual-api';
    const context = { chat: [{ is_user: true, mes: 'Lucien waits.' }, { mes: 'Nia remains at the desk.' }] };
    const initial = createEmptyState(key);
    initial.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', appearance: 'Valid appearance.', birthday: 'May 3', relationshipSummary: 'Professional.', lifeStateReason: 'No concern.' })];
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
        recoverySessionId: 'v078-manual-api',
    });
    return { key, engine, persisted: () => decodeV3Payload(saved, key).state };
}

test('public updateNpc rejects malformed manual scalar values without overwriting stored dossier data', async () => {
    const h = harness();
    await h.engine.loadChat(h.key);
    const cases = [
        ['appearance', { hair: 'auburn' }, 'Valid appearance.'],
        ['birthday', { month: 'May' }, 'May 3'],
        ['relationshipSummary', { text: 'Professional.' }, 'Professional.'],
        ['lifeStateReason', { text: 'No concern.' }, 'No concern.'],
    ];
    for (const [field, value, expected] of cases) {
        const result = await h.engine.updateNpc('nia', { [field]: value });
        assert.equal(result.ok, false);
        assert.match(result.reason, new RegExp(`^invalid-value-type:${field}:`));
        assert.equal(h.persisted().npcs[0][field], expected);
        const diagnostic = h.engine.operationDiagnostics(h.key).at(-1);
        assert.equal(diagnostic.status, 'rejected');
        assert.match(diagnostic.failure.reason, new RegExp(`^invalid-value-type:${field}:`));
    }
});

test('public updateNpc preserves supported numeric and collection compatibility through manual validation', async () => {
    const h = harness();
    await h.engine.loadChat(h.key);
    const result = await h.engine.updateNpc('nia', {
        age: 24,
        apparentAge: 24,
        behaviorProfile: [{ behavior: 'Keeps careful records.' }],
        relationship: { trust: '12' },
        retentionProtected: true,
    });
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(npc.age, '24');
    assert.equal(npc.apparentAge, '~24');
    assert.deepEqual(npc.behaviorProfile, ['Keeps careful records.']);
    assert.equal(npc.relationship.trust, 12);
    assert.equal(npc.retentionProtected, true);
});

test('public addNpc rejects non-string identity instead of creating object-text identity', async () => {
    const h = harness();
    await h.engine.loadChat(h.key);
    const before = h.persisted().npcs.length;
    const result = await h.engine.addNpc({ name: 'Ghost' });
    assert.deepEqual(result, { ok: false, reason: 'invalid-name-type' });
    assert.equal(h.persisted().npcs.length, before);
    assert.equal(h.persisted().npcs.some(npc => npc.name === '[object Object]'), false);
});

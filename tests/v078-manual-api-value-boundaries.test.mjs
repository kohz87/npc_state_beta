import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';
import { encodeV3Payload, decodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

function harness({ trustedBoundary = false } = {}) {
    const key = 'v078-manual-api';
    const context = { chat: [{ is_user: true, mes: 'Lucien waits.' }, { mes: 'Nia remains at the desk.' }] };
    let initial = createEmptyState(key);
    initial.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', appearance: 'Valid appearance.', birthday: 'May 3', relationshipSummary: 'Professional.', lifeStateReason: 'No concern.' })];
    if (trustedBoundary) {
        initial = ensurePreUpdateBaseline(initial, context.chat, 1);
        initial = recordCheckpoint(initial, context.chat, 1, 'pre-manual-api-review');
    }
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
    return { key, context, engine, persisted: () => decodeV3Payload(saved, key).state };
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


test('explicit manualOverrides rejects malformed owned values before a later rollback can reapply object text', async () => {
    const h = harness({ trustedBoundary: true });
    await h.engine.loadChat(h.key);
    const result = await h.engine.updateNpc('nia', { manualOverrides: { appearance: { hair: 'auburn' } } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid-value-type:manualOverrides.appearance:expected-string-value');
    assert.deepEqual(h.persisted().npcs[0].manualOverrides, {});
    h.context.chat.splice(0);
    const reconciled = await h.engine.reconcileBranch();
    assert.equal(reconciled.ok, true);
    assert.equal(h.persisted().npcs[0].appearance, 'Valid appearance.');
    assert.equal(JSON.stringify(h.persisted()).includes('[object Object]'), false);
});

test('empty explicit manualOverrides remains a supported clear operation', async () => {
    const h = harness();
    await h.engine.loadChat(h.key);
    assert.equal((await h.engine.updateNpc('nia', { mood: 'Pinned.' })).ok, true);
    assert.equal(h.persisted().npcs[0].manualOverrides.mood, 'Pinned.');
    const cleared = await h.engine.updateNpc('nia', { manualOverrides: {} });
    assert.equal(cleared.ok, true);
    assert.deepEqual(h.persisted().npcs[0].manualOverrides, {});
});


test('portrait object updates remain supported outside dossier text validation', async () => {
    const h = harness();
    await h.engine.loadChat(h.key);
    const portrait = { dataUrl: 'data:image/png;base64,TEST', mimeType: 'image/png' };
    const result = await h.engine.updateNpc('nia', { portrait });
    assert.equal(result.ok, true);
    assert.equal(h.persisted().npcs[0].portrait.dataUrl, portrait.dataUrl);
});


test('legacy malformed manualOverrides are dropped during normalization and cannot poison rollback', () => {
    const chat = [{ is_user: true, mes: 'Lucien waits.' }, { mes: 'Nia works at the desk.' }];
    let state = createEmptyState('v078-legacy-invalid-override');
    state.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', appearance: 'Valid appearance.' })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state.npcs[0].appearance = 'Later story appearance.';
    state.lastScannedMessageId = 1;
    state.turn = 1;
    state = recordCheckpoint(state, chat, 1, 'story');
    state.npcs[0].manualOverrides = { appearance: { hair: 'auburn' } };
    state.npcs[0].manualOverrideMeta = { appearance: { at: Date.now() + 1000, sourceMessageId: 1 } };

    const normalized = normalizeState(state, state.chatKey);
    assert.deepEqual(normalized.npcs[0].manualOverrides, {});
    const rolled = reconcileToCurrentBranch(normalized, []);
    assert.equal(rolled.state.npcs[0].appearance, 'Valid appearance.');
    assert.equal(JSON.stringify(rolled.state).includes('[object Object]'), false);
});

test('legacy valid manualOverrides remain user-owned across rollback normalization', () => {
    const chat = [{ is_user: true, mes: 'Lucien waits.' }, { mes: 'Nia works at the desk.' }];
    let state = createEmptyState('v078-legacy-valid-override');
    state.npcs = [normalizeNpc({ id: 'nia', name: 'Nia', appearance: 'Story appearance.' })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'pre-valid-legacy-override');
    state.npcs[0].manualOverrides = { appearance: 'Player-pinned appearance.' };
    state.npcs[0].manualOverrideMeta = { appearance: { at: Date.now() + 1000, sourceMessageId: 1 } };
    const rolled = reconcileToCurrentBranch(normalizeState(state, state.chatKey), []);
    assert.equal(rolled.state.npcs[0].appearance, 'Player-pinned appearance.');
    assert.equal(rolled.state.npcs[0].manualOverrides.appearance, 'Player-pinned appearance.');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { scanOutputExamples } from '../src/scan-contract.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const NIA_STORY = 'Nia, harbor clerk in blue, tells Ari “Registry first” and taps the form. Ivo has green eyes.';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function install(h, story = NIA_STORY) {
    h.context.name1 = 'Ari';
    h.context.chat = [{ is_user: true, name: 'Ari', mes: 'I approach the harbor registry.' }, { is_user: false, name: 'Narrator', swipe_id: 0, mes: story }];
}
function provider(h, payload = scanOutputExamples().populated, hook = null) {
    h.context.generateRaw = async args => { h.metrics.generations += 1; await hook?.(args); return JSON.stringify(payload); };
}

test('real host post-response path scans visible narrative once and persists supported dossiers', () => {
    const state = createEmptyState('unused');
    state.npcs = [normalizeNpc({ id: 'npc-ivo', name: 'Ivo', appearance: 'Brown eyes.' })];
    return withHost(async h => {
        install(h); provider(h);
        const first = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(first.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);
        assert.equal(/<npc_state_v1/i.test(h.context.chat[1].mes), false);
        const saved = h.persisted();
        assert.equal(saved.npcs.find(n => n.name === 'Nia').appearance, 'Blue coat.');
        assert.equal(saved.npcs.find(n => n.id === 'npc-ivo').appearance, 'Green eyes.');
        assert.equal(h.api.scanStatus().status, 'complete');
        const second = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(second.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);
    }, { state });
});

for (const change of ['past', 'swipe', 'deletion', 'chat']) test(`post-response source cannot become current during hydration after ${change}`, () => withHost(async h => {
    install(h); provider(h);
    const entered = deferred(), release = deferred();
    h.beforeRead = async () => { entered.resolve(); await release.promise; };
    const pending = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    if (change === 'past') h.context.chat[0].mes = 'Changed request';
    if (change === 'swipe') h.context.chat[1].swipe_id = 1;
    if (change === 'deletion') h.context.chat.shift();
    if (change === 'chat') { h.context.chatId = 'other'; }
    release.resolve();
    const result = await pending;
    assert.equal(result.ok, false); if (change !== 'deletion') assert.equal(result.discarded, true); else assert.equal(result.reason, 'not-assistant-message'); assert.equal(h.metrics.posts, 0); assert.equal(h.metrics.generations, 0);
}));

test('persistence failure remains failed rather than complete and closes the operation ledger', () => withHost(async h => {
    install(h); provider(h); const before = h.persisted();
    h.beforeWrite = () => ({ ok: false, status: 403, text: async () => 'fixture persistence denied' });
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false); assert.equal(h.api.scanStatus().status, 'failed');
    assert.equal(h.api.operationDiagnostics().some(row => row.status === 'running'), false); assert.deepEqual(h.persisted(), before);
}));

test('history changes during save cannot advertise the dedicated scan as current', () => withHost(async h => {
    install(h); provider(h); let first = true;
    h.beforeWrite = () => { if (first) { first = false; h.context.chat[0].mes = 'Changed during save.'; } };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false); assert.equal(result.discarded, true); assert.equal(h.api.scanStatus().status, 'blocked');
    assert.notEqual(h.persisted().branchSafety.status, 'safe');
}));

test('revision during provider generation cannot publish stale state', () => withHost(async h => {
    install(h); const entered = deferred(), release = deferred();
    provider(h, scanOutputExamples().populated, async () => { entered.resolve(); await release.promise; });
    const pending = h.entry.processCompletedAssistantResponse(1); await entered.promise;
    h.context.chat[1].mes = 'A replacement response with no Nia.'; release.resolve();
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.discarded, true); assert.equal(h.metrics.posts, 0); assert.equal(h.api.scanStatus().status, 'blocked');
}));

test('lengthy narrative with Inventory still uses one post-response request and preserves user-visible content', () => withHost(async h => {
    const story = `${'Cold wind rattles the shutters. '.repeat(180)} ${NIA_STORY}\n<Inventory>Coin Pouch | 1 | 100 Gold</Inventory>`;
    install(h, story); provider(h);
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);
    assert.match(h.context.chat[1].mes, /<Inventory>Coin Pouch/); assert.equal(/<npc_state_v1/i.test(h.context.chat[1].mes), false);
}));

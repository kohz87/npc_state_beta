import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { scanOutputExamples } from '../src/scan-contract.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const NIA_STORY = 'Nia, harbor clerk in blue, tells Ari “Registry first,” slides the form back when he hesitates, says “Next line,” and taps the signature box. Ivo has green eyes.';
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
    assert.equal(result.ok, false); assert.equal(result.discarded, true);
    assert.equal(h.metrics.posts, 0); assert.equal(h.api.scanStatus().status, 'blocked');
}));

test('persistence failure remains failed rather than complete and closes the operation ledger', () => withHost(async h => {
    install(h); provider(h); h.failNextWrite = true;
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false); assert.equal(h.api.scanStatus().status, 'failed');
    const row = h.api.operationDiagnostics().find(op => op.type === 'automatic-scan');
    assert.ok(row); assert.equal(row.status, 'failed'); assert.equal(row.stage, 'persist');
}));

test('history changes during save cannot advertise the dedicated scan as current', () => withHost(async h => {
    install(h); provider(h);
    h.beforeWrite = async () => { h.context.chat[1].mes += ' revised'; };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false); assert.equal(result.discarded, true);
    assert.equal(h.api.scanStatus().status, 'blocked'); assert.equal(h.metrics.posts, 1);
}));

test('revision during provider generation cannot publish stale state', () => withHost(async h => {
    install(h);
    const entered = deferred(), release = deferred();
    provider(h, scanOutputExamples().populated, async () => { entered.resolve(); await release.promise; });
    const pending = h.entry.processCompletedAssistantResponse(1);
    await entered.promise; h.context.chat[1].mes += ' revised'; release.resolve();
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.discarded, true); assert.equal(h.metrics.posts, 0);
}));

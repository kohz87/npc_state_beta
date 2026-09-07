import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withHost } from './helpers/host-harness.mjs';
import { emptyScanPayload, scanOutputExamples } from '../src/scan-contract.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const empty = () => JSON.stringify(emptyScanPayload());
const wrap = raw => `<npc_state_v1>${raw}</npc_state_v1>`;
const visible = 'Nia wears a blue coat. Nia greets Ari. Ivo has green eyes.';
const chatFor = (raw = empty(), narrative = visible) => [{ is_user: true, name: 'Ari', mes: 'Hello.' }, { is_user: false, swipe_id: 0, swipe_info: [{ extra: {} }, { extra: {} }], mes: narrative + '\n' + wrap(raw) + '\n<Inventory>Coin | 1 | Belt</Inventory>' }];
const drift = fs.readFileSync(new URL('./fixtures/v077-schema-drift.json', import.meta.url), 'utf8');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

for (const [name, raw, code] of [
    ['exact real drift', drift, 'invalid-structure'], ['syntax', '{broken}', 'json-syntax'], ['truncated JSON', '{"npcs":[]', 'truncated-json'],
    ['missing array', JSON.stringify({ ...emptyScanPayload(), familyFacts: undefined }), 'missing-required-members'],
]) test(`host rejects ${name} with specific metadata/notice and zero sidecar or model writes`, () => withHost(async h => {
    const before = h.persisted();
    h.context.chat = chatFor(raw);
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false);
    assert.ok(result.errorCodes.includes(code));
    assert.deepEqual(h.persisted(), before);
    assert.equal(h.metrics.posts, 0);
    assert.equal(h.metrics.generations, 0);
    const diagnosis = h.api.captureDiagnostics();
    assert.equal(diagnosis.parseStatus, 'rejected');
    assert.equal(diagnosis.application.persistenceStatus, 'not-run');
    assert.ok(diagnosis.parseErrors.some(error => error.includes(code)));
    assert.ok(h.metrics.notices.some(notice => notice.text.includes(code)));
    assert.match(h.context.chat[1].mes, /<Inventory>Coin/);
}));

test('missing/duplicate/truncated control leaves the sidecar untouched without implicit recovery generation', () => withHost(async h => {
    for (const text of [visible, visible + '\n' + wrap(empty()) + wrap(empty()), visible + '\n<npc_state_v1', visible + '\n</npc_state_v1>']) {
        h.context.chat = chatFor(); h.context.chat[1].mes = text;
        const result = await h.entry.processEmbeddedScan(1);
        assert.equal(result.ok, false);
        assert.ok(result.errorCodes.length);
    }
    assert.equal(h.metrics.posts, 0);
    assert.equal(h.metrics.generations, 0);
}));

test('real narrative plus embedded payload populates supported dossiers and persists once with no extra request', () => {
    const state = createEmptyState('unused');
    state.npcs = [normalizeNpc({ id: 'npc-ivo', name: 'Ivo', appearance: 'Brown eyes.', manualProfileFields: ['speech'], speech: 'Measured.' })];
    return withHost(async h => {
        const payload = scanOutputExamples().populated;
        const nia = payload.npcs[0];
        Object.assign(nia, {
            role: 'Station clerk', personality: 'Careful with records.', speech: 'Speaks clearly.', behaviorProfile: ['Checks each ledger entry.'],
            mannerisms: ['Taps the ledger while greeting Ari.'], mood: 'Focused', location: 'Station counter', goal: 'Register Ari', status: 'Completing registration',
            memories: ['Registered Ari at the station.'],
        });
        const story = visible + ' Nia is the station clerk, careful with records, speaking clearly, checking each entry, tapping the ledger while greeting Ari. Nia is focused at the station counter. Nia registers Ari.';
        h.context.chat = chatFor(JSON.stringify(payload), story);
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, true);
        assert.equal(h.metrics.generations, 0);
        assert.equal(h.metrics.posts, 1);
        const saved = h.persisted();
        const n = saved.npcs.find(npc => npc.name === 'Nia');
        for (const field of ['appearance', 'personality', 'speech', 'behaviorProfile', 'mannerisms', 'mood', 'location', 'goal', 'status', 'memories']) assert.deepEqual(n[field], nia[field], field);
        assert.equal(n.relationshipSummary, nia.relationshipSummary);
        assert.equal(n.relationshipHistory.length, 0);
        assert.equal(n.age, ''); assert.equal(n.background, '');
        assert.deepEqual(n.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
        assert.equal(saved.npcs.find(npc => npc.id === 'npc-ivo').appearance, 'Green eyes.');
        assert.equal(saved.npcs.find(npc => npc.id === 'npc-ivo').speech, 'Measured.');
        const diag = h.api.captureDiagnostics();
        assert.equal(diag.parseStatus, 'parsed');
        assert.equal(diag.application.applicationStatus, 'applied');
        assert.equal(diag.application.persistenceStatus, 'committed');
        assert.ok(diag.application.proposals.accepted >= 12);
        assert.equal((await h.entry.processCompletedAssistantResponse(1)).skipped, true);
        assert.equal(h.metrics.posts, 1);
    }, { state });
});

test('unknown model transport id is not stored and accepted binding preserves new fields', () => withHost(async h => {
    const payload = scanOutputExamples().populated;
    payload.npcs = [payload.npcs[0]]; payload.npcs[0].id = 'foreign-model-id';
    h.context.chat = chatFor(JSON.stringify(payload));
    assert.equal((await h.entry.processCompletedAssistantResponse(1)).ok, true);
    assert.equal(h.persisted().npcs.length, 1);
    assert.notEqual(h.persisted().npcs[0].id, 'foreign-model-id');
    assert.equal(h.persisted().npcs[0].appearance, 'Blue coat.');
}));

test('completion dedupe never hides a new malformed or duplicate payload after a successful capture', () => withHost(async h => {
    h.context.chat = chatFor();
    assert.equal((await h.entry.processCompletedAssistantResponse(1)).ok, true);
    const committed = h.api.captureDiagnostics().application.operationId;
    for (const raw of [wrap('{broken}'), wrap(empty()) + wrap(empty())]) {
        h.context.chat[1].mes = visible + '\n' + raw;
        const result = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(result.ok, false);
        const diag = h.api.captureDiagnostics();
        assert.equal(diag.application.status, 'rejected');
        assert.notEqual(diag.application.operationId, committed);
        assert.equal(diag.application.revision, null);
    }
    assert.equal(h.metrics.posts, 1);
}));

test('completion and capture identity include preceding history even with unchanged assistant text', () => withHost(async h => {
    h.context.chat = chatFor();
    await h.entry.processCompletedAssistantResponse(1);
    h.context.chat[0].mes = 'An entirely different request.';
    assert.equal(h.api.captureDiagnostics().application.status, 'stale');
    h.context.chat[1].mes = visible + '\n' + wrap('{broken}');
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false);
    assert.notEqual(result.reason, 'completion-already-recorded');
    assert.equal(h.metrics.posts, 1);
}));

for (const change of ['past', 'swipe', 'deletion', 'chat']) test(`first-pass source cannot become current during hydration after ${change}`, () => withHost(async h => {
    h.context.chat = chatFor();
    const entered = deferred(), release = deferred();
    h.beforeRead = async () => { entered.resolve(); await release.promise; };
    const pending = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    if (change === 'past') h.context.chat[0].mes = 'Changed request';
    if (change === 'swipe') h.context.chat[1].swipe_id = 1;
    if (change === 'deletion') h.context.chat.shift();
    if (change === 'chat') h.context = { ...h.context, chatId: 'other', chat: chatFor() };
    release.resolve();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(h.metrics.posts, 0);
    assert.equal(h.metrics.generations, 0);
}));

test('persistence failure remains failed rather than committed and closes the operation ledger', () => withHost(async h => {
    h.context.chat = chatFor();
    const before = h.persisted();
    h.beforeWrite = () => ({ ok: false, status: 403, text: async () => 'fixture persistence denied' });
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false);
    const diag = h.api.captureDiagnostics();
    assert.equal(diag.parseStatus, 'parsed');
    assert.equal(diag.application.status, 'failed');
    assert.notEqual(diag.application.persistenceStatus, 'committed');
    assert.equal(h.api.operationDiagnostics().some(row => row.status === 'running'), false);
    assert.deepEqual(h.persisted(), before);
}));

test('history changes during save cannot advertise the new capture as committed', () => withHost(async h => {
    h.context.chat = chatFor();
    let first = true;
    h.beforeWrite = () => { if (first) { first = false; h.context.chat[0].mes = 'Changed during save.'; } };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(h.api.captureDiagnostics().application.status, 'stale');
    assert.notEqual(h.persisted().branchSafety.status, 'safe');
}));

test('delayed transport cleanup cannot strip another chat or a newer payload at the same address', () => withHost(async h => {
    h.context.chat = chatFor();
    await h.entry.processCompletedAssistantResponse(1);
    const replacement = visible + '\n' + wrap('{new capture}');
    h.context.chat[1].mes = replacement;
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(h.context.chat[1].mes, replacement);
    h.context = { ...h.context, chatId: 'other', chat: chatFor('{other chat}') };
    const other = h.context.chat[1].mes;
    await new Promise(resolve => setTimeout(resolve, 240));
    assert.equal(h.context.chat[1].mes, other);
}));

test('a newer capture attempt invalidates an earlier in-flight save even when the narrative is identical', () => withHost(async h => {
    h.context.chat = chatFor();
    const entered = deferred(), release = deferred(); let first = true;
    h.beforeWrite = async () => { if (first) { first = false; entered.resolve(); await release.promise; } };
    const older = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat[1].mes = visible + '\n' + wrap('{bad}');
    const newer = await h.entry.processCompletedAssistantResponse(1);
    release.resolve();
    const result = await older;
    assert.equal(newer.ok, false);
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.notEqual(h.persisted().branchSafety.status, 'safe');
    assert.equal(h.api.captureDiagnostics().application.status, 'rejected');
    assert.equal(h.api.operationDiagnostics()[0].persistence.status, 'saved-unowned-blocked');
}));

test('duplicate host completion events preserve the original malformed-tag failure rather than replacing it with missing-block', () => withHost(async h => {
    for (const tag of ['<npc_state_v1', '</npc_state_v1>']) {
        h.context.chat = chatFor(); h.context.chat[1].mes = visible + '\n' + tag;
        const first = await h.entry.processCompletedAssistantResponse(1);
        const second = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(second.skipped, true);
        assert.deepEqual(h.api.captureDiagnostics().errorCodes, first.errorCodes);
    }
    assert.equal(h.metrics.posts, 0);
}));

test('optional completeness rejects changed preceding history between first-pass commit and its own request', () => withHost(async h => {
    h.context.chat = chatFor();
    let changed = false;
    h.context.setExtensionPrompt = () => {
        if (h.metrics.posts > 0 && !changed) { changed = true; h.context.chat[0].mes = 'Changed between first pass and completeness.'; }
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(changed, true);
    assert.equal(result.completeness, 'discarded');
    assert.equal(result.completenessResult.reason, 'source-changed-before-completeness');
    assert.equal(h.metrics.generations, 0);
}, { settings: { scanAfterEachResponse: true } }));

test('a host with a not-yet-populated active swipe slot accepts its owned message metadata, never another swipe', () => withHost(async h => {
    h.context.chat = chatFor(); h.context.chat[1].swipe_info = [];
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.api.captureDiagnostics().application.persistenceStatus, 'committed');
    assert.equal(h.api.captureDiagnostics().metadataSource, 'message');
    h.context.chat[1].swipe_id = 1;
    assert.equal(h.api.captureDiagnostics().available, false);
}));

test('lengthy narration with Inventory still captures supported facts without a supplemental request', () => withHost(async h => {
    const payload = scanOutputExamples().populated; payload.npcs = [payload.npcs[0]];
    const narration = 'Snow settles on the station roof. '.repeat(360) + visible;
    h.context.chat = chatFor(JSON.stringify(payload), narration);
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 0);
    assert.equal(h.persisted().npcs[0].appearance, 'Blue coat.');
    assert.ok(h.context.chat[1].mes.startsWith(narration));
    assert.match(h.context.chat[1].mes, /<Inventory>Coin/);
}));

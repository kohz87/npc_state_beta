import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createEmptyState, normalizeNpc, normalizeState, normalizeScannerResponseTokens, relationshipMilestoneUnlocked } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { relationshipEvidenceGrounding } from '../v03/relationship-evidence.js';
import { rebaseToCurrentChat } from '../v03/branches.js';
import { createNpcStateBundle, applyNpcStateBundleImport } from '../v03/bundle.js';
import { createNpcStateEngine } from '../v03/engine.js';
import { writeV3Sidecar } from '../v03/storage.js';
import { dossierHtml } from '../v03/dossier-view.js';

const id = 'npc-mira';
function stateWith(extra = {}, key = 'relationship-047') {
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id, name: 'Mira', present: true, relationshipMilestones: [], ...extra })];
    return state;
}
function payload(evidence, delta = { trust: 1 }, impact = 'meaningful') {
    return { exchangeActiveNpcIds: [id], inChatNpcIds: [id], npcs: [{ id, name: 'Mira', relationshipChange: { evidence, reason: 'A new event changes the relationship.', delta, impact } }] };
}
function apply(state, evidence, delta = { trust: 1 }, impact = 'meaningful', messageId = 2, context = evidence) {
    return applyScanResult(state, payload(evidence, delta, impact), { sourceMessageId: messageId, turn: messageId, relationshipContext: context, applyReturnedNpcPatches: true }).state;
}
const npc = state => state.npcs[0];
const last = state => npc(state).relationshipDiagnostics.at(-1);
const unlocked = (state, axis, threshold, sign = 1) => relationshipMilestoneUnlocked(npc(state).relationshipMilestones, axis, sign, threshold);

function server() {
    const files = new Map();
    const response = (status, data) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof data === 'string' ? data : JSON.stringify(data), json: async () => data });
    return async (url, options = {}) => {
        if (url === '/api/files/upload') {
            const body = JSON.parse(options.body);
            const path = '/user/files/' + body.name;
            files.set(path, Buffer.from(body.data, 'base64').toString());
            return response(200, { path });
        }
        if (url === '/api/files/delete') { files.delete(JSON.parse(options.body).path); return response(200, {}); }
        return files.has(url) ? response(200, files.get(url)) : response(404, '');
    };
}
let serial = 0;
async function harness(extra = {}, generate = async () => '{}', settings = {}) {
    const key = 'chat:047-test-' + (++serial);
    const state = stateWith(extra, key);
    const chat = [{ is_user: true, mes: 'I return the family heirloom.' }, { is_user: false, mes: 'Mira sees Lucien return her family heirloom. He also repairs her damaged bicycle.' }];
    const fetchFn = server();
    let pointer = (await writeV3Sidecar({ chatKey: key, state, pointer: null, fetchFn, headers: {} })).pointer;
    const config = { enabled: true, autoScan: true, staleManagementEnabled: false, ...settings };
    const adapters = { getContext: () => ({ chat }), getChatKey: () => key, getSettings: () => config,
        getPointer: () => pointer, setPointer: (_, p) => { pointer = p; }, getStablePointer: () => null,
        persistSettings() {}, getHeaders: () => ({}), fetchFn, generate };
    const engine = createNpcStateEngine(adapters);
    await engine.loadChat();
    return { engine, chat, config, reload: () => createNpcStateEngine(adapters) };
}

test('token setting clamps safely and preserves the 7000 default', () => {
    for (const value of [undefined, null, '', NaN, Infinity, -1, 0, 'bad']) assert.equal(normalizeScannerResponseTokens(value), 7000);
    assert.equal(normalizeScannerResponseTokens(500), 512);
    assert.equal(normalizeScannerResponseTokens('15000'), 15000);
    assert.equal(normalizeScannerResponseTokens(20000), 15000);
});

test('scan and malformed JSON retry use the same chosen budget', async () => {
    const calls = [];
    let h;
    h = await harness({}, async request => { calls.push(request); h.config.scannerResponseTokens = 7000; return calls.length === 1 ? 'malformed' : JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [] }); }, { scannerResponseTokens: 15000 });
    const result = await h.engine.scan(1, { manual: true });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map(call => call.responseLength), [15000, 15000]);
});

test('unrelated editor save preserves all locked gates and fractional state', async () => {
    const h = await harness({ relationship: { trust: 25, affection: 50, tension: -75 }, relationshipProgress: { affection: 0.4 } });
    const before = await h.engine.loadChat();
    await h.engine.updateNpc(id, { mood: 'Calm', relationship: npc(before).relationship });
    const after = await h.engine.loadChat();
    assert.deepEqual(npc(after).relationshipMilestones, []);
    assert.deepEqual(npc(after).relationshipProgress, npc(before).relationshipProgress);
    assert.equal(npc(after).relationshipHistory.length, 0);
});

test('partial manual score edit unlocks only deliberately changed axes', async () => {
    const h = await harness({ relationship: { trust: 24, affection: 50, tension: -75 }, relationshipProgress: { trust: 0.3, affection: 0.4 } });
    await h.engine.updateNpc(id, { relationship: { trust: 25 } });
    const after = await h.engine.loadChat();
    assert.equal(unlocked(after, 'trust', 25), true);
    assert.equal(unlocked(after, 'affection', 50), false);
    assert.equal(unlocked(after, 'tension', 75, -1), false);
    assert.equal(npc(after).relationship.affection, 50);
    assert.equal(npc(after).relationshipProgress.trust, 0);
    assert.equal(npc(after).relationshipProgress.affection, 0.4);
});

test('opposite event survives similarity dedupe, including old rows with no direction', () => {
    for (const legacy of [false, true]) {
        let state = apply(stateWith(), 'Lucien keeps his promise to return her family heirloom.');
        if (legacy) delete npc(state).relationshipEvidenceHistory[0].delta;
        state = apply(state, 'Lucien breaks his promise to return her family heirloom.', { trust: -1 }, 'meaningful', 3);
        assert.equal(npc(state).relationship.trust, 0);
        assert.equal(npc(state).relationshipEvidenceHistory.length, 2);
    }
});

test('repeated event remains deduplicated and cannot rewrite summary', () => {
    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');
    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: 1 }, 'meaningful', 3);
    assert.equal(npc(state).relationship.trust, 1);
    assert.deepEqual(last(state).reasons, ['duplicate']);
    assert.equal(npc(state).relationshipEvidenceHistory.length, 1);
});

test('missing old timeline references do not become turn zero', () => {
    const state = stateWith({ relationshipEvidenceHistory: [{ evidence: 'Lucien returns the family heirloom to Mira.', reason: 'Trust', sourceMessageId: null, turn: null }] });
    const after = apply(state, 'Lucien returns the family heirloom to Mira.');
    assert.equal(npc(after).relationship.trust, 1);
});

test('grounding rejects negation, changed outcome, and scattered unrelated words', () => {
    assert.equal(relationshipEvidenceGrounding('Mira trusts Lucien completely.', 'Mira does not trust Lucien completely.'), 'contradictory');
    assert.equal(relationshipEvidenceGrounding('Lucien keeps his promise to return the heirloom.', 'Lucien breaks his promise to return the heirloom.'), 'contradictory');
    assert.equal(relationshipEvidenceGrounding('Mira trusts Lucien completely.', 'Mira cooks. Lucien walks. A stranger trusts his captain completely.'), 'ungrounded');
    assert.equal(relationshipEvidenceGrounding('Mira does not trust Lucien.', 'Mira does not trust Lucien.'), '');
    assert.equal(relationshipEvidenceGrounding('Mira trusts Lucien.', 'Mira was angry, but Mira trusts Lucien.'), '');
});

test('contradictory proposal changes neither scores nor fractions or milestones', () => {
    const before = stateWith({ relationship: { trust: 25 } });
    const after = apply(before, 'Mira trusts Lucien completely.', { trust: 2 }, 'meaningful', 2, 'Mira does not trust Lucien completely.');
    assert.deepEqual(npc(after).relationship, npc(before).relationship);
    assert.deepEqual(npc(after).relationshipMilestones, []);
    assert.equal(npc(after).relationshipEvidenceHistory.length, 0);
    assert(last(after).reasons.includes('trust:contradictory'));
});

test('diagnostics explain locked gates, per-axis unlocks, and fractional absorption', () => {
    let state = stateWith({ relationship: { trust: 25, affection: 25 }, relationshipProgress: { affection: -0.4 } });
    state = apply(state, 'Mira appreciates Lucien helping with her studies.', { affection: 1 });
    assert.equal(npc(state).relationship.affection, 25);
    assert.equal(unlocked(state, 'affection', 25), true);
    assert.equal(unlocked(state, 'trust', 25), false);
    assert.equal(last(state).progressAfter.affection, 0.6);
    assert.equal(last(state).unlocks[0].axis, 'affection');
    state = apply(state, 'Mira watches Lucien safely guide the wagon.', { trust: 1 }, 'ordinary', 3);
    assert.equal(npc(state).relationship.trust, 25);
    assert(last(state).reasons.includes('trust:gate-tier'));
    const html = dossierHtml(npc(state));
    assert(html.includes('+25 unlocked'));
    assert(html.includes('25 → 25'));
    assert(html.includes('fractional progress'));
});

test('axis-limit rejections are visible without changing scores', () => {
    const after = apply(stateWith(), 'Mira thanks Lucien for rescuing her.', { trust: 1, affection: 1 }, 'ordinary');
    assert.equal(npc(after).relationship.trust, 0);
    assert(last(after).reasons.includes('trust:axis-limit'));
    assert(last(after).reasons.includes('affection:axis-limit'));
});

test('diagnostics are bounded, survive normalization, and escape markup', () => {
    let state = stateWith();
    for (let i = 0; i < 20; i++) state = apply(state, '<img src=x onerror=alert(1)>', { trust: 1 }, 'meaningful', i + 1, 'Mira walks home.');
    state = normalizeState(state);
    assert.equal(npc(state).relationshipDiagnostics.length, 12);
    assert(!dossierHtml(npc(state)).includes('<img src=x onerror'));
});

test('cross-chat import and rebase clear timeline-local evidence, preserve durable relationship state', () => {
    const state = apply(stateWith({ relationship: { trust: 25 } }), 'Mira trusts Lucien with her private correspondence.');
    const bundle = createNpcStateBundle(state);
    const imported = applyNpcStateBundleImport(createEmptyState('different-chat'), bundle);
    assert.equal(imported.ok, true);
    const rebased = rebaseToCurrentChat(state, [{ is_user: false, mes: 'Mira arrives.' }]);
    for (const next of [imported.state, rebased]) {
        assert.deepEqual(npc(next).relationshipEvidenceHistory, []);
        assert.deepEqual(npc(next).relationshipDiagnostics, []);
        assert.deepEqual(npc(next).relationship, npc(state).relationship);
        assert.equal(npc(next).relationshipHistory[0].sourceMessageId, null);
    }
    assert.deepEqual(npc(imported.state).relationshipMilestones, npc(state).relationshipMilestones);
    assert.deepEqual(
        npc(rebased).relationshipMilestones,
        npc(state).relationshipMilestones.map(entry => ({ ...entry, sourceMessageId: null, turn: null })),
    );
});

test('embedded replay is idempotent across paraphrases and reloads', async () => {
    const h = await harness();
    const first = await h.engine.applyEmbeddedScan(1, payload('Mira sees Lucien return her family heirloom.'));
    assert.equal(first.ok, true);
    assert.equal(npc(first.state).relationship.trust, 1);
    const second = await h.engine.applyEmbeddedScan(1, payload('He also repairs her damaged bicycle.'));
    assert.equal(second.reason, 'already-scanned');
    assert.equal(npc(second.state).relationship.trust, 1);
    const reloaded = h.reload();
    const third = await reloaded.applyEmbeddedScan(1, payload('He also repairs her damaged bicycle.'));
    assert.equal(third.reason, 'already-scanned');
    h.chat[1].mes = 'Mira witnesses a different outcome.';
    assert.equal((await reloaded.applyEmbeddedScan(1, payload(h.chat[1].mes))).reason, 'branch-unreconciled');
});

test('token setting is wired to persistence, editor, and recovery category', () => {
    const read = path => fs.readFileSync(new URL('../v03/' + path, import.meta.url), 'utf8');
    assert(read('index.js').includes('scannerResponseTokens: 7000'));
    assert(read('index.js').includes('settings.scannerResponseTokens = normalizeScannerResponseTokens'));
    assert(read('ui.js').includes('max="15000"'));
    assert(read('settings-layout.js').includes("'#npc_state_v047_response_tokens'"));
    assert(!read('engine.js').includes('responseLength: 7000'));
});

test('changing only a delta sign cannot replay identical evidence', () => {
    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');
    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: -1 }, 'meaningful', 3);
    assert.equal(npc(state).relationship.trust, 1);
    assert.deepEqual(last(state).reasons, ['duplicate']);
});

test('real branch reconciliation permits a new swipe and restores scored siblings exactly once', async () => {
    const h = await harness();
    await h.engine.applyEmbeddedScan(1, payload('Mira sees Lucien return her family heirloom.'));
    h.chat.push({ is_user: true, mes: 'I help Mira.' }, { is_user: false, mes: 'Mira receives a map during the blizzard.' });
    const b = await h.engine.applyEmbeddedScan(3, payload(h.chat[3].mes));
    assert.equal(npc(b.state).relationship.trust, 2);
    h.chat[3].mes = 'Mira sees Lucien repair the broken wagon.';
    await h.engine.reconcileBranch({ rescan: false });
    assert.equal(npc(h.engine.getState()).relationship.trust, 1);
    const c = await h.engine.applyEmbeddedScan(3, payload(h.chat[3].mes));
    assert.equal(npc(c.state).relationship.trust, 2);
    h.chat[3].mes = 'Mira receives a map during the blizzard.';
    await h.engine.reconcileBranch({ rescan: false });
    const replay = await h.engine.applyEmbeddedScan(3, payload(h.chat[3].mes));
    assert.equal(replay.reason, 'already-scanned');
    assert.equal(npc(replay.state).relationship.trust, 2);
});

test('release versions agree across manifest, schema, and settings header', () => {
    const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    const manifest = JSON.parse(read('manifest.json'));
    assert(/^0\.4\.(?:[7-9]|[1-9]\d+)$/.test(manifest.version), 'Release predates the 0.4.7 fixes');
    assert(read('v03/schema.js').includes("NPC_STATE_VERSION = '" + manifest.version + "'"));
    assert(read('v03/ui.js').includes('npc-state-version">' + manifest.version + '</span>'));
});

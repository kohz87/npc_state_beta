import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyScanPayload, scanOutputContract, scanOutputExamples, SCAN_ARRAY_MEMBERS } from '../src/scan-contract.js';
import { parseScanJson, normalizeScanPayload } from '../src/scan-payload.js';
import { consumeNpcStateControl } from '../src/foreground.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { compactForegroundNpc } from '../src/foreground-context.js';
import { buildForegroundInjection } from '../src/injection.js';
import { storeCapturedPayload, inspectCapturedPayload, createOperationDiagnostics, captureSourceMatches } from '../src/operation-diagnostics.js';

const strict = raw => parseScanJson(raw, { requireLifeStateUpdates: true });
const wrap = raw => `<npc_state_v1>${raw}</npc_state_v1>`;
const drift = JSON.parse(fs.readFileSync(new URL('./fixtures/v077-schema-drift.json', import.meta.url)));
const newPatch = () => scanOutputExamples().populated.npcs[0];
const withNpc = patch => ({ ...emptyScanPayload(), npcs: [patch] });

function literalExamples(prompt) {
    return prompt.split('\n').filter(line => line.startsWith('{') && line.includes('"exchangeActiveNpcIds"'));
}

test('every shared literal example and every emitted mode example passes the strict production parser', () => {
    const state = createEmptyState('chat:examples');
    state.npcs = [normalizeNpc({ id: 'npc-ivo', name: 'Ivo' })];
    state.branchSafety = { status: 'safe' };
    const chat = [{ is_user: true, name: 'Ari', mes: 'Hello.' }, { is_user: false, mes: 'Nia greets Ari. Ivo has green eyes.' }];
    const prompts = [scanOutputContract(), buildScanPrompt({ state, chat, assistantMessageId: 1 }),
        buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1 }),
        buildStructuredDossierImportPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1 }),
        buildForegroundInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1600 }).prompt];
    for (const prompt of prompts) {
        const examples = literalExamples(prompt);
        assert.equal(examples.length, 2);
        for (const example of examples) {
            const raw = JSON.parse(example);
            assert.deepEqual(Object.keys(raw).sort(), Object.keys(SCAN_ARRAY_MEMBERS).sort());
            const parsed = strict(example);
            assert.ok(Array.isArray(parsed.npcs));
            assert.deepEqual(consumeNpcStateControl(`Narrative\n${wrap(example)}\n<Inventory>Coin | 1 | Belt</Inventory>`, { requireLifeStateUpdates: true }).parsed, parsed);
        }
    }
});

test('minimal canonical envelope permits genuinely empty evaluation without invented NPCs', () => {
    assert.deepEqual(strict(JSON.stringify(emptyScanPayload())).npcs, []);
    for (const patch of [{ id: '', name: 'Nia', identityKind: 'named' }, { id: '', name: 'The station registrar', identityKind: 'role-label' }, { id: 'npc-ivo' }]) {
        assert.equal(strict(JSON.stringify(withNpc(patch))).npcs.length, 1);
    }
});

test('the exact captured schema drift and a name-only correction fail before any mutation', () => {
    for (const fixture of [drift, { ...drift, npcs: [{ ...drift.npcs[0], name: 'Vrena Holt' }] }]) {
        assert.throws(() => strict(JSON.stringify(fixture)), error => error.code === 'invalid-structure'
            && /canonicalName/.test(error.message) && /identityKind/.test(error.message) && /live/.test(error.message) && /relationshipToPlayer/.test(error.message));
        const state = createEmptyState('chat:reject');
        const before = structuredClone(state);
        assert.throws(() => applyScanResult(state, fixture), /unsupported/);
        assert.deepEqual(state, before);
    }
});

for (const member of Object.keys(SCAN_ARRAY_MEMBERS)) {
    test(`strict envelope distinguishes missing and null ${member}`, () => {
        const missing = emptyScanPayload(); delete missing[member];
        assert.throws(() => strict(JSON.stringify(missing)), error => error.code === 'missing-required-members' && error.message.includes(member));
        assert.throws(() => strict(JSON.stringify({ ...emptyScanPayload(), [member]: null })), error => error.code === 'invalid-structure' && error.message.includes(member));
    });
}

test('invalid identity members, foreign axes and ambiguous aliases are not silently repaired', () => {
    for (const patch of [null, [], {}, { id: 3, name: 'Nia' }, { id: '', name: 5 }, { name: 'Nia', aliases: null }, { name: 'Nia', identityKind: 'admitted' },
        { name: 'Nia', live: { mood: 'happy' } }, { name: 'Nia', canonicalName: 'Someone else' },
        { name: 'Nia', relationshipChange: { delta: { respect: 1 } } }, { name: 'Nia', relationshipChange: { delta: { attraction: 1 } } },
        { name: 'Nia', relationshipChange: { delta: { trust: '1' } } }]) {
        assert.throws(() => strict(JSON.stringify(withNpc(patch))), error => error.code === 'invalid-structure');
    }
    assert.throws(() => strict(JSON.stringify({ ...emptyScanPayload(), inChatNpcIds: ['a'], finalPresentNpcIds: ['b'] })), /conflicting/);
    assert.throws(() => strict(JSON.stringify({ ...emptyScanPayload(), npcs: Array.from({ length: 101 }, () => ({ name: 'Nia' })) })), /entire payload rejected/);
});

test('documented legacy envelope/classification compatibility normalizes once without admitting by label', () => {
    const legacy = { ...emptyScanPayload(), finalPresentNpcIds: [], npcs: [{ id: '', name: 'Nia', identityKind: 'proper-name' }] };
    delete legacy.inChatNpcIds;
    const parsed = strict(JSON.stringify(legacy));
    assert.equal(parsed.npcs[0].identityKind, 'named');
    assert.deepEqual(normalizeScanPayload(parsed), parsed);
    const output = applyScanResult(createEmptyState('chat:legacy'), parsed, { currentAdmissionText: 'No individually relevant NPC appears.', admissionMode: 'named_preferred' });
    assert.equal(output.state.npcs.length, 0);
});

for (const [name, raw, code] of [
    ['trailing comma', '{"npcs":[],}', 'json-syntax'], ['broken quotation', '{"npcs":[{"name":"Nia "the clerk""}]}', 'json-syntax'],
    ['truncated outer object', '{"npcs":[]', 'truncated-json'], ['truncated string', '{"name":"Nia', 'truncated-json'],
    ['garbage after JSON', JSON.stringify(emptyScanPayload()) + ' STOP', 'json-syntax'], ['array root', '[]', 'wrong-root'],
    ['null root', 'null', 'wrong-root'], ['empty', '', 'empty-response'],
]) test(`production parser rejects ${name} with a concrete bounded reason`, () => {
    assert.throws(() => strict(raw), error => error.code === code && error.issues.length > 0 && error.issues.every(value => value.length <= 240));
});

test('complete legacy JSON fence remains supported, while prose brace extraction is gone', () => {
    const raw = JSON.stringify(emptyScanPayload());
    assert.deepEqual(strict('```json\n' + raw + '\n```'), strict(raw));
    assert.throws(() => strict('Here is the result:\n' + raw), /json-syntax/);
    assert.throws(() => strict('{"outer":' + raw), /truncated-json/);
});

test('duplicate, unfinished and orphan transport blocks reject the whole capture and preserve Inventory', () => {
    const good = wrap(JSON.stringify(emptyScanPayload()));
    for (const [raw, code] of [[good + good, 'duplicate-blocks'], [good + '<npc_state_v1>{', 'truncated-block'],
        ['<npc_state_v1', 'truncated-block'], ['<npc_state_v1>{}', 'truncated-block'], ['</npc_state_v1>', 'unmatched-closing-tag'],
        [good + '</npc_state_v1>', 'unmatched-closing-tag']]) {
        const consumed = consumeNpcStateControl('Narrative\n' + raw + '\n<Inventory>Knife | 1 | Belt</Inventory>', { requireLifeStateUpdates: true });
        assert.equal(consumed.found, true);
        assert.equal(consumed.parsed, null);
        assert.ok(consumed.errorCodes.includes(code));
        assert.ok(consumed.cleanedText.startsWith('Narrative'));
        assert.match(consumed.cleanedText, /<Inventory>Knife/);
    }
});

test('shared populated example applies both identities and descriptive zero-score summary without numeric history', () => {
    const state = createEmptyState('chat:apply');
    state.npcs = [normalizeNpc({ id: 'npc-ivo', name: 'Ivo', appearance: 'Brown eyes.' })];
    const example = scanOutputExamples().populated;
    const text = `${example.npcs[0].relationshipSummaryEvidence.excerpts[0]} Ivo has green eyes.`;
    const result = applyScanResult(state, strict(JSON.stringify(example)), {
        sourceMessageId: 1, turn: 1, playerName: 'Ari', currentAdmissionText: text, profileContext: text, relationshipContext: text, applyReturnedNpcPatches: true,
    });
    assert.equal(result.state.npcs.length, 2);
    const nia = result.state.npcs.find(npc => npc.name === 'Nia');
    assert.ok(nia.id && nia.id !== 'Nia');
    assert.equal(nia.appearance, 'Blue coat.');
    assert.equal(nia.relationshipSummary, 'Professional clerk-applicant interaction.');
    assert.deepEqual(nia.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(nia.relationshipHistory.length, 0);
    assert.equal(result.state.npcs.find(npc => npc.id === 'npc-ivo').appearance, 'Green eyes.');
});

test('a zero-score summary with no independent evidence is rejected without fabricating an event', () => {
    const patch = newPatch(); delete patch.relationshipSummaryEvidence;
    const text = 'Nia greets Ari.';
    const result = applyScanResult(createEmptyState('chat:summary'), { ...withNpc(patch), exchangeActiveNpcIds: ['Nia'], inChatNpcIds: ['Nia'] }, { playerName: 'Ari', currentAdmissionText: text, profileContext: text, relationshipContext: text, applyReturnedNpcPatches: true });
    assert.equal(result.state.npcs[0].relationshipSummary, '');
    assert.equal(result.state.npcs[0].relationshipHistory.length, 0);
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'rejected-proposal'));
});

test('minimum context does not accidentally retain all profile evidence at a zero-entry tier', () => {
    const npc = normalizeNpc({ id: 'n', name: 'N', profileEvolutionEvidence: [{ field: 'personality', mode: 'refine', concept: 'calmer', evidence: 'N grows calmer.', sourceMessageId: 1 }] });
    assert.equal(compactForegroundNpc(npc, 0).recentProfileEvidence.length, 1);
    assert.equal(compactForegroundNpc(npc, 3).recentProfileEvidence, undefined);
    assert.equal(compactForegroundNpc(npc, 4).recentProfileEvidence, undefined);
});

function captured() {
    const chat = [{ is_user: true, mes: 'Hello.' }, { is_user: false, mes: 'Nia greets Ari.', swipe_id: 0, swipe_info: [{ extra: {} }, { extra: {} }] }];
    const capture = storeCapturedPayload({ chat, chatKey: 'chat:a', messageId: 1, consumed: { parsed: emptyScanPayload(), raw: wrap(JSON.stringify(emptyScanPayload())), errors: [] } });
    const operation = { id: 'owned', type: 'first-pass', chatKey: 'chat:a', status: 'committed', source: { ...capture.source, captureId: capture.captureId }, application: { status: 'applied' }, persistence: { status: 'committed', revision: 2 } };
    return { chat, capture, operation, inspect: (options = {}) => inspectCapturedPayload({ chat, chatKey: 'chat:a', messageId: 1, operations: [operation], ...options }) };
}

test('capture ownership associates the exact attempt and retains separate application/persistence phases', () => {
    const h = captured();
    assert.equal(h.inspect().application.status, 'committed');
    h.operation.status = 'running'; h.operation.persistence = { status: 'saving' };
    const running = h.inspect();
    assert.equal(running.parseStatus, 'parsed');
    assert.equal(running.application.applicationStatus, 'applied');
    assert.equal(running.application.persistenceStatus, 'saving');
    h.operation.status = 'failed'; h.operation.persistence.status = 'failed';
    assert.equal(h.inspect().application.status, 'failed');
});

for (const [name, alter] of [
    ['edit', h => { h.chat[1].mes = 'Different text.'; }], ['replacement at same index', h => { h.chat[1] = { ...h.chat[1], mes: 'Replacement.' }; }],
    ['preceding history', h => { h.chat[0].mes = 'Changed past'; }], ['renumbering', h => { h.chat.shift(); }],
    ['unprocessed new transport', h => { h.chat[1].mes += '\n<npc_state_v1>{bad}</npc_state_v1>'; }],
]) test(`capture history ownership refuses older commits after ${name}`, () => {
    const h = captured(); alter(h);
    const result = h.inspect({ messageId: h.chat.length - 1 });
    assert.equal(result.application.status, 'stale');
    assert.equal(result.application.revision, null);
});

test('new malformed attempt cannot borrow an older successful operation at the same address', () => {
    const h = captured();
    const next = storeCapturedPayload({ chat: h.chat, chatKey: 'chat:a', messageId: 1, consumed: { parsed: null, raw: '{wrong}', errors: ['wrong schema'], errorCodes: ['invalid-structure'] } });
    assert.notEqual(h.capture.captureId, next.captureId);
    assert.equal(h.inspect().parseStatus, 'rejected');
    assert.equal(h.inspect().application.status, 'rejected');
    assert.equal(h.inspect().application.persistenceStatus, 'not-run');
    assert.equal(next.payload, null);
});

test('active swipe, chat switch, reload, legacy metadata, and evicted ledger never imply a current commit', () => {
    const h = captured();
    assert.equal(h.inspect({ chatKey: 'chat:b' }).application.status, 'stale');
    assert.equal(h.inspect({ chat: structuredClone(h.chat), operations: [] }).application.status, 'unavailable');
    h.chat[1].swipe_id = 1;
    assert.equal(h.inspect().available, false);
    h.chat[1].swipe_info[1] = undefined;
    assert.equal(h.inspect().available, false);
    h.chat[1].swipe_id = 0;
    delete h.chat[1].swipe_info[0].extra.npc_state_beta_v1.source;
    assert.equal(h.inspect().application.status, 'unavailable');
    const ledger = createOperationDiagnostics({ limit: 8 });
    for (let i = 0; i < 9; i += 1) { const id = ledger.start({ chatKey: 'chat:a', type: 'first-pass' }); ledger.finish(id, { status: 'committed' }); }
    assert.equal(ledger.records('chat:a').length, 8);
    assert.equal(h.inspect({ operations: ledger.records('chat:a') }).application.status, 'unavailable');
});

test('capture diagnostics retain only bounded failure details and source hashes', () => {
    const h = captured();
    const meta = storeCapturedPayload({ chat: h.chat, chatKey: 'chat:a', messageId: 1, consumed: { parsed: null, raw: 'secret narrative'.repeat(2000), errors: Array(100).fill('x'.repeat(2000)), errorCodes: ['json-syntax'] } });
    assert.equal(meta.payload, null);
    assert.equal(meta.errors.length, 12);
    assert.ok(meta.errors.every(text => text.length <= 300));
    assert.ok(JSON.stringify(meta).length < 5000);
    assert.equal(captureSourceMatches(meta.source, 'chat:a', h.chat), true);
});

test('existing identity classification spelling normalization survives the stricter boundary without accepting admitted', () => {
    for (const [value, expected] of [['Named', 'named'], ['role_label', 'role-label'], [' proper ', 'named'], ['ROLE', 'role-label'], ['', '']]) {
        const parsed = strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value })));
        assert.equal(parsed.npcs[0].identityKind, expected);
    }
    for (const value of ['admitted', ' accepted ', 'constructor', '__proto__', null, 1, {}]) {
        assert.throws(() => strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value }))), /identityKind/);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyScanPayload, scanOutputContract, scanOutputExamples, SCAN_ARRAY_MEMBERS } from '../src/scan-contract.js';
import { parseScanJson, normalizeScanPayload } from '../src/scan-payload.js';
import { fingerprintMessage } from '../src/branches.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { compactForegroundNpc } from '../src/foreground-context.js';
import { buildForegroundInjection } from '../src/injection.js';

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
        buildStructuredDossierImportPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1 })];
    for (const prompt of prompts) {
        const examples = literalExamples(prompt);
        assert.equal(examples.length, 2);
        for (const example of examples) {
            const raw = JSON.parse(example);
            assert.deepEqual(Object.keys(raw).sort(), Object.keys(SCAN_ARRAY_MEMBERS).sort());
            const parsed = strict(example);
            assert.ok(Array.isArray(parsed.npcs));
        }
    }
    const foreground = buildForegroundInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1600 }).prompt;
    assert.equal(literalExamples(foreground).length, 0);
    assert.doesNotMatch(foreground, /OUTPUT CONTRACT|semanticUpdates|npc_state_v1/);
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

test('legacy embedded transport is ignored by canonical history ownership', () => {
    const payload = JSON.stringify(emptyScanPayload());
    const visible = 'Narrative text.\n<Inventory>Knife | 1 | Belt</Inventory>';
    const legacy = `Narrative text.\n<npc_state_v1>${payload}</npc_state_v1>\n<Inventory>Knife | 1 | Belt</Inventory>`;
    assert.equal(fingerprintMessage({ is_user: false, mes: legacy }), fingerprintMessage({ is_user: false, mes: visible }));
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

test('existing identity classification spelling normalization survives the stricter boundary without accepting admitted', () => {
    for (const [value, expected] of [['Named', 'named'], ['role_label', 'role-label'], [' proper ', 'named'], ['ROLE', 'role-label'], ['', '']]) {
        const parsed = strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value })));
        assert.equal(parsed.npcs[0].identityKind, expected);
    }
    for (const value of ['admitted', ' accepted ', 'constructor', '__proto__', null, 1, {}]) {
        assert.throws(() => strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value }))), /identityKind/);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyScanResult,
    buildScanPrompt,
    buildTargetedRefreshPrompt,
    parseScanJson,
} from '../src/scanner.js';
import { emptyScanPayload, SCAN_LIFECYCLE_EXAMPLE_ROW } from '../src/scan-contract.js';
import {
    applyModelLedSemanticUpdates,
    SEMANTIC_COLLECTION_CHANGE_EXAMPLE,
    SEMANTIC_FORM_UPDATE_EXAMPLE,
} from '../src/model/semantic-updates.js';
import { createPostResponseCoordinator } from '../src/post-response-coordinator.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

function stateWithNpc(npc) {
    const state = createEmptyState('v0519');
    state.npcs = [normalizeNpc(npc)];
    return state;
}

function semanticPayload(update) {
    const payload = emptyScanPayload();
    payload.npcs = [{ id: 'npc-ivo', name: 'Ivo', semanticUpdates: [structuredClone(update)] }];
    return payload;
}

function applySemantic(state, update, context) {
    return applyModelLedSemanticUpdates(state, semanticPayload(update), {
        sourceMessageId: 1,
        profileContext: context,
        semanticEvidenceContext: context,
    });
}

test('literal canonical lifecycle row parses and applies a confirmed death', () => {
    const payload = emptyScanPayload();
    payload.lifeStateUpdates = [structuredClone(SCAN_LIFECYCLE_EXAMPLE_ROW)];
    const parsed = parseScanJson(JSON.stringify(payload));
    assert.deepEqual(parsed.lifeStateUpdates, [SCAN_LIFECYCLE_EXAMPLE_ROW]);

    const state = stateWithNpc({ id: 'npc-ivo', name: 'Ivo', lifeState: 'alive' });
    const result = applyScanResult(state, parsed, { profileContext: SCAN_LIFECYCLE_EXAMPLE_ROW.lifeStateReason, sourceMessageId: 1 });
    const npc = result.state.npcs[0];
    assert.equal(npc.lifeState, 'dead');
    assert.equal(npc.archived, true);
    assert.equal(npc.archiveReason, 'deceased');
    assert.equal(npc.lifeStateReason, SCAN_LIFECYCLE_EXAMPLE_ROW.lifeStateReason);
});

test('canonical grounded livingReturn resurrects a confirmed-dead dossier', () => {
    const evidence = 'Ivo is alive again beneath the rubble.';
    const payload = emptyScanPayload();
    payload.lifeStateUpdates = [{
        id: 'npc-ivo',
        lifeState: 'alive',
        lifeStateCertainty: 'explicit',
        lifeStateReason: evidence,
        livingReturn: true,
    }];
    const parsed = parseScanJson(JSON.stringify(payload));
    const state = stateWithNpc({
        id: 'npc-ivo', name: 'Ivo', lifeState: 'dead', lifeStateCertainty: 'explicit',
        lifeStateReason: 'Ivo died.', archived: true, archiveReason: 'deceased', archivedAt: 1,
    });
    const result = applyScanResult(state, parsed, { profileContext: evidence, sourceMessageId: 2 });
    const npc = result.state.npcs[0];
    assert.equal(npc.lifeState, 'alive');
    assert.equal(npc.archived, false);
    assert.equal(npc.archiveReason, '');
    assert.equal(npc.lifeStateReason, evidence);
});

test('abbreviated lifecycle keys are rejected explicitly while a valid sibling semantic update still applies', async () => {
    const death = 'Vrena Tolk died when the tower collapsed.';
    const move = 'Before the collapse, Vrena Tolk moved the ledger to the archive room.';
    const context = `${death}\n${move}`;
    const payload = emptyScanPayload();
    payload.npcs = [{
        id: 'vrena', name: 'Vrena Tolk',
        semanticUpdates: [{
            field: 'location', operation: 'replace', value: 'Archive room',
            sources: [{ messageId: null, excerpt: move }],
        }],
    }];
    payload.lifeStateUpdates = [{ id: 'vrena', state: 'dead', certainty: 'explicit', reason: death }];

    const state = stateWithNpc({ id: 'vrena', name: 'Vrena Tolk', lifeState: 'alive', location: 'Guild desk' });
    const result = applyScanResult(state, JSON.stringify(payload), {
        profileContext: context,
        semanticEvidenceContext: context,
        sourceMessageId: 1,
    });
    const npc = result.state.npcs[0];
    assert.equal(npc.lifeState, 'alive');
    assert.equal(npc.archived, false);
    assert.equal(npc.location, 'Archive room');
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'lifeStateUpdates'
        && row.status === 'rejected-proposal'
        && row.reason === 'unsupported-lifecycle-keys:state,certainty,reason'));
    assert.ok(result.semanticDiagnostics.some(row => row.field === 'location' && row.status === 'applied'));

    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.ok(summary.rejected >= 1);
    assert.ok(summary.reasons.some(reason => reason.includes('unsupported-lifecycle-keys')));

    const statuses = [];
    const source = { valid: true, chatKey: 'v0519-status', identity: 'source-1', messageId: 1 };
    const coordinator = createPostResponseCoordinator({
        getSource: () => source,
        getLatestSource: () => source,
        getSettings: () => ({ enabled: true, autoScan: true, scanSyncTimeoutMs: 1000 }),
        runScan: async () => ({ ok: true, semanticDiagnostics: result.semanticDiagnostics, coverageDiagnostics: [] }),
        setStatus: (_chatKey, value) => statuses.push(value),
    });
    await coordinator.process(1);
    assert.equal(coordinator.status('v0519-status').status, 'partial');
    assert.ok(statuses.some(value => value.status === 'partial'));
});

test('supported grounded alive/unknown lifecycle compatibility may omit certainty', () => {
    const evidence = 'Ivo vanished into the fog.';
    const state = stateWithNpc({ id: 'npc-ivo', name: 'Ivo', lifeState: 'alive' });
    const payload = emptyScanPayload();
    payload.lifeStateUpdates = [{ id: 'npc-ivo', lifeState: 'unknown', lifeStateReason: evidence }];
    const result = applyScanResult(state, payload, { profileContext: evidence, sourceMessageId: 1 });
    const npc = result.state.npcs[0];
    assert.equal(npc.lifeState, 'unknown');
    assert.equal(npc.lifeStateCertainty, '');
    assert.equal(npc.lifeStateReason, evidence);
    assert.ok(!result.semanticDiagnostics.some(row => row.channel === 'focused-proposal' && row.field === 'lifeStateUpdates'));
});

test('empty lifeStateUpdates remains a valid no-op', () => {
    const parsed = parseScanJson(JSON.stringify(emptyScanPayload()));
    const state = stateWithNpc({ id: 'npc-ivo', name: 'Ivo', lifeState: 'alive' });
    const result = applyScanResult(state, parsed, { profileContext: 'Ivo waits.', sourceMessageId: 1 });
    assert.equal(result.state.npcs[0].lifeState, 'alive');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'lifeStateUpdates'), false);
});

test('literal collection example consolidates at capacity without clearing unrelated entries', () => {
    const unrelated = Array.from({ length: 6 }, (_, i) => `Unrelated mannerism ${i + 1}.`);
    const state = stateWithNpc({
        id: 'npc-ivo', name: 'Ivo',
        mannerisms: ['Taps twice.', 'Rings bell.', ...unrelated],
    });
    const source = SEMANTIC_COLLECTION_CHANGE_EXAMPLE.sources[0].excerpt;
    const result = applySemantic(state, SEMANTIC_COLLECTION_CHANGE_EXAMPLE, source);
    const values = result.state.npcs[0].mannerisms;
    assert.equal(values.length, 8);
    assert.ok(values.includes('Taps once.'));
    assert.ok(values.includes('Squares pages.'));
    assert.equal(values.includes('Taps twice.'), false);
    assert.equal(values.includes('Rings bell.'), false);
    for (const value of unrelated) assert.ok(values.includes(value), value);
    assert.ok(result.diagnostics.some(row => row.field === 'mannerisms' && row.status === 'applied'));
});

test('literal appearanceForms example updates only the targeted form and preserves shared/current state', () => {
    const state = stateWithNpc({
        id: 'npc-ivo', name: 'Ivo',
        appearance: 'Lean traveler with a brass signet.',
        appearanceForms: [
            { name: 'Human', appearance: 'Human form with black hair.' },
            { name: 'Wolf', appearance: 'Grey wolf form with a white forepaw.' },
        ],
        currentForm: 'Wolf',
    });
    const source = SEMANTIC_FORM_UPDATE_EXAMPLE.sources[0].excerpt;
    const result = applySemantic(state, SEMANTIC_FORM_UPDATE_EXAMPLE, source);
    const npc = result.state.npcs[0];
    assert.equal(npc.appearance, 'Lean traveler with a brass signet.');
    assert.equal(npc.currentForm, 'Wolf');
    assert.deepEqual(npc.appearanceForms, [
        { name: 'Human', appearance: 'Human form with auburn hair.' },
        { name: 'Wolf', appearance: 'Grey wolf form with a white forepaw.' },
    ]);
    assert.ok(result.diagnostics.some(row => row.field === 'appearanceForms' && row.status === 'applied'));
});

test('literal collection/form updates still obey manual locks and source validation', () => {
    const collectionSource = SEMANTIC_COLLECTION_CHANGE_EXAMPLE.sources[0].excerpt;
    const lockedCollection = stateWithNpc({
        id: 'npc-ivo', name: 'Ivo', mannerisms: ['Taps twice.', 'Rings bell.'], manualProfileFields: ['mannerisms'],
    });
    const lockedResult = applySemantic(lockedCollection, SEMANTIC_COLLECTION_CHANGE_EXAMPLE, collectionSource);
    assert.deepEqual(lockedResult.state.npcs[0].mannerisms, ['Taps twice.', 'Rings bell.']);
    assert.ok(lockedResult.diagnostics.some(row => row.field === 'mannerisms' && row.status === 'manually-protected'));

    const formState = stateWithNpc({
        id: 'npc-ivo', name: 'Ivo', appearanceForms: [{ name: 'Human', appearance: 'Human form with black hair.' }],
    });
    const badSource = applySemantic(formState, SEMANTIC_FORM_UPDATE_EXAMPLE, 'No form evidence appears here.');
    assert.deepEqual(badSource.state.npcs[0].appearanceForms, [{ name: 'Human', appearance: 'Human form with black hair.' }]);
    assert.ok(badSource.diagnostics.some(row => row.field === 'appearanceForms'
        && row.status === 'invalid-source-reference'
        && row.reason === 'out-of-scope-source'));
});

test('assembled Scan and Refresh advertise canonical lifecycle, collection, and form shapes', () => {
    const npc = normalizeNpc({ id: 'npc-ivo', name: 'Ivo', present: true, mannerisms: ['Taps twice.'], appearanceForms: [{ name: 'Human', appearance: 'Human form with black hair.' }] });
    const state = createEmptyState('prompt');
    state.npcs = [npc];
    const chat = [{ is_user: true, name: 'Ari', mes: 'I ask Ivo about the ledger.' }, { is_user: false, mes: 'Ivo taps the ledger once.' }];
    const scan = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const refresh = buildTargetedRefreshPrompt({ npc, chat, assistantMessageId: 1 });

    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /lifeStateUpdates\{id\|name,lifeState,lifeStateCertainty,lifeStateReason,livingReturn\?\}/);
        assert.doesNotMatch(prompt, /lifeStateUpdates id\/name,state,certainty,reason,livingReturn/);
        assert.match(prompt, /changes:\[\{action:add\|replace\|remove,ref\?,expected\?,value\?\}\]/);
        assert.match(prompt, /scope:\{form:"name"\}/);
        assert.ok(prompt.includes(JSON.stringify(SEMANTIC_COLLECTION_CHANGE_EXAMPLE)));
        assert.ok(prompt.includes(JSON.stringify(SEMANTIC_FORM_UPDATE_EXAMPLE)));
        assert.ok(prompt.includes(JSON.stringify(SCAN_LIFECYCLE_EXAMPLE_ROW)));
    }
});

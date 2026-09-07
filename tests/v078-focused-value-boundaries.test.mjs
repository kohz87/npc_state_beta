import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_FIELD_DEFINITIONS, dossierFieldValueIssue } from '../src/model/dossier-fields.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';

function twoNpcState() {
    const state = createEmptyState('chat:v078-focused-values');
    state.npcs = [
        normalizeNpc({ id: 'npc-nia', name: 'Nia', relationshipSummary: 'Neutral acquaintance.' }),
        normalizeNpc({ id: 'npc-ivo', name: 'Ivo' }),
    ];
    return state;
}

function basePayload() {
    return {
        exchangeActiveNpcIds: ['npc-nia', 'npc-ivo'], finalPresentNpcIds: ['npc-nia', 'npc-ivo'], worldActiveNpcIds: [],
        npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function apply(state, payload, context = 'Nia and Ivo work together. Nia calls Ivo her brother.') {
    return applyScanResult(state, payload, {
        sourceMessageId: 2, turn: 0, profileContext: context, semanticEvidenceContext: context,
        currentAdmissionText: context, relationshipContext: context, playerName: 'Ari',
        allowHistoricalProfilePatches: true, applyReturnedNpcPatches: true, applyRelationship: true,
        preservePresence: true, preserveObservation: true,
    });
}

test('ordinary scalar registry rejects object/array/boolean shapes while numeric age compatibility remains explicit', () => {
    for (const [field, definition] of Object.entries(DOSSIER_FIELD_DEFINITIONS)) {
        if (definition.kind !== 'scalar') continue;
        for (const invalid of [{ nested: true }, ['text'], true]) {
            assert.ok(dossierFieldValueIssue(field, invalid), `${field} accepted ${JSON.stringify(invalid)}`);
        }
    }
    assert.equal(dossierFieldValueIssue('age', 24), '');
    assert.equal(dossierFieldValueIssue('apparentAge', 24), '');
    assert.ok(dossierFieldValueIssue('age', -1));
    assert.ok(dossierFieldValueIssue('age', Number.NaN));
});

test('focused graph and lifecycle proposals reject object-valued scalar/member shapes without poisoning valid siblings', () => {
    const payload = basePayload();
    payload.socialEdges = [
        { from: 'Nia', to: 'Ivo', relation: { kind: 'coworker' }, summary: 'Invalid relation shape.', provenance: 'explicit' },
        { from: 'Nia', to: 'Ivo', relation: 'coworker', summary: 'They work the same station.', provenance: 'explicit' },
    ];
    payload.familyFacts = [
        { owner: 'Nia', relation: 'sister', members: ['Ivo'], descriptor: { note: 'older' }, evidence: 'Nia calls Ivo her brother.' },
        { owner: 'Nia', relation: 'sister', members: ['Ivo'], descriptor: 'Established sibling tie.', evidence: 'Nia calls Ivo her brother.' },
        { owner: 'Nia', relation: 'sister', members: [{ name: 'Ivo' }], evidence: 'Nia calls Ivo her brother.' },
    ];
    payload.lifeStateUpdates = [{ id: 'npc-nia', name: 'Nia', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: { text: 'Nia died.' }, livingReturn: false }];

    const applied = apply(twoNpcState(), payload);
    assert.equal(applied.state.socialGraph.length >= 1, true);
    assert.equal(applied.state.socialGraph.some(edge => edge.relation === 'coworker'), true);
    assert.equal(applied.state.familySlots.some(slot => slot.relation === 'sister' && slot.descriptor === 'Established sibling tie.'), true);
    assert.equal(applied.state.npcs.find(npc => npc.id === 'npc-nia').lifeState, 'unknown');
    assert.equal(JSON.stringify(applied.state).includes('[object Object]'), false);

    const focusedRejected = applied.semanticDiagnostics.filter(row => row.channel === 'focused-proposal' && row.status === 'rejected-proposal');
    assert.deepEqual(focusedRejected.map(row => row.field), ['socialEdges', 'familyFacts', 'familyFacts', 'lifeStateUpdates']);
    assert.ok(focusedRejected.every(row => row.reason.startsWith('invalid-value-type:')));
    const summary = summarizeProposalDiagnostics(applied.semanticDiagnostics, applied.coverageDiagnostics);
    assert.equal(summary.rejected >= 4, true);
});

test('relationship reason object cannot enter durable relationship history while valid axis evidence still governs scoring', () => {
    const state = createEmptyState('chat:v078-relationship-reason');
    state.npcs = [normalizeNpc({ id: 'npc-nia', name: 'Nia' })];
    const context = 'Nia thanks Ari warmly for saving her from the wolves.';
    const payload = basePayload();
    payload.exchangeActiveNpcIds = ['npc-nia']; payload.finalPresentNpcIds = ['npc-nia'];
    payload.npcs = [{
        id: 'npc-nia', name: 'Nia', semanticUpdates: [],
        relationshipChange: {
            evaluated: true, impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            axisEvidence: { trust: { excerpts: [context], explanation: context } }, reason: { note: 'gratitude' },
        },
    }];
    const applied = apply(state, payload, context);
    const npc = applied.state.npcs[0];
    assert.equal(npc.relationship.trust, 1);
    assert.equal(npc.relationshipHistory[0].reason, '');
    assert.equal(JSON.stringify(npc.relationshipHistory).includes('[object Object]'), false);
    assert.ok(npc.relationshipDiagnostics.at(-1).reasons.includes('reason:invalid-type'));
});

test('object-valued Current Dynamic is rejected and preserves the established summary', () => {
    const state = createEmptyState('chat:v078-summary-shape');
    state.npcs = [normalizeNpc({ id: 'npc-nia', name: 'Nia', relationshipSummary: 'Neutral acquaintance.' })];
    const context = 'Nia greets Ari at the desk.';
    const payload = basePayload();
    payload.exchangeActiveNpcIds = ['npc-nia']; payload.finalPresentNpcIds = ['npc-nia'];
    payload.npcs = [{
        id: 'npc-nia', name: 'Nia', semanticUpdates: [],
        relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'No shift.' },
        relationshipSummary: { text: 'Helpful acquaintance.' },
        relationshipSummaryEvidence: { excerpts: [context], explanation: context },
    }];
    const applied = apply(state, payload, context);
    assert.equal(applied.state.npcs[0].relationshipSummary, 'Neutral acquaintance.');
    assert.equal(JSON.stringify(applied.state.npcs[0]).includes('[object Object]'), false);
    assert.ok(applied.semanticDiagnostics.some(row => row.field === 'relationshipSummary'
        && row.status === 'rejected-proposal' && row.reason === 'invalid-value-type:expected-string-value'));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const ZERO_RELATIONSHIP = {
    evaluated: true, impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    priority: [], axisEvidence: {}, evidence: '', reason: 'Routine first contact.',
};

function rolePatch({ name = 'Guild Receptionist', anchor = 'receptionist', identityExcerpt, activityExcerpt, role = 'Adventurer Guild intake clerk and receptionist' } = {}) {
    return {
        id: '', name, identityKind: 'role-label', role,
        identityEvidence: { anchor, excerpts: [identityExcerpt], explanation: 'The visible role anchor identifies this new NPC.' },
        activityEvidence: {
            exchangeActive: { excerpts: [activityExcerpt], explanation: 'The NPC acts in the current exchange.' },
            inChat: { excerpts: [activityExcerpt], explanation: 'The NPC remains individually relevant in the scene.' },
        },
        relationshipChange: structuredClone(ZERO_RELATIONSHIP),
    };
}

function payload(patches, refs) {
    return {
        exchangeActiveNpcIds: refs, inChatNpcIds: refs, worldActiveNpcIds: [], npcs: patches,
        socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}

function apply(result, visible, admissionMode = 'balanced') {
    const state = createEmptyState('chat:v0527-anchor-admission');
    state.branchSafety = { status: 'safe' };
    return applyScanResult(state, result, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible,
        semanticEvidenceContext: visible, relationshipContext: visible, admissionMode,
        applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
}

test('balanced admission accepts a canonical role label through its exact grounded shorter identity anchor', () => {
    const visible = '"Take the parchment if you want the coin," the receptionist said, her eyes already scanning the next page in her ledger.';
    const patch = rolePatch({ identityExcerpt: visible, activityExcerpt: visible });
    const result = apply(payload([patch], ['Guild Receptionist']), visible);
    const npc = result.state.npcs.find(item => item.name === 'Guild Receptionist');
    assert.ok(npc);
    assert.match(npc.id, /^npc-guild-receptionist(?:-|$)/);
    assert.equal(result.patchResolutions[0].status, 'accepted');
    assert.equal(result.patchResolutions[0].npcId, npc.id);
    assert.deepEqual(result.exchangeActiveNpcIds, [npc.id]);
});

test('identity anchor admission rejects fabricated identity excerpts even when activity evidence is valid', () => {
    const visible = '"Take the parchment," the receptionist said, sliding it across the counter.';
    const patch = rolePatch({ identityExcerpt: 'The receptionist stamped the registration book.', activityExcerpt: visible });
    const result = apply(payload([patch], ['Guild Receptionist']), visible);
    assert.equal(result.state.npcs.length, 0);
    assert.equal(result.patchResolutions[0].status, 'unresolved');
    assert.equal(result.patchResolutions[0].reason, 'identity-evidence-unresolved');
});

test('identity anchor must occur inside its own validated identity excerpt rather than elsewhere in the exchange', () => {
    const visible = 'The receptionist watches the hall. A ledger lies open beside the wax seal.';
    const patch = rolePatch({ identityExcerpt: 'A ledger lies open beside the wax seal.', activityExcerpt: 'The receptionist watches the hall.' });
    const result = apply(payload([patch], ['Guild Receptionist']), visible);
    assert.equal(result.state.npcs.length, 0);
    assert.equal(result.patchResolutions[0].status, 'unresolved');
    assert.equal(result.patchResolutions[0].reason, 'identity-evidence-unresolved');
});

test('ambiguous shared short anchors cannot admit two different canonical role labels', () => {
    const blue = 'The receptionist in blue opens one ledger.';
    const red = 'The receptionist in red opens another ledger.';
    const visible = blue + ' ' + red;
    const first = rolePatch({ name: 'Guild Receptionist', identityExcerpt: blue, activityExcerpt: blue, role: 'Guild desk receptionist' });
    const second = rolePatch({ name: 'Harbor Receptionist', identityExcerpt: red, activityExcerpt: red, role: 'Harbor desk receptionist' });
    const result = apply(payload([first, second], ['Guild Receptionist', 'Harbor Receptionist']), visible);
    assert.equal(result.state.npcs.length, 0);
    assert.deepEqual(result.patchResolutions.map(row => row.status), ['unresolved', 'unresolved']);
});

test('named-preferred still rejects a grounded role-label identity after anchor admission succeeds', () => {
    const visible = '"Take the parchment," the receptionist said, sliding it across the counter.';
    const patch = rolePatch({ identityExcerpt: visible, activityExcerpt: visible });
    const result = apply(payload([patch], ['Guild Receptionist']), visible, 'named_preferred');
    assert.equal(result.state.npcs.length, 0);
    assert.equal(result.patchResolutions[0].status, 'rejected');
    assert.equal(result.patchResolutions[0].reason, 'admission-policy-rejected');
});

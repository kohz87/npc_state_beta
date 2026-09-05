import assert from 'node:assert/strict';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy, profileEvidenceText } from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

function run({ visible, patch, worldActive = ['npc-clara'], inChat = [] }) {
    const state = createEmptyState('v0427-world-active-evidence');
    state.npcs = [normalizeNpc({ id: 'npc-clara', name: 'Clara', present: false, worldActive: false })];
    const exchange = { user: null, assistant: { mes: visible, is_user: false } };
    const policy = buildExchangeEvidencePolicy(exchange);
    return applyScanResult(state, {
        exchangeActiveNpcIds: [],
        inChatNpcIds: inChat,
        worldActiveNpcIds: worldActive,
        npcs: [{ id: 'npc-clara', name: 'Clara', relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No movement.' }, ...patch }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 90,
        turn: 90,
        evidencePolicy: policy,
        currentAdmissionText: profileEvidenceText(visible),
        profileContext: profileEvidenceText(visible),
        applyRelationship: false,
        applyReturnedNpcPatches: true,
    });
}

// A visible name is not proof that the NPC is doing something off-screen.
{
    const result = run({ visible: 'Clara opened the guesthouse door and remained beside the stove.', patch: {} });
    assert.deepEqual(result.worldActiveNpcIds, [], 'A mere public name mention authorized worldActive');
    assert.equal(result.state.npcs[0].worldActive, false);
}

// Plain prose can still establish real off-screen activity through exact model evidence.
{
    const text = 'Across town, Clara was still bolting the guesthouse shutters against the rising wind.';
    const result = run({
        visible: text,
        patch: {
            activityEvidence: {
                exchangeActive: { excerpts: [], explanation: '' },
                inChat: { excerpts: [], explanation: '' },
                worldActive: { excerpts: [text], explanation: 'The narration explicitly places Clara actively securing the guesthouse elsewhere.' },
            },
        },
    });
    assert.deepEqual(result.worldActiveNpcIds, ['npc-clara'], 'Verified plain-narrative off-screen activity was rejected');
    assert.equal(result.state.npcs[0].worldActive, true);
    assert.equal(result.state.npcs[0].present, false);
}

// Fabricated worldActive evidence remains rejected even though Clara is named visibly.
{
    const visible = 'Clara was mentioned while Lucien studied the road map.';
    const result = run({
        visible,
        patch: {
            activityEvidence: {
                worldActive: { excerpts: ['Clara was locking the guesthouse doors.'], explanation: 'Fabricated fixture.' },
            },
        },
    });
    assert.deepEqual(result.worldActiveNpcIds, [], 'Fabricated worldActive quotation was accepted');
}

console.log('NPC State 0.4.27 plain-narrative worldActive evidence verified');

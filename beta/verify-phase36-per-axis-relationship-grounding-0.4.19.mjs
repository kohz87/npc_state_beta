import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

function stateWithKora() {
    const state = createEmptyState('per-axis-relationship-grounding');
    state.npcs = [normalizeNpc({
        id: 'npc-kora',
        name: 'Kora Lind',
        aliases: ['Kora'],
        role: 'Guild Clerk',
        present: true,
        relationship: ZERO,
    })];
    return state;
}

function applyKora(change, relationshipContext, options = {}) {
    const result = applyScanResult(stateWithKora(), {
        exchangeActiveNpcIds: ['npc-kora'],
        inChatNpcIds: ['npc-kora'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-kora',
            name: 'Kora Lind',
            relationshipChange: { evaluated: true, ...change },
        }],
        socialEdges: [],
        familyFacts: [],
    }, {
        sourceMessageId: 20,
        turn: 20,
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        requireCurrentRelationshipEvidence: true,
        relationshipContext,
        ...options,
    });
    return result.state.npcs.find(npc => npc.id === 'npc-kora');
}

const performanceContext = 'Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk. Kora inspected the delivery and accepted the completed work.';

// A weak extra axis must not poison a grounded Trust movement.
{
    const kora = applyKora({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1, desire: 0, tension: 0 },
        evidence: 'Kora regarded Lucien as more reliable after his competent completion of the bounty, while also feeling warmer toward him.',
        reason: 'Reliable performance may build Trust; the warmth claim is less directly supported.',
    }, performanceContext);

    assert.equal(kora.relationship.trust, 2, 'Grounded Trust was discarded because another axis was weak');
    assert.equal(kora.relationship.affection, 0, 'Unsupported Affection was incorrectly applied');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:ungrounded'), 'Rejected Affection axis was not diagnosed independently');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'), 'Mixed accepted/rejected proposal was not marked partial-applied');
    assert.equal(kora.relationshipEvidenceHistory.length, 1, 'Grounded subset did not enter relationship evidence history');
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.trust, 2, 'Evidence history lost the accepted Trust delta');
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.affection, 0, 'Evidence history retained a rejected Affection delta');
    assert.equal(kora.relationshipDiagnostics.at(-1)?.proposed?.affection, 1, 'Diagnostics no longer preserve the original scanner proposal');
}

// Unsupported Desire must not suppress independently grounded de-escalation.
{
    const context = 'Lucien lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful',
        delta: { trust: 0, affection: 0, desire: 1, tension: -1 },
        evidence: 'Kora relaxed around Lucien after his reassurance and felt more physical desire for him.',
        reason: 'His reassurance eased her tension; the attraction claim is not independently shown in the scene.',
    }, context);

    assert.equal(kora.relationship.tension, -1, 'Grounded Tension reduction was discarded with unsupported Desire');
    assert.equal(kora.relationship.desire, 0, 'Unsupported Desire bypassed explicit Desire safeguards');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('desire:unsupported'), 'Unsupported Desire was not diagnosed');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'), 'Tension-only surviving subset was not marked partial-applied');
}

// Multiple independently grounded axes may survive together when the impact tier permits them.
{
    const context = 'Lucien completed Kora\'s contract before dusk and delivered the intact proof. Kora accepted the work. Lucien then lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful',
        delta: { trust: 2, affection: 0, desire: 0, tension: -1 },
        evidence: 'Kora regarded Lucien as more reliable after his competent contract completion and relaxed after his reassurance.',
        reason: 'Two independently grounded effects: reliable performance and de-escalation.',
    }, context);

    assert.equal(kora.relationship.trust, 2, 'Grounded Trust did not survive a valid two-axis proposal');
    assert.equal(kora.relationship.tension, -1, 'Grounded Tension did not survive a valid two-axis proposal');
    assert(!kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => /^(?:trust|tension):(?:ungrounded|wrong-direction|contradictory|evidence-polarity)$/.test(reason)), 'A grounded axis was spuriously rejected');
}

// If every proposed axis fails, no score/history movement is created, but rejection is axis-specific.
{
    const context = 'Sora delivered the bounty proof to Kora while Lucien waited across the room.';
    const kora = applyKora({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1, desire: 0, tension: 0 },
        evidence: 'Kora regarded Lucien as more reliable after his competent completion and felt warmer toward him.',
        reason: 'Proposed relationship movement.',
    }, context);

    assert.deepEqual(kora.relationship, ZERO, 'Fully ungrounded proposal changed relationship scores');
    assert.equal(kora.relationshipEvidenceHistory.length, 0, 'Fully ungrounded proposal polluted evidence history');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('trust:')), 'Trust rejection lost axis-specific diagnostics');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('affection:')), 'Affection rejection lost axis-specific diagnostics');
    assert(!kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'), 'Fully rejected proposal was marked partial-applied');
}

// Single-axis behavior remains intact under the new pipeline.
{
    const kora = applyKora({
        impact: 'ordinary',
        delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
        evidence: 'Kora regarded Lucien as more reliable after his competent completion of the bounty.',
        reason: 'A small grounded reliability gain.',
    }, performanceContext);
    assert.equal(kora.relationship.trust, 1, 'Single-axis grounded Trust regressed');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('applied'), 'Single-axis application lost the normal applied diagnostic');
}

const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
assert(scanner.includes('function relationshipAxisGrounding'), 'Per-axis grounding helper is missing');
assert(scanner.includes("reasons.push(axis + ':' + rejection)"), 'Axis-specific grounding diagnostics are missing');
assert(scanner.includes("axis + ':evidence-polarity'"), 'Axis-specific polarity diagnostics are missing');
assert(scanner.includes("reasons.includes('partial-applied')"), 'Partial-application diagnostic marker is missing');
assert(scanner.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Recovery scanner lacks per-axis evidence guidance');
assert(injection.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Foreground scanner lacks per-axis evidence guidance');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.19');

console.log('NPC State 0.4.19 per-axis relationship grounding verified');

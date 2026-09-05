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

// A weak extra axis must not poison a provenance-valid Trust movement.
{
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 1, desire: 0, tension: 0 }, priority: ['trust', 'affection'],
        axisEvidence: {
            trust: { excerpts: ['Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk.'], explanation: 'Verifier trust judgment.' },
            affection: { excerpts: ['Kora smiled warmly at Lucien.'], explanation: 'Verifier intentionally fabricates the weaker axis quote.' },
        },
        evidence: 'Mixed verifier proposal.', reason: 'Trust quote exists; Affection quote does not.',
    }, performanceContext);
    assert.equal(kora.relationship.trust, 2, 'Provenance-valid Trust was discarded because another axis was weak');
    assert.equal(kora.relationship.affection, 0, 'Unverifiable Affection was incorrectly applied');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:unverifiable-excerpt'));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
    assert.equal(kora.relationshipEvidenceHistory.length, 1);
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.trust, 2);
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.affection, 0);
    assert.equal(kora.relationshipDiagnostics.at(-1)?.proposed?.affection, 1);
}

// An unverifiable Desire quote must not suppress independently provenance-valid de-escalation.
{
    const context = 'Lucien lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 1, tension: -1 }, priority: ['tension', 'desire'],
        axisEvidence: {
            tension: { excerpts: [context], explanation: 'Verifier tension judgment.' },
            desire: { excerpts: ['Kora pulled Lucien into a hungry kiss.'], explanation: 'Verifier intentionally fabricates this quote.' },
        },
        evidence: 'Mixed verifier proposal.', reason: 'Tension quote exists; Desire quote does not.',
    }, context);
    assert.equal(kora.relationship.tension, -1, 'Provenance-valid Tension reduction was discarded with invalid Desire');
    assert.equal(kora.relationship.desire, 0);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('desire:unverifiable-excerpt'));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
}

// Multiple independently provenance-valid axes survive together when the tier permits them.
{
    const context = 'Lucien completed Kora\'s contract before dusk and delivered the intact proof. Kora accepted the work. Lucien then lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 0, desire: 0, tension: -1 }, priority: ['trust', 'tension'],
        axisEvidence: {
            trust: { excerpts: ['Lucien completed Kora\'s contract before dusk and delivered the intact proof.'], explanation: 'Verifier trust judgment.' },
            tension: { excerpts: ['Lucien then lowered his weapon and reassured Kora that she was safe.'], explanation: 'Verifier tension judgment.' },
        },
        evidence: 'Two-source verifier proposal.', reason: 'Two independently quoted effects.',
    }, context);
    assert.equal(kora.relationship.trust, 2);
    assert.equal(kora.relationship.tension, -1);
}

// If every proposed quotation is absent, no score/history movement is created.
{
    const context = 'Sora delivered the bounty proof to Kora while Lucien waited across the room.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 1, desire: 0, tension: 0 }, priority: ['trust', 'affection'],
        axisEvidence: {
            trust: { excerpts: ['Lucien completed the bounty himself.'], explanation: 'Absent verifier quote.' },
            affection: { excerpts: ['Kora embraced Lucien.'], explanation: 'Absent verifier quote.' },
        },
        evidence: 'Fully invalid verifier proposal.', reason: 'No quoted support exists.',
    }, context);
    assert.deepEqual(kora.relationship, ZERO);
    assert.equal(kora.relationshipEvidenceHistory.length, 0);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('trust:')));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('affection:')));
    assert(!kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
}

// Single-axis behavior remains intact.
{
    const kora = applyKora({
        impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],
        axisEvidence: { trust: { excerpts: ['Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk.'], explanation: 'Verifier trust judgment.' } },
        evidence: 'Single-axis verifier proposal.', reason: 'Exact quote is present.',
    }, performanceContext);
    assert.equal(kora.relationship.trust, 1);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('applied'));
}



const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
assert(scanner.includes('function relationshipAxisProvenance'), 'Per-axis provenance helper is missing');
assert(scanner.includes('axisEvidenceStatus'), 'Axis-specific evidence diagnostics are missing');
assert(scanner.includes("axis + ':unverifiable-excerpt'"), 'Axis-specific provenance diagnostics are missing');
assert(scanner.includes("reasons.includes('partial-applied')"), 'Partial-application diagnostic marker is missing');
assert(scanner.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Recovery scanner lacks per-axis evidence guidance');
assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Foreground scanner lacks per-axis evidence guidance');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert(String(manifest.version).startsWith('0.4.') && Number(String(manifest.version).split('.')[2]) >= 19);

console.log('NPC State 0.4.19 per-axis relationship grounding verified');

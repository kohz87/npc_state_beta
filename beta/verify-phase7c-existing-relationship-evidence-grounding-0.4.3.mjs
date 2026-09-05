import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const base = createEmptyState('relationship-grounding-existing');
base.npcs = [normalizeNpc({
    id: 'npc-mira-rel-ground',
    name: 'Mira',
    relationship: { trust: 10, affection: 5, desire: 0, tension: 0 },
})];

const proposed = {
    exchangeActiveNpcIds: ['Mira'],
    inChatNpcIds: ['Mira'],
    worldActiveNpcIds: [],
    npcs: [{
        id: 'npc-mira-rel-ground',
        name: 'Mira',
        relationshipChange: {
            evaluated: true, impact: 'meaningful',
            delta: { trust: 2, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],
            axisEvidence: { trust: { excerpts: ['Mira explicitly entrusts Lucien with the only key to her private archive.'], explanation: 'Verifier trust judgment.' } },
            evidence: 'Mira explicitly entrusts Lucien with the only key to her private archive.',
            reason: 'A meaningful act of trust.',
        },
    }],
    socialEdges: [], familyFacts: [],
};

// The model cannot invent an evidence sentence for an existing NPC and move the meter when
// that evidence is absent from the actual current relationship context.
let applied = applyScanResult(base, proposed, {
    sourceMessageId: 70,
    turn: 70,
    applyReturnedNpcPatches: true,
    relationshipContext: 'Mira thanks Lucien for returning a borrowed book and changes the subject.',
});
let mira = applied.state.npcs.find(item => item.id === 'npc-mira-rel-ground');
assert(mira.relationship.trust === 10, 'Ungrounded existing-NPC relationship change was accepted');
assert(Number(mira.relationshipProgress?.trust || 0) === 0, 'Ungrounded relationship evidence accumulated hidden fractional progress');
assert(!(mira.relationshipEvidenceHistory || []).length, 'Ungrounded relationship evidence polluted semantic dedupe history');

// The same proposal is allowed when the current exchange actually contains the evidence.
applied = applyScanResult(base, proposed, {
    sourceMessageId: 71,
    turn: 71,
    applyReturnedNpcPatches: true,
    relationshipContext: 'Mira explicitly entrusts Lucien with the only key to her private archive.',
});
mira = applied.state.npcs.find(item => item.id === 'npc-mira-rel-ground');
assert(mira.relationship.trust > 10 || Number(mira.relationshipProgress?.trust || 0) > 0, 'Grounded existing-NPC relationship evidence was rejected');
assert((mira.relationshipEvidenceHistory || []).length === 1, 'Accepted grounded relationship evidence was not recorded once');

// Direct low-level calls that omit a permitted relationship source now fail closed. Existing saves
// remain readable, but missing current provenance does not silently authorize new movement.
applied = applyScanResult(base, proposed, {
    sourceMessageId: 72,
    turn: 72,
    applyReturnedNpcPatches: true,
});
mira = applied.state.npcs.find(item => item.id === 'npc-mira-rel-ground');
assert(mira.relationship.trust === 10, 'Context-less low-level proposal silently authorized movement');
assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:no-permitted-evidence-source'));

console.log('NPC State 0.4.3 existing-NPC relationship evidence grounding verification passed');

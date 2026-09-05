import assert from 'node:assert/strict';
import fs from 'node:fs';
import { relationshipEvidenceGrounding } from '../v03/relationship-evidence.js';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

const expectations = {
    subjectNames: ['Kora Lind', 'Kora'],
    objectNames: ['Lucien', 'player', 'the player'],
    otherSubjectNames: ['Sora'],
    impact: 'ordinary',
    delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
};

const groundedPerformance = 'Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk. Kora inspected the delivery and accepted the completed work.';

// The reported failure: a reasonable event paraphrase must not need near-verbatim token overlap.
{
    const evidence = 'Lucien completed his first local bounty promptly and cleanly before sundown.';
    assert.equal(
        relationshipEvidenceGrounding(evidence, groundedPerformance, expectations),
        '',
        'A concrete player-attributed bounty completion paraphrase was rejected as ungrounded',
    );
}

// Even an abstract ordinary evaluation may ground when the current exchange independently proves
// the concrete player-attributed performance pattern behind that evaluation.
{
    const evidence = 'Lucien demonstrated straightforward competence and reliability.';
    assert.equal(
        relationshipEvidenceGrounding(evidence, groundedPerformance, expectations),
        '',
        'Competence/reliability evaluation did not ground against concrete timely successful work',
    );
}

// Full integration: the backend should actually accept the +1 rather than merely classify the text.
{
    const state = createEmptyState('relationship-semantic-grounding');
    state.npcs = [normalizeNpc({
        id: 'npc-kora',
        name: 'Kora Lind',
        aliases: ['Kora'],
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },
        present: true,
    })];
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-kora'],
        inChatNpcIds: ['npc-kora'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-kora',
            name: 'Kora Lind',
            relationshipChange: {
                impact: 'ordinary',
                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
                evidence: 'Lucien demonstrated straightforward competence and reliability.',
                reason: 'Lucien completed his first local bounty promptly and cleanly before sundown.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
    }, {
        sourceMessageId: 8,
        turn: 8,
        relationshipContext: groundedPerformance,
        playerName: 'Lucien',
        otherNpcNames: ['Sora'],
        requireCurrentRelationshipEvidence: true,
        applyReturnedNpcPatches: true,
    });
    const kora = result.state.npcs[0];
    assert.equal(kora.relationship.trust, 1, 'Grounded ordinary Trust +1 was still discarded');
    assert(!kora.relationshipDiagnostics.at(-1)?.reasons?.includes('ungrounded'), 'Accepted ordinary Trust event still reports ungrounded');
}

// Another NPC doing the work cannot be credited to the player.
{
    const context = 'Sora delivered three intact pairs of lower tusks for the brush-boar contract before dusk while Lucien watched from the counter.';
    assert.notEqual(
        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', context, expectations),
        '',
        'Another NPC performance was incorrectly credited to Lucien',
    );
}

// Passive completion without a player actor is not enough to manufacture Trust movement.
{
    const context = 'The brush-boar contract was completed before dusk and three intact pairs of tusks were on the counter.';
    assert.equal(
        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', context, expectations),
        'ungrounded',
        'Actorless task completion incorrectly grounded a player Trust change',
    );
}

// Negative performance blocks the positive competence/reliability bridge.
{
    const context = 'Lucien returned late with broken tusks after failing to complete the brush-boar contract cleanly.';
    assert.equal(
        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', context, expectations),
        'ungrounded',
        'Failed or damaged work incorrectly grounded positive Trust',
    );
}

// v0.4.17+ separates grounding validity from progression difficulty. A stronger impact
// may use the same grounded event; inertia and milestone gates still decide movement.
{
    const stronger = { ...expectations, impact: 'meaningful', delta: { trust: 2, affection: 0, desire: 0, tension: 0 } };
    assert.equal(
        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', groundedPerformance, stronger),
        '',
        'Meaningful Trust paraphrase regressed after grounding/difficulty separation',
    );
}

// Desire remains outside this fallback entirely.
{
    const desire = { ...expectations, delta: { trust: 0, affection: 0, desire: 1, tension: 0 } };
    assert.equal(
        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', groundedPerformance, desire),
        'ungrounded',
        'Performance evidence leaked into Desire grounding',
    );
}

const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const evidenceSource = fs.readFileSync(new URL('../v03/relationship-evidence.js', import.meta.url), 'utf8');
assert(scanner.includes('impact: change.impact') && scanner.includes('delta: change.delta'), 'Scanner does not pass movement semantics into relationship grounding');
assert(evidenceSource.includes('ordinaryTrustSemanticGrounding') || evidenceSource.includes('relationshipSemanticGrounding'), 'Runtime relationship evidence lacks semantic relationship grounding');
assert(evidenceSource.includes('TRUST_PERFORMANCE_FAILURE'), 'Runtime relationship evidence lacks negative performance fail-closed protection');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const [major, minor, patch] = String(manifest.version).split('.').map(Number);
assert(major === 0 && minor === 4 && patch >= 16, 'Manifest regressed below v0.4.16');

console.log('NPC State 0.4.16 ordinary Trust semantic grounding verified');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { relationshipEvidenceGrounding } from '../v03/relationship-evidence.js';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc, relationshipMilestoneUnlocked } from '../v03/schema.js';

const baseExpectations = {
    subjectNames: ['Kora Lind', 'Kora'],
    objectNames: ['Lucien', 'player', 'the player'],
    otherSubjectNames: ['Sora'],
};
const groundedPerformance = 'Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk. Kora inspected the delivery and accepted the completed work.';

// Grounding is evidence validity, not difficulty. The same concrete performance paraphrase
// may be grounded at any impact tier; inertia and milestone rules decide how far it can move.
for (const [impact, raw] of [['ordinary', 1], ['meaningful', 2], ['major', 5], ['extreme', 10]]) {
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora regarded Lucien as more reliable after his competent completion of the bounty.',
            groundedPerformance,
            { ...baseExpectations, impact, delta: { trust: raw, affection: 0, desire: 0, tension: 0 } },
        ),
        '',
        `${impact} Trust paraphrase was incorrectly rejected by semantic grounding`,
    );
}

// Positive Affection can ground against a concrete player-attributed caring action.
{
    const context = 'Lucien gave Kora his cloak and helped tend her injured hand. Kora thanked him quietly.';
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora felt warmer affection toward Lucien after his considerate care.',
            context,
            { ...baseExpectations, impact: 'meaningful', delta: { trust: 0, affection: 2, desire: 0, tension: 0 } },
        ),
        '',
        'Affection paraphrase failed to ground against concrete player care',
    );
}

// Tension uses its real polarity: positive is more strain, negative is greater ease.
{
    const threat = 'Lucien threatened Kora and brandished his knife across the counter.';
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora grew more tense and wary of Lucien after his threat.',
            threat,
            { ...baseExpectations, impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 0, tension: 2 } },
        ),
        '',
        'Positive Tension paraphrase failed to ground against a player threat',
    );

    const reassurance = 'Lucien lowered his weapon and reassured Kora that she was safe.';
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora relaxed around Lucien after his reassurance.',
            reassurance,
            { ...baseExpectations, impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 0, tension: -2 } },
        ),
        '',
        'Negative Tension paraphrase failed to ground against player reassurance',
    );
}

// Fail closed around actor, target, ambiguity, failed positive performance, and Desire.
{
    const wrongActor = 'Sora delivered three intact pairs of lower tusks before dusk. Kora accepted the completed work while Lucien watched.';
    assert.notEqual(
        relationshipEvidenceGrounding(
            'Kora regarded Lucien as more reliable after his competent completion of the bounty.',
            wrongActor,
            { ...baseExpectations, impact: 'major', delta: { trust: 5, affection: 0, desire: 0, tension: 0 } },
        ),
        '',
        'Another NPC performance was credited to Lucien',
    );

    const noTarget = 'Lucien delivered three intact pairs of lower tusks before dusk to the guild stores.';
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora regarded Lucien as more reliable after his competent completion of the bounty.',
            noTarget,
            { ...baseExpectations, impact: 'major', delta: { trust: 5, affection: 0, desire: 0, tension: 0 } },
        ),
        'ungrounded',
        'Semantic grounding accepted an event that never connected the target NPC',
    );

    assert.equal(
        relationshipEvidenceGrounding(
            'Kora regarded Lucien as more reliable and felt warmer toward him.',
            groundedPerformance,
            { ...baseExpectations, impact: 'meaningful', delta: { trust: 2, affection: 2, desire: 0, tension: 0 } },
        ),
        'ungrounded',
        'Ambiguous multi-axis semantic fallback should remain fail-closed',
    );

    const failed = 'Lucien returned late with broken tusks after failing the brush-boar contract. Kora rejected the delivery.';
    assert.equal(
        relationshipEvidenceGrounding(
            'Kora regarded Lucien as more reliable after his competent completion of the bounty.',
            failed,
            { ...baseExpectations, impact: 'major', delta: { trust: 5, affection: 0, desire: 0, tension: 0 } },
        ),
        'ungrounded',
        'Failed performance incorrectly grounded positive Trust',
    );

    assert.equal(
        relationshipEvidenceGrounding(
            'Kora felt more physical desire for Lucien after his impressive work.',
            groundedPerformance,
            { ...baseExpectations, impact: 'ordinary', delta: { trust: 0, affection: 0, desire: 1, tension: 0 } },
        ),
        'ungrounded',
        'Broad semantic performance evidence leaked into Desire',
    );
}

function milestones(thresholds = []) {
    return thresholds.map(threshold => ({
        axis: 'trust', polarity: 1, threshold,
        reason: 'Verifier setup', evidence: 'Verifier setup', inferred: false,
    }));
}

function trustState(score, progress = 0, unlocked = []) {
    const state = createEmptyState('relationship-progression-curve');
    state.npcs = [normalizeNpc({
        id: 'npc-kora', name: 'Kora Lind', aliases: ['Kora'], present: true,
        relationship: { trust: score, affection: 0, desire: 0, tension: 0 },
        relationshipProgress: { trust: progress, affection: 0, desire: 0, tension: 0 },
        relationshipMilestones: milestones(unlocked),
    })];
    return state;
}

function applyTrust(state, { impact, delta, messageId = 10, label = 'verified event' }) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-kora'], inChatNpcIds: ['npc-kora'], worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-kora', name: 'Kora Lind',
            relationshipChange: {
                impact,
                delta: { trust: delta, affection: 0, desire: 0, tension: 0 },
                evidence: label,
                reason: label,
            },
        }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: messageId,
        turn: messageId,
        playerName: 'Lucien',
        requireCurrentRelationshipEvidence: false,
        applyReturnedNpcPatches: true,
    }).state.npcs[0];
}

// Aligned deepening bands: 0–25 ×1.00, 26–50 ×0.80, 51–75 ×0.60,
// 76–90 ×0.40, 91–100 ×0.25. Fractional progress must survive.
{
    const early = applyTrust(trustState(10), { impact: 'ordinary', delta: 1, label: 'early ordinary' });
    assert.equal(early.relationship.trust, 11, '0–25 should apply ordinary Trust at full weight');
    assert.equal(early.relationshipProgress.trust, 0);

    const secondBand = applyTrust(trustState(26, 0, [25]), { impact: 'ordinary', delta: 1, label: 'second band ordinary' });
    assert.equal(secondBand.relationship.trust, 26, '26–50 should retain sub-point progress rather than force a whole point');
    assert.equal(secondBand.relationshipProgress.trust, 0.8, '26–50 deepening multiplier is not ×0.80');

    const thirdBand = applyTrust(trustState(51, 0, [25, 50]), { impact: 'meaningful', delta: 2, label: 'third band meaningful' });
    assert.equal(thirdBand.relationship.trust, 52, '51–75 meaningful +2 should produce one whole point at ×0.60');
    assert.equal(thirdBand.relationshipProgress.trust, 0.2, '51–75 deepening multiplier is not ×0.60');

    const fourthBand = applyTrust(trustState(76, 0, [25, 50, 75]), { impact: 'major', delta: 5, label: 'fourth band major' });
    assert.equal(fourthBand.relationship.trust, 78, '76–90 major +5 should produce +2 at ×0.40');
    assert.equal(fourthBand.relationshipProgress.trust, 0);

    const finalBand = applyTrust(trustState(91, 0, [25, 50, 75, 90]), { impact: 'extreme', delta: 10, label: 'final band extreme' });
    assert.equal(finalBand.relationship.trust, 93, '91–100 extreme +10 should produce +2 whole points at ×0.25');
    assert.equal(finalBand.relationshipProgress.trust, 0.5, '91–100 deepening multiplier is not ×0.25');
}

// Moving back toward neutral must remain easier than deepening at the same depth.
{
    const deeper = applyTrust(trustState(80, 0, [25, 50, 75]), { impact: 'ordinary', delta: 1, label: 'deepen at eighty' });
    const neutral = applyTrust(trustState(80, 0, [25, 50, 75]), { impact: 'ordinary', delta: -1, label: 'neutralize at eighty' });
    assert.equal(deeper.relationshipProgress.trust, 0.4, '76–90 deepening setup is not ×0.40');
    assert.equal(neutral.relationshipProgress.trust, -0.55, 'Existing easier movement-toward-neutral multiplier changed unexpectedly');
    assert(Math.abs(neutral.relationshipProgress.trust) > Math.abs(deeper.relationshipProgress.trust), 'Movement toward neutral is no longer easier than deepening');
}

// Gates remain hard narrative locks at the exact same boundaries.
{
    const locked25 = applyTrust(trustState(25), { impact: 'ordinary', delta: 1, label: 'ordinary at locked twenty five' });
    assert.equal(locked25.relationship.trust, 25);
    assert.equal(locked25.relationshipProgress.trust, 0);
    assert(locked25.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:gate-tier'), 'Ordinary evidence crossed a locked 25 gate');

    const unlock25 = applyTrust(trustState(25), { impact: 'meaningful', delta: 1, label: 'meaningful gate twenty five' });
    assert(relationshipMilestoneUnlocked(unlock25.relationshipMilestones, 'trust', 1, 25), 'Meaningful raw +1 did not unlock 25');
    assert.equal(unlock25.relationship.trust, 26, 'Qualifying 25-gate event should carry the score into the 26–50 band');

    const unlock50 = applyTrust(trustState(50, 0, [25]), { impact: 'major', delta: 3, label: 'major gate fifty' });
    assert(relationshipMilestoneUnlocked(unlock50.relationshipMilestones, 'trust', 1, 50), 'Major raw +3 did not unlock 50');
    assert(unlock50.relationship.trust > 50, '50 gate qualifying event did not carry the score into the 51–75 band');

    const unlock75 = applyTrust(trustState(75, 0, [25, 50]), { impact: 'extreme', delta: 5, label: 'extreme gate seventy five' });
    assert(relationshipMilestoneUnlocked(unlock75.relationshipMilestones, 'trust', 1, 75), 'Extreme raw +5 did not unlock 75');

    const unlock90 = applyTrust(trustState(90, 0, [25, 50, 75]), { impact: 'extreme', delta: 8, label: 'extreme gate ninety' });
    assert(relationshipMilestoneUnlocked(unlock90.relationshipMilestones, 'trust', 1, 90), 'Extreme raw +8 did not unlock 90');
}

const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const evidence = fs.readFileSync(new URL('../v03/relationship-evidence.js', import.meta.url), 'utf8');
assert(scanner.includes('if (magnitude <= 25) return 1;'));
assert(scanner.includes('if (magnitude <= 50) return 0.8;'));
assert(scanner.includes('if (magnitude <= 75) return 0.6;'));
assert(scanner.includes('if (magnitude <= 90) return 0.4;'));
assert(scanner.includes('return 0.25;'));
assert(evidence.includes('relationshipSemanticGrounding'));
assert(evidence.includes("movement.axis === 'desire'"), 'Desire semantic isolation is missing');
assert(evidence.includes('semanticMentionsTarget'), 'Target binding is missing from semantic grounding');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.17');

console.log('NPC State 0.4.17 relationship progression curve verified');

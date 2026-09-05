import fs from 'node:fs';
import {
    createEmptyState,
    normalizeNpc,
    relationshipMilestoneUnlocked,
} from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function near(actual, expected, epsilon = 0.000001) {
    return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}

function milestone(axis, polarity, threshold) {
    return { axis, polarity, threshold, reason: 'Established for test.', evidence: '', sourceMessageId: 1, turn: 1, at: 1, inferred: false };
}

function stateWithRelationship(relationship, milestones = []) {
    const state = createEmptyState('phase1');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-phase1',
        name: 'Mira',
        relationship,
        relationshipMilestones: milestones,
    })];
    return state;
}

function apply(state, { impact = 'ordinary', delta = {}, evidence = 'Fresh grounded evidence.', reason = 'Fresh relationship event.', summary = '', sourceMessageId = 2, turn = sourceMessageId, context = '' } = {}) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-phase1'],
        inChatNpcIds: ['npc-mira-phase1'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-mira-phase1',
            name: 'Mira',
            relationshipSummary: summary,
            relationshipChange: {
                impact,
                delta: { trust: 0, affection: 0, desire: 0, tension: 0, ...delta },
                evidence,
                reason,
            },
        }],
        socialEdges: [],
    }, {
        sourceMessageId,
        turn,
        relationshipContext: context,
        applyReturnedNpcPatches: true,
    }).state;
}

const mira = state => state.npcs.find(npc => npc.id === 'npc-mira-phase1');

// Fractional evidence + inertia: at 30, two ordinary +1 events yield +1 visible total,
// with 0.5 evidence retained after the second event.
{
    let state = stateWithRelationship({ trust: 30, affection: 0, desire: 0, tension: 0 }, [milestone('trust', 1, 25)]);
    state = apply(state, { delta: { trust: 1 }, evidence: 'Mira sees the player keep a small promise.', reason: 'A small promise is kept.', sourceMessageId: 2 });
    assert(mira(state).relationship.trust === 30, 'First weighted ordinary event at 30 moved a visible point too early');
    assert(near(mira(state).relationshipProgress.trust, 0.75), 'First weighted ordinary event did not retain 0.75 fractional progress');
    state = apply(state, { delta: { trust: 1 }, evidence: 'Mira sees the player return borrowed tools on time.', reason: 'Borrowed tools are returned reliably.', sourceMessageId: 3 });
    assert(mira(state).relationship.trust === 31, 'Second distinct ordinary event did not convert accumulated evidence into one point');
    assert(near(mira(state).relationshipProgress.trust, 0.5), 'Fractional remainder after second event is incorrect');
}

// Very high relationship depth is strongly resistant to further deepening.
{
    let state = stateWithRelationship(
        { trust: 95, affection: 0, desire: 0, tension: 0 },
        [25, 50, 75, 90].map(point => milestone('trust', 1, point)),
    );
    state = apply(state, { impact: 'extreme', delta: { trust: 10 }, evidence: 'Mira entrusts the player with her life during a decisive crisis.', reason: 'A relationship-defining act of trust occurs.' });
    assert(mira(state).relationship.trust === 96, 'Trust 95 incorrectly received the full extreme raw weight instead of 10% inertia');
}

// Tier axis-count limits are deterministic. Meaningful accepts at most two strongest axes.
{
    let state = stateWithRelationship({ trust: 0, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        impact: 'meaningful',
        delta: { trust: 2, affection: 2, tension: 1 },
        evidence: 'Mira receives meaningful reliability and kindness from the player.',
        reason: 'The exchange meaningfully improves trust and affection.',
    });
    assert(mira(state).relationship.trust === 2 && mira(state).relationship.affection === 2, 'Meaningful event did not retain the two strongest axes');
    assert(mira(state).relationship.tension === 0, 'Meaningful event moved a third axis');
}

// Ambiguous equal-strength overflow is rejected rather than biased by fixed axis order.
{
    let state = stateWithRelationship({ trust: 0, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        impact: 'meaningful',
        delta: { trust: 2, affection: 2, tension: 2 },
        evidence: 'The model ambiguously proposes three equal relationship axes.',
        reason: 'Ambiguous equal-strength overflow.',
    });
    assert(mira(state).relationship.trust === 0 && mira(state).relationship.affection === 0 && mira(state).relationship.tension === 0, 'Equal tied overflow created deterministic axis bias');
}

// Desire is blocked unless both the model evidence and actual current narration contain
// explicit romantic/intimate/physical-attraction evidence.
{
    let state = stateWithRelationship({ trust: 0, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        impact: 'meaningful',
        delta: { desire: 2 },
        evidence: 'Mira is grateful after being rescued.',
        reason: 'The rescue supposedly increases desire.',
        context: 'The player rescues Mira. She thanks him warmly.',
    });
    assert(mira(state).relationship.desire === 0, 'Rescue/gratitude leaked into Desire');

    state = apply(state, {
        impact: 'meaningful',
        delta: { desire: 2 },
        evidence: 'Mira explicitly admits she is romantically attracted to the player.',
        reason: 'Mira voices romantic attraction.',
        context: 'Mira says she is romantically attracted to the player and asks for a kiss.',
        sourceMessageId: 3,
    });
    assert(mira(state).relationship.desire === 2, 'Explicit current romantic attraction was incorrectly blocked');
}

// Semantic repeat protection stores accepted evidence in a hidden six-event ledger and
// prevents the same beat/aftermath from scoring again.
{
    let state = stateWithRelationship({ trust: 0, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'The player returns Mira\'s lost purse untouched.',
        reason: 'Returning the lost purse demonstrates honesty.',
        sourceMessageId: 2,
    });
    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'The player returns Mira\'s lost purse untouched.',
        reason: 'Returning the lost purse demonstrates honesty.',
        sourceMessageId: 3,
    });
    assert(mira(state).relationship.trust === 1, 'Duplicate relationship event scored twice');
    assert(mira(state).relationshipEvidenceHistory.length === 1, 'Duplicate event polluted the hidden evidence ledger');
}

// Locked checkpoint attempts are remembered for dedupe but cannot change fractional state,
// Last Relationship Change, or Relationship Summary.
{
    let state = stateWithRelationship({ trust: 25, affection: 0, desire: 0, tension: 0 }, []);
    state = apply(state, {
        impact: 'ordinary',
        delta: { trust: 1 },
        evidence: 'The player performs another small reliable favor.',
        reason: 'A modest reliable favor occurs at the locked checkpoint.',
        summary: 'Mira is gradually becoming more confident in the player.',
    });
    assert(mira(state).relationship.trust === 25, 'Ordinary event passed locked 25 gate');
    assert(near(mira(state).relationshipProgress.trust, 0), 'Blocked checkpoint banked fractional outward progress');
    assert(mira(state).relationshipSummary === '', 'Blocked checkpoint event rewrote Relationship Summary');
    assert(mira(state).relationshipEvidenceHistory.length === 1, 'Blocked checkpoint evidence was not retained for dedupe');
}

// Milestones still work on top of inertia. At 50, a qualifying major +3 opens the gate,
// while resistance means only one visible point is earned immediately.
{
    let state = stateWithRelationship({ trust: 50, affection: 0, desire: 0, tension: 0 }, [milestone('trust', 1, 25)]);
    state = apply(state, {
        impact: 'major',
        delta: { trust: 3 },
        evidence: 'Mira entrusts the player with a dangerous secret at personal risk.',
        reason: 'A major act of vulnerability establishes deeper trust.',
    });
    assert(mira(state).relationship.trust === 51, 'Major +3 at 50 ignored restored relationship inertia');
    assert(near(mira(state).relationshipProgress.trust, 0.5), 'Major +3 at 50 did not retain its fractional remainder');
    assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 50), 'Qualifying event did not unlock the 50 milestone');
}

// Relationship Summary is calibrated against actual accepted depth.
{
    let state = stateWithRelationship({ trust: 10, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'Mira sees the player keep another small promise.',
        reason: 'A fresh small promise increases trust.',
        summary: 'Mira has unbreakable trust in the player and trusts him with her life.',
    });
    assert(mira(state).relationshipSummary === '', 'Unsupported exceptional Relationship Summary survived low trust');

    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'Mira sees the player honestly return a borrowed key.',
        reason: 'A different small act of honesty increases trust.',
        summary: 'Mira has growing confidence in the player\'s reliability.',
        sourceMessageId: 3,
    });
    assert(mira(state).relationshipSummary.includes('growing confidence'), 'Grounded modest Relationship Summary was incorrectly rejected');
}

// Version and wiring invariants.
{
    const schema = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const runtimeMatch = schema.match(/NPC_STATE_VERSION = '(0\.4\.(\d+))'/);
    assert(runtimeMatch && Number(runtimeMatch[2]) >= 2, 'Runtime version regressed below the 0.4.2 relationship-hardening baseline');
    const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
    assert(/^0\.4\./.test(String(manifest.version || '')) && Number.isFinite(manifestPatch) && manifestPatch >= 2, 'Manifest version regressed below the 0.4.2 relationship-hardening baseline');
    assert(schema.includes('relationshipProgress') && schema.includes('relationshipEvidenceHistory'), 'Relationship hardening state fields missing');
    assert(scanner.includes('relationshipInertiaFactor') && scanner.includes('selectRelationshipAxes'), 'Inertia/axis hardening missing');
    assert(scanner.includes('DESIRE_EVIDENCE_CUES') && scanner.includes('relationshipChangeLooksDuplicate'), 'Desire firewall or dedupe missing');
    assert(scanner.includes('relationshipSummarySupported') && scanner.includes('relationshipStateChanged'), 'Relationship Summary validation missing');
    assert(engine.includes('relationshipContextForExchange'), 'Current-exchange narration is not wired to deterministic relationship validation');
    assert(injection.includes('RELATIONSHIP HARDENING'), 'Foreground model contract does not describe relationship hardening');
}

console.log('NPC State 0.4.2 phase 1 relationship hardening verification passed');

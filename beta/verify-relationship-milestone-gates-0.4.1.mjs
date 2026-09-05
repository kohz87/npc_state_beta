import fs from 'node:fs';
import {
    createEmptyState,
    normalizeNpc,
    normalizeRelationshipMilestones,
    relationshipMilestoneUnlocked,
} from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

function milestone(axis, polarity, threshold) {
    return { axis, polarity, threshold, reason: 'Established for test.', evidence: '', sourceMessageId: 1, turn: 1, at: 1, inferred: false };
}

function stateWithTrust(value, milestones = []) {
    const state = createEmptyState('relationship-gate-test');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-test',
        name: 'Mira',
        relationship: { trust: value, affection: 0, desire: 0, tension: 0 },
        relationshipMilestones: milestones,
    })];
    return state;
}

function applyTrust(state, { impact, delta, sourceMessageId = 2, evidence = ({2: 'Mira receives a map during the blizzard.', 3: 'Lucien returns her stolen ancestral heirloom.', 4: 'They survive a dangerous rescue on the mountain.'})[sourceMessageId], reason = 'Current exchange changes trust.' }) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-test'],
        inChatNpcIds: ['npc-mira-test'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-mira-test',
            name: 'Mira',
            relationshipChange: {
                impact,
                delta: { trust: delta, affection: 0, desire: 0, tension: 0 },
                evidence,
                reason,
            },
        }],
        socialEdges: [],
    }, { sourceMessageId, turn: sourceMessageId, applyReturnedNpcPatches: true }).state;
}

function mira(state) {
    return state.npcs.find(npc => npc.id === 'npc-mira-test');
}

// Migration: existing scores beyond old checkpoints are grandfathered, exact boundary stays locked.
let migrated = normalizeNpc({ name: 'Legacy', relationship: { trust: 51, affection: 0, desire: 0, tension: 0 } });
assert(relationshipMilestoneUnlocked(migrated.relationshipMilestones, 'trust', 1, 25), 'Legacy score above 25 did not infer 25 milestone');
assert(relationshipMilestoneUnlocked(migrated.relationshipMilestones, 'trust', 1, 50), 'Legacy score above 50 did not infer 50 milestone');
assert(!relationshipMilestoneUnlocked(migrated.relationshipMilestones, 'trust', 1, 75), 'Legacy score inferred an uncrossed milestone');
migrated = normalizeNpc({ name: 'Boundary', relationship: { trust: 50, affection: 0, desire: 0, tension: 0 } });
assert(relationshipMilestoneUnlocked(migrated.relationshipMilestones, 'trust', 1, 25), 'Boundary score did not infer lower passed milestone');
assert(!relationshipMilestoneUnlocked(migrated.relationshipMilestones, 'trust', 1, 50), 'Exact legacy boundary should remain a locked checkpoint');

// 25: ordinary can reach the checkpoint but cannot deepen past it.
let state = stateWithTrust(24, []);
state = applyTrust(state, { impact: 'ordinary', delta: 1 });
assert(mira(state).relationship.trust === 25, 'Ordinary evidence did not reach 25 boundary');
assert(!relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 25), 'Ordinary evidence incorrectly unlocked 25');
state = applyTrust(state, { impact: 'ordinary', delta: 1, sourceMessageId: 3 });
assert(mira(state).relationship.trust === 25, 'Ordinary evidence passed locked 25 gate');
state = applyTrust(state, { impact: 'meaningful', delta: 1, sourceMessageId: 4 });
assert(mira(state).relationship.trust === 26, 'Meaningful evidence did not cross 25 gate');
assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 25), '25 gate was not recorded after qualifying crossing');

// 50: meaningful may reach/clamp to 50, but only major with >=3 raw points crosses.
state = stateWithTrust(49, [milestone('trust', 1, 25)]);
state = applyTrust(state, { impact: 'meaningful', delta: 2 });
assert(mira(state).relationship.trust === 50, 'Meaningful evidence was not clamped to locked 50 gate');
assert(!relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 50), 'Meaningful evidence incorrectly unlocked 50');
state = applyTrust(state, { impact: 'major', delta: 2, sourceMessageId: 3 });
assert(mira(state).relationship.trust === 50, 'Major event below 50 raw requirement passed gate');
state = applyTrust(state, { impact: 'major', delta: 3, sourceMessageId: 4 });
assert(mira(state).relationship.trust === 51, 'Qualifying major event did not cross 50 gate');
assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 50), '50 gate unlock was not persisted');

// 75: extreme with >=5 raw points.
state = stateWithTrust(74, [milestone('trust', 1, 25), milestone('trust', 1, 50)]);
state = applyTrust(state, { impact: 'major', delta: 5 });
assert(mira(state).relationship.trust === 75, 'Major event passed locked 75 gate');
state = applyTrust(state, { impact: 'extreme', delta: 5, sourceMessageId: 3 });
assert(mira(state).relationship.trust === 76, 'Qualifying extreme event did not cross 75 gate');
assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 75), '75 gate unlock was not persisted');

// 90: extreme requires >=8 raw points, not merely the extreme label.
state = stateWithTrust(89, [milestone('trust', 1, 25), milestone('trust', 1, 50), milestone('trust', 1, 75)]);
state = applyTrust(state, { impact: 'extreme', delta: 5 });
assert(mira(state).relationship.trust === 90, 'Under-strength extreme event was not clamped to 90');
assert(!relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 90), 'Under-strength extreme event unlocked 90');
state = applyTrust(state, { impact: 'extreme', delta: 7, sourceMessageId: 3 });
assert(mira(state).relationship.trust === 90, 'Extreme event below 8 raw points crossed 90');
state = applyTrust(state, { impact: 'extreme', delta: 8, sourceMessageId: 4 });
assert(mira(state).relationship.trust === 91, 'Qualifying relationship-defining event did not cross 90');
assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 90), '90 gate unlock was not persisted');

// Movement toward neutral is never checkpoint-blocked.
state = stateWithTrust(50, [milestone('trust', 1, 25)]);
state = applyTrust(state, { impact: 'ordinary', delta: -1 });
assert(mira(state).relationship.trust === 50 && mira(state).relationshipProgress.trust === -0.7, 'Movement toward neutral did not retain inertia-weighted evidence');

// Positive and negative directions have separate gates.
state = stateWithTrust(-25, []);
state = applyTrust(state, { impact: 'ordinary', delta: -1 });
assert(mira(state).relationship.trust === -25, 'Ordinary evidence passed locked negative 25 gate');
state = applyTrust(state, { impact: 'meaningful', delta: -1, sourceMessageId: 3 });
assert(mira(state).relationship.trust === -26, 'Meaningful evidence did not cross negative 25 gate');
assert(relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', -1, 25), 'Negative 25 gate unlock missing');
assert(!relationshipMilestoneUnlocked(mira(state).relationshipMilestones, 'trust', 1, 25), 'Negative gate incorrectly unlocked positive direction');

// Milestone normalization deduplicates and preserves hidden audit state.
const normalizedMilestones = normalizeRelationshipMilestones([
    milestone('trust', 1, 25),
    milestone('trust', 1, 25),
], { trust: 25, affection: 0, desire: 0, tension: 0 }, { inferFromRelationship: false });
assert(normalizedMilestones.length === 1, 'Milestone normalization did not deduplicate');

// Full and foreground scanners must be told the same semantics, but no unlock state is injected.
const promptState = stateWithTrust(25, []);
const chat = [
    { is_user: true, is_system: false, mes: 'I keep my promise to Mira.' },
    { is_user: false, is_system: false, mes: 'Mira acknowledges it.' },
];
const scanPrompt = buildScanPrompt({ state: promptState, chat, assistantMessageId: 1 });
assert(scanPrompt.includes('RELATIONSHIP MILESTONE GATES'), 'Recovery scanner gate rule missing');
assert(scanPrompt.includes('25, 50, 75, and 90'), 'Recovery scanner thresholds missing');
const injection = buildInjection(promptState, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 6000 });
assert(injection.includes('RELATIONSHIP MILESTONE GATES'), 'Foreground gate rule missing');
assert(injection.includes('50 requires major-or-stronger'), 'Foreground 50 gate requirement missing');
assert(!injection.includes('relationshipMilestones'), 'Private milestone unlock state leaked into foreground injection');

const engine = file('v03/engine.js');
assert(engine.includes('changedAxes.includes(entry.axis)'), 'Manual relationship milestones are not limited to changed axes');
const index = file('v03/index.js');
assert(index.includes('PRE_GATE_RELATIONSHIP_CRITERIA'), 'Exact stock rubric migration marker missing');
assert(index.includes('RELATIONSHIP MILESTONES: outward depth is gated'), 'Default gated relationship rubric missing');

console.log('NPC State 0.4.1 relationship milestone gate verification passed');

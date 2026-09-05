import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEmptyState, normalizeNpc, relationshipMilestoneUnlocked } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

const id = 'npc-gate-test';

function stateAt(score, axis = 'trust') {
    const state = createEmptyState('gate-048');
    state.npcs = [normalizeNpc({
        id,
        name: 'Mira',
        present: true,
        relationship: { [axis]: score },
        relationshipMilestones: [],
    })];
    return state;
}

function applyEvent(state, { axis = 'trust', delta, impact, caps, evidence, messageId = 2 }) {
    const payload = {
        exchangeActiveNpcIds: [id],
        inChatNpcIds: [id],
        npcs: [{
            id,
            name: 'Mira',
            relationshipChange: {
                impact,
                delta: { [axis]: delta },
                evidence,
                reason: 'A newly grounded event changes this relationship axis.',
            },
        }],
    };
    return applyScanResult(state, payload, {
        sourceMessageId: messageId,
        turn: messageId,
        relationshipContext: evidence,
        relationshipCaps: caps,
        applyReturnedNpcPatches: true,
    }).state;
}

function npc(state) { return state.npcs[0]; }
function unlocked(state, threshold, axis = 'trust', polarity = 1) {
    return relationshipMilestoneUnlocked(npc(state).relationshipMilestones, axis, polarity, threshold);
}

{
    const cases = [
        { threshold: 25, impact: 'meaningful', delta: 1, evidence: 'Mira meaningfully entrusts Lucien with her private correspondence.' },
        { threshold: 50, impact: 'major', delta: 3, evidence: 'Mira places major trust in Lucien by giving him sole custody of her family heirloom during a crisis.' },
        { threshold: 75, impact: 'extreme', delta: 5, evidence: 'Mira entrusts Lucien with her life during an extreme life-or-death rescue.' },
    ];
    for (const item of cases) {
        const after = applyEvent(stateAt(item.threshold), item);
        assert.equal(unlocked(after, item.threshold), true, `${item.threshold} gate did not unlock at its fixed stock requirement`);
        assert(npc(after).relationship.trust >= item.threshold, `${item.threshold} gate event moved in the wrong direction`);
    }
}

{
    const after = applyEvent(stateAt(50), {
        delta: 2,
        impact: 'major',
        caps: { ordinary: 1, meaningful: 2, major: 2, extreme: 10 },
        evidence: 'Mira gives Lucien a major responsibility and her trust deepens.',
    });
    assert.equal(npc(after).relationship.trust, 50, 'Lower major cap incorrectly allowed score to deepen past the locked 50 gate');
    assert.equal(unlocked(after, 50), false, 'Lower major cap incorrectly weakened the raw >=3 requirement at 50');
}

{
    const after = applyEvent(stateAt(75), {
        delta: 4,
        impact: 'extreme',
        caps: { ordinary: 1, meaningful: 2, major: 5, extreme: 4 },
        evidence: 'Mira survives an extreme ordeal with Lucien and her trust deepens sharply.',
    });
    assert.equal(npc(after).relationship.trust, 75, 'Lower extreme cap incorrectly allowed score to deepen past the locked 75 gate');
    assert.equal(unlocked(after, 75), false, 'Lower extreme cap incorrectly weakened the raw >=5 requirement at 75');
}

{
    const after = applyEvent(stateAt(90), {
        delta: 7,
        impact: 'extreme',
        caps: { ordinary: 1, meaningful: 2, major: 5, extreme: 7 },
        evidence: 'Mira experiences an extreme relationship-defining ordeal with Lucien.',
    });
    assert.equal(npc(after).relationship.trust, 90, 'Lower extreme cap incorrectly allowed score to deepen past the locked 90 gate');
    assert.equal(unlocked(after, 90), false, 'Lower extreme cap incorrectly weakened the raw >=8 requirement at 90');
}

{
    const after = applyEvent(stateAt(25), {
        delta: 1,
        impact: 'meaningful',
        caps: { ordinary: 1, meaningful: 1, major: 5, extreme: 10 },
        evidence: 'Mira meaningfully relies on Lucien for a sensitive task.',
    });
    assert.equal(unlocked(after, 25), true, 'The fixed raw >=1 requirement at 25 should remain reachable with a cap of 1');
}

{
    const after = applyEvent(stateAt(50), {
        delta: -2,
        impact: 'meaningful',
        evidence: 'Mira becomes less trusting after Lucien carelessly reveals a private detail.',
    });
    assert(npc(after).relationship.trust < 50, 'Movement back toward neutral was incorrectly milestone-blocked');
}

const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(!scannerSource.includes('Math.min(tierCap, stockMinimum)'), 'Legacy cap-dependent milestone weakening still exists');
assert(scannerSource.includes('Milestone minima are evidence invariants'), 'Invariant gate rationale is missing from scanner implementation');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.8', 'Manifest was not bumped to 0.4.8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
assert(readme.includes('25 = meaningful-or-stronger with at least 1 raw point'), 'README does not document the 25 gate invariant');
assert(readme.includes('50 = major-or-stronger with at least 3 raw points'), 'README does not document the 50 gate invariant');
assert(readme.includes('75 = extreme with at least 5 raw points'), 'README does not document the 75 gate invariant');

console.log('NPC State 0.4.8 relationship milestone gate invariants verification passed');

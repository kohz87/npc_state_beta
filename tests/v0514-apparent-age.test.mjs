import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeActualAge, normalizeApparentAge, normalizeNpc, normalizeState } from '../src/schema.js';

function rangeNumber(value) {
    const match = String(value || '').match(/^~(\d+)$/);
    return match ? Number(match[1]) : NaN;
}

test('apparent-age ranges canonicalize without turning into chronological age', () => {
    assert.equal(normalizeApparentAge('20-30'), '~20-30');
    assert.equal(normalizeApparentAge('~20–30'), '~20-30');
    assert.equal(normalizeApparentAge('about 20 to 30'), '~20-30');
    assert.equal(normalizeApparentAge('22-22'), '~22');
    assert.equal(normalizeApparentAge('30-20'), '');
    assert.equal(normalizeApparentAge('20s'), '');
    assert.equal(normalizeActualAge('20-30'), '');
});

test('NPC identity stably selects one inclusive value from a model-proposed apparent-age range', () => {
    const first = normalizeApparentAge('~20-30', 'npc-guild-clerk');
    const retry = normalizeApparentAge('20 to 30', 'npc-guild-clerk');
    assert.equal(first, retry);
    assert.match(first, /^~\d+$/);
    assert.ok(rangeNumber(first) >= 20 && rangeNumber(first) <= 30);

    const picks = new Set(Array.from({ length: 32 }, (_, index) =>
        normalizeApparentAge('~20-30', `npc-range-${index}`)));
    assert.ok(picks.size > 1, 'different stable NPC identities should not all collapse to one endpoint');
    for (const picked of picks) assert.ok(rangeNumber(picked) >= 20 && rangeNumber(picked) <= 30);
});

test('normalizeNpc persists only the chosen ~N and reload does not reroll it', () => {
    const npc = normalizeNpc({ id: 'npc-guild-clerk', name: 'Guild Clerk', apparentAge: '~20-30' });
    assert.match(npc.apparentAge, /^~\d+$/);
    assert.ok(rangeNumber(npc.apparentAge) >= 20 && rangeNumber(npc.apparentAge) <= 30);

    const state = createEmptyState('chat:v0514-age');
    state.npcs = [npc];
    const once = normalizeState(state, state.chatKey);
    const twice = normalizeState(once, once.chatKey);
    assert.equal(twice.npcs[0].apparentAge, once.npcs[0].apparentAge);
});

test('semantic apparent-age range update resolves to the target NPC stable value before final state leaves the scanner', () => {
    const state = createEmptyState('chat:v0514-semantic-age');
    state.npcs = [normalizeNpc({ id: 'npc-guild-clerk', name: 'Guild Clerk', apparentAge: 'young woman' })];
    const evidence = 'The guild clerk is a slender young woman in a wool waistcoat.';
    const expected = normalizeApparentAge('~20-30', 'npc-guild-clerk');
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-guild-clerk',
            name: 'Guild Clerk',
            evaluatedGroups: ['canon'],
            semanticUpdates: [{
                field: 'apparentAge',
                operation: 'replace',
                value: '~20-30',
                durability: 'durable',
                sources: [{ messageId: 19, excerpt: 'young woman' }],
                explanation: 'The visual description supports a young-adult apparent-age interval.',
            }],
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    }, {
        sourceMessageId: 20,
        turn: 1,
        profileContext: evidence,
        semanticEvidenceContext: evidence,
        currentAdmissionText: evidence,
        allowHistoricalProfilePatches: true,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
    });

    assert.equal(result.state.npcs[0].apparentAge, expected);
    assert.match(result.state.npcs[0].apparentAge, /^~\d+$/);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'apparentAge' && row.status === 'applied'), true);
});

test('Scan and Refresh share one model-led apparent-age range policy with no phrase lookup instruction', () => {
    const state = createEmptyState('chat:v0514-prompt');
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I approach the counter.' },
        { is_user: false, name: 'Narrator', mes: 'A slender young woman in a wool waistcoat waits behind the guild desk.' },
    ];
    const scan = buildScanPrompt({ state, chat, assistantMessageId: 1, playerName: 'Lucien' });
    const npc = normalizeNpc({ id: 'npc-guild-clerk', name: 'Guild Clerk' });
    const refresh = buildTargetedRefreshPrompt({ npc, chat, assistantMessageId: 1, playerName: 'Lucien' });

    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /APPARENT AGE:/);
        assert.match(prompt, /apparentAge=~N-M/i);
        assert.match(prompt, /semantically infer a defensible numeric interval/i);
        assert.match(prompt, /do not use a fixed phrase-to-range lookup/i);
        assert.match(prompt, /backend chooses and persists one stable ~N inside that interval/i);
        assert.doesNotMatch(prompt, /Never invent a numeric range|fabricate a range/i);
    }
});

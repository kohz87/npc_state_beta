import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolvedCurrentAppearance } from '../v03/appearance.js';
import { relationshipEvidenceGrounding } from '../v03/relationship-evidence.js';
import { applyScanResult, parseScanJson, reconcileFamilyGraphState } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

function payload(overrides = {}) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        ...overrides,
    };
}

function apply(state, patch, context, messageId = 1, extra = {}) {
    return applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'],
        inChatNpcIds: ['npc-mira'],
        npcs: [patch],
    }), {
        sourceMessageId: messageId,
        turn: messageId,
        profileContext: context,
        relationshipContext: context,
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        ...extra,
    }).state;
}

// Invalid-but-parseable JSON must fail before it can become an authoritative empty cast.
assert.throws(
    () => parseScanJson('{"unexpected":"value"}'),
    /(?:missing required payload structure|invalid payload structure or members)/i,
);
assert.doesNotThrow(() => parseScanJson(JSON.stringify(payload())));

// Existing-id + another dossier's canonical identity must fail closed.
{
    const state = createEmptyState('identity-collision');
    state.npcs = [
        normalizeNpc({ id: 'npc-mira', name: 'Mira', appearance: 'Mira baseline.' }),
        normalizeNpc({ id: 'npc-sora', name: 'Sora', appearance: 'Sora baseline.' }),
    ];
    const next = applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'],
        inChatNpcIds: ['npc-mira'],
        npcs: [{ id: 'npc-mira', name: 'Sora', appearance: 'Wrong dossier data.' }],
    }), { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
    assert.equal(next.npcs.find(npc => npc.id === 'npc-mira')?.name, 'Mira');
    assert.equal(next.npcs.filter(npc => npc.name === 'Sora').length, 1);
    assert.equal(next.npcs.find(npc => npc.id === 'npc-mira')?.appearance, 'Mira baseline.');
}

// Negated death cannot archive; affirmative target-attributed death can.
{
    const base = createEmptyState('death-negation');
    base.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', lifeState: 'alive' })];
    const denied = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira is not dead.',
    }, 'Mira is not dead. She remains conscious.', 1);
    assert.equal(denied.npcs[0].archived, false);
    assert.notEqual(denied.npcs[0].lifeState, 'dead');

    const confirmed = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira died from her wounds.',
    }, 'Mira died from her wounds.', 2);
    assert.equal(confirmed.npcs[0].archived, true);
    assert.equal(confirmed.npcs[0].lifeState, 'dead');
}

// Canonical appearance comparison and Base synchronization must look past character 160.
{
    const prefix = 'Weathered traveler with ash-brown hair, grey eyes, a narrow face, layered road clothes, old leather gloves, and a calm guarded posture. '.repeat(2);
    assert(prefix.length > 177);
    const oldAppearance = prefix + 'No facial scar.';
    const newAppearance = prefix + 'A permanent scar crosses the left cheek.';
    const evidence = 'Mira now has a permanent scar across her left cheek.';

    const state = createEmptyState('appearance-long');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', appearance: oldAppearance })];
    const ordinary = apply(state, {
        id: 'npc-mira', name: 'Mira', appearance: newAppearance,
        canonChanges: [{ field: 'appearance', value: newAppearance, evidence, mode: 'change' }],
    }, evidence, 1);
    assert.equal(ordinary.npcs[0].appearance, newAppearance);

    const withBase = createEmptyState('appearance-base-long');
    withBase.npcs = [normalizeNpc({
        id: 'npc-mira', name: 'Mira', appearance: oldAppearance, currentForm: 'Base',
        appearanceForms: [{ name: 'Base', appearance: oldAppearance }],
    })];
    const revised = apply(withBase, {
        id: 'npc-mira', name: 'Mira', currentForm: 'Base',
        appearanceFormChanges: [{ name: 'Base', appearance: newAppearance, evidence, mode: 'change' }],
    }, evidence, 2);
    assert.equal(revised.npcs[0].appearance, newAppearance);
    assert.equal(resolvedCurrentAppearance(revised.npcs[0]), newAppearance);
}

// Individually sub-threshold birthdays accumulate against the last visual-aging baseline.
{
    let state = createEmptyState('maturation-cumulative');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', age: '25', apparentAge: '~25' })];

    for (const age of [26, 27, 28]) {
        const evidence = `On her birthday, Mira turned ${age}.`;
        state = apply(state, {
            id: 'npc-mira', name: 'Mira',
            ageChange: { age: String(age), kind: 'birthday', evidence },
            ageProgression: {
                maturation: 'ordinary', meaningful: true, basis: 'Human ordinary maturation.', evidence,
                affectsShared: false, affectedForms: [],
            },
            apparentAge: age === 28 ? '~28' : '~25',
        }, evidence, age);
    }
    assert.equal(state.npcs[0].age, '28');
    assert.equal(state.npcs[0].apparentAge, '~28');
    assert.equal(state.npcs[0].ageProgressionBaselineAge, '28');
}

// Family reconciliation may infer graph edges, but manual Key Relationships locks remain authoritative.
{
    const state = createEmptyState('family-lock');
    state.npcs = [
        normalizeNpc({ id: 'npc-brina', name: 'Brina' }),
        normalizeNpc({ id: 'npc-mira', name: 'Mira', keyRelationships: [], manualProfileFields: ['keyRelationships'] }),
        normalizeNpc({ id: 'npc-sora', name: 'Sora', keyRelationships: [] }),
    ];
    state.familySlots = [{
        id: 'family:npc-brina:child:twins', ownerId: 'npc-brina', relation: 'child', count: 2,
        resolvedNpcIds: ['npc-mira', 'npc-sora'], descriptor: 'twin daughters', twinGroup: 'twins',
        evidence: 'Brina is mother to the twins Mira and Sora.', provenance: 'explicit', confidence: 1,
    }];
    const next = reconcileFamilyGraphState(state, { sourceMessageId: 1 });
    assert.deepEqual(next.npcs.find(npc => npc.id === 'npc-mira')?.keyRelationships, []);
    assert(next.npcs.find(npc => npc.id === 'npc-sora')?.keyRelationships.some(value => /Mira - twin sibling/i.test(value)));
}

// Targeted Refresh must be an allowlist and discard familyFacts/non-target graph state.
{
    const engine = fs.readFileSync('v03/engine.js', 'utf8');
    const marker = "const parsedRaw = await invokeJson(prompt, `targeted-${npc.id}`);";
    const start = engine.indexOf(marker);
    assert(start >= 0, 'Targeted Refresh parser marker missing');
    const window = engine.slice(start, start + 1800);
    assert(window.includes('familyFacts: []'), 'Targeted Refresh does not discard familyFacts');
    assert(!window.includes('...parsedRaw'), 'Targeted Refresh still spreads unrestricted scanner output');
}

// Predicate-local negation accepts valid trust evidence despite unrelated negation.
assert.equal(
    relationshipEvidenceGrounding(
        'Mira trusts Lucien completely.',
        'Mira trusts Lucien completely and does not fear the journey.',
        { subjectNames: ['Mira'], objectNames: ['Lucien'] },
    ),
    '',
);

// Reverse-direction evidence cannot move Mira's trust toward Lucien.
assert.equal(
    relationshipEvidenceGrounding(
        'Lucien trusts Mira completely.',
        'Lucien trusts Mira completely.',
        { subjectNames: ['Mira'], objectNames: ['Lucien'] },
    ),
    'wrong-direction',
);

// Legacy verifier now inspects only its intended identity-directory budget.
{
    const legacy = fs.readFileSync('beta/verify-0.4.1.mjs', 'utf8');
    assert(legacy.includes('const directorySection = prompt.slice'), 'Legacy directory-budget verifier repair missing');
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert(Number(manifest.version.split('.')[2]) >= 11, 'Manifest regressed below 0.4.11');
console.log('NPC State 0.4.11 scanner edge-case hardening verified');

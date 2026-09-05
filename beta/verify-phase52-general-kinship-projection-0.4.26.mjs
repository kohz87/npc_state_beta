import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

function stateWith(owner, extras = [], key = 'kinship-v0426') {
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc(owner), ...extras.map(normalizeNpc)];
    return state;
}

function apply(state, fact, evidence = fact.evidence, messageId = 42, options = {}) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [fact],
    }, {
        sourceMessageId: messageId,
        turn: messageId,
        profileContext: evidence,
        playerName: options.playerName || 'Lucien',
        dossierLimits: options.dossierLimits,
        applyRelationship: false,
    }).state;
}

function namedFact(owner, relation, member, evidence, extra = {}) {
    return { owner, relation, count: 1, members: [member], evidence, ...extra };
}

// Direct named sibling does not require a dossier for the relative.
{
    const base = stateWith({ id: 'npc-greta', name: 'Greta Vane', keyRelationships: [] });
    const fact = namedFact('Greta Vane', 'younger sister', 'Mara', 'Greta introduced Mara as her younger sister.');
    const next = apply(base, fact);
    assert.equal(next.npcs.length, 1, 'Named sibling created a placeholder NPC dossier');
    assert(next.npcs[0].keyRelationships.includes('Mara - younger sister'), 'Named sibling did not project into owner Key relationships');
    assert.deepEqual(next.familySlots[0].memberNames, ['Mara'], 'Named sibling was not persisted in family continuity');
}

// When the sibling has a dossier, preserve the owner's explicit direction and add a safe reciprocal.
{
    const base = stateWith(
        { id: 'npc-greta', name: 'Greta Vane', keyRelationships: [] },
        [{ id: 'npc-mara', name: 'Mara Vane', keyRelationships: [] }],
        'kinship-sibling-reciprocal',
    );
    const fact = namedFact('Greta Vane', 'sister', 'Mara', 'Greta said Mara was her sister.');
    const next = apply(base, fact);
    const greta = next.npcs.find(npc => npc.id === 'npc-greta');
    const mara = next.npcs.find(npc => npc.id === 'npc-mara');
    assert(greta.keyRelationships.includes('Mara Vane - sister'), 'Owner sibling relation was not canonicalized');
    assert(mara.keyRelationships.includes('Greta Vane - sibling'), 'Sibling reciprocal guessed or omitted incorrectly');
}

// Aunts/uncles use a gender-neutral inverse because the owner's gender is not established by the tie.
{
    const base = stateWith(
        { id: 'npc-lyra', name: 'Lyra Vane', keyRelationships: [] },
        [{ id: 'npc-rowan', name: 'Rowan Vane', keyRelationships: [] }],
        'kinship-uncle',
    );
    const fact = namedFact('Lyra Vane', 'uncle', 'Rowan', 'Lyra identified Rowan as her uncle.');
    const next = apply(base, fact);
    const lyra = next.npcs.find(npc => npc.id === 'npc-lyra');
    const rowan = next.npcs.find(npc => npc.id === 'npc-rowan');
    assert(lyra.keyRelationships.includes('Rowan Vane - uncle'), 'Uncle relation missing from owner');
    assert(rowan.keyRelationships.includes('Lyra Vane - niece/nephew'), 'Uncle reciprocal should be gender-neutral niece/nephew');
}

// Cousin is symmetric.
{
    const base = stateWith(
        { id: 'npc-mara', name: 'Mara Vane', keyRelationships: [] },
        [{ id: 'npc-jory', name: 'Jory Vale', keyRelationships: [] }],
        'kinship-cousin',
    );
    const fact = namedFact('Mara Vane', 'cousin', 'Jory', 'Mara called Jory her cousin.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-mara').keyRelationships.includes('Jory Vale - cousin'));
    assert(next.npcs.find(npc => npc.id === 'npc-jory').keyRelationships.includes('Mara Vane - cousin'));
}

// Grandparent/grandchild reciprocal is structural and does not guess gender.
{
    const base = stateWith(
        { id: 'npc-sura', name: 'Sura Vane', keyRelationships: [] },
        [{ id: 'npc-elis', name: 'Elis Vane', keyRelationships: [] }],
        'kinship-grandparent',
    );
    const fact = namedFact('Sura Vane', 'grandmother', 'Elis', 'Sura introduced Elis as her grandmother.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-sura').keyRelationships.includes('Elis Vane - grandmother'));
    assert(next.npcs.find(npc => npc.id === 'npc-elis').keyRelationships.includes('Sura Vane - grandchild'));
}

// Spouses are reciprocal without forcing husband/wife onto the other side.
{
    const base = stateWith(
        { id: 'npc-anna', name: 'Anna Reed', keyRelationships: [] },
        [{ id: 'npc-ren', name: 'Ren Reed', keyRelationships: [] }],
        'kinship-spouse',
    );
    const fact = namedFact('Anna Reed', 'husband', 'Ren', 'Anna introduced Ren as her husband.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-anna').keyRelationships.includes('Ren Reed - husband'));
    assert(next.npcs.find(npc => npc.id === 'npc-ren').keyRelationships.includes('Anna Reed - spouse'));
}

// Guardian/ward and in-law directions are both supported.
{
    const base = stateWith(
        { id: 'npc-ward', name: 'Nia Vale', keyRelationships: [] },
        [{ id: 'npc-guardian', name: 'Tomas Vale', keyRelationships: [] }],
        'kinship-guardian',
    );
    const fact = namedFact('Nia Vale', 'guardian', 'Tomas', 'Nia named Tomas as her legal guardian.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-ward').keyRelationships.includes('Tomas Vale - guardian'));
    assert(next.npcs.find(npc => npc.id === 'npc-guardian').keyRelationships.includes('Nia Vale - ward'));
}
{
    const base = stateWith(
        { id: 'npc-oren', name: 'Oren Pike', keyRelationships: [] },
        [{ id: 'npc-marta', name: 'Marta Pike', keyRelationships: [] }],
        'kinship-in-law',
    );
    const fact = namedFact('Oren Pike', 'mother-in-law', 'Marta', 'Oren introduced Marta as his mother-in-law.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-oren').keyRelationships.includes('Marta Pike - mother-in-law'));
    assert(next.npcs.find(npc => npc.id === 'npc-marta').keyRelationships.includes('Oren Pike - child-in-law'));
}

// Twin/half/step sibling detail may safely survive in the reciprocal without gender guessing.
{
    const base = stateWith(
        { id: 'npc-a', name: 'Ari Vane', keyRelationships: [] },
        [{ id: 'npc-b', name: 'Bela Vane', keyRelationships: [] }],
        'kinship-twin-sibling',
    );
    const fact = namedFact('Ari Vane', 'twin sister', 'Bela', 'Ari called Bela her twin sister.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-a').keyRelationships.includes('Bela Vane - twin sister'));
    assert(next.npcs.find(npc => npc.id === 'npc-b').keyRelationships.includes('Ari Vane - twin sibling'));
}

// Unknown non-family labels must not be smuggled through familyFacts as a generic relationship channel.
{
    const base = stateWith({ id: 'npc-greta', name: 'Greta Vane', keyRelationships: [] }, [], 'kinship-non-family');
    const fact = namedFact('Greta Vane', 'friend', 'Maren', 'Greta called Maren her friend.');
    const next = apply(base, fact);
    assert.deepEqual(next.npcs[0].keyRelationships, [], 'Non-family relation was accepted through familyFacts');
    assert.equal(next.familySlots.length, 0, 'Non-family relation created a family slot');
}

// Manual locks are respected on both sides. The private slot still resolves the relative dossier.
{
    const base = stateWith(
        { id: 'npc-greta', name: 'Greta Vane', keyRelationships: [] },
        [{ id: 'npc-mara', name: 'Mara Vane', keyRelationships: ['Tomas - friend'], manualProfileFields: ['keyRelationships'] }],
        'kinship-counterpart-lock',
    );
    const fact = namedFact('Greta Vane', 'sister', 'Mara', 'Greta said Mara was her sister.');
    const next = apply(base, fact);
    assert(next.npcs.find(npc => npc.id === 'npc-greta').keyRelationships.includes('Mara Vane - sister'));
    assert.deepEqual(next.npcs.find(npc => npc.id === 'npc-mara').keyRelationships, ['Tomas - friend'], 'Reciprocal projection bypassed manual lock');
    assert.deepEqual(next.familySlots[0].resolvedNpcIds, ['npc-mara'], 'Manual lock incorrectly prevented private family resolution');
}

// Existing child/parent and shared-parent twin inference remain intact after generalization.
{
    const base = stateWith(
        { id: 'npc-greta', name: 'Greta Vane', keyRelationships: [] },
        [
            { id: 'npc-lyra', name: 'Lyra Vane', keyRelationships: [] },
            { id: 'npc-talia', name: 'Talia Vane', keyRelationships: [] },
        ],
        'kinship-child-regression',
    );
    const fact = { owner: 'Greta Vane', relation: 'daughter', count: 2, members: ['Lyra', 'Talia'], descriptor: 'twin daughters', twinGroup: 'Greta twins', evidence: 'Greta has twin daughters Lyra and Talia.' };
    const next = apply(base, fact);
    const lyra = next.npcs.find(npc => npc.id === 'npc-lyra');
    const talia = next.npcs.find(npc => npc.id === 'npc-talia');
    assert(lyra.keyRelationships.includes('Greta Vane - parent'), 'Child reciprocal parent relation regressed');
    assert(talia.keyRelationships.includes('Greta Vane - parent'), 'Second child reciprocal parent relation regressed');
    assert(lyra.keyRelationships.includes('Talia Vane - twin sibling'), 'Existing twin inference regressed');
    assert(talia.keyRelationships.includes('Lyra Vane - twin sibling'), 'Existing reciprocal twin inference regressed');
}

// Production prompt contracts expose the generalized relation vocabulary and the foreground
// JSON shape now explicitly carries members, closing the v0.4.25 shape/rule mismatch.
{
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    assert(scanner.includes('const FAMILY_KINSHIP_GROUPS'), 'General kinship classifier missing');
    assert(scanner.includes('reciprocalFamilyRelation'), 'Reciprocal kinship helper missing');
    assert(scanner.includes('resolveFamilySlotMember'), 'Generic family slot resolver missing');
    assert(scanner.includes('upsertFamilyRelationship'), 'Reciprocal Key relationship projector missing');
    for (const marker of ['sister', 'uncle', 'niece', 'cousin', 'grandparent', 'spouse', 'guardian', 'in-law']) {
        assert(scanner.includes(marker), 'Recovery contract/classifier lacks kinship marker: ' + marker);
        assert(injection.includes(marker), 'Foreground contract lacks kinship marker: ' + marker);
    }
    assert(injection.includes('COUNTABLE FAMILY FACTS / GENERAL KINSHIP'), 'Foreground family guidance was not generalized');
    assert(injection.includes('"members":["explicitly named members from current visible evidence"]'), 'Foreground JSON shape still omits familyFacts.members');
    assert(injection.includes('never guess an unknown gender'), 'Foreground reciprocal-gender safety guidance missing');
}

console.log('NPC State 0.4.26 general kinship projection verified');

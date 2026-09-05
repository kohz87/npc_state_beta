import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNpcStateBundle, parseNpcStateBundle } from '../v03/bundle.js';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../v03/schema.js';

function baseState(key = 'family-v0425', extras = []) {
    const state = createEmptyState(key);
    state.npcs = [
        normalizeNpc({ id: 'npc-greta', name: 'Greta Vane', role: 'Guesthouse Keeper', keyRelationships: [] }),
        ...extras.map(npc => normalizeNpc(npc)),
    ];
    return state;
}

function payload(familyFacts = []) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        familyFacts,
    };
}

function apply(state, familyFacts, profileContext, messageId = 12, options = {}) {
    return applyScanResult(state, payload(familyFacts), {
        sourceMessageId: messageId,
        turn: messageId,
        profileContext,
        playerName: options.playerName || 'Lucien',
        dossierLimits: options.dossierLimits,
        applyRelationship: false,
    }).state;
}

const namedTwins = {
    owner: 'Greta Vane',
    relation: 'daughter',
    count: 2,
    members: ['Lyra', 'Talia'],
    descriptor: 'twin daughters',
    twinGroup: 'Greta twins',
    evidence: 'Greta Vane has twin daughters named Lyra and Talia.',
};

// Exact reported failure: named twin daughters must appear in Greta's Key relationships
// even though neither daughter is individually relevant enough to receive a dossier.
{
    const state = apply(baseState('greta-named-twins'), [namedTwins], namedTwins.evidence);
    const greta = state.npcs.find(npc => npc.id === 'npc-greta');
    assert.equal(state.npcs.length, 1, 'Named family fact created daughter placeholder dossiers');
    assert(greta.keyRelationships.includes('Lyra - daughter'), 'Lyra was not projected into Greta keyRelationships');
    assert(greta.keyRelationships.includes('Talia - daughter'), 'Talia was not projected into Greta keyRelationships');
    assert.equal(state.familySlots.length, 1, 'Named twins did not retain their countable family slot');
    assert.deepEqual(state.familySlots[0].memberNames, ['Lyra', 'Talia'], 'Named twins were not persisted in family continuity');
    assert.deepEqual(state.familySlots[0].resolvedNpcIds, [], 'Non-dossier daughters were falsely resolved to NPC ids');
}

// Rescanning the same durable fact must not duplicate owner relationships or member names.
{
    let state = apply(baseState('greta-named-twins-repeat'), [namedTwins], namedTwins.evidence, 12);
    state = apply(state, [namedTwins], namedTwins.evidence, 13);
    const greta = state.npcs.find(npc => npc.id === 'npc-greta');
    assert.equal(greta.keyRelationships.filter(entry => /^Lyra\s+-/i.test(entry)).length, 1, 'Repeated family fact duplicated Lyra relationship');
    assert.equal(greta.keyRelationships.filter(entry => /^Talia\s+-/i.test(entry)).length, 1, 'Repeated family fact duplicated Talia relationship');
    assert.deepEqual(state.familySlots[0].memberNames, ['Lyra', 'Talia'], 'Repeated family fact duplicated slot member names');
}

// Partial naming is allowed: count stays authoritative while only explicitly named members project.
{
    const fact = {
        owner: 'Greta Vane', relation: 'daughter', count: 2, members: ['Lyra'], descriptor: 'twin daughters', twinGroup: 'Greta twins',
        evidence: 'Greta Vane has twin daughters; one is named Lyra.',
    };
    const state = apply(baseState('greta-partial-name'), [fact], fact.evidence);
    const greta = state.npcs[0];
    assert(greta.keyRelationships.includes('Lyra - daughter'), 'Explicitly named partial family member was not projected');
    assert.equal(greta.keyRelationships.length, 1, 'Unnamed twin produced a placeholder key relationship');
    assert.equal(state.familySlots[0].count, 2, 'Partial naming changed the family count');
    assert.deepEqual(state.familySlots[0].memberNames, ['Lyra'], 'Partial named family continuity is wrong');
}

// Existing unnamed-family semantics remain unchanged.
{
    const fact = {
        owner: 'Greta Vane', relation: 'daughter', count: 2, members: [], descriptor: 'twin daughters', twinGroup: 'Greta twins',
        evidence: 'Greta Vane has twin daughters.',
    };
    const state = apply(baseState('greta-unnamed-twins'), [fact], fact.evidence);
    assert.equal(state.npcs.length, 1, 'Unnamed family created fake dossiers');
    assert.deepEqual(state.npcs[0].keyRelationships, [], 'Unnamed family created placeholder key relationships');
    assert.deepEqual(state.familySlots[0].memberNames, [], 'Unnamed family acquired invented member names');
}

// User-owned Key relationships are never mutated by automatic family projection.
{
    const state = baseState('greta-manual-lock');
    state.npcs[0] = normalizeNpc({ ...state.npcs[0], manualProfileFields: ['keyRelationships'], keyRelationships: ['Maren - friend'] });
    const next = apply(state, [namedTwins], namedTwins.evidence);
    assert.deepEqual(next.npcs[0].keyRelationships, ['Maren - friend'], 'Manual keyRelationships lock was bypassed');
    assert.deepEqual(next.familySlots[0].memberNames, ['Lyra', 'Talia'], 'Manual lock incorrectly discarded private family continuity');
}

// If matching daughter dossiers already exist under full canonical names, unique short names
// resolve safely, canonicalize the owner's entries, and enable the existing twin inference.
{
    const state = baseState('greta-existing-daughters', [
        { id: 'npc-lyra', name: 'Lyra Vane', keyRelationships: [] },
        { id: 'npc-talia', name: 'Talia Vane', keyRelationships: [] },
    ]);
    const next = apply(state, [namedTwins], namedTwins.evidence);
    const greta = next.npcs.find(npc => npc.id === 'npc-greta');
    const lyra = next.npcs.find(npc => npc.id === 'npc-lyra');
    const talia = next.npcs.find(npc => npc.id === 'npc-talia');
    assert(greta.keyRelationships.includes('Lyra Vane - daughter'), 'Existing Lyra dossier was not canonicalized in Greta relationship');
    assert(greta.keyRelationships.includes('Talia Vane - daughter'), 'Existing Talia dossier was not canonicalized in Greta relationship');
    assert.deepEqual(new Set(next.familySlots[0].resolvedNpcIds), new Set(['npc-lyra', 'npc-talia']), 'Named twins did not resolve to existing dossiers');
    assert(lyra.keyRelationships.includes('Talia Vane - twin sibling'), 'Twin inference did not reach Lyra');
    assert(talia.keyRelationships.includes('Lyra Vane - twin sibling'), 'Twin inference did not reach Talia');
}

// Shared short names fail closed for dossier resolution. The explicit family name itself is
// still valid owner continuity, but it must not be attached to an arbitrary Lyra dossier.
{
    const fact = { owner: 'Greta Vane', relation: 'daughter', count: 1, members: ['Lyra'], evidence: 'Greta Vane has a daughter named Lyra.' };
    const state = baseState('greta-ambiguous-lyra', [
        { id: 'npc-lyra-vane', name: 'Lyra Vane' },
        { id: 'npc-lyra-cole', name: 'Lyra Cole' },
    ]);
    const next = apply(state, [fact], fact.evidence);
    assert(next.npcs[0].keyRelationships.includes('Lyra - daughter'), 'Explicit ambiguous family name disappeared from owner continuity');
    assert.deepEqual(next.familySlots[0].resolvedNpcIds, [], 'Ambiguous short name selected an arbitrary daughter dossier');
}

// Member names must be present in public profile evidence. A generic visible family fact may
// store the count, but names supplied only by structured/private material are not promoted.
{
    const publicContext = 'Greta Vane says she has twin daughters.';
    const fact = { ...namedTwins, evidence: 'Greta Vane has twin daughters.' };
    const next = apply(baseState('greta-structured-names-only'), [fact], publicContext);
    assert.deepEqual(next.npcs[0].keyRelationships, [], 'Names absent from public evidence were promoted into keyRelationships');
    assert.deepEqual(next.familySlots[0].memberNames, [], 'Names absent from public evidence entered durable family continuity');
    assert.equal(next.familySlots[0].count, 2, 'Grounded unnamed family count was lost while rejecting structured-only names');
}

// Player-family facts never leak into the non-player Key relationships surface.
{
    const fact = { owner: 'Greta Vane', relation: 'son', count: 1, members: ['Lucien'], evidence: 'Greta Vane says Lucien is her son.' };
    const next = apply(baseState('greta-player-family'), [fact], fact.evidence, 12, { playerName: 'Lucien' });
    assert.deepEqual(next.npcs[0].keyRelationships, [], 'Player identity leaked into non-player keyRelationships');
    assert.deepEqual(next.familySlots[0].memberNames, [], 'Player identity leaked into named family slot members');
}

// Named member continuity survives normalization and portable bundles, while older slots that
// predate memberNames remain backward compatible.
{
    const state = apply(baseState('greta-bundle-members'), [namedTwins], namedTwins.evidence);
    const normalized = normalizeState(structuredClone(state), state.chatKey);
    assert.deepEqual(normalized.familySlots[0].memberNames, ['Lyra', 'Talia'], 'State normalization lost family member names');
    const bundle = createNpcStateBundle(state, { sourceNarrativeTurn: 12 });
    const parsed = parseNpcStateBundle(bundle);
    assert.deepEqual(parsed.data.familySlots[0].memberNames, ['Lyra', 'Talia'], 'Portable bundle lost family member names');
    const legacy = structuredClone(bundle);
    delete legacy.data.familySlots[0].memberNames;
    const parsedLegacy = parseNpcStateBundle(legacy);
    assert.deepEqual(parsedLegacy.data.familySlots[0].memberNames, [], 'Older family slot without memberNames became incompatible');
}

// Source-level contract guards.
{
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const schema = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    assert(scanner.includes('groundedFamilyMemberNames'), 'Grounded family member extractor missing');
    assert(scanner.includes('projectFamilySlotMembers'), 'Family key relationship projector missing');
    assert(scanner.includes('familyMemberNpc'), 'Family short-name resolver missing');
    assert(scanner.includes("members: ['explicitly named members from visible evidence; [] when unnamed']"), 'Recovery family member contract missing');
    assert(schema.includes('memberNames'), 'Family slot schema does not persist named members');
    assert(injection.includes('members MUST list each family member whose personal name is explicitly established in the current visible exchange'), 'Foreground named-family contract missing');
    assert(injection.includes('MUST NOT create NPC dossiers by themselves'), 'Named family admission isolation missing');
}

console.log('NPC State 0.4.25 named family key-relationship projection verified');

import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { createNpcStateBundle, parseNpcStateBundle } from '../v03/bundle.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

function familyState() {
    const state = createEmptyState('phase4');
    state.npcs = [
        normalizeNpc({ id: 'npc-brina-p4', name: 'Brina', keyRelationships: ['Maren - friend'] }),
        normalizeNpc({ id: 'npc-astra-p4', name: 'Astra' }),
        normalizeNpc({ id: 'npc-kiri-p4', name: 'Kiri' }),
        normalizeNpc({ id: 'npc-maren-p4', name: 'Maren' }),
    ];
    return state;
}

function apply(state, result, messageId = 2) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], socialEdges: [], familyFacts: [], npcs: [],
        ...result,
    }, { sourceMessageId: messageId, turn: messageId, applyReturnedNpcPatches: true }).state;
}

const npc = (state, name) => state.npcs.find(item => item.name === name);

// Omitted key relationships are preserved while the affected counterpart is merged in.
{
    let state = familyState();
    state = apply(state, { npcs: [{ id: 'npc-brina-p4', name: 'Brina', keyRelationships: ['Astra - daughter'] }] });
    const rels = npc(state, 'Brina').keyRelationships;
    assert(rels.includes('Maren - friend'), 'Omitted existing key relationship was erased');
    assert(rels.includes('Astra - daughter'), 'New key relationship was not merged');

    state = apply(state, { npcs: [{ id: 'npc-brina-p4', name: 'Brina', keyRelationships: ['Maren - estranged friend'] }] }, 3);
    const revised = npc(state, 'Brina').keyRelationships;
    assert(revised.includes('Maren - estranged friend'), 'Same-counterpart key relationship was not revised');
    assert(!revised.includes('Maren - friend'), 'Old same-counterpart relationship remained beside its revision');
    assert(revised.includes('Astra - daughter'), 'Revising one counterpart erased another relationship');
}

// Explicit removals require evidence and cannot be triggered by omission or an empty array.
{
    let state = familyState();
    state = apply(state, { npcs: [{ id: 'npc-brina-p4', name: 'Brina', keyRelationships: [] }] });
    assert(npc(state, 'Brina').keyRelationships.includes('Maren - friend'), 'Empty scanner keyRelationships cleared established ties');
    state = apply(state, { npcs: [{ id: 'npc-brina-p4', name: 'Brina', keyRelationshipChanges: [{ other: 'Maren', action: 'remove', evidence: '' }] }] }, 3);
    assert(npc(state, 'Brina').keyRelationships.includes('Maren - friend'), 'Evidence-free relationship removal succeeded');
    state = apply(state, { npcs: [{ id: 'npc-brina-p4', name: 'Brina', keyRelationshipChanges: [{ other: 'Maren', action: 'remove', evidence: 'Brina explicitly ends the friendship and says they are no longer friends.' }] }] }, 4);
    assert(!npc(state, 'Brina').keyRelationships.some(entry => entry.startsWith('Maren -')), 'Explicit evidence-backed relationship removal failed');
}

// Countable unnamed family creates a private slot, never placeholder dossiers.
{
    let state = familyState();
    const beforeCount = state.npcs.length;
    state = apply(state, {
        familyFacts: [{ owner: 'Brina', relation: 'daughter', count: 2, descriptor: 'twin daughters', twinGroup: 'Brina twins', evidence: 'Brina explicitly says she has twin daughters.' }],
    });
    assert(state.npcs.length === beforeCount, 'Unnamed daughters created fake NPC dossiers');
    assert(state.familySlots.length === 1, 'Countable family fact did not create one bounded family slot');
    const slot = state.familySlots[0];
    assert(slot.ownerId === 'npc-brina-p4' && slot.count === 2 && slot.resolvedNpcIds.length === 0, 'Family slot identity/count is wrong');
    assert(slot.twinGroup === 'Brina twins', 'Twin-group continuity was not retained');
}

// Later named children resolve the slot from either direction and infer twin sibling continuity.
{
    let state = familyState();
    state = apply(state, {
        familyFacts: [{ owner: 'Brina', relation: 'daughter', count: 2, descriptor: 'twin daughters', twinGroup: 'Brina twins', evidence: 'Brina has twin daughters.' }],
    });
    state = apply(state, {
        npcs: [
            { id: 'npc-astra-p4', name: 'Astra', keyRelationships: ['Brina - mother'] },
            { id: 'npc-kiri-p4', name: 'Kiri', keyRelationships: ['Brina - mother'] },
        ],
    }, 3);
    const slot = state.familySlots[0];
    assert(slot.resolvedNpcIds.includes('npc-astra-p4') && slot.resolvedNpcIds.includes('npc-kiri-p4'), 'Named daughters did not partially/fully resolve family slot');
    const siblingEdge = state.socialGraph.find(edge => {
        const ids = new Set([edge.fromId, edge.toId]);
        return ids.has('npc-astra-p4') && ids.has('npc-kiri-p4') && edge.relation === 'twin sibling';
    });
    assert(siblingEdge?.inferred === true && siblingEdge?.provenance === 'inferred', 'Twin sibling graph inference missing provenance');
    assert(npc(state, 'Astra').keyRelationships.includes('Kiri - twin sibling'), 'Twin inference was not projected into Astra key relationships');
    assert(npc(state, 'Kiri').keyRelationships.includes('Astra - twin sibling'), 'Twin inference was not projected into Kiri key relationships');
}

// Explicit social edges keep explicit provenance and are not confused with inferred edges.
{
    let state = familyState();
    state = apply(state, {
        socialEdges: [{ from: 'Astra', to: 'Kiri', relation: 'rival', summary: 'They compete openly.', provenance: 'explicit' }],
        npcs: [{ id: 'npc-astra-p4', name: 'Astra' }, { id: 'npc-kiri-p4', name: 'Kiri' }],
        exchangeActiveNpcIds: ['Astra', 'Kiri'], inChatNpcIds: ['Astra', 'Kiri'],
    });
    const edge = state.socialGraph.find(item => item.relation === 'rival');
    assert(edge?.provenance === 'explicit' && edge?.confidence === 1 && edge?.inferred === false, 'Explicit social-edge provenance was not preserved');
}

// Family slots survive portable full-chat bundles without becoming a required field for older bundles.
{
    let state = familyState();
    state = apply(state, { familyFacts: [{ owner: 'Brina', relation: 'daughter', count: 2, evidence: 'Brina has two daughters.' }] });
    const bundle = createNpcStateBundle(state, { sourceNarrativeTurn: 3 });
    assert(Array.isArray(bundle.data.familySlots) && bundle.data.familySlots.length === 1, 'Full-chat bundle omitted family slots');
    const parsed = parseNpcStateBundle(bundle);
    assert(parsed.data.familySlots.length === 1, 'Bundle parser did not preserve family slots');
    const legacyCompatible = structuredClone(bundle);
    delete legacyCompatible.data.familySlots;
    const parsedLegacy = parseNpcStateBundle(legacyCompatible);
    assert(Array.isArray(parsedLegacy.data.familySlots) && parsedLegacy.data.familySlots.length === 0, 'Older bundle without familySlots became invalid');
}

// Prompt/state architecture checks.
{
    const schema = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    assert(schema.includes('normalizeFamilySlots') && schema.includes('familySlots: []'), 'Family slot state schema missing');
    assert(scanner.includes('mergeKeyRelationshipPatch') && scanner.includes('reconcileFamilyGraphState'), 'Key merge/family reconcile backend missing');
    assert(scanner.includes('familyFacts') && injection.includes('COUNTABLE UNNAMED FAMILY'), 'Family-fact scanner contract missing');
    assert(injection.includes('counterpart MERGE PATCH'), 'Foreground key relationship merge semantics missing');
    assert(engine.includes('state.familySlots') && engine.includes('reconcileFamilyGraphState'), 'Manual/delete family lifecycle wiring missing');
    assert(!injection.includes('resolvedNpcIds'), 'Private family slot internals leaked into RP injection');
}

console.log('NPC State 0.4.2 phase 4 family graph and key-relationship merge verification passed');

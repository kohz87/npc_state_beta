import fs from 'node:fs';
import { createEmptyState } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// A model-invented id for a genuinely new NPC must never become the stable database id.
{
    const inventedId = 'npc-clerk-master-orin';
    const result = applyScanResult(createEmptyState('id-authority-new'), {
        exchangeActiveNpcIds: [inventedId],
        inChatNpcIds: [inventedId],
        worldActiveNpcIds: [],
        npcs: [{
            id: inventedId,
            name: 'Master Orin',
            role: 'Clerk',
            status: 'Reviewing the guild ledger at the front desk',
        }],
        socialEdges: [],
    }, { sourceMessageId: 7, turn: 1, applyReturnedNpcPatches: true });

    assert(result.state.npcs.length === 1, 'Invented new-NPC id created duplicate/missing dossier');
    const orin = result.state.npcs[0];
    assert(orin.name === 'Master Orin', 'Canonical proper name was not preserved');
    assert(orin.role === 'Clerk', 'Role was not kept separate from the proper name');
    assert(orin.id !== inventedId, 'Model-invented id was accepted as stable state id');
    assert(/^npc-master-orin-[a-z0-9]+$/i.test(orin.id), 'Locally generated id did not derive from canonical name');
    assert(result.exchangeActiveNpcIds.includes(orin.id), 'Invented activity reference did not resolve to locally allocated id');
    assert(result.finalPresentNpcIds.includes(orin.id), 'Invented in-chat reference did not resolve to locally allocated id');
}

// An unknown id on a later update must reconcile to the exact existing name rather than
// create a second dossier or drop the update.
{
    const seeded = applyScanResult(createEmptyState('id-authority-existing'), {
        exchangeActiveNpcIds: ['Master Orin'],
        inChatNpcIds: ['Master Orin'],
        worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Master Orin', role: 'Clerk', status: 'Sorting petitions' }],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true });
    const stableId = seeded.state.npcs[0].id;

    const updated = applyScanResult(seeded.state, {
        exchangeActiveNpcIds: ['npc-clerk-master-orin'],
        inChatNpcIds: ['npc-clerk-master-orin'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-clerk-master-orin', name: 'Master Orin', role: 'Clerk', status: 'Explaining the fee schedule' }],
        socialEdges: [],
    }, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true });

    assert(updated.state.npcs.length === 1, 'Unknown model id duplicated an existing same-name dossier');
    assert(updated.state.npcs[0].id === stableId, 'Existing stable id was replaced by model-invented id');
    assert(updated.state.npcs[0].status === 'Explaining the fee schedule', 'Same-name reconciliation dropped returned update');
    assert(updated.exchangeActiveNpcIds.includes(stableId), 'Unknown activity id did not resolve to existing stable dossier');
}

// Same-payload social edges that use invented ids must still resolve after local id allocation.
{
    const result = applyScanResult(createEmptyState('id-authority-edge'), {
        exchangeActiveNpcIds: ['npc-clerk-master-orin', 'npc-guard-lena'],
        inChatNpcIds: ['npc-clerk-master-orin', 'npc-guard-lena'],
        worldActiveNpcIds: [],
        npcs: [
            { id: 'npc-clerk-master-orin', name: 'Master Orin', role: 'Clerk' },
            { id: 'npc-guard-lena', name: 'Lena', role: 'Guard' },
        ],
        socialEdges: [{ from: 'npc-clerk-master-orin', to: 'npc-guard-lena', relation: 'coworkers', summary: 'Work the same guild hall.' }],
    }, { sourceMessageId: 3, turn: 1, applyReturnedNpcPatches: true });

    const orin = result.state.npcs.find(npc => npc.name === 'Master Orin');
    const lena = result.state.npcs.find(npc => npc.name === 'Lena');
    assert(orin && lena, 'Invented ids prevented multi-NPC creation');
    assert(result.state.socialGraph.some(edge => {
        const ids = new Set([edge.fromId, edge.toId]);
        return ids.has(orin.id) && ids.has(lena.id) && edge.relation === 'coworkers';
    }), 'Social edge using invented ids did not resolve to local stable ids');
}

{
    const injection = file('v03/injection.js');
    const scanner = file('v03/scanner.js');
    assert(injection.includes('if a proper/personal name is known in this response'), 'Foreground proper-name priority rule missing');
    assert(injection.includes('Never invent an npc-* id'), 'Foreground new-id authority rule missing');
    assert(scanner.includes('NPC State assigns the stable id locally'), 'Recovery scanner new-id authority rule missing');
    assert(scanner.includes('id: makeNpcId(name'), 'New dossier creation still accepts returned model id');
}

console.log('NPC State 0.4.1 new-NPC ID authority verification passed');

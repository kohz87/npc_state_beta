import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// If the model puts its invented machine key in both id and name but also returns the
// grounded human name as an alias, the alias must become the dossier display name.
{
    const machine = 'npc-clerk-master-orin';
    const result = applyScanResult(createEmptyState('display-name-alias'), {
        exchangeActiveNpcIds: [machine],
        inChatNpcIds: [machine],
        worldActiveNpcIds: [],
        npcs: [{ id: machine, name: machine, aliases: ['Master Orin'], role: 'Clerk', status: 'Reviewing the guild ledger' }],
        socialEdges: [],
    }, { sourceMessageId: 11, turn: 1, applyReturnedNpcPatches: true });

    assert(result.state.npcs.length === 1, 'Alias-backed technical-name bootstrap did not create exactly one dossier');
    const orin = result.state.npcs[0];
    assert(orin.name === 'Master Orin', 'Human alias was not promoted over npc-* machine name');
    assert(!orin.name.toLowerCase().startsWith('npc-'), 'Technical machine name leaked into dossier display name');
    assert(/^npc-master-orin-[a-z0-9]+$/i.test(orin.id), 'Stable id was not allocated from promoted canonical name');
    assert(result.finalPresentNpcIds.includes(orin.id), 'Machine activity reference did not resolve to promoted dossier');
}

// If the patch aliases are empty but the activity arrays carry the grounded human name,
// a related human reference embedded in the machine slug may recover the display name.
{
    const machine = 'npc-clerk-master-orin';
    const result = applyScanResult(createEmptyState('display-name-reference'), {
        exchangeActiveNpcIds: [machine, 'Master Orin'],
        inChatNpcIds: ['Master Orin'],
        worldActiveNpcIds: [],
        npcs: [{ id: machine, name: machine, aliases: [], role: 'Clerk', status: 'Answering a question' }],
        socialEdges: [],
    }, { sourceMessageId: 12, turn: 1, applyReturnedNpcPatches: true });

    assert(result.state.npcs.length === 1, 'Reference-backed technical-name bootstrap did not create exactly one dossier');
    assert(result.state.npcs[0].name === 'Master Orin', 'Human activity reference was not promoted over machine-shaped name');
}

// A machine-only identity has no trustworthy human-facing name. It must fail closed rather
// than poison the persistent roster with the transport key.
{
    const machine = 'npc-clerk-master-orin';
    const result = applyScanResult(createEmptyState('display-name-fail-closed'), {
        exchangeActiveNpcIds: [machine],
        inChatNpcIds: [machine],
        worldActiveNpcIds: [],
        npcs: [{ id: machine, name: machine, aliases: [], role: 'Clerk' }],
        socialEdges: [],
    }, { sourceMessageId: 13, turn: 1, applyReturnedNpcPatches: true });

    assert(result.state.npcs.length === 0, 'Machine-only identity was persisted as a dossier name instead of failing closed');
}

// Existing good display names must never be overwritten by a later technical machine name.
{
    const seeded = applyScanResult(createEmptyState('display-name-existing'), {
        exchangeActiveNpcIds: ['Master Orin'],
        inChatNpcIds: ['Master Orin'],
        worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Master Orin', aliases: [], role: 'Clerk' }],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true });
    const stableId = seeded.state.npcs[0].id;

    const updated = applyScanResult(seeded.state, {
        exchangeActiveNpcIds: [stableId],
        inChatNpcIds: [stableId],
        worldActiveNpcIds: [],
        npcs: [{ id: stableId, name: 'npc-clerk-master-orin', aliases: [], role: 'Clerk', status: 'Sorting forms' }],
        socialEdges: [],
    }, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true });

    assert(updated.state.npcs[0].name === 'Master Orin', 'Technical patch name overwrote an existing human display name');
    assert(updated.state.npcs[0].status === 'Sorting forms', 'Rejecting technical name incorrectly discarded other grounded patch fields');
}

// Old affected dossiers can self-repair when a trustworthy human alias already exists.
{
    const state = createEmptyState('display-name-repair');
    state.npcs = [normalizeNpc({
        id: 'npc-bad-old-id',
        name: 'npc-clerk-master-orin',
        aliases: ['Master Orin'],
        role: 'Clerk',
        present: true,
    })];
    const repaired = applyScanResult(state, {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
    }, { sourceMessageId: 20, turn: 2, preservePresence: true });

    assert(repaired.state.npcs[0].name === 'Master Orin', 'Existing technical display name did not self-repair from trustworthy alias');
    assert(!(repaired.state.npcs[0].aliases || []).some(alias => String(alias).toLowerCase().startsWith('npc-')), 'Technical name remained as a visible alias after repair');
}

{
    const injection = file('v03/injection.js');
    const scanner = file('v03/scanner.js');
    assert(injection.includes('npcs.name is human-facing display text'), 'Foreground human-facing display-name rule missing');
    assert(injection.includes('MUST NEVER begin with npc-'), 'Foreground npc-* display-name ban missing');
    assert(scanner.includes('function isTechnicalNpcIdentity'), 'Deterministic machine-name detector missing');
    assert(scanner.includes('function canonicalPatchName'), 'Deterministic canonical display-name resolver missing');
    assert(scanner.includes('repairTechnicalStoredName'), 'Existing technical-name repair path missing');
}

console.log('NPC State 0.4.1 display-name authority verification passed');

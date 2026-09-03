import fs from 'node:fs';
import { createEmptyState } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// Secondary existing NPC patches should carry their explicit NPC-to-NPC edge with them
// even if the model imperfectly omitted both endpoints from the activity arrays.
{
    const seeded = applyScanResult(createEmptyState('returned-edge-test'), {
        exchangeActiveNpcIds: ['Astra', 'Kiri', 'Brina'],
        inChatNpcIds: ['Astra', 'Kiri', 'Brina'],
        worldActiveNpcIds: [],
        npcs: [
            { id: '', name: 'Astra', role: 'daughter' },
            { id: '', name: 'Kiri', role: 'daughter' },
            { id: '', name: 'Brina', role: 'mother' },
        ],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1 });

    const byName = name => seeded.state.npcs.find(npc => npc.name === name);
    const updated = applyScanResult(seeded.state, {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [
            { id: byName('Astra').id, name: 'Astra', status: 'ready' },
            { id: byName('Kiri').id, name: 'Kiri', keyRelationships: ['Brina - mother'] },
            { id: byName('Brina').id, name: 'Brina', keyRelationships: ['Kiri - daughter'] },
        ],
        socialEdges: [
            { from: 'Kiri', to: 'Brina', relation: 'daughter/mother', summary: 'Explicit family relationship.' },
        ],
    }, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true });

    assert(updated.state.socialGraph.some(edge => {
        const ids = new Set([edge.fromId, edge.toId]);
        return ids.has(byName('Kiri').id) && ids.has(byName('Brina').id) && edge.relation === 'daughter/mother';
    }), 'Social edge between secondary returned NPCs was discarded');
}

// Lifecycle safety invariants live around SillyTavern integration and are guarded here
// structurally in addition to the generated runtime syntax/behavior suite.
{
    const engine = file('v03/engine.js');
    const index = file('v03/index.js');
    assert(engine.includes('const alreadyScannedMessage = state.lastScannedMessageId === messageId'), 'Repeated-scan idempotence flag missing');
    assert(engine.includes('applyRelationship: !alreadyScannedMessage'), 'Repeated forced scan can replay relationship deltas');
    assert(engine.includes("typeof options.expectedMessageText === 'string'"), 'Pre-lock embedded expected-message guard missing');
    assert(index.includes('expectedMessageText: consumed.cleanedText'), 'Foreground expected-message text is not wired into embedded apply');
    assert(index.includes("settings.enabled === false || settings.autoScan === false"), 'Disabled foreground quiet path missing');
    assert(index.includes('stripNpcTransportOnly(id);'), 'Disabled foreground path does not clean stray transport');
    assert(index.includes('if (swipe) return swipe.extra?.npc_state_beta_v1 || null;'), 'Active swipe can still fall back to another swipe message payload');
}

console.log('NPC State 0.4.1 final foreground/replay verification passed');

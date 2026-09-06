import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

const memories = [
    'Lucien rescued Sora from a charging boar beside the frozen road.',
    'Lucien taught Sora to read animal tracks in fresh snow.',
    'Lucien gave Sora a small brass whistle for emergencies.',
    'Sora promised Lucien that she would protect Ryu if they were separated.',
    'Sora discovered a hidden warm spring beneath the old tower.',
    'Lucien treated Sora after thorn-vine cuts during the forest crossing.',
];

function patchState(state, patchMemories, sourceMessageId, dossierLimits = { memories: 8 }) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-sora-memory-44'],
        inChatNpcIds: ['npc-sora-memory-44'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-sora-memory-44',
            name: 'Sora',
            memories: patchMemories,
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No new player-relationship change.' },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    }, {
        sourceMessageId,
        turn: sourceMessageId,
        applyReturnedNpcPatches: true,
        dossierLimits,
    }).state;
}

let state = createEmptyState('phase90-memory');
state.npcs = [normalizeNpc({ id: 'npc-sora-memory-44', name: 'Sora', memories: [memories[0]] }, { dossierLimits: { memories: 8 } })];

// The schema-default [] must be a no-op for an existing NPC rather than a destructive clear.
state = patchState(state, [], 2);
assert.deepEqual(state.npcs[0].memories, [memories[0]], 'Empty existing-NPC memory patch cleared durable memory');

// Repeated turns must accumulate distinct important events instead of replacing the collection each turn.
for (let i = 1; i < memories.length; i += 1) state = patchState(state, [memories[i]], i + 2);
assert.equal(state.npcs[0].memories.length, 6, 'Distinct memories did not accumulate beyond the model-sized 1-3 item patch');
for (const memory of memories) assert(state.npcs[0].memories.includes(memory), 'Accumulated durable memory disappeared: ' + memory);

// A richer paraphrase of the same event may refine that slot without consuming another slot.
const richerRescue = 'Lucien rescued Sora from the charging boar beside the frozen road, pulling her behind a stone marker before impact.';
state = patchState(state, [richerRescue], 10);
assert.equal(state.npcs[0].memories.length, 6, 'Richer duplicate memory consumed an extra slot');
assert(state.npcs[0].memories.includes(richerRescue), 'Richer duplicate did not refine the stored memory');

// null/omission semantics remain non-destructive as well.
const beforeNull = structuredClone(state.npcs[0].memories);
state = patchState(state, null, 11);
assert.deepEqual(state.npcs[0].memories, beforeNull, 'Null existing-NPC memory patch changed durable memory');

// The configured cap still applies, but reaching it never authorizes a routine new patch to erase older memories.
let capped = createEmptyState('phase90-memory-cap');
capped.npcs = [normalizeNpc({ id: 'npc-sora-memory-44', name: 'Sora', memories: memories.slice(0, 5) })];
capped = patchState(capped, ['Sora mapped a seventh route through the eastern ravine.'], 20, { memories: 5 });
assert.equal(capped.npcs[0].memories.length, 5, 'Configured Important Memories cap was exceeded');
for (const memory of memories.slice(0, 5)) assert(capped.npcs[0].memories.includes(memory), 'Full-cap scan evicted an established memory without explicit authority');

const chat = [
    { is_user: true, is_system: false, mes: 'Sora remembers another important day.' },
    { is_user: false, is_system: false, mes: 'Sora quietly adds the new event to what she remembers.' },
];
const scanPrompt = buildScanPrompt({ state, chat, assistantMessageId: 1, dossierLimits: { memories: 8 } });
assert(scanPrompt.includes('DURABLE IMPORTANT MEMORY MERGE'), 'Recovery/full-scan prompt lacks durable-memory merge semantics');
assert(scanPrompt.includes('memories: [] means no memory additions'), 'Recovery/full-scan prompt does not make empty memory patches safe');
const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 5000, dossierLimits: { memories: 8 } });
assert(injection.includes('DURABLE IMPORTANT MEMORY MERGE'), 'Foreground prompt lacks durable-memory merge semantics');
assert(injection.includes('memories: [] means no additions'), 'Foreground prompt does not make empty memory patches safe');

const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(scannerSource.includes('PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE'), 'Durable-memory backend marker missing');
assert(scannerSource.includes('normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Existing memories are not merged before semantic compaction');
assert(!scannerSource.includes('? normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Memory persistence must not depend on supplementalPass');

console.log('PASS v0.4.44 durable Important Memories merge');

import fs from 'node:fs';
import { createEmptyState, memoriesSemanticallyDuplicate, normalizeMemoryEntries, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const rescueA = 'Lucien rescued Sora from the charging boar.';
const rescueB = 'Lucien saved Sora when the boar charged at her, pulling her behind the rocks.';
const training = 'Lucien taught Sora to track boars by reading hoofprints in frozen soil.';
const secondRescue = 'Lucien rescued Sora from a river flood several weeks later.';
assert(memoriesSemanticallyDuplicate(rescueA, rescueB), 'Obvious same-event rescue paraphrases were not recognized');
assert(!memoriesSemanticallyDuplicate(rescueA, training), 'Shared people/topic incorrectly merged rescue and training');
assert(!memoriesSemanticallyDuplicate(rescueA, secondRescue), 'Two distinct rescue events were collapsed merely because the actors matched');

const compacted = normalizeMemoryEntries([
    rescueA,
    rescueB,
    training,
    'Sora remembers Lucien teaching her to read boar tracks in frozen soil.',
]);
assert(compacted.length === 2, 'Semantic memory compaction did not collapse the two duplicate event pairs');
assert(compacted.some(item => item.includes('pulling her behind the rocks')), 'Richer duplicate rescue memory was not retained');
assert(compacted.some(item => /track boars|boar tracks/.test(item)), 'Distinct training memory disappeared');

// Legacy stored duplicates compact during ordinary normalization as well.
const legacy = normalizeNpc({
    id: 'npc-sora-memory',
    name: 'Sora',
    memories: [rescueA, rescueB, training],
});
assert(legacy.memories.length === 2, 'Legacy dossier memory duplicates survived normalization');

// Scanner replacement arrays receive the same semantic hygiene.
let state = createEmptyState('phase3-memory');
state.npcs = [normalizeNpc({ id: 'npc-sora-memory', name: 'Sora', memories: ['An older unrelated memory.'] })];
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['npc-sora-memory'],
    inChatNpcIds: ['npc-sora-memory'],
    worldActiveNpcIds: [],
    npcs: [{
        id: 'npc-sora-memory',
        name: 'Sora',
        memories: [rescueA, rescueB, training],
        relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
    }],
    socialEdges: [],
}, { sourceMessageId: 4, turn: 4, applyReturnedNpcPatches: true }).state;
const sora = state.npcs.find(npc => npc.id === 'npc-sora-memory');
assert(sora.memories.length === 2, 'Scanner memory array was not semantically compacted');
assert(!sora.memories.includes('An older unrelated memory.'), 'Authoritative memory replacement semantics were accidentally changed into append-only behavior');

const limited = normalizeMemoryEntries([
    'Mira promised to return the silver key.',
    'Mira discovered the hidden gate beneath the chapel.',
    'Mira was wounded by the ash wolf.',
], 2);
assert(limited.length === 2, 'Configured memory cap was not respected');

const chat = [
    { is_user: true, is_system: false, mes: 'Sora recalls the boar incident.' },
    { is_user: false, is_system: false, mes: 'Sora remembers Papa pulling her clear when the boar charged.' },
];
const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(prompt.includes('MEMORY SEMANTIC HYGIENE'), 'Recovery scanner memory semantic-hygiene rule missing');
const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 5000 });
assert(injection.includes('MEMORY SEMANTIC HYGIENE'), 'Foreground memory semantic-hygiene rule missing');

const schemaSource = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(schemaSource.includes('export function normalizeMemoryEntries'), 'Shared semantic memory normalizer missing');
assert(scannerSource.includes('normalizeMemoryEntries(patch.memories'), 'Scanner does not use semantic memory normalizer');

console.log('NPC State 0.4.3 Phase 3 memory hygiene verification passed');

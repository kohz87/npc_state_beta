import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection, runtimeNpcSalience } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function baseState() {
    const state = createEmptyState('phase2-v043');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-phase2',
        name: 'Mira',
        role: 'Innkeeper',
        species: 'Human',
        appearance: 'Five-foot-five woman with brown hair and gray eyes.',
        background: 'Born and raised in the river village of Harth.',
        importance: 20,
        present: true,
    })];
    state.lastObservation = { exchangeActiveNpcIds: ['npc-mira-phase2'], finalPresentNpcIds: ['npc-mira-phase2'], worldActiveNpcIds: [] };
    return state;
}

function applyPatch(state, patch, context) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-phase2'],
        inChatNpcIds: ['npc-mira-phase2'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-phase2', name: 'Mira', relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' }, ...patch }],
        socialEdges: [],
    }, { sourceMessageId: 12, turn: 12, profileContext: context, applyReturnedNpcPatches: true }).state;
}

let state = baseState();
state = applyPatch(state, {
    role: 'Captain',
    species: 'Elf',
    appearance: 'Seven-foot-tall woman with green hair.',
    background: 'Secret princess of a distant empire.',
    importance: 99,
}, 'Mira smiles and pours another cup of tea.');
let mira = state.npcs[0];
assert(mira.role === 'Innkeeper', 'Casual scanner drift rewrote established role');
assert(mira.species === 'Human', 'Casual scanner drift rewrote established species');
assert(mira.appearance.includes('Five-foot-five'), 'Casual scanner drift rewrote ordinary appearance');
assert(mira.background.includes('river village of Harth'), 'Casual scanner drift rewrote established background');
assert(mira.importance === 20, 'Scanner importance ratcheted user/editor importance');

const context = [
    'Mira reveals, "I was actually born an elf; the Human entry in the registry was mistaken."',
    'The curse leaves a lasting change: her hair permanently turns silver and a thin scar remains over her left brow.',
    'The reeve announces, "Mira is promoted to Captain of the River Watch."',
    'Mira reveals that she was born in the hidden valley of Lethren, correcting the old Harth story.',
].join('\n');
state = applyPatch(state, {
    role: 'Captain of the River Watch',
    species: 'Elf',
    appearance: 'Five-foot-five elf with silver hair, gray eyes, and a thin scar over her left brow.',
    background: 'Born in the hidden valley of Lethren before later settling in Harth.',
    importance: 100,
    canonChanges: [
        { field: 'species', mode: 'correction', value: 'Elf', evidence: 'Mira reveals, "I was actually born an elf; the Human entry in the registry was mistaken."' },
        { field: 'appearance', mode: 'change', value: 'Five-foot-five elf with silver hair, gray eyes, and a thin scar over her left brow.', evidence: 'The curse leaves a lasting change: her hair permanently turns silver and a thin scar remains over her left brow.' },
        { field: 'role', mode: 'change', value: 'Captain of the River Watch', evidence: 'The reeve announces, "Mira is promoted to Captain of the River Watch."' },
        { field: 'background', mode: 'revelation', value: 'Born in the hidden valley of Lethren before later settling in Harth.', evidence: 'Mira reveals that she was born in the hidden valley of Lethren, correcting the old Harth story.' },
    ],
}, context);
mira = state.npcs[0];
assert(mira.species === 'Elf', 'Explicit grounded species correction was blocked');
assert(mira.role === 'Captain of the River Watch', 'Explicit grounded role change was blocked');
assert(mira.appearance.includes('silver hair') && mira.appearance.includes('scar'), 'Explicit lasting appearance change was blocked');
assert(mira.background.includes('hidden valley of Lethren'), 'Explicit background revelation was blocked');
assert(mira.importance === 20, 'Explicit scanner patch still changed user/editor importance');

const presentLow = normalizeNpc({ id: 'npc-present', name: 'Present', present: true, importance: 0 });
const offscreenHigh = normalizeNpc({ id: 'npc-offscreen', name: 'Offscreen', present: false, worldActive: false, importance: 100 });
const salienceState = { lastObservation: { exchangeActiveNpcIds: [], finalPresentNpcIds: ['npc-present'], worldActiveNpcIds: [] } };
assert(runtimeNpcSalience(presentLow, salienceState) > runtimeNpcSalience(offscreenHigh, salienceState), 'Manual importance overpowered actual In-chat salience');

const chat = [
    { is_user: true, is_system: false, mes: 'Mira tells me about her promotion.' },
    { is_user: false, is_system: false, mes: 'Mira shows the new River Watch insignia.' },
];
const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(prompt.includes('DURABLE SCALAR CANON'), 'Recovery scanner durable scalar canon rule missing');
assert(prompt.includes('canonChanges'), 'Recovery scanner canonChanges channel missing');
const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 5000 });
assert(injection.includes('DURABLE SCALAR CANON'), 'Foreground durable scalar canon rule missing');
assert(injection.includes('importance is user/editor-owned'), 'Foreground manual Importance authority rule missing');

const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(scannerSource.includes('function durableCanonDecision'), 'Durable scalar backend gate missing');
assert(!scannerSource.includes('next.importance = Math.max(next.importance'), 'Legacy scanner importance ratchet remains');

console.log('NPC State 0.4.3 Phase 2 durable canon and salience verification passed');

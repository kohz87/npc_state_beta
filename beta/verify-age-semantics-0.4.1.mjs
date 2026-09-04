import fs from 'node:fs';
import { createEmptyState, normalizeActualAge, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// Canonical actual-age parsing.
assert(normalizeActualAge('25') === '25', 'Exact year age did not normalize');
assert(normalizeActualAge('25 years old') === '25', 'Year wording did not normalize');
assert(normalizeActualAge('about 25 years old') === '~25', 'Approximate year age did not normalize');
assert(normalizeActualAge('6 months old') === '6 months', 'Month age did not normalize');
assert(normalizeActualAge('1 day old') === '1 day', 'Singular day age did not normalize');
for (const bad of ['child', 'teenager', 'adult', 'young adult', 'middle-aged', 'elder', 'elderly', 'old', '20s', '20-30']) {
    assert(normalizeActualAge(bad) === '', `Life-stage/range age leaked through: ${bad}`);
}
assert(normalizeNpc({ name: 'A', age: 'adult' }).age === '', 'Stored life-stage age was not cleaned');

// Existing grounded age must not jump because a later model emits a category or a different guess.
let seeded = applyScanResult(createEmptyState('age-stickiness'), {
    exchangeActiveNpcIds: ['Mira'],
    inChatNpcIds: ['Mira'],
    worldActiveNpcIds: [],
    npcs: [{ id: '', name: 'Mira', age: '25', apparentAge: '~24' }],
    socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
let mira = seeded.npcs.find(npc => npc.name === 'Mira');
assert(mira?.age === '25', 'Initial numeric age was not stored');

seeded = applyScanResult(seeded, {
    exchangeActiveNpcIds: ['Mira'],
    inChatNpcIds: ['Mira'],
    worldActiveNpcIds: [],
    npcs: [{ id: mira.id, name: 'Mira', age: 'adult' }],
    socialEdges: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true }).state;
mira = seeded.npcs.find(npc => npc.name === 'Mira');
assert(mira.age === '25', 'Life-stage label overwrote grounded numeric age');

seeded = applyScanResult(seeded, {
    exchangeActiveNpcIds: ['Mira'],
    inChatNpcIds: ['Mira'],
    worldActiveNpcIds: [],
    npcs: [{ id: mira.id, name: 'Mira', age: '31' }],
    socialEdges: [],
}, { sourceMessageId: 3, turn: 3, applyReturnedNpcPatches: true }).state;
mira = seeded.npcs.find(npc => npc.name === 'Mira');
assert(mira.age === '25', 'Different scanner guess overwrote grounded numeric age');

// Approximate actual age may refine to the exact same number, but not jump elsewhere.
let approximate = applyScanResult(createEmptyState('age-refinement'), {
    exchangeActiveNpcIds: ['Tomas'], inChatNpcIds: ['Tomas'], worldActiveNpcIds: [],
    npcs: [{ id: '', name: 'Tomas', age: '~30' }], socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
let tomas = approximate.npcs.find(npc => npc.name === 'Tomas');
approximate = applyScanResult(approximate, {
    exchangeActiveNpcIds: ['Tomas'], inChatNpcIds: ['Tomas'], worldActiveNpcIds: [],
    npcs: [{ id: tomas.id, name: 'Tomas', age: '30' }], socialEdges: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true }).state;
tomas = approximate.npcs.find(npc => npc.name === 'Tomas');
assert(tomas.age === '30', 'Exact same-number age did not refine approximate age');

// Prompt surfaces must define and preserve age semantics.
const state = createEmptyState('prompt-age');
state.npcs = [normalizeNpc({ id: 'npc-mira-test', name: 'Mira', age: '25', apparentAge: '~24' })];
const chat = [
    { is_user: true, is_system: false, mes: 'I greet Mira.' },
    { is_user: false, is_system: false, mes: 'Mira answers.' },
];
const scanPrompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(scanPrompt.includes('age is ACTUAL chronological age only'), 'Full scanner age rule missing');
assert(scanPrompt.includes('"age":"25"'), 'Existing actual age missing from recovery scanner continuity');
assert(scanPrompt.includes('"apparentAge":"~24"'), 'Existing apparent age missing from recovery scanner continuity');

const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true });
assert(injection.includes('age is ACTUAL chronological age only'), 'Foreground age rule missing');
assert(injection.includes('Actual age: 25'), 'Foreground continuity does not label actual age clearly');
assert(injection.includes('child, teenager, adult'), 'Foreground life-stage exclusion missing');

const dossierView = file('v03/dossier-view.js');
assert(dossierView.includes('Actual age ${npc.age}'), 'Dossier actual-age wording missing');

console.log('NPC State 0.4.1 age semantics verification passed');

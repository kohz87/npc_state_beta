import fs from 'node:fs';
import { createEmptyState, normalizeAppearanceForms, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';
import { buildPortraitCharacterBlock } from '../v03/portrait-prompt.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

function form(npc, name) {
    const key = String(name || '').toLocaleLowerCase();
    return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === key) || null;
}

// Normalization accepts both object maps and structured arrays while deduplicating form names.
const normalized = normalizeAppearanceForms({
    Human: '5 ft 4 in, silver hair, blue eyes.',
    Beast: 'Shoulder height 3 ft 4 in; wingspan 7 ft.',
});
assert(normalized.length === 2, 'Object-map appearance forms did not normalize');
assert(normalized[0].name === 'Human', 'Appearance form label was not preserved');
assert(normalizeNpc({ name: 'Astra', currentForm: 'beast', appearanceForms: normalized }).currentForm === 'Beast', 'Current form did not canonicalize to stored form label');

// In 0.4.3 ordinary non-transforming NPCs remain non-form-aware, but established appearance is durable canon.
let ordinary = applyScanResult(createEmptyState('ordinary-appearance'), {
    exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
    npcs: [{ id: '', name: 'Mira', appearance: 'Auburn hair worn loose.' }], socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
let mira = ordinary.npcs.find(npc => npc.name === 'Mira');
ordinary = applyScanResult(ordinary, {
    exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
    npcs: [{ id: mira.id, name: 'Mira', appearance: 'Auburn hair now tied back.' }], socialEdges: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true }).state;
mira = ordinary.npcs.find(npc => npc.name === 'Mira');
assert(mira.appearance === 'Auburn hair worn loose.', '0.4.3 durable canon allowed casual ordinary appearance drift');
assert(!mira.currentForm && !(mira.appearanceForms || []).length, 'Ordinary NPC was unnecessarily made form-aware');

// Multi-form bootstrap stores every grounded form and current form without losing shared appearance.
let state = applyScanResult(createEmptyState('form-aware'), {
    exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
    npcs: [{
        id: '', name: 'Sora', species: 'Avian chimera',
        appearance: 'Golden-blue hair and luminous blue eyes are shared across her forms.',
        currentForm: 'Beast',
        appearanceForms: [
            { name: 'Human', appearance: '5 ft 4 in, golden-blue hair, blue eyes.' },
            { name: 'Beast', appearance: 'Large raptor-like body; wingspan 7 ft; golden-blue plumage.' },
        ],
    }], socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
let sora = state.npcs.find(npc => npc.name === 'Sora');
assert(sora?.currentForm === 'Beast', 'Initial current form was not stored');
assert(sora.appearanceForms.length === 2, 'Initial multiple forms were not stored');
assert(form(sora, 'Beast')?.appearance.includes('wingspan 7 ft'), 'Initial beast dimensions were not stored');

// Casual contradictory replay of an existing form cannot overwrite its canonical appearance.
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
    npcs: [{
        id: sora.id, name: 'Sora', currentForm: 'Human',
        appearance: 'A tiny bird-bodied creature in the current scene.',
        appearanceForms: [{ name: 'Beast', appearance: 'Tiny beast form; wingspan 3 ft.' }],
    }], socialEdges: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true }).state;
sora = state.npcs.find(npc => npc.name === 'Sora');
assert(sora.currentForm === 'Human', 'Transformation did not update live currentForm');
assert(form(sora, 'Beast')?.appearance.includes('wingspan 7 ft'), 'Casual contradictory form description overwrote sticky canon');
assert(sora.appearance.includes('shared across her forms'), 'Changing form overwrote shared appearance');

// A newly discovered form is merged without deleting existing forms.
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
    npcs: [{
        id: sora.id, name: 'Sora', currentForm: 'Demihuman',
        appearanceForms: [{ name: 'Demihuman', appearance: '5 ft 5 in; feathered ears, small wings, and a golden-blue tail fan.' }],
    }], socialEdges: [],
}, { sourceMessageId: 3, turn: 3, applyReturnedNpcPatches: true }).state;
sora = state.npcs.find(npc => npc.name === 'Sora');
assert(sora.appearanceForms.length === 3, 'New form did not merge with established forms');
assert(form(sora, 'Human') && form(sora, 'Beast') && form(sora, 'Demihuman'), 'Adding a form deleted established forms');
assert(sora.currentForm === 'Demihuman', 'Newly established current form did not canonicalize');

// Revision channel requires evidence. Missing evidence fails closed.
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
    npcs: [{
        id: sora.id, name: 'Sora',
        appearanceFormChanges: [{ name: 'Beast', appearance: 'Wingspan 3 ft.' }],
    }], socialEdges: [],
}, { sourceMessageId: 4, turn: 4, applyReturnedNpcPatches: true }).state;
sora = state.npcs.find(npc => npc.name === 'Sora');
assert(form(sora, 'Beast')?.appearance.includes('wingspan 7 ft'), 'Evidence-free form revision was accepted');

// Explicit persistent physical change can revise one form without touching the others.
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
    npcs: [{
        id: sora.id, name: 'Sora', currentForm: 'Beast',
        appearanceFormChanges: [{
            name: 'Beast',
            appearance: 'Large raptor-like body; wingspan nearly 10 ft after her molt; golden-blue plumage.',
            evidence: 'The current exchange explicitly states that after molting her wings had grown to nearly ten feet across.',
        }],
    }], socialEdges: [],
}, { sourceMessageId: 5, turn: 5, applyReturnedNpcPatches: true }).state;
sora = state.npcs.find(npc => npc.name === 'Sora');
assert(form(sora, 'Beast')?.appearance.includes('10 ft'), 'Evidence-gated explicit form revision was not applied');
assert(form(sora, 'Human')?.appearance.includes('5 ft 4 in'), 'Explicit beast revision mutated another form');
assert(sora.currentForm === 'Beast', 'Current form was not updated with explicit beast scene');

// Recovery/Refresh prompts receive existing form canon and define the sticky rules.
const chat = [
    { is_user: true, is_system: false, mes: 'I ask Sora to stretch her wings.' },
    { is_user: false, is_system: false, mes: 'Sora stretches her wings beside the fire.' },
];
const scanPrompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(scanPrompt.includes('appearanceForms stores durable canonical descriptions'), 'Full scanner form semantics missing');
assert(scanPrompt.includes('"currentForm":"Beast"'), 'Full scanner was not shown current form');
assert(scanPrompt.includes('nearly 10 ft'), 'Full scanner was not shown stored form appearance');
const refreshPrompt = buildTargetedRefreshPrompt({ npc: sora, chat, assistantMessageId: 1 });
assert(refreshPrompt.includes('appearanceFormChanges may revise a stored form only'), 'Targeted Refresh form-revision rule missing');
assert(refreshPrompt.includes('nearly 10 ft'), 'Targeted Refresh was not shown stored form canon');

// Foreground injection returns all known forms for a relevant NPC and marks the current one.
const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectLimit: 6, injectBudgetTokens: 6000 });
assert(!injection.includes('Current form: Beast'), 'Foreground continuity still exposes redundant standalone current form');
assert(injection.includes('Appearance forms:'), 'Foreground continuity omitted compact form registry');
assert(injection.includes('Beast [CURRENT]:'), 'Foreground continuity did not mark current form');
assert(injection.includes('Human:'), 'Foreground continuity omitted inactive known form');
assert(injection.includes('Demihuman:'), 'Foreground continuity omitted another known form');
assert(injection.includes('appearanceFormChanges is the only scanner channel'), 'Foreground form revision rule missing');

// Portrait prompt uses shared appearance plus the current form, not another body's description.
const portrait = buildPortraitCharacterBlock(sora, 'natural');
assert(portrait.includes('nearly 10 ft'), 'Portrait prompt omitted current Beast form appearance');
assert(!portrait.includes('5 ft 4 in'), 'Portrait prompt leaked inactive Human form appearance into current Beast portrait');

// Manual dossier surfaces expose form-aware state.
const ui = file('v03/ui.js');
const dossier = file('v03/dossier-view.js');
assert(ui.includes('Appearance forms · one per line as Form | description'), 'Manual appearance-form editor missing');
assert(ui.includes('npc_state_v3_edit_current_form'), 'Manual current-form editor missing');
assert(dossier.includes("block('Appearance forms'"), 'Dossier appearance-form display missing');
assert(!dossier.includes("currentFact('Current form'"), 'Dossier still exposes redundant standalone current-form card');
assert(dossier.includes("currentFact('Current appearance'"), 'Dossier resolved current-appearance display missing');

console.log('NPC State 0.4.1 form-aware appearance verification passed');

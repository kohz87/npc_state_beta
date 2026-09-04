import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function stateWith(npc) { const state = createEmptyState('phase8f'); state.npcs = [normalizeNpc({ ...npc, present: true })]; return state; }
function apply(state, patch, id, context) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [patch.id || patch.name], inChatNpcIds: [patch.id || patch.name], worldActiveNpcIds: [], npcs: [patch], socialEdges: [],
    }, { sourceMessageId: id, turn: id, applyReturnedNpcPatches: true, profileContext: context }).state;
}
function form(npc, name) { return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === String(name).toLocaleLowerCase()); }

// Predicate-style color wording is protected just like adjective-before-noun wording.
let state = stateWith({ id: 'npc-color-after', name: 'Color After', species: 'Human', age: '6', apparentAge: '~6', appearance: 'Hair is silver; eyes are blue; small child build.' });
let npc = state.npcs[0];
const colorEvidence = 'Color After celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: colorEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: colorEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~7', appearance: 'Hair is black; eyes are green; taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Hair is black; eyes are green; taller child build.', evidence: colorEvidence }],
}, 1, colorEvidence);
npc = state.npcs[0];
assert(npc.age === '7' && npc.apparentAge === '~7', 'Color preservation test did not accept chronology/apparent age');
assert(npc.appearance === 'Hair is silver; eyes are blue; small child build.', 'Predicate-style hair/eye colors changed through age progression');

// Stable structural descriptors cannot mutate merely because age advanced.
state = stateWith({ id: 'npc-structure', name: 'Structure', species: 'Human', age: '6', apparentAge: '~6', appearance: 'Silver hair, blue eyes, pointed ears, and a small child build.' });
npc = state.npcs[0];
const structureEvidence = 'Structure celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: structureEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: structureEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~7', appearance: 'Silver hair, blue eyes, rounded ears, and a taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Silver hair, blue eyes, rounded ears, and a taller child build.', evidence: structureEvidence }],
}, 2, structureEvidence);
npc = state.npcs[0];
assert(npc.age === '7' && npc.apparentAge === '~7', 'Structural descriptor test did not accept chronology/apparent age');
assert(npc.appearance.includes('pointed ears'), 'Age progression changed pointed ears to rounded ears');

// Scar location is canonical structure too. A birthday cannot move it.
state = stateWith({ id: 'npc-scar', name: 'Scar', species: 'Human', age: '6', apparentAge: '~6', appearance: 'Brown hair, amber eyes, a fine scar at the left brow, and a small child build.' });
npc = state.npcs[0];
const scarEvidence = 'Scar celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: scarEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: scarEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~7', appearance: 'Brown hair, amber eyes, a fine scar at the right arm, and a taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Brown hair, amber eyes, a fine scar at the right arm, and a taller child build.', evidence: scarEvidence }],
}, 3, scarEvidence);
npc = state.npcs[0];
assert(npc.appearance.includes('left brow'), 'Age progression moved an established scar');

// If appearance is locked while it is still the exact legacy Base mirror, Base cannot
// evolve out from under it and create contradictory duplicate canon. Alternate forms remain
// independently editable when appearanceForms itself is not locked.
state = stateWith({
    id: 'npc-legacy-lock', name: 'Legacy Lock', species: 'Human', age: '6', apparentAge: '~6',
    appearance: 'Silver hair, gray eyes, and a small child build.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair, gray eyes, and a small child build.' },
        { name: 'Beast', appearance: 'Silver-furred wolf with gray eyes and a long tail.' },
    ], currentForm: 'Base', manualProfileFields: ['appearance'],
});
npc = state.npcs[0];
const lockEvidence = 'Legacy Lock celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: lockEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: lockEvidence, affectsShared: false, affectedForms: ['Base'] },
    apparentAge: '~7',
    appearanceFormChanges: [{ name: 'Base', mode: 'age_progression', evidence: lockEvidence, appearance: 'Silver hair, gray eyes, and a taller child build.' }],
}, 4, lockEvidence);
npc = state.npcs[0];
assert(npc.age === '7' && npc.apparentAge === '~7', 'Appearance lock incorrectly blocked chronology/apparent age');
assert(npc.appearance === 'Silver hair, gray eyes, and a small child build.', 'Manual appearance lock was bypassed');
assert(form(npc, 'Base').appearance === npc.appearance, 'Locked legacy scalar and Base diverged');

const beastEvidence = 'A permanent old wound leaves a notch in Legacy Lock’s Beast-form left ear.';
state = apply(state, {
    id: npc.id, name: npc.name,
    appearanceFormChanges: [{ name: 'Beast', evidence: beastEvidence, appearance: 'Silver-furred wolf with gray eyes, a notched left ear, and a long tail.' }],
}, 5, beastEvidence);
npc = state.npcs[0];
assert(form(npc, 'Beast').appearance.includes('notched left ear'), 'Scalar appearance lock incorrectly blocked an unrelated alternate-form revision');
assert(form(npc, 'Base').appearance === npc.appearance, 'Alternate-form revision disturbed locked Base mirror');

console.log('NPC State 0.4.3 phase 8F trait and legacy-lock hardening verification passed');

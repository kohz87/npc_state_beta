import { createEmptyState, normalizeActualAge, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { resolvedCurrentAppearance } from '../v03/appearance.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function form(npc, name) { return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === String(name).toLocaleLowerCase()); }
function one(state) { return state.npcs[0]; }
function apply(state, patch, id, context) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [patch.id || patch.name], inChatNpcIds: [patch.id || patch.name], worldActiveNpcIds: [],
        npcs: [patch], socialEdges: [],
    }, { sourceMessageId: id, turn: id, applyReturnedNpcPatches: true, profileContext: context }).state;
}
function stateWith(npc) {
    const state = createEmptyState('age-progression-test');
    state.npcs = [normalizeNpc({ ...npc, present: true })];
    return state;
}

// 1. Meaningful child birthday may mature apparent age and Base. Legacy scalar follows Base.
let state = stateWith({
    id: 'npc-child', name: 'Mira', species: 'Human', age: '6', apparentAge: '~6',
    appearance: 'Silver hair, gray eyes, small rounded face, and slight child build.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair, gray eyes, small rounded face, and slight child build.' },
        { name: 'Beast', appearance: 'Silver-furred wolf body with gray eyes, pointed ears, and a long tail.' },
    ], currentForm: 'Base',
});
let npc = one(state);
const childEvidence = 'Mira celebrated her birthday and turned 7 today.';
const childBase = 'Silver hair, gray eyes, a slightly taller child build, and a less rounded face.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: childEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Established ordinary short-lived maturation.', evidence: childEvidence, affectsShared: false, affectedForms: ['Base'] },
    apparentAge: '~7',
    appearanceFormChanges: [{ name: 'Base', appearance: childBase, mode: 'age_progression', evidence: childEvidence }],
}, 10, childEvidence);
npc = one(state);
assert(npc.age === '7', 'Meaningful child birthday did not preserve accepted age transition');
assert(npc.apparentAge === '~7', 'Meaningful child birthday did not update apparentAge');
assert(form(npc, 'Base').appearance === childBase, 'Meaningful child birthday did not update Base appearance');
assert(npc.appearance === childBase, 'Legacy scalar did not synchronize after age-progressed Base');
assert(npc.currentForm === 'Base', 'Age progression changed currentForm');
assert(resolvedCurrentAppearance(npc) === childBase, 'Resolved current appearance did not reflect matured Base');
assert(form(npc, 'Beast').appearance.includes('Silver-furred wolf body'), 'Child Base maturation mutated unrelated Beast form');

// 2. One ordinary adult birthday updates chronology but does not authorize invented visual drift.
state = stateWith({ id: 'npc-adult', name: 'Tomas', species: 'Human', age: '25', apparentAge: '~25', appearance: 'Brown hair, amber eyes, lean adult build.' });
npc = one(state);
const adultEvidence = 'On his birthday Tomas turned 26.';
const adultAppearance = 'Brown hair, amber eyes, a visibly older face, and lean adult build.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '26', kind: 'birthday', evidence: adultEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary short-lived maturation.', evidence: adultEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~26', appearance: adultAppearance,
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: adultAppearance, evidence: adultEvidence }],
}, 20, adultEvidence);
npc = one(state);
assert(npc.age === '26', 'Adult birthday age transition was not accepted');
assert(npc.apparentAge === '~25', 'Insignificant adult birthday forced apparent-age drift');
assert(npc.appearance === 'Brown hair, amber eyes, lean adult build.', 'Insignificant adult birthday forced appearance drift');

// 3. Correction is chronology repair, never physical time passage.
state = stateWith({ id: 'npc-correction', name: 'Iris', species: 'Human', age: '7', apparentAge: '~7', appearance: 'Black hair, green eyes, small child build.' });
npc = one(state);
const correctionEvidence = 'Correction: Iris was actually 8, not 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '8', kind: 'correction', evidence: correctionEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: correctionEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~8', appearance: 'Black hair, green eyes, taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Black hair, green eyes, taller child build.', evidence: correctionEvidence }],
}, 30, correctionEvidence);
npc = one(state);
assert(npc.age === '8', 'Explicit age correction was not accepted');
assert(npc.apparentAge === '~7', 'Age correction incorrectly changed apparentAge');
assert(npc.appearance === 'Black hair, green eyes, small child build.', 'Age correction incorrectly matured appearance');

// 4. Manual dossier age edits are simple state edits and fabricate no visual change.
const manualBefore = normalizeNpc({ id: 'npc-manual-age', name: 'Manual', age: '6', apparentAge: '~6', appearance: 'Red hair, blue eyes, small child build.' });
const manualAfter = normalizeNpc({ ...manualBefore, age: '7' });
assert(manualAfter.age === '7', 'Manual age edit did not store the requested valid age');
assert(manualAfter.apparentAge === manualBefore.apparentAge, 'Manual age edit fabricated apparent-age maturation');
assert(manualAfter.appearance === manualBefore.appearance, 'Manual age edit fabricated appearance maturation');

// 5. Long-lived chronology may advance while a small interval remains visually unchanged.
state = stateWith({ id: 'npc-long', name: 'Elen', species: 'Established long-lived folk', age: '100', apparentAge: '~20', appearance: 'White hair, violet eyes, youthful face.' });
npc = one(state);
const longEvidence = 'Elen celebrated her birthday and turned 101.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '101', kind: 'birthday', evidence: longEvidence },
    ageProgression: { maturation: 'long_lived', meaningful: true, basis: 'Established long-lived maturation.', evidence: longEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~21', appearance: 'White hair, violet eyes, slightly older youthful face.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'White hair, violet eyes, slightly older youthful face.', evidence: longEvidence }],
}, 40, longEvidence);
npc = one(state);
assert(npc.age === '101', 'Long-lived chronological age did not advance');
assert(npc.apparentAge === '~20', 'Long-lived one-year interval changed apparentAge');
assert(npc.appearance === 'White hair, violet eyes, youthful face.', 'Long-lived one-year interval changed appearance');

// 6. Ageless beings never auto-mature from chronology alone.
state = stateWith({ id: 'npc-ageless', name: 'Aion', species: 'Ageless entity', age: '1000', apparentAge: '~30', appearance: 'Black hair, silver eyes, luminous crystalline markings.' });
npc = one(state);
const agelessEvidence = 'Aion marked the date and turned 1001.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '1001', kind: 'birthday', evidence: agelessEvidence },
    ageProgression: { maturation: 'ageless', meaningful: true, basis: 'Established ageless nature.', evidence: agelessEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~31', appearance: 'Black hair, silver eyes, older face, luminous crystalline markings.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Black hair, silver eyes, older face, luminous crystalline markings.', evidence: agelessEvidence }],
}, 50, agelessEvidence);
npc = one(state);
assert(npc.age === '1001', 'Ageless chronology did not advance');
assert(npc.apparentAge === '~30' && npc.appearance.includes('luminous crystalline'), 'Ageless chronology caused visual maturation');

// 7. Explicit accelerated growth can mature over a much shorter interval.
state = stateWith({ id: 'npc-fast', name: 'Pip', species: 'Rapid-maturing chimera', age: '6 months', apparentAge: '~5', appearance: 'Golden hair, blue eyes, very small child build.' });
npc = one(state);
const fastEvidence = 'One month later, Pip is now 7 months old.';
const fastAppearance = 'Golden hair, blue eyes, a slightly taller child build, and less infant-like facial proportions.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7 months', kind: 'elapsed', evidence: fastEvidence },
    ageProgression: { maturation: 'accelerated', meaningful: true, basis: 'Established accelerated-growth biology.', evidence: fastEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~6', appearance: fastAppearance,
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: fastAppearance, evidence: fastEvidence }],
}, 60, fastEvidence);
npc = one(state);
assert(npc.age === '7 months', 'Accelerated elapsed age transition failed');
assert(npc.apparentAge === '~6', 'Accelerated growth did not update apparentAge');
assert(npc.appearance === fastAppearance, 'Accelerated growth did not update ordinary appearance');

// Unknown fantasy maturation is fail-closed rather than silently human.
state = stateWith({ id: 'npc-unknown', name: 'Nyx', species: 'Unclassified starborn', age: '6', apparentAge: '~6', appearance: 'Purple hair, amber eyes, small frame.' });
npc = one(state);
const unknownEvidence = 'Nyx celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: unknownEvidence },
    ageProgression: { maturation: 'unknown', meaningful: true, basis: 'No established maturation lore.', evidence: unknownEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~7', appearance: 'Purple hair, amber eyes, taller frame.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Purple hair, amber eyes, taller frame.', evidence: unknownEvidence }],
}, 70, unknownEvidence);
npc = one(state);
assert(npc.age === '7', 'Unknown-species chronological transition failed');
assert(npc.apparentAge === '~6' && npc.appearance === 'Purple hair, amber eyes, small frame.', 'Unknown fantasy species silently inherited ordinary maturation');

// Age progression cannot smuggle unrelated color/anatomy changes.
state = stateWith({ id: 'npc-protected', name: 'Kiri', species: 'Human', age: '7', apparentAge: '~7', appearance: 'Silver hair, blue eyes, pointed ears, and a small child build.' });
npc = one(state);
const protectedEvidence = 'Kiri celebrated her birthday and turned 8.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '8', kind: 'birthday', evidence: protectedEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: protectedEvidence, affectsShared: true, affectedForms: [] },
    apparentAge: '~8', appearance: 'Black hair, green eyes, rounded ears, and a taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Black hair, green eyes, rounded ears, and a taller child build.', evidence: protectedEvidence }],
}, 80, protectedEvidence);
npc = one(state);
assert(npc.age === '8' && npc.apparentAge === '~8', 'Protected-trait test did not accept chronology/apparent age');
assert(npc.appearance === 'Silver hair, blue eyes, pointed ears, and a small child build.', 'Age progression changed unrelated color/anatomy canon');

// Form-aware maturation is per-form, preserves currentForm, and respects locks.
state = stateWith({
    id: 'npc-form-age', name: 'Ryu', species: 'Biologically maturing chimera', age: '6', apparentAge: '~6',
    appearance: 'Silver hair and blue eyes are shared across biological forms.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair, blue eyes, small child build, slender horns, and small wings.' },
        { name: 'Dragon', appearance: 'Silver-scaled dragon body with blue eyes, slender horns, broad wings, and a long tail.' },
        { name: 'Spectral', appearance: 'Spectral silver silhouette with luminous blue eyes.' },
    ], currentForm: 'Dragon',
});
npc = one(state);
const formEvidence = 'Ryu celebrated her birthday and turned 7.';
const baseBefore = form(npc, 'Base').appearance;
const dragonBefore = form(npc, 'Dragon').appearance;
const spectralBefore = form(npc, 'Spectral').appearance;
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: formEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Established biological maturation for Base and Dragon.', evidence: formEvidence, affectsShared: false, affectedForms: ['Base'] },
    apparentAge: '~7',
    appearanceFormChanges: [
        { name: 'Base', mode: 'age_progression', evidence: formEvidence, appearance: 'Silver hair, blue eyes, slightly taller child build, slender horns, and small wings.' },
        { name: 'Dragon', mode: 'age_progression', evidence: formEvidence, appearance: 'Silver-scaled larger dragon body with blue eyes, slender horns, broad wings, and a long tail.' },
        { name: 'Spectral', mode: 'age_progression', evidence: formEvidence, appearance: 'Spectral larger silver silhouette with luminous blue eyes.' },
    ],
}, 90, formEvidence);
npc = one(state);
assert(form(npc, 'Base').appearance !== baseBefore, 'Affected Base form did not mature');
assert(form(npc, 'Dragon').appearance === dragonBefore, 'Unlisted Dragon form matured despite affectedForms gate');
assert(form(npc, 'Spectral').appearance === spectralBefore, 'Unlisted fixed Spectral form matured');
assert(npc.currentForm === 'Dragon', 'Age-linked form update changed currentForm');
assert(npc.appearance === 'Silver hair and blue eyes are shared across biological forms.', 'Base maturation overwrote genuine shared appearance');

state = stateWith({
    id: 'npc-age-lock', name: 'Locked Age Visuals', species: 'Human', age: '6', apparentAge: '~6', appearance: 'Brown hair, blue eyes, small child build.',
    appearanceForms: [{ name: 'Base', appearance: 'Brown hair, blue eyes, small child build.' }], currentForm: 'Base',
    manualProfileFields: ['apparentAge', 'appearance', 'appearanceForms'],
});
npc = one(state);
const lockEvidence = 'Locked Age Visuals celebrated a birthday and turned 7.';
state = apply(state, {
    id: npc.id, name: npc.name,
    ageChange: { age: '7', kind: 'birthday', evidence: lockEvidence },
    ageProgression: { maturation: 'ordinary', meaningful: true, basis: 'Ordinary maturation.', evidence: lockEvidence, affectsShared: false, affectedForms: ['Base'] },
    apparentAge: '~7', appearance: 'Brown hair, blue eyes, taller child build.',
    canonChanges: [{ field: 'appearance', mode: 'age_progression', value: 'Brown hair, blue eyes, taller child build.', evidence: lockEvidence }],
    appearanceFormChanges: [{ name: 'Base', mode: 'age_progression', evidence: lockEvidence, appearance: 'Brown hair, blue eyes, taller child build.' }],
}, 100, lockEvidence);
npc = one(state);
assert(npc.age === '7', 'Visual locks incorrectly blocked chronological age transition');
assert(npc.apparentAge === '~6', 'apparentAge manual lock was bypassed');
assert(npc.appearance === 'Brown hair, blue eyes, small child build.', 'appearance manual lock was bypassed');
assert(form(npc, 'Base').appearance === 'Brown hair, blue eyes, small child build.', 'appearanceForms manual lock was bypassed');

// Existing age normalization remains exactly the established contract.
assert(normalizeActualAge('25 years old') === '25', 'Existing year normalization regressed');
assert(normalizeActualAge('about 25 years old') === '~25', 'Existing approximate age normalization regressed');
assert(normalizeActualAge('6 months old') === '6 months', 'Existing month-age normalization regressed');
assert(normalizeActualAge('child') === '', 'Life-stage label leaked into actual age');

console.log('NPC State 0.4.3 phase 8B age-linked appearance backend verification passed');

import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { resolvedCurrentAppearance } from '../v03/appearance.js';
import { buildInjection } from '../v03/injection.js';
import { buildPortraitCharacterBlock } from '../v03/portrait-prompt.js';
import { dossierHtml } from '../v03/dossier-view.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function byName(state, name) { return state.npcs.find(npc => npc.name === name); }
function form(npc, name) { return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === String(name).toLocaleLowerCase()); }
function scan(state, patch, id, context = '') {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [patch.id || patch.name], inChatNpcIds: [patch.id || patch.name], worldActiveNpcIds: [],
        npcs: [patch], socialEdges: [],
    }, { sourceMessageId: id, turn: id, applyReturnedNpcPatches: true, profileContext: context }).state;
}

// Form switch resolves the active form without mutating a legacy ordinary/Base scalar.
let state = createEmptyState('appearance-sync');
state.npcs = [normalizeNpc({
    id: 'npc-mira-appearance', name: 'Mira', appearance: 'Silver hair and blue eyes; small ordinary humanoid body.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair and blue eyes; small ordinary humanoid body.' },
        { name: 'Beast', appearance: 'Silver-furred wolf body with blue eyes and a long tail.' },
        { name: 'Partial manifestation', appearance: 'Silver hair, blue eyes, wolf ears, and a tail.' },
    ],
    currentForm: 'Base', present: true,
})];
let mira = byName(state, 'Mira');
const originalScalar = mira.appearance;
state = scan(state, { id: mira.id, name: 'Mira', currentForm: 'Beast' }, 1);
mira = byName(state, 'Mira');
assert(mira.appearance === originalScalar, 'Simple form switch overwrote stored appearance');
assert(mira.currentForm === 'Beast', 'Simple form switch did not update currentForm');
assert(resolvedCurrentAppearance(mira) === form(mira, 'Beast').appearance, 'Legacy Base scalar leaked into alternate-form current appearance');

// A grounded shared canon change is allowed even though the NPC is form-aware.
let shared = createEmptyState('shared-form-aware');
shared.npcs = [normalizeNpc({
    id: 'npc-sora-shared', name: 'Sora',
    appearance: 'Golden-blue hair and luminous blue eyes are shared across every biological form.',
    appearanceForms: [
        { name: 'Base', appearance: 'Small humanoid body with feathered ears.' },
        { name: 'Beast', appearance: 'Large raptor-like body with broad wings.' },
    ], currentForm: 'Beast', present: true,
})];
let sora = byName(shared, 'Sora');
const sharedReplacement = 'Golden-blue hair, luminous blue eyes, and a lasting pale brow mark are shared across every biological form.';
const sharedEvidence = 'A lasting pale brow mark now remains visible across every biological form.';
shared = scan(shared, {
    id: sora.id, name: 'Sora', appearance: sharedReplacement,
    canonChanges: [{ field: 'appearance', mode: 'change', value: sharedReplacement, evidence: sharedEvidence }],
}, 2, sharedEvidence);
sora = byName(shared, 'Sora');
assert(sora.appearance === sharedReplacement, 'Form-aware shared canonChanges.appearance was rejected');
assert(form(sora, 'Base').appearance === 'Small humanoid body with feathered ears.', 'Shared appearance change mutated Base form');
assert(form(sora, 'Beast').appearance === 'Large raptor-like body with broad wings.', 'Shared appearance change mutated Beast form');
assert(resolvedCurrentAppearance(sora).includes(sharedReplacement) && resolvedCurrentAppearance(sora).includes('Large raptor-like body'), 'Resolved current appearance did not combine genuine shared traits with current form');

// Revising Base synchronizes the legacy scalar only while it is still the copied Base duplicate.
state = createEmptyState('legacy-base-sync');
state.npcs = [normalizeNpc({
    id: 'npc-astra-base', name: 'Astra', appearance: 'Silver hair, gray eyes, and a small rounded face.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair, gray eyes, and a small rounded face.' },
        { name: 'Dragon', appearance: 'Silver-scaled dragon body with gray eyes, swept horns, and broad wings.' },
    ], currentForm: 'Base', present: true,
})];
let astra = byName(state, 'Astra');
const baseReplacement = 'Silver hair, gray eyes, a small rounded face, and a permanent fine scar at the left brow.';
const baseEvidence = 'A permanent fine scar remains at Astra’s left brow in her ordinary body.';
state = scan(state, {
    id: astra.id, name: 'Astra',
    appearanceFormChanges: [{ name: 'Base', appearance: baseReplacement, evidence: baseEvidence }],
}, 3, baseEvidence);
astra = byName(state, 'Astra');
assert(form(astra, 'Base').appearance === baseReplacement, 'Evidence-backed Base revision was not stored');
assert(astra.appearance === baseReplacement, 'Legacy scalar did not synchronize with revised duplicated Base');
assert(form(astra, 'Dragon').appearance.includes('Silver-scaled dragon'), 'Base revision damaged alternate form');

// If scalar appearance is genuine shared/common canon, revising Base must not overwrite it.
const commonScalar = 'Silver hair and gray eyes remain recognizable across every form.';
state = createEmptyState('shared-not-base');
state.npcs = [normalizeNpc({
    id: 'npc-common-base', name: 'Rin', appearance: commonScalar,
    appearanceForms: [
        { name: 'Base', appearance: 'Small humanoid body with silver hair and gray eyes.' },
        { name: 'Beast', appearance: 'Four-legged silver beast with gray eyes.' },
    ], currentForm: 'Base', present: true,
})];
let rin = byName(state, 'Rin');
const rinEvidence = 'A permanent faint scar now crosses Rin’s ordinary left cheek.';
state = scan(state, {
    id: rin.id, name: 'Rin',
    appearanceFormChanges: [{ name: 'Base', appearance: 'Small humanoid body with silver hair, gray eyes, and a faint left-cheek scar.', evidence: rinEvidence }],
}, 4, rinEvidence);
rin = byName(state, 'Rin');
assert(rin.appearance === commonScalar, 'Genuine shared appearance was overwritten by Base synchronization');

// Updating an alternate form does not mutate Base, scalar shared appearance, or another form.
const beforeBase = form(rin, 'Base').appearance;
const beforeShared = rin.appearance;
const altEvidence = 'Rin’s Beast form permanently retains a chipped right fang after the injury.';
state = scan(state, {
    id: rin.id, name: 'Rin',
    appearanceFormChanges: [{ name: 'Beast', appearance: 'Four-legged silver beast with gray eyes and a permanently chipped right fang.', evidence: altEvidence }],
}, 5, altEvidence);
rin = byName(state, 'Rin');
assert(form(rin, 'Beast').appearance.includes('chipped right fang'), 'Alternate form revision was not applied');
assert(form(rin, 'Base').appearance === beforeBase, 'Alternate form revision mutated Base');
assert(rin.appearance === beforeShared, 'Alternate form revision mutated shared appearance');

// Manual appearance and form locks stay authoritative.
let locked = createEmptyState('appearance-locks');
locked.npcs = [normalizeNpc({
    id: 'npc-locked-appearance', name: 'Locked', appearance: 'Black hair and green eyes.',
    appearanceForms: [{ name: 'Base', appearance: 'Black hair and green eyes.' }, { name: 'Beast', appearance: 'Black-furred beast with green eyes.' }],
    currentForm: 'Base', manualProfileFields: ['appearance', 'appearanceForms'], present: true,
})];
let lockedNpc = byName(locked, 'Locked');
const lockEvidence = 'A permanent magical change turns every form white.';
locked = scan(locked, {
    id: lockedNpc.id, name: 'Locked', appearance: 'White hair and green eyes.',
    canonChanges: [{ field: 'appearance', mode: 'change', value: 'White hair and green eyes.', evidence: lockEvidence }],
    appearanceFormChanges: [{ name: 'Base', appearance: 'White hair and green eyes.', evidence: lockEvidence }],
}, 6, lockEvidence);
lockedNpc = byName(locked, 'Locked');
assert(lockedNpc.appearance === 'Black hair and green eyes.', 'Manual appearance lock was bypassed');
assert(form(lockedNpc, 'Base').appearance === 'Black hair and green eyes.', 'Manual appearanceForms lock was bypassed');

// Casual contradictory prose still cannot rewrite either durable channel.
state = createEmptyState('appearance-drift');
state.npcs = [normalizeNpc({
    id: 'npc-drift', name: 'Drift', appearance: 'Brown hair and amber eyes.',
    appearanceForms: [{ name: 'Base', appearance: 'Brown hair and amber eyes.' }, { name: 'Beast', appearance: 'Brown-furred wolf with amber eyes.' }],
    currentForm: 'Base', present: true,
})];
let drift = byName(state, 'Drift');
state = scan(state, {
    id: drift.id, name: 'Drift', appearance: 'Blue hair and violet eyes.',
    appearanceForms: [{ name: 'Base', appearance: 'Blue hair and violet eyes.' }],
}, 7, 'Drift looks across the room.');
drift = byName(state, 'Drift');
assert(drift.appearance === 'Brown hair and amber eyes.', 'Casual scalar contradiction rewrote appearance');
assert(form(drift, 'Base').appearance === 'Brown hair and amber eyes.', 'Casual form contradiction rewrote Base');

// All current-appearance consumers use the same resolver semantics.
const currentResolved = resolvedCurrentAppearance(mira);
const injection = buildInjection({ ...state, npcs: [mira], lastObservation: { exchangeActiveNpcIds: [mira.id], finalPresentNpcIds: [mira.id], worldActiveNpcIds: [] } }, {
    enabled: true, autoScan: true, inject: true, injectLimit: 2, injectBudgetTokens: 2600,
});
assert(injection.includes('Current appearance: ' + currentResolved), 'Foreground injection does not use resolved current appearance');
assert(injection.includes('Shared / ordinary appearance: ' + mira.appearance), 'Foreground injection does not distinguish stored shared/ordinary appearance');
const portrait = buildPortraitCharacterBlock(mira, 'natural');
assert(portrait.includes(currentResolved), 'Portrait prompt does not use resolved current appearance');
assert(!portrait.includes(originalScalar), 'Portrait prompt leaked inactive legacy Base description into Beast current appearance');
const dossier = dossierHtml(mira);
assert(dossier.includes('Current appearance'), 'Dossier lacks Current appearance');
assert(dossier.includes('Shared / ordinary appearance'), 'Dossier lacks Shared / ordinary appearance');
assert(dossier.includes('Appearance forms'), 'Dossier lacks complete Appearance forms registry');

const portraitSource = fs.readFileSync(new URL('../v03/portrait-prompt.js', import.meta.url), 'utf8');
const injectionSource = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
const dossierSource = fs.readFileSync(new URL('../v03/dossier-view.js', import.meta.url), 'utf8');
assert(portraitSource.includes("resolvedCurrentAppearance as currentFormAppearance"), 'Portrait did not adopt shared resolver module');
assert(injectionSource.includes('resolvedCurrentAppearance(npc)'), 'Injection did not adopt shared resolver module');
assert(dossierSource.includes('resolvedCurrentAppearance(npc)'), 'Dossier did not adopt shared resolver module');

console.log('NPC State 0.4.3 phase 8A form-aware appearance synchronization verification passed');

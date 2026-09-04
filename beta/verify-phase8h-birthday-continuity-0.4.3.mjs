import fs from 'node:fs';
import {
    applyBirthdayFill,
    createEmptyState,
    generatedBirthdayForNpc,
    normalizeBirthday,
    normalizeBirthdayCalendar,
    normalizeNpc,
} from '../v03/schema.js';
import { applyScanResult, buildScanPrompt, buildStructuredDossierImportPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';
import { dossierHtml } from '../v03/dossier-view.js';
import { createNpcStateBundle, parseNpcStateBundle } from '../v03/bundle.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function one(state) { return state.npcs[0]; }
function stateWith(npc) {
    const state = createEmptyState('birthday-test');
    state.npcs = [normalizeNpc({ ...npc, present: true })];
    return state;
}
function applyExisting(state, patch, id, context, birthdayFill = null) {
    const npc = one(state);
    return applyScanResult(state, {
        exchangeActiveNpcIds: [npc.id], inChatNpcIds: [npc.id], worldActiveNpcIds: [],
        npcs: [{ id: npc.id, name: npc.name, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' }, ...patch }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: id, turn: id, applyReturnedNpcPatches: true,
        profileContext: context, currentAdmissionText: context,
        ...(birthdayFill ? { birthdayFill } : {}),
    }).state;
}

// 1. Old dossiers normalize without any birthday migration requirement.
let legacy = normalizeNpc({ id: 'npc-legacy-bday', name: 'Legacy', age: '25', apparentAge: '~25' });
assert(legacy.birthday === '', 'Missing legacy birthday did not normalize to empty string');
assert(legacy.age === '25' && legacy.apparentAge === '~25', 'Birthday normalization changed established age representation');

// 2. A new NPC can capture an explicitly grounded fantasy-calendar birthday.
let fresh = createEmptyState('birthday-bootstrap');
const bootstrapContext = "Mira introduces herself. Her birthday is 14 Frostwane.";
fresh = applyScanResult(fresh, {
    exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
    npcs: [{ id: '', name: 'Mira', identityKind: 'named', aliases: [], role: '', species: 'Human', age: '6', apparentAge: '~6', birthday: '14 Frostwane', appearance: '', personality: '', behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [], relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }],
    socialEdges: [], familyFacts: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true, profileContext: bootstrapContext, currentAdmissionText: bootstrapContext, admissionMode: 'balanced' }).state;
assert(fresh.npcs.length === 1, 'Birthday bootstrap test failed to create new NPC');
assert(one(fresh).birthday === '14 Frostwane' && one(fresh).birthdayProvenance === 'explicit', 'New NPC explicit birthday was not captured as grounded canon');

// 3. An existing blank birthday may be populated later by grounded evidence.
let state = stateWith({ id: 'npc-blank-bday', name: 'Astra', age: '6', apparentAge: '~6', appearance: 'Silver hair, blue eyes, small child build.' });
const explicitContext = "Astra quietly says that her birthday is 9 Rainmoot.";
state = applyExisting(state, { birthday: '9 Rainmoot' }, 2, explicitContext);
assert(one(state).birthday === '9 Rainmoot' && one(state).birthdayProvenance === 'explicit', 'Grounded birthday did not populate blank existing field');

// 4. Casual contradictory prose cannot replace established birthday.
const established = one(state).birthday;
state = applyExisting(state, { birthday: '2 Highsun' }, 3, 'Someone guesses that Astra might celebrate around 2 Highsun.');
assert(one(state).birthday === established, 'Casual contradictory birthday prose overwrote established canon');

// 5. Explicit correction through durable canon may replace established birthday.
const correction = "Correction: Astra's birthday is actually 2 Highsun, not 9 Rainmoot.";
state = applyExisting(state, {
    birthday: '2 Highsun',
    canonChanges: [{ field: 'birthday', mode: 'correction', value: '2 Highsun', evidence: correction }],
}, 4, correction);
assert(one(state).birthday === '2 Highsun' && one(state).birthdayProvenance === 'explicit', 'Grounded birthday correction did not replace established canon');

// 6. Manual birthday lock remains authoritative.
state = stateWith({ id: 'npc-lock-bday', name: 'Kiri', birthday: '7 Frostwane', birthdayProvenance: 'manual', manualProfileFields: ['birthday'] });
const lockedCorrection = "Correction: Kiri's birthday is actually 8 Frostwane, not 7 Frostwane.";
state = applyExisting(state, { birthday: '8 Frostwane', canonChanges: [{ field: 'birthday', mode: 'correction', value: '8 Frostwane', evidence: lockedCorrection }] }, 5, lockedCorrection);
assert(one(state).birthday === '7 Frostwane', 'Manual birthday lock did not block scanner correction');

// 7. Birthday is visible in dossier/editor/scanner context/foreground injection.
const visibleNpc = normalizeNpc({ id: 'npc-visible-bday', name: 'Sora', age: '6', apparentAge: '~6', birthday: '14 Frostwane', birthdayProvenance: 'explicit', present: true });
const visibleState = createEmptyState('birthday-visible');
visibleState.npcs = [visibleNpc];
visibleState.lastObservation = { exchangeActiveNpcIds: [visibleNpc.id], finalPresentNpcIds: [visibleNpc.id], worldActiveNpcIds: [] };
const foreground = buildInjection(visibleState, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1800 });
assert(foreground.includes('Birthday: 14 Frostwane'), 'Foreground continuity omitted Birthday');
assert(dossierHtml(visibleNpc).includes('Birthday 14 Frostwane'), 'Dossier display omitted Birthday');
const chat = [{ is_user: true, is_system: false, mes: 'Sora answers.' }, { is_user: false, is_system: false, mes: 'Sora smiles.' }];
const recoveryPrompt = buildScanPrompt({ state: visibleState, chat, assistantMessageId: 1 });
assert(recoveryPrompt.includes('14 Frostwane') && recoveryPrompt.includes('birthday'), 'Recovery scanner context/contract omitted Birthday');
const uiSource = fs.readFileSync(new URL('../v03/ui.js', import.meta.url), 'utf8');
assert(uiSource.includes('npc_state_v3_edit_birthday') && uiSource.includes("'birthday'"), 'Manual dossier editor/lock integration omitted Birthday');

// 8. Birthday metadata alone never advances age or matures appearance.
state = stateWith({ id: 'npc-no-auto-age', name: 'Pip', age: '6', apparentAge: '~6', appearance: 'Golden hair, blue eyes, small child build.' });
const birthdayOnly = "Pip's birthday is 3 Bloomtide.";
state = applyExisting(state, { birthday: '3 Bloomtide' }, 6, birthdayOnly);
assert(one(state).birthday === '3 Bloomtide', 'Birthday-only metadata was not captured');
assert(one(state).age === '6' && one(state).apparentAge === '~6' && one(state).appearance === 'Golden hair, blue eyes, small child build.', 'Birthday metadata independently changed age or appearance');

// 9. Fantasy values are compact freeform text, not Gregorian parsed/reformatted data.
assert(normalizeBirthday('  14   Frostwane  ') === '14 Frostwane', 'Fantasy birthday whitespace normalization failed');
assert(normalizeBirthday('Moonfall, Third Bell') === 'Moonfall, Third Bell', 'Fantasy birthday was Gregorian-parsed or rewritten');
const fantasyMonths = normalizeBirthdayCalendar('Frostwane:30\nRainmoot:28\nHighsun', 31);
assert(fantasyMonths[0].name === 'Frostwane' && fantasyMonths[2].name === 'Highsun' && fantasyMonths[2].days === 31, 'Fantasy random-calendar parsing failed');

// 10 + random-fill extension: Off/Unknown/Random are passive and deterministic.
const blankNpc = normalizeNpc({ id: 'npc-random-bday', name: 'Random Test', age: '25', apparentAge: '~25', appearance: 'Brown hair, gray eyes.' });
assert(applyBirthdayFill(blankNpc, { mode: 'off', calendar: 'Frostwane:30' }).birthday === '', 'Off birthday fill mutated a blank');
const unknownFilled = applyBirthdayFill(blankNpc, { mode: 'unknown' });
assert(unknownFilled.birthday === 'Unknown' && unknownFilled.birthdayProvenance === 'generated', 'Unknown birthday fill failed');
const randomA = applyBirthdayFill(blankNpc, { mode: 'random', calendar: 'Frostwane:30\nRainmoot:28', fallbackDays: 30 });
const randomB = applyBirthdayFill(blankNpc, { mode: 'random', calendar: 'Frostwane:30\nRainmoot:28', fallbackDays: 30 });
assert(randomA.birthday === randomB.birthday && /Frostwane|Rainmoot/.test(randomA.birthday), 'Random birthday fill is not deterministic/custom-calendar-safe');
assert(randomA.birthdayProvenance === 'generated', 'Random fill did not record generated provenance');
assert(randomA.age === blankNpc.age && randomA.apparentAge === blankNpc.apparentAge && randomA.appearance === blankNpc.appearance, 'Random fill changed age/appearance');
assert(generatedBirthdayForNpc(blankNpc, 'Frostwane:30\nRainmoot:28', 30) === randomA.birthday, 'Generated birthday helper disagrees with fill behavior');

// Generated placeholders yield to later explicit canon without requiring a correction scene.
state = stateWith({ ...randomA, present: true });
const realContext = "Random Test states that their birthday is 11 Starwane.";
state = applyExisting(state, { birthday: '11 Starwane' }, 7, realContext);
assert(one(state).birthday === '11 Starwane' && one(state).birthdayProvenance === 'explicit', 'Grounded canon did not supersede generated placeholder');

// A manually cleared birthday remains intentionally blank and is not passively refilled.
const manualBlank = normalizeNpc({ id: 'npc-manual-blank-bday', name: 'Manual Blank', birthday: '', birthdayProvenance: 'manual' });
assert(applyBirthdayFill(manualBlank, { mode: 'random', calendar: 'Frostwane:30' }).birthday === '', 'Manual blank birthday was passively refilled');

// Scanner-side Random fill works without any age change proposal.
state = stateWith({ id: 'npc-scan-fill', name: 'Fill Me', age: '31', apparentAge: '~31', appearance: 'Black hair, green eyes.' });
state = applyExisting(state, { mood: 'Calm' }, 8, 'Fill Me remains calm.', { mode: 'random', calendar: 'Frostwane:30', fallbackDays: 30 });
assert(/Frostwane/.test(one(state).birthday) && one(state).birthdayProvenance === 'generated', 'Participating dossier did not receive active Random fill policy');
assert(one(state).age === '31' && one(state).apparentAge === '~31' && one(state).appearance === 'Black hair, green eyes.', 'Scanner Random fill changed age-linked state');

// Structured import exposes birthday but not calendar automation.
const structuredPrompt = buildStructuredDossierImportPrompt({ npc: visibleNpc, blocks: [{ messageId: 1, role: 'ASSISTANT', tag: 'NPC_Update', body: 'Birthday: 14 Frostwane' }] });
assert(structuredPrompt.includes('birthday') && structuredPrompt.includes('never be inferred from age'), 'Structured dossier import birthday contract missing');

// Portable bundles preserve birthday/provenance automatically through normalizeNpc.
const bundleState = createEmptyState('birthday-bundle');
bundleState.npcs = [normalizeNpc({ id: 'npc-bundle-bday', name: 'Bundle Birthday', birthday: '12 Frostwane', birthdayProvenance: 'generated' })];
const bundle = createNpcStateBundle(bundleState);
const parsedBundle = parseNpcStateBundle(JSON.stringify(bundle));
assert(parsedBundle.data.npcs[0].birthday === '12 Frostwane' && parsedBundle.data.npcs[0].birthdayProvenance === 'generated', 'Portable bundle lost birthday continuity/provenance');

const indexSource = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
assert(indexSource.includes("birthdayFillMode: 'off'") && indexSource.includes('birthdayRandomCalendar'), 'Birthday fill settings/defaults missing');
assert(engineSource.includes('fillMissingBirthdays') && engineSource.includes("checkpointReason: 'birthday-fill'"), 'Local fill-missing-birthdays action missing');
assert(uiSource.includes('npc_state_v04_birthday_fill_now') && uiSource.includes('npc_state_v04_birthday_calendar'), 'Birthday fill UI missing');
assert(readme.includes('Passive birthday continuity') && readme.includes('never derives it from age'), 'README birthday safeguards missing');

console.log('NPC State 0.4.3 passive birthday continuity and fill verification passed');

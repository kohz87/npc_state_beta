import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { dossierHtml } from '../v03/dossier-view.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

// A birthday correction cannot be smuggled through a generic correction sentence that
// merely contains the replacement date without establishing it as the birthday.
let state = createEmptyState('birthday-hard-pass');
state.npcs = [normalizeNpc({ id: 'npc-bday-hard', name: 'Mira', birthday: '14 Frostwane', birthdayProvenance: 'explicit', present: true })];
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['npc-bday-hard'], inChatNpcIds: ['npc-bday-hard'], worldActiveNpcIds: [],
    npcs: [{ id: 'npc-bday-hard', name: 'Mira', birthday: '3 Rainmoot', canonChanges: [{ field: 'birthday', mode: 'correction', value: '3 Rainmoot', evidence: 'Correction: the date was 3 Rainmoot.' }], relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }],
    socialEdges: [], familyFacts: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true, profileContext: 'Correction: the date was 3 Rainmoot.' }).state;
assert(state.npcs[0].birthday === '14 Frostwane', 'Generic correction text rewrote Birthday without birthday semantics');

// The same correction is accepted when the source explicitly establishes birthday meaning.
const grounded = "Correction: Mira's birthday is actually 3 Rainmoot, not 14 Frostwane.";
state = applyScanResult(state, {
    exchangeActiveNpcIds: ['npc-bday-hard'], inChatNpcIds: ['npc-bday-hard'], worldActiveNpcIds: [],
    npcs: [{ id: 'npc-bday-hard', name: 'Mira', birthday: '3 Rainmoot', canonChanges: [{ field: 'birthday', mode: 'correction', value: '3 Rainmoot', evidence: grounded }], relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }],
    socialEdges: [], familyFacts: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true, profileContext: grounded }).state;
assert(state.npcs[0].birthday === '3 Rainmoot', 'Explicit birthday correction was blocked by hard-pass grounding');

// Random fill also applies to a newly admitted dossier that has no explicit birthday.
let fresh = createEmptyState('birthday-new-random');
const current = 'Lina introduces herself and joins the conversation.';
fresh = applyScanResult(fresh, {
    exchangeActiveNpcIds: ['Lina'], inChatNpcIds: ['Lina'], worldActiveNpcIds: [],
    npcs: [{ id: '', name: 'Lina', identityKind: 'named', aliases: [], role: '', species: 'Human', age: '20', apparentAge: '~20', birthday: '', appearance: '', personality: '', behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [], relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }],
    socialEdges: [], familyFacts: [],
}, { sourceMessageId: 3, turn: 3, currentAdmissionText: current, profileContext: current, admissionMode: 'balanced', applyReturnedNpcPatches: true, birthdayFill: { mode: 'random', calendar: 'Frostwane:30', fallbackDays: 30 } }).state;
assert(fresh.npcs.length === 1 && /Frostwane/.test(fresh.npcs[0].birthday) && fresh.npcs[0].birthdayProvenance === 'generated', 'New blank NPC did not receive active Random birthday fill');
assert(fresh.npcs[0].age === '20' && fresh.npcs[0].apparentAge === '~20', 'New-NPC random birthday changed age state');

// Dossier gives the three age/date concepts independently labeled cards.
const html = dossierHtml(normalizeNpc({ id: 'npc-bday-display', name: 'Display', age: '6', apparentAge: '~6', birthday: '14 Frostwane' }));
assert(html.includes('<b>Actual age</b>') && html.includes('<b>Apparent age</b>') && html.includes('<b>Birthday</b>'), 'Dossier does not separately label Actual age, Apparent age, and Birthday');

console.log('NPC State 0.4.3 birthday hard-pass verification passed');

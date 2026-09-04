import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function form(npc, name) {
    const key = String(name || '').toLocaleLowerCase();
    return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === key) || null;
}

// Existing single-form dossiers preserve their already-grounded body as Base the first
// time alternate forms are discovered. A single scan can add both a partial manifestation
// and a full beast body, while ending back in Base.
let state = createEmptyState('multi-stage-form-capture');
state.npcs = [normalizeNpc({
    id: 'npc-ryu-test',
    name: 'Ryu',
    appearance: 'Small silver-haired girl with gray eyes, wearing a tailored wool dress.',
    species: 'Chimera',
})];

state = applyScanResult(state, {
    exchangeActiveNpcIds: ['npc-ryu-test'],
    inChatNpcIds: ['npc-ryu-test'],
    worldActiveNpcIds: [],
    npcs: [{
        id: 'npc-ryu-test',
        name: 'Ryu',
        currentForm: 'Base',
        appearanceForms: [
            {
                name: 'Partial manifestation',
                appearance: 'Humanoid body with translucent pale-blue horns, ethereal wings of solid cold, and a spectral frost-spiked lizard tail.',
            },
            {
                name: 'Silver Dragon',
                appearance: 'Juvenile quadrupedal silver dragon, chest-high at the shoulder, overlapping steel-bright scales, heavy talons, long tail, and frost mist from the nostrils.',
            },
        ],
    }],
    socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;

const ryu = state.npcs.find(npc => npc.id === 'npc-ryu-test');
assert(ryu, 'Ryu dossier disappeared');
assert(ryu.currentForm === 'Base', 'Returning to baseline body did not preserve Base as current form');
assert(ryu.appearanceForms.length === 3, 'Baseline plus two alternate states were not all retained');
assert(form(ryu, 'Base')?.appearance.includes('silver-haired girl'), 'Legacy baseline appearance was not promoted to Base');
assert(form(ryu, 'Partial manifestation')?.appearance.includes('ethereal wings'), 'Partial spectral manifestation was not retained as a form');
assert(form(ryu, 'Silver Dragon')?.appearance.includes('quadrupedal silver dragon'), 'Full beast body was not retained as a form');

// Ordinary NPCs remain ordinary until an actual alternate body state is introduced.
let ordinary = createEmptyState('ordinary-remains-ordinary');
ordinary.npcs = [normalizeNpc({ id: 'npc-clerk-test', name: 'Corinne', appearance: 'Middle-aged clerk with spectacles.' })];
ordinary = applyScanResult(ordinary, {
    exchangeActiveNpcIds: ['npc-clerk-test'], inChatNpcIds: ['npc-clerk-test'], worldActiveNpcIds: [],
    npcs: [{ id: 'npc-clerk-test', name: 'Corinne', appearance: 'Middle-aged clerk with spectacles and ink-stained fingers.' }], socialEdges: [],
}, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true }).state;
const corinne = ordinary.npcs.find(npc => npc.id === 'npc-clerk-test');
assert(!(corinne.appearanceForms || []).length, 'Ordinary NPC was spuriously converted into a form-aware dossier');

// Prompt surfaces explicitly distinguish coherent temporary transformations from mere effects.
const chat = [
    { is_user: true, is_system: false, mes: 'Try drawing on the core beneath your ribs.' },
    { is_user: false, is_system: false, mes: 'Ryu manifests spectral horns and wings, becomes a juvenile dragon, then returns to her ordinary body.' },
];
const scanPrompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(scanPrompt.includes('A physical form MAY be temporary, reversible, magical, elemental, spectral, or energy-made'), 'Full scanner still requires permanent/solid forms');
assert(scanPrompt.includes('Partial transformations count when they add form-defining anatomy'), 'Full scanner does not explicitly recognize partial transformations');
assert(scanPrompt.includes('Capture every distinct form state explicitly shown in the CURRENT exchange'), 'Full scanner does not require multi-stage capture from one exchange');
assert(scanPrompt.includes('use currentForm Base'), 'Full scanner does not resolve end-of-exchange return to baseline');

const refreshPrompt = buildTargetedRefreshPrompt({ npc: ryu, chat, assistantMessageId: 1 });
assert(refreshPrompt.includes('A form may be temporary, reversible, magical, spectral, elemental, or energy-made'), 'Targeted Refresh lacks temporary/reversible form semantics');
assert(refreshPrompt.includes('Capture multiple distinct states from the same scene'), 'Targeted Refresh lacks multi-stage form capture');

const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectLimit: 6, injectBudgetTokens: 6000 });
assert(injection.includes('A form MAY be temporary, reversible, magical, elemental, spectral, or energy-made'), 'Foreground capture lacks temporary/reversible form semantics');
assert(injection.includes('Capture EVERY distinct form state explicitly entered in this response'), 'Foreground capture lacks multi-stage form capture');
assert(injection.includes('Base [CURRENT]:'), 'Foreground continuity does not expose promoted baseline form as current');
assert(injection.includes('Partial manifestation:'), 'Foreground continuity omitted partial manifestation form');
assert(injection.includes('Silver Dragon:'), 'Foreground continuity omitted full beast form');

console.log('NPC State 0.4.1 multi-stage form capture verification passed');

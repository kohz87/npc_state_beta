import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function form(npc, name) {
    const key = String(name || '').toLocaleLowerCase();
    return (npc.appearanceForms || []).find(item => String(item?.name || '').toLocaleLowerCase() === key) || null;
}

// Simulate a dossier produced by the earlier form-aware build: ordinary appearance exists,
// Beast was captured, but Base and the intermediate manifestation were missed.
let state = createEmptyState('baseline-recovery');
state.npcs = [normalizeNpc({
    id: 'npc-sora-old',
    name: 'Sora',
    appearance: 'Small golden-blue-haired girl with bright blue eyes.',
    appearanceForms: [
        { name: 'Stormcrown Thunderbird', appearance: 'Young thunderbird, three feet at the breast, thundercloud plumage edged in gold.' },
    ],
    currentForm: 'Stormcrown Thunderbird',
})];

state = applyScanResult(state, {
    exchangeActiveNpcIds: ['npc-sora-old'], inChatNpcIds: ['npc-sora-old'], worldActiveNpcIds: [],
    npcs: [{
        id: 'npc-sora-old',
        name: 'Sora',
        currentForm: 'Base',
        appearanceForms: [{
            name: 'Partial manifestation',
            appearance: 'Humanoid body with golden-blue plumage along the forearms, a lightning-feather crest, and radiant avian wings of wind and lightning.',
        }],
    }],
    socialEdges: [],
}, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true }).state;

const sora = state.npcs.find(npc => npc.id === 'npc-sora-old');
assert(sora.currentForm === 'Base', 'Rescan did not end in recovered Base form');
assert(form(sora, 'Base')?.appearance.includes('golden-blue-haired girl'), 'Legacy ordinary appearance was not recovered into Base');
assert(form(sora, 'Partial manifestation')?.appearance.includes('radiant avian wings'), 'Previously missed intermediate form was not added');
assert(form(sora, 'Stormcrown Thunderbird')?.appearance.includes('three feet at the breast'), 'Previously captured Beast form was lost during repair');
assert(sora.appearanceForms.length === 3, 'Baseline recovery produced the wrong form count');

const chat = [
    { is_user: true, is_system: false, mes: 'Dismiss the draw. Let the core rest.' },
    { is_user: false, is_system: false, mes: 'The thunderbird dissolves and Sora stands in her ordinary girl body again.' },
];
const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
assert(prompt.includes('RECOVERY: if an older scan already captured an alternate form but no Base entry'), 'Full scanner baseline recovery instruction missing');

const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectLimit: 6, injectBudgetTokens: 6000 });
assert(injection.includes('If an older scan already captured an alternate but no Base'), 'Foreground baseline recovery instruction missing');
assert(injection.includes('Base [CURRENT]:'), 'Recovered Base form is not injected as current continuity');
assert(injection.includes('Partial manifestation:'), 'Recovered intermediate form is not injected');
assert(injection.includes('Stormcrown Thunderbird:'), 'Previously stored beast form is not injected after recovery');

console.log('NPC State 0.4.1 baseline form recovery verification passed');

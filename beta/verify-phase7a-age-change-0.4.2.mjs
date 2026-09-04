import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

function stateAt(age = '25', locked = false) {
    const state = createEmptyState('phase7a');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-p7a',
        name: 'Mira',
        age,
        manualProfileFields: locked ? ['age'] : [],
    })];
    return state;
}

function apply(state, patch, context) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-p7a'],
        inChatNpcIds: ['npc-mira-p7a'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-p7a', name: 'Mira', ...patch }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 2,
        turn: 2,
        profileContext: context,
        relationshipContext: context,
        applyReturnedNpcPatches: true,
    }).state;
}

const mira = state => state.npcs.find(npc => npc.id === 'npc-mira-p7a');

// Casual contradictory direct age remains sticky.
{
    const next = apply(stateAt('25'), { age: '31' }, 'Mira enters the room. The prose casually calls her 31 years old.');
    assert(mira(next).age === '25', 'Direct contradictory age bypassed sticky age continuity');
}

// Same-number approximate -> exact refinement still works through the ordinary field.
{
    const next = apply(stateAt('~25'), { age: '25' }, 'Her records establish that she is exactly 25 years old.');
    assert(mira(next).age === '25', 'Same-number approximate-to-exact refinement was broken');
}

// Birthday update succeeds only through ageChange and states the new age.
{
    const context = 'Today is Mira\'s birthday. She turns 26 and laughs as the candles are lit.';
    const next = apply(stateAt('25'), {
        ageChange: { age: '26', kind: 'birthday', evidence: 'Today is Mira\'s birthday. She turns 26.' },
    }, context);
    assert(mira(next).age === '26', 'Grounded birthday ageChange was rejected');
}

// Elapsed-time update requires both passage and explicit resulting age.
{
    const bad = apply(stateAt('25'), {
        ageChange: { age: '26', kind: 'elapsed', evidence: 'One year later, Mira returns to town.' },
    }, 'One year later, Mira returns to town.');
    assert(mira(bad).age === '25', 'Elapsed ageChange guessed the target age from arithmetic alone');

    const goodContext = 'One year later, Mira returns to town, now 26 years old.';
    const good = apply(stateAt('25'), {
        ageChange: { age: '26', kind: 'elapsed', evidence: 'One year later, Mira returns to town, now 26 years old.' },
    }, goodContext);
    assert(mira(good).age === '26', 'Explicit elapsed-time resulting age was rejected');
}

// Explicit correction succeeds, vague contradiction does not.
{
    const bad = apply(stateAt('25'), {
        ageChange: { age: '27', kind: 'correction', evidence: 'Mira is 27 years old.' },
    }, 'Mira is 27 years old.');
    assert(mira(bad).age === '25', 'Plain contradictory age was accepted as a correction');

    const context = 'Mira corrects the clerk: "Actually, I am 27, not 25."';
    const good = apply(stateAt('25'), {
        ageChange: { age: '27', kind: 'correction', evidence: 'Mira corrects the clerk: Actually, I am 27, not 25.' },
    }, context);
    assert(mira(good).age === '27', 'Explicit age correction was rejected');
}

// Evidence must be grounded in the supplied visible/profile context.
{
    const next = apply(stateAt('25'), {
        ageChange: { age: '26', kind: 'birthday', evidence: 'Mira turns 26 on her birthday.' },
    }, 'Mira enters quietly.');
    assert(mira(next).age === '25', 'Ungrounded ageChange evidence changed canon');
}

// Manual age locks remain authoritative.
{
    const context = 'Today is Mira\'s birthday. She turns 26.';
    const next = apply(stateAt('25', true), {
        ageChange: { age: '26', kind: 'birthday', evidence: context },
    }, context);
    assert(mira(next).age === '25', 'Scanner ageChange bypassed a manual age lock');
}

// New/sparse NPCs can still establish initial age normally.
{
    const state = createEmptyState('phase7a-new');
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['Lena'], inChatNpcIds: ['Lena'], worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Lena', age: '18' }], socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 1, turn: 1, profileContext: 'Lena says she is 18 years old.', applyReturnedNpcPatches: true });
    assert(result.state.npcs.find(npc => npc.name === 'Lena')?.age === '18', 'Initial new-NPC age population was broken');
}

// Prompt contracts use ageChange consistently.
{
    const state = stateAt('25');
    const chat = [{ is_user: true, mes: 'How old are you?' }, { is_user: false, mes: 'Mira corrects the record.' }];
    const full = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const targeted = buildTargetedRefreshPrompt({ npc: mira(state), chat, assistantMessageId: 1 });
    const foreground = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 4000 });
    assert(full.includes('ageChange') && full.includes('birthday|elapsed|correction'), 'Recovery scanner lacks ageChange contract');
    assert(targeted.includes('ageChange') && targeted.includes('birthday|elapsed|correction'), 'Targeted refresh lacks ageChange contract');
    assert(foreground.includes('ageChange') && foreground.includes('birthday|elapsed|correction'), 'Foreground capture lacks ageChange contract');

    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    assert(scanner.includes('explicitAgeChange') && scanner.includes('ageEvidenceMentionsTarget'), 'Backend ageChange gate is missing');
}

console.log('NPC State 0.4.2 phase 7A explicit age-change verification passed');

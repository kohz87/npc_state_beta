import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

function baseState(npc = {}) {
    const state = createEmptyState('phase3');
    state.npcs = [normalizeNpc({ id: 'npc-mira-p3', name: 'Mira', ...npc })];
    return state;
}

function apply(state, patch, { messageId = 2, turn = messageId, context = '' } = {}) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-p3'],
        inChatNpcIds: ['npc-mira-p3'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-p3', name: 'Mira', ...patch }],
        socialEdges: [],
    }, { sourceMessageId: messageId, turn, profileContext: context, applyReturnedNpcPatches: true }).state;
}

const mira = state => state.npcs.find(npc => npc.id === 'npc-mira-p3');

// A brand-new NPC still gets a rich baseline in one scan.
{
    const applied = applyScanResult(createEmptyState('phase3-bootstrap'), {
        exchangeActiveNpcIds: ['Lena'], inChatNpcIds: ['Lena'], worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Lena', personality: 'Patient and observant.', behaviorProfile: ['Protective of children'], speech: 'Soft, concise phrasing.', mannerisms: ['Habitually rubs her thumb over a ring when thinking.'] }],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1, profileContext: 'Lena is patient and observant. She habitually rubs her thumb over a ring when thinking.' });
    const lena = applied.state.npcs.find(npc => npc.name === 'Lena');
    assert(lena?.personality.includes('Patient'), 'New NPC personality baseline was blocked');
    assert(lena?.behaviorProfile.includes('Protective of children'), 'New NPC behavior baseline was blocked');
    assert(lena?.speech.includes('Soft'), 'New NPC speech baseline was blocked');
    assert(lena?.mannerisms.length === 1, 'New NPC mannerism baseline was blocked');
}

// Established fields cannot be rewritten just because the model returned new prose.
{
    let state = baseState({ personality: 'Kind and patient.', speech: 'Quiet and formal.', behaviorProfile: ['Avoids needless cruelty'], mannerisms: ['Folds her hands when waiting'] });
    state = apply(state, { personality: 'Cruel and impatient.', speech: 'Loud and vulgar.', behaviorProfile: ['Enjoys needless cruelty'], mannerisms: ['Slams tables'] }, { context: 'Mira slams the table once in anger.' });
    assert(mira(state).personality === 'Kind and patient.', 'Established personality changed without profileChanges evidence');
    assert(mira(state).speech === 'Quiet and formal.', 'Established speech changed without profileChanges evidence');
    assert(mira(state).behaviorProfile.includes('Avoids needless cruelty'), 'Established behavior changed without profileChanges evidence');
    assert(mira(state).mannerisms.includes('Folds her hands when waiting'), 'Established mannerism changed from a one-off scene');
}

// Compatible refinement can apply with grounded evidence, but refinement cannot hide a polarity flip.
{
    let state = baseState({ personality: 'Kind and patient.' });
    state = apply(state, {
        personality: 'Kind, patient, and especially gentle with frightened children.',
        profileChanges: [{ field: 'personality', mode: 'refine', concept: 'gentleness with frightened children', evidence: 'Mira gently reassures frightened children while remaining patient.' }],
    }, { context: 'Mira gently reassures frightened children while remaining patient.' });
    assert(mira(state).personality.includes('frightened children'), 'Grounded compatible refinement was rejected');

    state = apply(state, {
        personality: 'Cruel and merciless.',
        profileChanges: [{ field: 'personality', mode: 'refine', concept: 'cruelty', evidence: 'Mira is cruel and merciless toward one captured raider.' }],
    }, { messageId: 3, context: 'Mira is cruel and merciless toward one captured raider.' });
    assert(mira(state).personality.includes('Kind'), 'Refinement channel smuggled a morality flip');
}

// Gradual development requires the same labeled concept on a distinct scan.
{
    let state = baseState({ personality: 'Reserved and cautious.' });
    const patch = {
        personality: 'Reserved but increasingly willing to speak her mind.',
        profileChanges: [{ field: 'personality', mode: 'gradual', concept: 'growing assertiveness', evidence: 'Mira speaks up despite her usual reserve.' }],
    };
    state = apply(state, patch, { messageId: 2, context: 'Mira speaks up despite her usual reserve.' });
    assert(mira(state).personality === 'Reserved and cautious.', 'First gradual evidence changed personality immediately');
    assert(mira(state).profileEvolutionEvidence.length === 1, 'First gradual evidence was not queued');
    state = apply(state, { ...patch, profileChanges: [{ ...patch.profileChanges[0], evidence: 'Mira again speaks up for herself despite her usual reserve.' }] }, { messageId: 4, context: 'Mira again speaks up for herself despite her usual reserve.' });
    assert(mira(state).personality.includes('willing to speak'), 'Second distinct gradual confirmation did not apply');
}

// Explicit lasting change needs an actual lasting-change cue.
{
    let state = baseState({ speech: 'Careful formal speech.' });
    state = apply(state, {
        speech: 'Blunt informal speech.',
        profileChanges: [{ field: 'speech', mode: 'explicit', concept: 'speech shift', evidence: 'Mira speaks bluntly in this argument.' }],
    }, { context: 'Mira speaks bluntly in this argument.' });
    assert(mira(state).speech === 'Careful formal speech.', 'One-scene speech shift was accepted as explicit lasting change');
    state = apply(state, {
        speech: 'Blunt informal speech.',
        profileChanges: [{ field: 'speech', mode: 'explicit', concept: 'speech shift', evidence: 'Mira says she will speak plainly from now on.' }],
    }, { messageId: 3, context: 'Mira says she will speak plainly from now on, abandoning her old courtly phrasing.' });
    assert(mira(state).speech === 'Blunt informal speech.', 'Explicit lasting speech change was rejected');
}

// Batch evolution requires an actual narrated time skip.
{
    let state = baseState({ behaviorProfile: ['Avoids leadership'] });
    const change = [{ field: 'behaviorProfile', mode: 'batch', concept: 'leadership growth', evidence: 'Mira became comfortable leading patrols over months of practice.' }];
    state = apply(state, { behaviorProfile: ['Comfortable leading patrols'], profileChanges: change }, { context: 'Mira leads today\'s patrol confidently.' });
    assert(mira(state).behaviorProfile.includes('Avoids leadership'), 'Batch change applied without a narrated time skip');
    state = apply(state, { behaviorProfile: ['Comfortable leading patrols'], profileChanges: change }, { messageId: 4, context: 'Six months later, Mira had become comfortable leading patrols over months of practice.' });
    assert(mira(state).behaviorProfile.includes('Comfortable leading patrols'), 'Grounded batch development across a time skip was rejected');
}

// Sparse existing mannerisms cannot be seeded from one isolated gesture unless it is
// explicitly described as a habit/recurring behavior.
{
    let state = baseState({ mannerisms: [] });
    state = apply(state, {
        mannerisms: ['Taps the table when thinking'],
        profileChanges: [{ field: 'mannerisms', mode: 'refine', concept: 'table tapping', evidence: 'Mira taps the table once while thinking.' }],
    }, { context: 'Mira taps the table once while thinking.' });
    assert(mira(state).mannerisms.length === 0, 'One-off gesture became a durable mannerism');
    state = apply(state, {
        mannerisms: ['Taps the table when thinking'],
        profileChanges: [{ field: 'mannerisms', mode: 'refine', concept: 'table tapping', evidence: 'Mira habitually taps the table whenever she is thinking.' }],
    }, { messageId: 3, context: 'Mira habitually taps the table whenever she is thinking.' });
    assert(mira(state).mannerisms.includes('Taps the table when thinking'), 'Explicit habitual mannerism was rejected');
}

// Prompt and private-state invariants.
{
    const state = baseState({ personality: 'Reserved.' });
    const chat = [{ is_user: true, mes: 'Talk to Mira.' }, { is_user: false, mes: 'Mira answers.' }];
    const scan = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const targeted = buildTargetedRefreshPrompt({ npc: mira(state), chat, assistantMessageId: 1 });
    const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 4000 });
    assert(scan.includes('DURABLE PROFILE EVOLUTION') && scan.includes('profileChanges'), 'Recovery scanner lacks profile evolution contract');
    assert(targeted.includes('DURABLE PROFILE EVOLUTION') && targeted.includes('profileChanges'), 'Targeted refresh lacks profile evolution contract');
    assert(injection.includes('DURABLE PROFILE EVOLUTION') && injection.includes('profileChanges'), 'Foreground capture lacks profile evolution contract');
    assert(!injection.includes('profileEvolutionEvidence'), 'Private profile evolution ledger leaked into RP injection');

    const schema = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    assert(schema.includes('normalizeProfileEvolutionEvidence'), 'Profile evidence normalizer missing');
    assert(scanner.includes('profileEvolutionDecision') && scanner.includes('PROFILE_TIME_SKIP_CUES'), 'Profile evolution backend gates missing');
    assert(engine.includes('profileContextForWindow') && engine.includes('profileContext: relationshipContextForExchange(exchange)'), 'Profile grounding context is not wired');
}

console.log('NPC State 0.4.2 phase 3 durable profile evolution verification passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInjection } from '../v03/injection.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const injectionSource = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
if (manifest.version !== '0.4.34' || !scannerSource.includes('lifeStateEvidenceMatchesStoredStatus')) {
    console.log('NPC State v0.4.34 terminal-status verification skipped on pre-transform source checkout');
    process.exit(0);
}

const terminalStatuses = [
    'Dissolved into pure ambient mana after reaching out toward the newly hatched chimeric girls',
    'Deceased; physical body and mortal essence dissolved and absorbed into the hatching Silver Dragon chimera egg',
    'Slain in combat; stripped corpse left in the snow along the White Maw path',
];

function stateWithStatus(status, key = 'terminal-status') {
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc({
        id: 'npc-mira-terminal',
        name: 'Mira',
        aliases: [],
        role: 'Traveller',
        status,
        lifeState: 'alive',
        lifeStateCertainty: 'explicit',
        lifeStateReason: 'Previously assumed alive.',
        archived: false,
        present: false,
        worldActive: true,
        relationship: { trust: 12, affection: 8, desire: 0, tension: 1 },
        relationshipHistory: [{ impact: 'meaningful', delta: { trust: 1, affection: 1, desire: 0, tension: 0 }, reason: 'Existing relationship history.', at: 10 }],
        memories: ['Existing memory survives lifecycle reconciliation.'],
    }, { now: 20 })];
    return state;
}

function repairResult(status, certainty = 'strong') {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        // Reproduce the bad combination directly: model/activity path still claims off-screen
        // activity while the same patch correctly reconciles the stored terminal condition.
        worldActiveNpcIds: ['Mira'],
        npcs: [{
            id: 'npc-mira-terminal',
            name: 'Mira',
            lifeState: 'dead',
            lifeStateCertainty: certainty,
            lifeStateReason: status,
        }],
        socialEdges: [],
        familyFacts: [],
    };
}

for (const status of terminalStatuses) {
    const state = applyScanResult(stateWithStatus(status), repairResult(status), {
        sourceMessageId: 50,
        turn: 50,
        applyReturnedNpcPatches: true,
        profileContext: 'No current exchange repeats the old death event.',
    }).state;
    const mira = state.npcs[0];
    assert.equal(mira.lifeState, 'dead', 'Exact stored terminal status did not repair lifeState: ' + status);
    assert.equal(mira.archived, true, 'Stored terminal status did not archive immediately: ' + status);
    assert.equal(mira.archiveReason, 'deceased', 'Stored terminal status did not use deceased archive reason: ' + status);
    assert.equal(mira.present, false, 'Stored terminal status left NPC in-chat: ' + status);
    assert.equal(mira.worldActive, false, 'Confirmed stored-status death lost to worldActive/off-screen claim: ' + status);
    assert.equal(mira.relationship.trust, 12, 'Stored-status repair changed relationship meters');
    assert.equal(mira.relationshipHistory.length, 1, 'Stored-status repair discarded relationship history');
    assert.deepEqual(mira.memories, ['Existing memory survives lifecycle reconciliation.'], 'Stored-status repair discarded dossier memory');
}

// Stored status is a deliberately narrow provenance channel. A paraphrase that is neither
// current source text nor the exact stored Status remains rejected.
{
    const stored = terminalStatuses[1];
    const state = applyScanResult(stateWithStatus(stored), repairResult('Mira is deceased.', 'explicit'), {
        sourceMessageId: 51,
        turn: 51,
        applyReturnedNpcPatches: true,
        profileContext: 'No current exchange repeats the old death event.',
    }).state;
    const mira = state.npcs[0];
    assert.equal(mira.lifeState, 'alive', 'Non-exact stored-status paraphrase bypassed provenance');
    assert.equal(mira.archived, false, 'Non-exact stored-status paraphrase archived dossier');
    assert.equal(mira.worldActive, true, 'Rejected death unexpectedly cleared prior worldActive state');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.code, 'unverifiable-evidence', 'Non-exact stored-status rejection was not diagnosed');
}

// Uncertain semantic judgments never become authoritative merely because evidence is exact.
{
    const stored = terminalStatuses[2];
    const state = applyScanResult(stateWithStatus(stored), repairResult(stored, 'uncertain'), {
        sourceMessageId: 52,
        turn: 52,
        applyReturnedNpcPatches: true,
        profileContext: 'No current exchange repeats the old death event.',
    }).state;
    const mira = state.npcs[0];
    assert.equal(mira.lifeState, 'alive', 'Uncertain stored-status judgment confirmed death');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.code, 'insufficient-certainty', 'Uncertain stored-status rejection was not diagnosed');
}

// Stored terminal Status is death-repair evidence only. It must never function as resurrection
// evidence even when copied exactly into lifeStateReason.
{
    const stored = terminalStatuses[0];
    const state = stateWithStatus(stored, 'terminal-resurrection');
    state.npcs[0] = normalizeNpc({
        ...state.npcs[0], lifeState: 'dead', archived: true, archiveReason: 'deceased', worldActive: false,
    }, { now: 30 });
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'],
        inChatNpcIds: ['Mira'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-terminal', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: stored, livingReturn: true }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 53,
        turn: 53,
        applyReturnedNpcPatches: true,
        profileContext: 'Nothing in the current exchange establishes a living return.',
    }).state;
    const mira = result.npcs[0];
    assert.equal(mira.lifeState, 'dead', 'Stored terminal Status was incorrectly used to resurrect dossier');
    assert.equal(mira.archived, true, 'Stored terminal Status unarchived deceased dossier');
    assert.equal(mira.lifeStateDiagnostics.at(-1)?.code, 'unverifiable-evidence', 'Stored-status resurrection rejection was not diagnosed');
}

// Recovery scanner must actually receive the contradictory fields so the semantic model can
// reconcile them rather than seeing only a generic active/unarchived roster entry.
{
    const stored = terminalStatuses[1];
    const state = stateWithStatus(stored, 'terminal-prompt');
    const chat = [
        { id: 0, is_user: true, mes: 'We continue down the road.' },
        { id: 1, is_user: false, mes: 'Snow falls over the pass.' },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8 });
    assert(prompt.includes(stored), 'Recovery scanner does not receive stored terminal Status');
    assert(prompt.includes('"lifeState":"alive"'), 'Recovery scanner does not receive existing Life state');
    assert(prompt.includes('STORED TERMINAL-STATUS RECONCILIATION'), 'Recovery scanner lacks terminal-status reconciliation contract');
    assert(prompt.includes('never worldActive'), 'Recovery scanner lacks dead/worldActive consistency instruction');
}

// Foreground capture needs the same continuity, because ordinary turns use embedded capture
// rather than the recovery scanner.
{
    const stored = terminalStatuses[2];
    const state = stateWithStatus(stored, 'terminal-foreground');
    const prompt = buildInjection(state, {
        enabled: true,
        autoScan: true,
        inject: true,
        injectLimit: 6,
        injectBudgetTokens: 2600,
        newNpcAdmissionMode: 'balanced',
        relationshipCaps: { ordinary: 1, meaningful: 2, major: 5, extreme: 10 },
        relationshipCriteria: '', memoryCriteria: '', foregroundCurrentUserText: '',
    });
    assert(prompt.includes('Status: ' + stored), 'Foreground continuity omits stored terminal Status');
    assert(prompt.includes('Life state: alive'), 'Foreground continuity omits existing Life state');
    assert(prompt.includes('STORED TERMINAL-STATUS RECONCILIATION'), 'Foreground capture lacks terminal-status reconciliation contract');
    assert(prompt.includes('WORLD-ACTIVE CONSISTENCY'), 'Foreground capture lacks dead/worldActive consistency contract');
}

// Architecture invariant: no English death parser was reintroduced to perform this repair.
assert(scannerSource.includes('proof === stored'), 'Stored-status provenance is not exact equality');
assert(!scannerSource.includes('AFFIRMATIVE_DEATH_CUE'), 'Hardcoded death cue grammar reappeared');
assert(!scannerSource.includes('clauseAssertsNpcDeath'), 'Hardcoded death sentence parser reappeared');
assert(injectionSource.includes("field('Life state', npc.lifeState)"), 'Foreground dossier continuity still omits life state');

console.log('NPC State v0.4.34 terminal-status lifecycle reconciliation verified');

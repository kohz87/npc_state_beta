import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInjection } from '../v03/injection.js';
import {
    applyManualLifeStateTransition,
    createEmptyState,
    normalizeNpc,
} from '../v03/schema.js';
import {
    applyScanResult,
    buildScanPrompt,
    buildTargetedRefreshPrompt,
} from '../v03/scanner.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scannerSource = read('v03/scanner.js');
const engineSource = read('v03/engine.js');
const uiSource = read('v03/ui.js');
const injectionSource = read('v03/injection.js');

if (manifest.version !== '0.4.36' || !scannerSource.includes('lifeStateUpdateByNpcId')) {
    console.log('NPC State v0.4.36 lifecycle/manual recovery verification skipped on pre-transform source checkout');
    process.exit(0);
}

const dissolvedStatus = 'Deceased; physical body and mortal essence dissolved into pure ambient mana with no continuing living form.';

function aliveState(status = dissolvedStatus, key = 'v0436-life-state') {
    const state = createEmptyState(key);
    state.npcs = [normalizeNpc({
        id: 'npc-mira-life',
        name: 'Mira',
        aliases: ['Mira Vale'],
        status,
        lifeState: 'alive',
        lifeStateCertainty: 'explicit',
        lifeStateReason: 'Previously believed alive.',
        archived: false,
        present: false,
        worldActive: true,
        relationship: { trust: 14, affection: 9, desire: 0, tension: 1 },
        memories: ['Existing continuity survives lifecycle repair.'],
    }, { now: 20 })];
    return state;
}

function scanResult(lifeStateUpdates = [], npcs = []) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs,
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates,
    };
}

// Critical regression: lifecycle repair must not depend on the NPC also having an ordinary
// profile/activity patch. This is the hole that let terminal dissolution remain alive.
{
    const state = applyScanResult(aliveState(), scanResult([{
        id: 'npc-mira-life',
        name: 'Mira',
        lifeState: 'dead',
        lifeStateCertainty: 'strong',
        lifeStateReason: dissolvedStatus,
        livingReturn: false,
    }]), {
        sourceMessageId: 40,
        turn: 40,
        applyReturnedNpcPatches: true,
        profileContext: 'No current exchange repeats the old event.',
    }).state;
    const mira = state.npcs[0];
    assert.equal(mira.lifeState, 'dead', 'Dedicated stored-status repair did not set dead');
    assert.equal(mira.archived, true, 'Dedicated stored-status repair did not archive');
    assert.equal(mira.archiveReason, 'deceased', 'Dedicated stored-status repair did not mark deceased');
    assert.equal(mira.present, false, 'Dedicated stored-status repair left NPC present');
    assert.equal(mira.worldActive, false, 'Dedicated stored-status repair left NPC world-active');
    assert.equal(mira.relationship.trust, 14, 'Lifecycle repair changed relationship meters');
    assert.deepEqual(mira.memories, ['Existing continuity survives lifecycle repair.'], 'Lifecycle repair discarded memory');
}

// Current explicitly deceased irreversible dissolution can travel entirely through the
// lifecycle channel. Backend still requires exact current-source grounding and target binding.
{
    const evidence = 'Mira is deceased; her body and mortal essence dissolve into ambient mana, leaving no continuing living form.';
    const state = applyScanResult(aliveState('Standing nearby.', 'v0436-current-dissolution'), scanResult([{
        id: 'npc-mira-life',
        name: 'Mira',
        lifeState: 'dead',
        lifeStateCertainty: 'explicit',
        lifeStateReason: evidence,
        livingReturn: false,
    }]), {
        sourceMessageId: 41,
        turn: 41,
        profileContext: evidence,
    }).state;
    assert.equal(state.npcs[0].lifeState, 'dead', 'Grounded current dissolution did not set dead');
    assert.equal(state.npcs[0].archiveReason, 'deceased', 'Grounded current dissolution did not archive as deceased');
}

// The dedicated lifecycle channel is authoritative when a normal dossier patch is also
// present. An incidental ordinary patch must not cancel an accepted death transition.
{
    const evidence = 'Mira is deceased; her body dissolves completely into ambient mana with no surviving form.';
    const state = applyScanResult(aliveState('Standing nearby.', 'v0436-authority'), scanResult([{
        name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'strong', lifeStateReason: evidence,
    }], [{ id: 'npc-mira-life', name: 'Mira', status: 'No body remains.', lifeState: 'alive', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira was alive earlier.' }]), {
        sourceMessageId: 42,
        turn: 42,
        applyReturnedNpcPatches: true,
        allowHistoricalProfilePatches: true,
        profileContext: evidence + '\nMira was alive earlier.',
    }).state;
    assert.equal(state.npcs[0].lifeState, 'dead', 'Normal dossier patch overrode dedicated lifecycle death');
    assert.equal(state.npcs[0].archived, true, 'Dedicated lifecycle death did not remain archived');
}

// Certainty gate remains intact for the new channel.
{
    const state = applyScanResult(aliveState(dissolvedStatus, 'v0436-uncertain'), scanResult([{
        id: 'npc-mira-life', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'uncertain', lifeStateReason: dissolvedStatus,
    }]), { sourceMessageId: 43, turn: 43 }).state;
    assert.equal(state.npcs[0].lifeState, 'alive', 'Uncertain dedicated lifecycle update confirmed death');
    assert.equal(state.npcs[0].lifeStateDiagnostics.at(-1)?.code, 'insufficient-certainty', 'Uncertain lifecycle rejection was not diagnosed');
}

// Manual lifecycle recovery is authoritative but local. Recovering a deceased dossier clears
// only the deceased archive and never invents scene presence/activity.
{
    const dead = normalizeNpc({
        id: 'npc-manual-dead', name: 'Manual Dead', lifeState: 'dead', archived: true,
        archiveReason: 'deceased', archivedAt: 10, present: false, worldActive: false,
    }, { now: 20 });
    const alive = normalizeNpc(applyManualLifeStateTransition(dead, 'alive', { reason: 'Manual correction.' }), { now: 30 });
    assert.equal(alive.lifeState, 'alive');
    assert.equal(alive.archived, false, 'Manual dead -> alive did not recover deceased archive');
    assert.equal(alive.archiveReason, '');
    assert.equal(alive.archivedAt, null);
    assert.equal(alive.present, false, 'Manual recovery invented in-chat presence');
    assert.equal(alive.worldActive, false, 'Manual recovery invented off-screen activity');
    assert.equal(alive.lifeStateReason, 'Manual correction.');

    const unknown = normalizeNpc(applyManualLifeStateTransition(dead, 'unknown', { reason: 'Death record withdrawn.' }), { now: 31 });
    assert.equal(unknown.lifeState, 'unknown');
    assert.equal(unknown.archived, false, 'Manual dead -> unknown did not recover deceased archive');

    const living = normalizeNpc({ id: 'npc-manual-live', name: 'Manual Live', lifeState: 'alive' }, { now: 20 });
    const killed = normalizeNpc(applyManualLifeStateTransition(living, 'dead', { reason: 'Manual death confirmation.' }), { now: 32 });
    assert.equal(killed.lifeState, 'dead');
    assert.equal(killed.archived, true);
    assert.equal(killed.archiveReason, 'deceased');

    const manualArchive = normalizeNpc({
        id: 'npc-manual-archive', name: 'Manual Archive', lifeState: 'alive', archived: true, archiveReason: 'manual', archivedAt: 12,
    }, { now: 20 });
    const unchanged = normalizeNpc(applyManualLifeStateTransition(manualArchive, 'alive', { reason: 'Still alive.' }), { now: 33 });
    assert.equal(unchanged.archived, true, 'Manual life-state helper unarchived unrelated manual archive');
    assert.equal(unchanged.archiveReason, 'manual');
}

// Prompt/transport contracts must make lifecycle evaluation independent of ordinary npcs.
{
    const state = aliveState(dissolvedStatus, 'v0436-prompts');
    const chat = [
        { id: 0, is_user: true, mes: 'We continue down the road.' },
        { id: 1, is_user: false, mes: 'Rain falls over the old stones.' },
    ];
    const full = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8 });
    assert(full.includes('LIFE-STATE UPDATE CHANNEL'), 'Full scan lacks dedicated lifecycle rule');
    assert(full.includes('lifeStateUpdates'), 'Full scan output contract lacks lifecycle channel');
    assert(full.includes('you MUST emit a lifeStateUpdates row'), 'Full scan does not make stored-status repair mandatory');
    assert(full.includes('reversible'), 'Full scan does not distinguish terminal dissolution from reversible form changes');

    const targeted = buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1, scanDepth: 8 });
    assert(targeted.includes('lifeStateUpdates'), 'Targeted refresh lacks lifecycle channel');
    assert(targeted.includes('terminally/irreversibly dissolved'), 'Targeted refresh lost dissolution reconciliation');

    const foreground = buildInjection(state, {
        enabled: true, autoScan: true, inject: true, injectLimit: 6, injectBudgetTokens: 2600,
        newNpcAdmissionMode: 'balanced', relationshipCaps: { ordinary: 1, meaningful: 2, major: 5, extreme: 10 },
        relationshipCriteria: '', memoryCriteria: '', foregroundCurrentUserText: '',
    });
    assert(foreground.includes('lifeStateUpdates'), 'Foreground capture lacks dedicated lifecycle channel');
    assert(foreground.includes('you MUST emit a lifeStateUpdates row'), 'Foreground capture does not require stored-status lifecycle repair');
}

// Manual editor and engine plumbing must expose the recovery route the backend already needed.
assert(uiSource.includes('npc_state_v3_edit_life_state'), 'Dossier editor lacks Life state control');
assert(uiSource.includes('npc_state_v3_edit_life_state_reason'), 'Dossier editor lacks Life-state note control');
assert(uiSource.includes("lifeState: value('npc_state_v3_edit_life_state')"), 'Editor save does not send Life state');
assert(engineSource.includes('applyManualLifeStateTransition'), 'Engine does not use manual lifecycle helper');
assert(engineSource.includes("rejected: 'invalid-life-state'"), 'Engine does not reject invalid manual life-state values');
assert(engineSource.includes('parsedRaw.lifeStateUpdates'), 'Targeted refresh drops dedicated lifecycle updates');
assert(injectionSource.includes('lifeStateUpdates'), 'Foreground output shape lacks lifecycle updates');

// Architecture invariant: semantic English interpretation remains model-owned. The new
// lifecycle transport must not regress to a hardcoded death sentence parser.
assert(!scannerSource.includes('AFFIRMATIVE_DEATH_CUE'), 'Hardcoded death cue grammar reappeared');
assert(!scannerSource.includes('clauseAssertsNpcDeath'), 'Hardcoded death sentence parser reappeared');
assert(!scannerSource.includes('affirmativeDeathEvidence'), 'Hardcoded affirmative-death parser reappeared');

console.log('NPC State v0.4.36 lifecycle reconciliation and manual recovery verified');

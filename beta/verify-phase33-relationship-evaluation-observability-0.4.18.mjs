import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

function stateWithGreta() {
    const state = createEmptyState('relationship-evaluation-observability');
    state.npcs = [normalizeNpc({
        id: 'npc-greta',
        name: 'Greta Vane',
        aliases: ['Greta'],
        role: 'Innkeeper',
        present: true,
        relationship: ZERO,
    })];
    return state;
}

function apply(state, result, options = {}) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        familyFacts: [],
        ...result,
    }, {
        sourceMessageId: 10,
        turn: 10,
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        requireCurrentRelationshipEvidence: false,
        ...options,
    }).state.npcs.find(npc => npc.id === 'npc-greta');
}

// A deliberate zero must be observable without becoming relationship history.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [{
            id: 'npc-greta',
            name: 'Greta Vane',
            relationshipChange: {
                evaluated: true,
                impact: 'none',
                delta: ZERO,
                evidence: '',
                reason: 'Routine first lodging interaction; no personal relationship shift is warranted yet.',
            },
        }],
    });
    assert.deepEqual(greta.relationship, ZERO, 'Explicit no-change evaluation moved relationship scores');
    assert.equal(greta.relationshipHistory.length, 0, 'Explicit no-change evaluation polluted relationship history');
    assert.equal(greta.relationshipEvidenceHistory.length, 0, 'Explicit no-change evaluation polluted evidence history');
    assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('evaluated-no-change'), 'Explicit no-change evaluation was not recorded');
    assert.match(greta.relationshipDiagnostics.at(-1)?.reason || '', /Routine first lodging interaction/i, 'No-change reason was not preserved');
}

// If an exchange-active NPC gets no patch at all, omission must be visible.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [],
    });
    assert.deepEqual(greta.relationship, ZERO, 'Missing evaluation moved relationship scores');
    assert.equal(greta.relationshipHistory.length, 0, 'Missing evaluation polluted relationship history');
    assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('evaluation-missing'), 'Missing active-NPC relationship evaluation was silent');
}

// A returned active patch that omits the required evaluated flag is also distinguishable.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [{
            id: 'npc-greta', name: 'Greta Vane',
            relationshipChange: { impact: 'none', delta: ZERO, evidence: '', reason: 'No change.' },
        }],
    });
    assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('evaluation-missing'), 'Missing evaluated flag was accepted as a deliberate zero');
}

// A malformed attempted change should not masquerade as a clean no-change evaluation.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [{
            id: 'npc-greta', name: 'Greta Vane',
            relationshipChange: { evaluated: true, impact: 'ordinary', delta: { ...ZERO, trust: 1 }, evidence: '', reason: '' },
        }],
    });
    assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:missing-axis-evidence'), 'Malformed attempted relationship change was not diagnosed precisely');
    assert.equal(greta.relationshipHistory.length, 0, 'Malformed evaluation created relationship history');
}

// Non-exchange-active NPCs are not required to emit a relationship evaluation.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: [],
        inChatNpcIds: ['npc-greta'],
        npcs: [],
    });
    assert.equal(greta.relationshipDiagnostics.length, 0, 'Presence-only NPC received spurious missing-evaluation telemetry');
}

// Existing accepted relationship changes still use the normal scoring path.
{
    const greta = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [{
            id: 'npc-greta', name: 'Greta Vane',
            relationshipChange: {
                evaluated: true,
                impact: 'ordinary',
                delta: { ...ZERO, trust: 1 },
                priority: ['trust'],
                axisEvidence: { trust: { excerpts: ['Lucien paid exactly as promised and returned the room key to Greta.'], explanation: 'Verifier trust judgment for reliable follow-through.' } },
                evidence: 'Lucien paid exactly as promised and returned the room key to Greta.',
                reason: 'Lucien followed through reliably on a small commitment.',
            },
        }],
    }, { relationshipContext: 'Lucien paid exactly as promised and returned the room key to Greta.' });
    assert.equal(greta.relationship.trust, 1, 'Normal accepted Trust movement regressed');
    assert.equal(greta.relationshipHistory.length, 1, 'Accepted relationship movement did not enter history');
    assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('applied'), 'Accepted relationship change lost scoring diagnostics');
}

// Rescans that deliberately disable relationship application must not duplicate evaluation telemetry.
{
    const first = apply(stateWithGreta(), {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [{
            id: 'npc-greta', name: 'Greta Vane',
            relationshipChange: { evaluated: true, impact: 'none', delta: ZERO, evidence: '', reason: 'Routine interaction.' },
        }],
    });
    const state = createEmptyState('relationship-rescan');
    state.npcs = [first];
    const rescanned = apply(state, {
        exchangeActiveNpcIds: ['npc-greta'],
        inChatNpcIds: ['npc-greta'],
        npcs: [],
    }, { sourceMessageId: 10, turn: 11, applyRelationship: false });
    assert.equal(rescanned.relationshipDiagnostics.length, first.relationshipDiagnostics.length, 'Relationship-disabled rescan duplicated evaluation telemetry');
}

const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
const dossier = fs.readFileSync(new URL('../v03/dossier-view.js', import.meta.url), 'utf8');
assert(scanner.includes('RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds'), 'Recovery scanner lacks mandatory relationship evaluation instruction');
assert(injection.includes('RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds'), 'Foreground scanner lacks mandatory relationship evaluation instruction');
assert(scanner.includes('relationshipChange.evaluated to true'), 'Recovery scanner does not require evaluated=true');
assert(injection.includes('relationshipChange.evaluated to true'), 'Foreground scanner does not require evaluated=true');
assert(scanner.includes("['evaluated-no-change']"), 'Deliberate zero diagnostic path is missing');
assert(scanner.includes("['evaluation-missing']"), 'Missing evaluation diagnostic path is missing');
assert(scanner.includes("'evaluation-invalid'"), 'Invalid evaluation diagnostic path is missing');
assert(dossier.includes('Gate status and recent relationship evaluations'), 'Dossier does not expose relationship evaluation telemetry clearly');
assert(dossier.includes('Evaluated; no relationship movement warranted.'), 'Dossier lacks deliberate-zero display');
assert(dossier.includes('No score change.') && dossier.includes('Overall:'), 'Dossier lacks precise zero/omission display');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
assert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 18, 'Manifest regressed below v0.4.18');

console.log('NPC State 0.4.18 relationship evaluation observability verified');

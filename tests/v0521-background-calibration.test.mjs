import test from 'node:test';
import assert from 'node:assert/strict';

import { scanOutputExamples } from '../src/scan-contract.js';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

function state(key = 'chat:v0521') {
    const value = createEmptyState(key);
    value.branchSafety = { status: 'safe' };
    return value;
}

test('compact fictional new-NPC example demonstrates grounded Background instead of marking it insufficient', () => {
    const nia = scanOutputExamples().populated.npcs.find(npc => npc.name === 'Nia');
    assert.ok(nia);
    assert.equal(nia.role, 'Harbor clerk');
    assert.equal(nia.background, 'Clerk of the South Quay Registry.');
    assert.equal(nia.fieldEvaluations.insufficient.includes('background'), false);
});

test('new NPC may persist Role and grounded workplace Background from the same current evidence', () => {
    const excerpt = 'Morwen Cole, intake clerk at the Rimecross Adventurer Guild outpost, pulls Lucien to the counter.';
    const payload = {
        exchangeActiveNpcIds: ['Morwen Cole'],
        inChatNpcIds: ['Morwen Cole'],
        worldActiveNpcIds: [],
        npcs: [{
            id: '',
            name: 'Morwen Cole',
            identityKind: 'named',
            evaluatedGroups: ['canon'],
            identityEvidence: { anchor: 'Morwen Cole', excerpts: [excerpt], explanation: 'Morwen is named and her guild employment is explicit.' },
            activityEvidence: {
                exchangeActive: { excerpts: [excerpt], explanation: 'Morwen directly handles Lucien at intake.' },
                inChat: { excerpts: [excerpt], explanation: 'Morwen remains at the counter with Lucien.' },
            },
            role: 'Adventurer Guild intake clerk',
            background: 'Intake clerk at the Rimecross Adventurer Guild outpost.',
            fieldEvaluations: {
                unchanged: [],
                insufficient: ['species', 'age', 'apparentAge', 'birthday', 'appearance', 'appearanceForms'],
                unavailable: [],
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
    const result = applyScanResult(state(), payload, {
        sourceMessageId: 1,
        turn: 1,
        currentAdmissionText: excerpt,
        profileContext: excerpt,
        semanticEvidenceContext: excerpt,
        relationshipContext: excerpt,
        relationshipEvidenceSources: [{ id: 'current', kind: 'visible', text: excerpt }],
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        requireDossierCoverage: false,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
    });
    const morwen = result.state.npcs.find(npc => npc.name === 'Morwen Cole');
    assert.ok(morwen);
    assert.equal(morwen.role, 'Adventurer Guild intake clerk');
    assert.equal(morwen.background, 'Intake clerk at the Rimecross Adventurer Guild outpost.');
});

test('Scan and Refresh explicitly distinguish Role from grounded employment Background', () => {
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I approach the Adventurer Guild desk.' },
        { is_user: false, name: 'Assistant', mes: 'Morwen Cole, intake clerk at the Rimecross Adventurer Guild outpost, greets Lucien.' },
    ];
    const scan = buildScanPrompt({ state: state('chat:v0521-scan'), chat, assistantMessageId: 1, playerName: 'Lucien' });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'npc-morwen', name: 'Morwen Cole' }), chat, assistantMessageId: 1, playerName: 'Lucien' });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /role=current function\/title/);
        assert.match(prompt, /background=durable affiliation\/employment/);
        assert.match(prompt, /even if it also supports role/);
        assert.match(prompt, /do not mark background insufficient merely because role is populated/);
    }
});

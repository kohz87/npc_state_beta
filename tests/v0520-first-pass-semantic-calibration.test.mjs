import { citedFixture } from './helpers/cited-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const ZERO_REL = {
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'First encounter is transactional and does not move numeric relationship axes.',
};

const USER = 'A young woman receptionist grabs Lucien at the Adventurer Guild and rushes him through registration before showing him bounty contracts.';
const ASSISTANT = [
    'Vrena Pell, the guild clerk, pulls Lucien toward the reception counter.',
    'Two waiting carters barely look up; they have seen Vrena drag new arrivals in from the weather before.',
    'Vrena shoves the inkwell across the counter, pushes a quill into Lucien’s hand, taps the registration line, then points at the bounty broadsheet.',
    'Vrena Pell holds the quill out toward your hand again while asking whether Lucien will take the boar contract.',
].join(' ');
const VISIBLE = `${USER}\n${ASSISTANT}`;

function state(key = 'chat:v0520') {
    const value = createEmptyState(key);
    value.branchSafety = { status: 'safe' };
    return value;
}

function payload() {
    return {
        exchangeActiveNpcIds: ['Vrena Pell'],
        inChatNpcIds: ['Vrena Pell'],
        worldActiveNpcIds: [],
        npcs: [citedFixture({
            id: '',
            name: 'Vrena Pell',
            identityKind: 'named',
            evaluatedGroups: ['canon', 'profile', 'live', 'memory', 'npcRelationships'],
            identityEvidence: {
                anchor: 'Vrena Pell',
                excerpts: ['Vrena Pell, the guild clerk, pulls Lucien toward the reception counter.'],
                explanation: 'The current visible exchange names Vrena Pell and identifies her as the guild clerk.',
            },
            activityEvidence: {
                exchangeActive: {
                    excerpts: ['Vrena shoves the inkwell across the counter, pushes a quill into Lucien’s hand, taps the registration line, then points at the bounty broadsheet.'],
                    explanation: 'Vrena acts directly on Lucien and the registration materials.',
                },
                inChat: {
                    excerpts: ['Vrena Pell holds the quill out toward your hand again while asking whether Lucien will take the boar contract.'],
                    explanation: 'Vrena remains directly engaged with Lucien at the counter.',
                },
            },
            role: 'Adventurer Guild clerk',
            background: 'Clerk at the Adventurer Guild reception counter.',
            apparentAge: '~20-30',
            appearance: 'A young woman guild clerk working behind the reception counter.',
            personality: 'Brisk, assertive, and practically task-focused during intake.',
            behaviorProfile: ['Intake: Takes immediate control of registration and moves new arrivals quickly from paperwork to available work.'],
            speech: 'Brief, directive, and practical during registration.',
            mannerisms: ['Handles paperwork with brisk directive gestures, pushing implements toward applicants and tapping or pointing at the relevant place.'],
        profileEstablishment: { mannerisms: 'reinforced' },
            mood: 'Hurried and practical',
            location: 'Adventurer Guild reception counter',
            goal: 'Finish Lucien’s registration and put a suitable bounty in front of him',
            status: 'Holding out the quill while waiting for Lucien to choose the boar contract',
            relationshipChange: structuredClone(ZERO_REL),
            relationshipSummary: 'Brisk and transactional; Vrena treats Lucien as a provisional guild applicant being moved rapidly into available work.',
            relationshipSummaryEvidence: {
                excerpts: ['Vrena Pell holds the quill out toward your hand again while asking whether Lucien will take the boar contract.'],
                explanation: 'Vrena Pell holds the quill out toward your hand again while asking whether Lucien will take the boar contract.',
            },
            fieldEvaluations: {
                unchanged: [],
                insufficient: ['species', 'age', 'birthday', 'appearanceForms', 'currentForm', 'memories', 'keyRelationships'],
                unavailable: [],
            },
        }, {
            role: VISIBLE, background: VISIBLE, apparentAge: USER, appearance: VISIBLE,
            personality: ASSISTANT, behaviorProfile: ASSISTANT, speech: ASSISTANT,
            mannerisms: { excerpt: ASSISTANT, establishment: 'reinforced' },
            mood: ASSISTANT, location: ASSISTANT, goal: ASSISTANT, status: ASSISTANT,
        })],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

test('Vrena-style first encounter can persist narrow apparent age, behavior, mannerism and zero-score Current Dynamic together', () => {
    const result = applyScanResult(state(), payload(), {
        sourceMessageId: 1,
        turn: 1,
        currentAdmissionText: VISIBLE,
        profileContext: VISIBLE,
        semanticEvidenceContext: VISIBLE,
        relationshipContext: VISIBLE,
        relationshipEvidenceSources: [{ id: 'current', kind: 'visible', text: VISIBLE }],
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        requireDossierCoverage: true,
        applyRelationship: true,
        preservePresence: true,
        preserveObservation: true,
    });
    const vrena = result.state.npcs.find(npc => npc.name === 'Vrena Pell');
    assert.ok(vrena);
    assert.match(vrena.apparentAge, /^~\d+$/);
    assert.equal(vrena.age, '');
    assert.deepEqual(vrena.behaviorProfile, ['Intake: Takes immediate control of registration and moves new arrivals quickly from paperwork to available work.']);
    assert.deepEqual(vrena.mannerisms, ['Handles paperwork with brisk directive gestures, pushing implements toward applicants and tapping or pointing at the relevant place.']);
    assert.equal(vrena.relationshipSummary, 'Brisk and transactional; Vrena treats Lucien as a provisional guild applicant being moved rapidly into available work.');
    assert.deepEqual(vrena.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'rejected-proposal'), false);
});

test('Scan and Refresh advertise positive first-pass sufficiency and exact Current Dynamic target binding', () => {
    const base = state('chat:prompt-v0520');
    const chat = [{ is_user: true, name: 'Lucien', mes: USER }, { is_user: false, name: 'Assistant', mes: ASSISTANT }];
    const scan = buildScanPrompt({ state: base, chat, assistantMessageId: 1, playerName: 'Lucien' });
    const target = normalizeNpc({ id: 'npc-vrena', name: 'Vrena Pell', present: true });
    const refresh = buildTargetedRefreshPrompt({ npc: target, chat, assistantMessageId: 1, playerName: 'Lucien' });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /FIRST-PASS SUFFICIENCY:/);
        assert.match(prompt, /One scene can contain multiple distinct observations/);
        assert.match(prompt, /Direct visible life-stage wording/);
        assert.match(prompt, /young woman\/man\/adult/);
        assert.match(prompt, /explicit recurrence\/generalization or multiple reinforcing actions/);
        assert.match(prompt, /multiple related instances may consolidate into one narrow mannerism/i);
        assert.match(prompt, /CURRENT DYNAMIC EVIDENCE:/);
        assert.match(prompt, /small coherent set may use connected accepted identity\/activity evidence from the same permitted source/);
        assert.match(prompt, /need not repeat an already accepted narrator quote/);
        assert.match(prompt, /quoted you alone is insufficient/);
        assert.match(prompt, /zero numeric movement/);
    }
});

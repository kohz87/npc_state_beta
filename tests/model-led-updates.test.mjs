import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScanResult, buildScanPrompt, buildTargetedRefreshPrompt, newNpcAdmissionAllows } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { semanticEntryRef } from '../src/model/semantic-updates.js';

function stateWithNpc(overrides = {}) {
    const state = createEmptyState('chat:test');
    state.npcs = [normalizeNpc({
        id: 'npc-sora-test',
        name: 'Sora',
        species: 'Stormcrown Thunderbird Chimera',
        age: '6',
        apparentAge: '~6',
        personality: 'Quiet and dormant baseline post-emergence.',
        behaviorProfile: ['Rests in deep, restorative slumber following her emergence.'],
        speech: 'Unvoiced; currently sleeping.',
        mannerisms: ['Folds her feathered wings across her back in sleep.'],
        status: 'Sleeping after emergence.',
        ...overrides,
    })];
    return state;
}

function fixture(updates, extraPatch = {}) {
    return {
        exchangeActiveNpcIds: [],
        finalPresentNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-sora-test',
            name: 'Sora',
            semanticUpdates: updates,
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No relationship replay.' },
            ...extraPatch,
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

function apply(state, result, context, extra = {}) {
    return applyScanResult(state, result, {
        sourceMessageId: 20,
        turn: state.turn,
        profileContext: context,
        currentAdmissionText: context,
        allowHistoricalProfilePatches: true,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
        ...extra,
    });
}

function source(excerpt, messageId = 19) {
    return [{ messageId, excerpt }];
}

test('Scan engine repairs frozen post-emergence personality, behavior, speech, mannerism and stale sleep status', () => {
    const context = 'Sora laughs softly, asks three curious questions, eagerly compares hunting plans, and keeps tapping one boot when thinking. She is awake beside Lucien.';
    const result = fixture([
        { field: 'personality', operation: 'replace', value: 'Curious, energetic, proudly inquisitive.', sources: source('Sora laughs softly, asks three curious questions, eagerly compares hunting plans'), explanation: 'Later interaction establishes an actual baseline.' },
        { field: 'behaviorProfile', operation: 'replace', value: ['Eagerly engages with lessons and practical plans.', 'Approaches unfamiliar situations with bright curiosity.'], sources: source('eagerly compares hunting plans'), explanation: 'The sleeping placeholder is obsolete.' },
        { field: 'speech', operation: 'replace', value: 'Animated and direct, with frequent curious questions.', sources: source('asks three curious questions'), explanation: 'She is demonstrably speaking.' },
        { field: 'mannerisms', operation: 'replace', changes: [{ action: 'replace', expected: 'Folds her feathered wings across her back in sleep.', value: 'Taps one boot while thinking.' }], sources: source('keeps tapping one boot when thinking'), explanation: 'Current durable mannerism is observed.' },
        { field: 'status', operation: 'remove', sources: source('She is awake beside Lucien.'), explanation: 'Stored sleeping status is no longer current.' },
    ]);
    const applied = apply(stateWithNpc(), result, context);
    const npc = applied.state.npcs[0];
    assert.equal(npc.personality, 'Curious, energetic, proudly inquisitive.');
    assert.deepEqual(npc.behaviorProfile, ['Eagerly engages with lessons and practical plans.', 'Approaches unfamiliar situations with bright curiosity.']);
    assert.equal(npc.speech, 'Animated and direct, with frequent curious questions.');
    assert.deepEqual(npc.mannerisms, ['Taps one boot while thinking.']);
    assert.equal(npc.status, '');
    assert.ok(applied.semanticDiagnostics.every(row => ['applied', 'no-change-proposed'].includes(row.status)));
});

test('Refresh prompt receives personality and speech plus stable collection entry refs', () => {
    const state = stateWithNpc();
    const chat = [
        { is_user: true, mes: 'Sora, what do you think?' },
        { is_user: false, mes: 'Sora answers at length and taps her boot.' },
    ];
    const prompt = buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1, scanDepth: 12 });
    assert.match(prompt, /TARGET DOSSIER:/);
    assert.match(prompt, /SEMANTIC EDIT INDEX/);
    assert.match(prompt, /Quiet and dormant baseline post-emergence/);
    assert.match(prompt, /Unvoiced; currently sleeping/);
    assert.match(prompt, /entry:mannerisms:/);
    assert.match(prompt, /establish\|refine\|replace\|remove/);
});

test('foreground/full scan prompt includes personality and speech in reconciliation context', () => {
    const state = stateWithNpc();
    const chat = [
        { is_user: true, mes: 'Sora studies the map.' },
        { is_user: false, mes: 'Sora explains her route in a lively voice.' },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8 });
    assert.match(prompt, /Quiet and dormant baseline post-emergence/);
    assert.match(prompt, /Unvoiced; currently sleeping/);
    assert.match(prompt, /NPC STATE DOSSIER UPDATE CONTRACT v4/);
});

test('semantic replacement does not require English cue phrases or repeated concept labels', () => {
    const context = 'ソラの受け答えは明るく、質問を重ね、自分の考えをはっきり述べる。';
    const result = fixture([{ field: 'personality', operation: 'replace', value: 'Bright, inquisitive, and forthright.', sources: source(context), explanation: '現在の描写が基準を示す。' }]);
    const applied = apply(stateWithNpc(), result, context);
    assert.equal(applied.state.npcs[0].personality, 'Bright, inquisitive, and forthright.');
});

test('insufficient or out-of-scope evidence preserves established traits', () => {
    const result = fixture([{ field: 'personality', operation: 'replace', value: 'Cruel and aloof.', sources: source('This sentence is not in the supplied context.'), explanation: 'Unsupported.' }]);
    const applied = apply(stateWithNpc(), result, 'Sora quietly reads a page.');
    assert.equal(applied.state.npcs[0].personality, 'Quiet and dormant baseline post-emergence.');
    assert.equal(applied.semanticDiagnostics[0].status, 'invalid-source-reference');
});

test('manual profile protection is authoritative', () => {
    const state = stateWithNpc({ manualProfileFields: ['personality'] });
    const context = 'Sora speaks with lively confidence.';
    const result = fixture([{ field: 'personality', operation: 'replace', value: 'Lively and confident.', sources: source(context), explanation: 'Grounded but locked.' }]);
    const applied = apply(state, result, context);
    assert.equal(applied.state.npcs[0].personality, 'Quiet and dormant baseline post-emergence.');
    assert.equal(applied.semanticDiagnostics[0].status, 'manually-protected');
});

test('temporary evidence cannot rewrite durable species or ordinary appearance', () => {
    const state = stateWithNpc({ appearance: 'Small golden-blue-haired girl in human form.' });
    const context = 'For one spell Sora becomes a pillar of lightning, then returns to normal.';
    const result = fixture([
        { field: 'species', operation: 'replace', value: 'Lightning Elemental', durability: 'temporary', sources: source(context), explanation: 'Temporary spell form.' },
        { field: 'appearance', operation: 'replace', value: 'A pillar of lightning.', durability: 'temporary', sources: source(context), explanation: 'Temporary form.' },
    ]);
    const applied = apply(state, result, context);
    assert.equal(applied.state.npcs[0].species, 'Stormcrown Thunderbird Chimera');
    assert.equal(applied.state.npcs[0].appearance, 'Small golden-blue-haired girl in human form.');
    assert.ok(applied.semanticDiagnostics.every(row => row.status === 'invalid-structure'));
});

test('form-specific mannerism survives unrelated current-form changes', () => {
    const oldWingHabit = 'In winged form, settles her primary feathers before sleep.';
    const state = stateWithNpc({ mannerisms: [oldWingHabit, 'Taps a boot while thinking.'], currentForm: 'Human' });
    const context = 'In human form Sora now drums two fingers on the table while calculating.';
    const ref = semanticEntryRef('mannerisms', 'Taps a boot while thinking.');
    const result = fixture([{ field: 'mannerisms', operation: 'refine', changes: [{ action: 'replace', ref, value: 'Drums two fingers on a surface while calculating.' }], scope: { form: 'Human' }, sources: source(context), explanation: 'Human-form habit refined.' }]);
    const applied = apply(state, result, context);
    assert.deepEqual(applied.state.npcs[0].mannerisms, [oldWingHabit, 'Drums two fingers on a surface while calculating.']);
});

test('collection replacement works at capacity and preserves unrelated entries', () => {
    const state = stateWithNpc({ behaviorProfile: Array.from({ length: 8 }, (_, i) => `Behavior ${i + 1}`) });
    const context = 'Behavior 4 is superseded by a more precise observed pattern.';
    const ref = semanticEntryRef('behaviorProfile', 'Behavior 4');
    const result = fixture([{ field: 'behaviorProfile', operation: 'refine', changes: [{ action: 'replace', ref, value: 'Behavior 4 refined' }], sources: source(context), explanation: 'Refinement at capacity.' }]);
    const applied = apply(state, result, context);
    assert.equal(applied.state.npcs[0].behaviorProfile.length, 8);
    assert.ok(applied.state.npcs[0].behaviorProfile.includes('Behavior 4 refined'));
    assert.ok(applied.state.npcs[0].behaviorProfile.includes('Behavior 8'));
});

test('empty collection arrays do not clear without explicit remove authorization', () => {
    const state = stateWithNpc({ behaviorProfile: ['Studies before acting.'] });
    const context = 'No durable behavior correction is established.';
    const result = fixture([{ field: 'behaviorProfile', operation: 'refine', value: [], sources: source(context), explanation: 'No additions.' }]);
    const applied = apply(state, result, context);
    assert.deepEqual(applied.state.npcs[0].behaviorProfile, ['Studies before acting.']);
});


test('empty collection replacement requires explicit clear authorization for every durable collection', () => {
    const fields = {
        behaviorProfile: ['Studies before acting.'],
        mannerisms: ['Taps one boot while thinking.'],
        keyRelationships: ['Lucien - guardian: trusts his judgment.'],
        memories: ['Lucien rescued her from the winter pass.'],
    };
    const context = 'No evidence in this exchange retires any established collection entry.';
    for (const [field, value] of Object.entries(fields)) {
        const state = stateWithNpc({ [field]: value });
        const result = fixture([{ field, operation: 'replace', value: [], sources: source(context), explanation: 'No replacement entries.' }]);
        const applied = apply(state, result, context);
        assert.deepEqual(applied.state.npcs[0][field], value, field);
        assert.equal(applied.semanticDiagnostics[0].status, 'rejected-proposal', field);
        assert.equal(applied.semanticDiagnostics[0].reason, 'explicit-clear-required', field);
    }
});

test('explicit clear authorization can intentionally clear a collection', () => {
    const state = stateWithNpc({ memories: ['An obsolete memory entry.'] });
    const context = 'The stored memory entry is explicitly confirmed to be invalid and must be cleared.';
    const result = fixture([{ field: 'memories', operation: 'replace', value: [], clear: true, sources: source(context), explanation: 'Explicit whole-collection correction.' }]);
    const applied = apply(state, result, context);
    assert.deepEqual(applied.state.npcs[0].memories, []);
    assert.equal(applied.semanticDiagnostics[0].status, 'applied');
});

test('same-evidence targeted collection replacements are deduplicated by complete operation identity', () => {
    const first = 'Taps one boot while thinking.';
    const second = 'Tilts her head before answering.';
    const state = stateWithNpc({ mannerisms: [first, second] });
    const context = 'Sora now drums two fingers while calculating and folds her hands before answering.';
    const sharedSources = source(context);
    const result = fixture([
        { field: 'mannerisms', operation: 'replace', changes: [{ action: 'replace', ref: semanticEntryRef('mannerisms', first), value: 'Drums two fingers while calculating.' }], sources: sharedSources, explanation: 'First habit changed.' },
        { field: 'mannerisms', operation: 'replace', changes: [{ action: 'replace', ref: semanticEntryRef('mannerisms', second), value: 'Folds her hands before answering.' }], sources: sharedSources, explanation: 'Second habit changed.' },
    ]);
    const applied = apply(state, result, context);
    assert.deepEqual(applied.state.npcs[0].mannerisms, ['Drums two fingers while calculating.', 'Folds her hands before answering.']);
    assert.equal(applied.semanticDiagnostics.filter(row => row.status === 'applied').length, 2);
    assert.equal(applied.semanticDiagnostics.some(row => row.status === 'duplicate-operation'), false);
});

test('age change is model-classified without English cue phrases and remains separate from apparent age', () => {
    const state = stateWithNpc({ age: '6', apparentAge: '~6' });
    const context = '記録上のソラの年齢は7。見た目についての新情報はない。';
    const result = fixture([{ field: 'age', operation: 'replace', value: '7', ageKind: 'correction', sources: source(context), explanation: 'The supplied record establishes corrected chronological age.' }]);
    const applied = apply(state, result, context);
    assert.equal(applied.state.npcs[0].age, '7');
    assert.equal(applied.state.npcs[0].apparentAge, '~6');
});

test('grounded fantasy maturation can update only the affected form without arbitrary interval gates', () => {
    const state = stateWithNpc({
        age: '1',
        appearance: 'Small child with golden-blue hair.',
        appearanceForms: [
            { name: 'Human', appearance: 'Small child with golden-blue hair.' },
            { name: 'Thunderbird', appearance: 'Compact juvenile thunderbird with gold-blue plumage.' },
        ],
    });
    const context = 'At age 2, Stormcrown hatchlings undergo a sudden first molt; Sora reaches 2 and her Thunderbird form becomes long-limbed with a broader juvenile wingspan.';
    const result = fixture([
        { field: 'age', operation: 'replace', value: '2', ageKind: 'birthday', sources: source(context), explanation: 'Chronological age is established.' },
        { field: 'appearanceForms', operation: 'replace', scope: { form: 'Thunderbird' }, value: { name: 'Thunderbird', appearance: 'Long-limbed juvenile thunderbird with a broader wingspan and gold-blue plumage.' }, sources: source(context), explanation: 'Established species maturation affects this form.' },
    ]);
    const applied = apply(state, result, context);
    assert.equal(applied.state.npcs[0].age, '2');
    assert.equal(applied.state.npcs[0].appearance, 'Small child with golden-blue hair.');
    assert.equal(applied.state.npcs[0].appearanceForms.find(form => form.name === 'Human').appearance, 'Small child with golden-blue hair.');
    assert.match(applied.state.npcs[0].appearanceForms.find(form => form.name === 'Thunderbird').appearance, /broader wingspan/);
});

test('named-preferred admission trusts structured named judgment instead of English role-modifier vocabulary', () => {
    assert.equal(newNpcAdmissionAllows({ name: 'North Gate', role: 'Gate', identityKind: 'named' }, 'named_preferred'), true);
    assert.equal(newNpcAdmissionAllows({ name: 'Northern Gate Guard', role: 'Guard', identityKind: 'role-label' }, 'named_preferred'), false);
    assert.equal(newNpcAdmissionAllows({ name: 'Mira', identityKind: 'named' }, 'manual'), false);
});

test('custom directional kinship is preserved without forcing an English category', () => {
    const state = createEmptyState('chat:family');
    state.npcs = [normalizeNpc({ id: 'npc-sora-test', name: 'Sora' }), normalizeNpc({ id: 'npc-ryu-test', name: 'Ryu' })];
    const context = 'Sora and Ryu formally recognize each other as oath-clutch kin.';
    const result = {
        exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], lifeStateUpdates: [],
        familyFacts: [{ owner: 'Sora', relation: 'oath-clutch sister', reciprocalRelation: 'oath-clutch sister', count: 1, members: ['Ryu'], evidence: context }],
    };
    const applied = apply(state, result, context);
    assert.ok(applied.state.npcs.find(npc => npc.name === 'Sora').keyRelationships.some(value => /Ryu - oath-clutch sister/.test(value)));
    assert.ok(applied.state.npcs.find(npc => npc.name === 'Ryu').keyRelationships.some(value => /Sora - oath-clutch sister/.test(value)));
});

test('same-message retry is idempotent and does not create semantic replay', () => {
    const context = 'Sora speaks brightly and asks careful questions.';
    const result = fixture([{ field: 'personality', operation: 'replace', value: 'Bright and inquisitive.', sources: source(context), explanation: 'Updated baseline.' }]);
    const first = apply(stateWithNpc(), result, context);
    const second = apply(first.state, result, context);
    assert.equal(second.state.npcs[0].personality, 'Bright and inquisitive.');
    assert.equal(second.semanticDiagnostics[0].status, 'no-change-proposed');
});

test('semantic updates do not replay relationship scores', () => {
    const state = stateWithNpc({ relationship: { trust: 25, affection: 12, desire: 0, tension: 0 } });
    const context = 'Sora speaks brightly and asks careful questions.';
    const result = fixture([{ field: 'speech', operation: 'replace', value: 'Bright and inquisitive.', sources: source(context), explanation: 'Speech baseline.' }]);
    const applied = apply(state, result, context, { applyRelationship: true });
    assert.deepEqual(applied.state.npcs[0].relationship, { trust: 25, affection: 12, desire: 0, tension: 0 });
});

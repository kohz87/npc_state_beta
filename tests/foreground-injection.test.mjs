import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForegroundInjection, estimateForegroundTokens, FOREGROUND_MIN_BUDGET_TOKENS } from '../src/injection.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { semanticEntryRef } from '../src/model/semantic-updates.js';
import { createCompletenessCoordinator } from '../src/completeness-coordinator.js';
import { generateWithScanRoute, resolveScanGenerationRoute } from '../src/scan-connection.js';

function makeNpc(i, large = false) {
    const repeat = (text, n) => large ? text.repeat(n) : text;
    return normalizeNpc({
        id: `npc-${i}`, name: `NPC ${i}`, role: 'Companion', species: 'Fantasy species', age: String(10 + i), apparentAge: `~${10 + i}`,
        appearance: repeat('silver hair bright eyes travel clothes ', 60),
        appearanceForms: Array.from({ length: large ? 8 : 2 }, (_, j) => ({ name: j ? `Form ${j}` : 'Human', appearance: repeat('wings scales feathers markings ', 40) })),
        personality: 'Curious, deliberate, warm, and independent.', speech: 'Measured and direct with dry humor.',
        behaviorProfile: Array.from({ length: large ? 14 : 3 }, (_, j) => `Behavior ${j}: ${repeat('evaluates unfamiliar situations carefully ', 8)}`),
        mannerisms: Array.from({ length: large ? 14 : 3 }, (_, j) => `Mannerism ${j}: ${repeat('taps fingers while thinking ', 8)}`),
        keyRelationships: Array.from({ length: large ? 18 : 3 }, (_, j) => `Person ${j} - ally: ${repeat('shared history and obligation ', 6)}`),
        memories: Array.from({ length: large ? 18 : 3 }, (_, j) => `Memory ${j}: ${repeat('lasting consequential event ', 10)}`),
        background: repeat('Experienced traveler. ', 100), relationshipSummary: 'Trusts the player cautiously.', status: 'Reviewing plans.',
        present: i <= 2, worldActive: i === 3, importance: 80 - i, lastInteractionMessageId: 100 + i, updatedAt: 1000 + i,
    });
}
function state(count = 2, large = false) {
    const out = createEmptyState('chat:foreground');
    out.branchSafety = { status: 'safe' };
    out.lastObservation = { exchangeActiveNpcIds: ['npc-1', 'npc-2'], finalPresentNpcIds: ['npc-1', 'npc-2'], worldActiveNpcIds: ['npc-3'] };
    out.npcs = Array.from({ length: count }, (_, i) => makeNpc(i + 1, large));
    return out;
}
function settings(extra = {}) {
    return { enabled: true, autoScan: true, inject: true, injectLimit: 2, injectBudgetTokens: 1800, newNpcHistoryEnrichment: true,
        newNpcAdmissionMode: 'balanced', foregroundCurrentUserText: 'NPC 1 and NPC 2 discuss the plan.', foregroundNewNpcHistory: '[ASSISTANT #8] Earlier scene context.',
        dossierLimits: { memories: 8, keyRelationships: 12, mannerisms: 8, behaviorProfile: 8 }, ...extra };
}
function context(prompt) {
    const marker = 'FOREGROUND CONTEXT (selected once; collection refs are edit targets):\n';
    const at = prompt.indexOf(marker); assert.ok(at >= 0); return JSON.parse(prompt.slice(at + marker.length));
}

test('foreground emits one authoritative contract without layered legacy instructions', () => {
    const { prompt } = buildForegroundInjection(state(), settings());
    assert.equal((prompt.match(/FOREGROUND CONTRACT v3/g) || []).length, 1);
    assert.equal((prompt.match(/<npc_state_v1>/g) || []).length, 1);
    assert.doesNotMatch(prompt, /NPC STATE FOREGROUND FULL SCAN|MODEL-LED UPDATE CONTRACT v2|profileChanges|canonChanges/);
    assert.match(prompt, /Durable edits use semanticUpdates/);
});

test('one selection pipeline honors injection limit even with twelve available NPCs', () => {
    const result = buildForegroundInjection(state(12), settings());
    assert.equal(result.diagnostics.eligibleNpcCount, 12);
    assert.equal(result.diagnostics.selectedNpcCount, 2);
    assert.deepEqual(context(result.prompt).dossiers.map(row => row.id), result.diagnostics.selectedNpcIds);
});

test('total budget is enforceable for small, ordinary, and oversized dossiers', () => {
    for (const [fixture, budget] of [[state(), 1700], [state(12), 1800], [state(12, true), 1800], [state(12, true), 5000]]) {
        const result = buildForegroundInjection(fixture, settings({ injectBudgetTokens: budget }));
        context(result.prompt);
        assert.ok(result.diagnostics.totalTokenEstimate <= result.diagnostics.effectiveBudgetTokens);
        assert.ok(result.diagnostics.dynamicTokenEstimate <= result.diagnostics.dynamicBudgetTokenEstimate);
        assert.equal(result.diagnostics.totalTokenEstimate, estimateForegroundTokens(result.prompt));
        assert.equal(result.diagnostics.tokenCountKind, 'estimated');
    }
});

test('below-minimum budgets are raised and reported explicitly', () => {
    const result = buildForegroundInjection(state(), settings({ injectBudgetTokens: 100 }));
    assert.equal(result.diagnostics.configuredBudgetTokens, 100);
    assert.ok(result.diagnostics.effectiveBudgetTokens >= FOREGROUND_MIN_BUDGET_TOKENS);
    assert.equal(result.diagnostics.budgetRaisedToMinimum, true);
    assert.ok(result.diagnostics.totalTokenEstimate <= result.diagnostics.effectiveBudgetTokens);
});

test('compaction keeps valid JSON and stable edit references', () => {
    const fixture = state(12, true);
    const result = buildForegroundInjection(fixture, settings({ injectBudgetTokens: 5000 }));
    for (const dossier of context(result.prompt).dossiers) {
        const original = fixture.npcs.find(row => row.id === dossier.id);
        for (const field of ['behaviorProfile', 'mannerisms']) for (const [i, entry] of (dossier[field] || []).entries()) {
            assert.equal(entry.ref, semanticEntryRef(field, original[field][i])); assert.ok(entry.value);
        }
        for (const form of dossier.appearanceForms || []) assert.match(form.ref, /^entry:appearanceForms:/);
    }
});

test('capture, continuity, and completeness settings stay independent', () => {
    const fixture = state();
    assert.match(buildForegroundInjection(fixture, settings({ autoScan: true, inject: false })).prompt, /<npc_state_v1>/);
    assert.doesNotMatch(buildForegroundInjection(fixture, settings({ autoScan: false, inject: true })).prompt, /<npc_state_v1>/);
    assert.equal(buildForegroundInjection(fixture, settings({ autoScan: false, inject: false })).prompt, '');
    const diag = buildForegroundInjection(fixture, settings({ scanAfterEachResponse: true, scanConnectionProfileId: 'profile-x' })).diagnostics;
    assert.equal(diag.backgroundCompletenessEnabled, true); assert.deepEqual(diag.backgroundRoute, { kind: 'profile', profileId: 'profile-x' });
});

test('model-led personality, behavior, speech, and mannerism repair persists through reload', () => {
    const fixture = createEmptyState('chat:profile');
    fixture.npcs = [normalizeNpc({ id: 'npc-sora', name: 'Sora', personality: 'Quiet and dormant baseline post-emergence.', behaviorProfile: ['Rests in deep slumber after emergence.'], speech: 'Unvoiced; currently sleeping.', mannerisms: ['Folds her wings while sleeping.'], status: 'Sleeping after emergence.' })];
    const evidence = 'Sora wakes, laughs, asks several curious questions, and taps one boot while thinking.';
    const result = { exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [], npcs: [{ id: 'npc-sora', name: 'Sora', semanticUpdates: [
        { field: 'personality', operation: 'replace', value: 'Bright, curious, and energetic.', sources: [{ messageId: 19, excerpt: 'Sora wakes, laughs, asks several curious questions' }], explanation: 'real baseline' },
        { field: 'behaviorProfile', operation: 'replace', value: ['Eagerly engages with questions and plans.'], sources: [{ messageId: 19, excerpt: 'asks several curious questions' }], explanation: 'awake behavior' },
        { field: 'speech', operation: 'replace', value: 'Animated and inquisitive.', sources: [{ messageId: 19, excerpt: 'asks several curious questions' }], explanation: 'speaks now' },
        { field: 'mannerisms', operation: 'replace', changes: [{ action: 'replace', ref: semanticEntryRef('mannerisms', 'Folds her wings while sleeping.'), value: 'Taps one boot while thinking.' }], sources: [{ messageId: 19, excerpt: 'taps one boot while thinking' }], explanation: 'new habit' },
        { field: 'status', operation: 'remove', sources: [{ messageId: 19, excerpt: 'Sora wakes' }], explanation: 'sleep ended' },
    ] }] };
    const applied = applyScanResult(fixture, result, { sourceMessageId: 20, profileContext: evidence, currentAdmissionText: evidence, applyRelationship: false, preservePresence: true, preserveObservation: true, applyReturnedNpcPatches: true });
    const sora = normalizeState(JSON.parse(JSON.stringify(applied.state)), fixture.chatKey).npcs[0];
    assert.equal(sora.personality, 'Bright, curious, and energetic.'); assert.equal(sora.speech, 'Animated and inquisitive.');
    assert.deepEqual(sora.behaviorProfile, ['Eagerly engages with questions and plans.']); assert.deepEqual(sora.mannerisms, ['Taps one boot while thinking.']); assert.equal(sora.status, '');
});

test('manual locks and temporary-state protection remain authoritative', () => {
    const fixture = createEmptyState('chat:locks'); fixture.npcs = [normalizeNpc({ id: 'npc-1', name: 'NPC 1', personality: 'Reserved.', species: 'Human', manualProfileFields: ['personality'] })];
    const evidence = 'NPC 1 becomes a wolf-shaped illusion for a moment and jokes loudly.';
    const result = { exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [], npcs: [{ id: 'npc-1', name: 'NPC 1', semanticUpdates: [
        { field: 'personality', operation: 'replace', value: 'Boisterous.', sources: [{ messageId: 19, excerpt: 'jokes loudly' }], explanation: 'locked' },
        { field: 'species', operation: 'replace', value: 'Wolf', durability: 'temporary', sources: [{ messageId: 19, excerpt: 'wolf-shaped illusion for a moment' }], explanation: 'temporary' },
    ] }] };
    const applied = applyScanResult(fixture, result, { sourceMessageId: 20, profileContext: evidence, currentAdmissionText: evidence, applyRelationship: false, preservePresence: true, preserveObservation: true, applyReturnedNpcPatches: true });
    assert.equal(applied.state.npcs[0].personality, 'Reserved.'); assert.equal(applied.state.npcs[0].species, 'Human');
});

test('pending completeness does not synchronously block the caller and stale work stays discarded', async () => {
    let release; const pending = new Promise(resolve => { release = resolve; }); const records = [];
    const coordinator = createCompletenessCoordinator({
        getSource: id => ({ valid: true, chatKey: 'chat:x', messageId: id, message: {}, identity: `chat:x|${id}`, expectedFingerprint: 'fp', expectedSwipeId: 0 }),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: true }), runEmbedded: async () => ({ ok: true, coverage: 'embedded' }),
        runCompleteness: async () => { await pending; return { ok: false, discarded: true, reason: 'stale-completeness' }; },
        readRecord: () => null, writeRecord: (_s, value) => records.push(value), setStatus: () => {}, invalidateCompleteness: () => {},
    });
    const work = coordinator.process(10); assert.equal(coordinator.inFlightCount(), 1); release();
    const result = await work; assert.equal(result.completeness, 'discarded'); assert.notEqual(records.at(-1).coverage, 'embedded+completeness');
});

test('alternate profile route never falls back to the main connection when it changes', async () => {
    let main = 0, profileCalls = 0, profile = { id: 'p1', name: 'NPC Scan', api: 'mock' };
    const service = { getSupportedProfiles: () => [profile], getProfile: () => profile, validateProfile: () => {}, sendRequest: async () => { profileCalls += 1; return { content: '{}' }; } };
    const ctx = { ConnectionManagerRequestService: service, generateRaw: async () => { main += 1; return 'main'; } };
    const route = resolveScanGenerationRoute(() => ctx, 'p1'); await generateWithScanRoute({ getContext: () => ctx, route, systemPrompt: 's', prompt: 'p', responseLength: 100 });
    assert.equal(profileCalls, 1); assert.equal(main, 0); profile = { ...profile, api: 'changed' };
    await assert.rejects(() => generateWithScanRoute({ getContext: () => ctx, route, systemPrompt: 's', prompt: 'p', responseLength: 100 }), e => e.code === 'NPC_STATE_SCAN_PROFILE_CHANGED'); assert.equal(main, 0);
});

test('prompt cache invalidates on dossier content changes', () => {
    const fixture = state(); buildForegroundInjection(fixture, settings()); assert.equal(buildForegroundInjection(fixture, settings()).diagnostics.cacheHit, true);
    fixture.npcs[0].personality = 'Changed without timestamp.'; const next = buildForegroundInjection(fixture, settings()); assert.equal(next.diagnostics.cacheHit, false); assert.match(next.prompt, /Changed without timestamp/);
});

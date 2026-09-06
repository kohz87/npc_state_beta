import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInjection } from '../src/injection.js';
import { buildScanPrompt, applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { recordCheckpoint, rebaseToCurrentChat } from '../src/branches.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function baseState() {
    const state = createEmptyState('chat:compat');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-test',
        name: 'Mira',
        personality: 'Reserved but attentive.',
        speech: 'Soft-spoken and precise.',
        relationship: { trust: 25, affection: 12, desire: 0, tension: 0 },
        relationshipProgress: { trust: 0.5, affection: 0, desire: 0, tension: 0 },
        relationshipHistory: [{
            impact: 'meaningful',
            delta: { trust: 1, affection: 1, desire: 0, tension: 0 },
            evidence: 'Mira accepted Lucien as a partner.',
            reason: 'Established cooperation.',
            sourceMessageId: 3,
            turn: 2,
            at: 3,
        }],
        lastRelationshipChange: {
            impact: 'meaningful',
            delta: { trust: 1, affection: 1, desire: 0, tension: 0 },
            evidence: 'Mira accepted Lucien as a partner.',
            reason: 'Established cooperation.',
            sourceMessageId: 3,
            turn: 2,
            at: 3,
        },
    })];
    return normalizeState(state, state.chatKey);
}

test('schema-1 reload roundtrip preserves model-led dossier values and storage identity', () => {
    const state = baseState();
    state.npcs[0].personality = 'Warm, observant, and deliberate.';
    state.npcs[0].speech = 'Measured, with dry humor.';
    const roundTrip = normalizeState(JSON.parse(JSON.stringify(state)), state.chatKey);
    assert.equal(roundTrip.schemaVersion, 1);
    assert.equal(roundTrip.npcs[0].personality, 'Warm, observant, and deliberate.');
    assert.equal(roundTrip.npcs[0].speech, 'Measured, with dry humor.');
    assert.match(read('src/index.js'), /extension_settings\[EXTENSION_NAME\]\.v3/);
});

test('historical/full scan prompt cannot pull future messages into its supplied evidence window', () => {
    const state = baseState();
    const chat = [
        { is_user: true, mes: 'Mira studies the old bridge.' },
        { is_user: false, mes: 'Mira answers cautiously.' },
        { is_user: true, mes: 'FUTURE_SECRET: Mira is secretly a dragon.' },
        { is_user: false, mes: 'FUTURE_SECRET_RESPONSE' },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 12 });
    assert.doesNotMatch(prompt, /FUTURE_SECRET/);
    assert.match(prompt, /Mira answers cautiously/);
});

test('foreground embedded behavior remains enabled by default and carries model-led contract', () => {
    const text = buildInjection(baseState(), { enabled: true, autoScan: true, inject: true });
    assert.match(text, /<npc_state_v1>/);
    assert.match(text, /MODEL-LED UPDATE CONTRACT v2/);
    const disabled = buildInjection(baseState(), { enabled: true, autoScan: false, inject: true });
    assert.doesNotMatch(disabled, /MODEL-LED UPDATE CONTRACT v2/);
});

test('legacy profileChanges fixture is adapted to model-led semantics without English lasting/habit cues', () => {
    const state = baseState();
    const context = 'ミラは柔らかな冗談を交えながら、以前より率直に自分の考えを伝える。';
    const result = {
        exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [],
        npcs: [{
            id: 'npc-mira-test', name: 'Mira',
            personality: 'More open and gently humorous.',
            profileChanges: [{ field: 'personality', mode: 'explicit', concept: 'greater openness', evidence: context }],
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No relationship replay.' },
        }],
    };
    const applied = applyScanResult(state, result, {
        sourceMessageId: 7,
        turn: state.turn,
        profileContext: context,
        currentAdmissionText: context,
        allowHistoricalProfilePatches: true,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
    });
    assert.equal(applied.state.npcs[0].personality, 'More open and gently humorous.');
    assert.equal(applied.semanticDiagnostics.find(row => row.field === 'personality')?.status, 'applied');
});

test('preserve rebase retains relationship state while rollback mode removes abandoned-branch gains', () => {
    const oldChat = [
        { is_user: true, mes: 'Start' },
        { is_user: false, mes: 'Mira arrives.' },
        { is_user: true, mes: 'Old choice' },
        { is_user: false, mes: 'Mira accepted Lucien as a partner.' },
    ];
    let state = baseState();
    state.branchHeadLineage = oldChat.map((message, i) => `${message.is_user ? 'u' : 'a'}:fixture${i}`);
    state = recordCheckpoint(state, oldChat, 1, 'baseline');
    state.npcs[0].relationship = { trust: 26, affection: 13, desire: 0, tension: 0 };
    const newChat = [
        { is_user: true, mes: 'Start' },
        { is_user: false, mes: 'Mira arrives.' },
        { is_user: true, mes: 'New choice' },
        { is_user: false, mes: 'Mira leaves before deciding.' },
    ];
    const preserved = rebaseToCurrentChat(state, newChat, { relationshipMode: 'preserve' });
    const rolled = rebaseToCurrentChat(state, newChat, { relationshipMode: 'rollback' });
    assert.equal(preserved.npcs[0].relationship.trust, 26);
    assert.equal(preserved.npcs[0].relationshipProgress.trust, 0.5);
    assert.ok(rolled.npcs[0].relationship.trust <= 26);
    assert.ok(rolled.npcs[0].relationshipHistory.length <= preserved.npcs[0].relationshipHistory.length);
});

test('engine keeps stale-operation, completeness, and alternate connection protections wired', () => {
    const engine = read('src/engine.js');
    assert.match(engine, /reason: 'stale-operation'/);
    assert.match(engine, /reason: 'stale-completeness'/);
    assert.match(engine, /supplementalPass: true/);
    assert.match(engine, /applyRelationship: false/);
    assert.match(engine, /preservePresence: true/);
    assert.match(engine, /preserveObservation: true/);
    assert.match(engine, /connectionProfile/);
    assert.doesNotMatch(engine, /set.*main.*connection/i);
});

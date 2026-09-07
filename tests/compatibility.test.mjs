import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_STATE_VERSION, createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('schema-1 reload roundtrip preserves current 0.5.x dossier data', () => {
    const state = createEmptyState('chat:compat');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-test',
        name: 'Mira',
        personality: 'Warm, observant, and deliberate.',
        speech: 'Measured, with dry humor.',
    })];
    const roundTrip = normalizeState(JSON.parse(JSON.stringify(state)), state.chatKey);
    assert.equal(roundTrip.schemaVersion, 1);
    assert.equal(roundTrip.appVersion, NPC_STATE_VERSION);
    assert.equal(roundTrip.npcs[0].personality, 'Warm, observant, and deliberate.');
    assert.equal(roundTrip.npcs[0].speech, 'Measured, with dry humor.');
});

test('storage identity remains the established v3 sidecar/settings identity', () => {
    const index = read('src/index.js');
    const storage = read('src/storage.js');
    assert.match(index, /\.v3/);
    assert.match(storage, /v3/i);
    assert.doesNotMatch(read('manifest.json'), /v05\/|v04\/|v03\//);
});

test('branch implementation retains explicit preserve and rollback relationship modes', () => {
    const branches = read('src/branches.js');
    assert.match(branches, /relationshipMode = 'preserve'/);
    assert.match(branches, /mode === 'rollback' \? rollbackRebasedRelationship/);
    assert.match(branches, /relationshipReplayBoundary/);
});

test('engine retains stale-operation and supplemental completeness guards', () => {
    const engine = read('src/engine.js');
    assert.match(engine, /reason: 'stale-operation'/);
    assert.match(engine, /reason: 'stale-completeness'/);
    assert.match(engine, /supplementalPass: true/);
    assert.match(engine, /applyRelationship: false/);
    assert.match(engine, /preservePresence: true/);
    assert.match(engine, /preserveObservation: true/);
    assert.match(engine, /resolveGenerationRoute/);
});

test('legacy semantic compatibility no longer depends on English phrase gates for application', () => {
    const scanner = read('src/scanner.js');
    const adapter = read('src/model/legacy-semantic-adapter.js');
    const semantics = read('src/model/semantic-updates.js');
    assert.match(scanner, /adaptLegacySemanticPayload/);
    assert.match(adapter, /profileChanges/);
    assert.match(adapter, /canonChanges/);
    assert.match(adapter, /ageChange/);
    assert.match(adapter, /appearanceFormChanges/);
    assert.match(semantics, /establish.*refine.*replace.*remove/);
    assert.match(semantics, /out-of-scope-source/);
});

test('foreground uses one authoritative contract while deterministic scanner mechanics remain separate', () => {
    const injection = read('src/injection.js');
    const contract = read('src/foreground-contract.js');
    const scanner = read('src/scanner.js');
    assert.match(injection, /foregroundContract/);
    assert.match(contract, /dossierSemanticFieldList/);
    assert.match(contract, /DOSSIER_EVALUATION_GROUPS/);
    assert.doesNotMatch(injection, /injection-core/);
    assert.equal(fs.existsSync(path.join(root, 'src/injection-core.js')), false);
    assert.match(scanner, /semanticUpdatePrompt/);
    assert.match(scanner, /core\.applyScanResult/);
    assert.match(scanner, /applyModelLedSemanticUpdates/);
    assert.equal(fs.existsSync(path.join(root, 'src/scanner-core.js')), true);
});

test('MESSAGE_SENT refreshes foreground selection after invalidating pending work', () => {
    const index = read('src/index.js');
    assert.match(index, /MESSAGE_SENT[\s\S]{0,500}engine\.invalidate\(key\)[\s\S]{0,500}updateInjection\(\)/);
});

test('normal MESSAGE_RECEIVED handling remains nonblocking for post-response work', () => {
    const index = read('src/index.js');
    assert.match(index, /MESSAGE_RECEIVED[\s\S]{0,500}void processCompletedAssistantResponse\(messageId\)/);
    assert.doesNotMatch(index, /MESSAGE_RECEIVED[\s\S]{0,300}await processCompletedAssistantResponse\(messageId\)/);
});

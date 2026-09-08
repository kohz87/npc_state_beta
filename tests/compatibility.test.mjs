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

test('engine retains generic stale-operation ownership while retired automatic completeness is absent', () => {
    const engine = read('src/engine.js');
    assert.match(engine, /stale-operation-before-dispatch/);
    assert.match(engine, /operationOwnershipMatches/);
    assert.match(engine, /expectedSource/);
    assert.match(engine, /resolveGenerationRoute/);
    assert.doesNotMatch(engine, /completenessScan|supplementalPass|stale-completeness/);
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
    assert.match(semantics, /DOSSIER_SEMANTIC_OPERATIONS/);
    assert.match(semantics, /out-of-scope-source/);
});

test('foreground is continuity-only while scanner owns extraction/application contracts', () => {
    const injection = read('src/injection.js');
    const contract = read('src/foreground-contract.js');
    const scanner = read('src/scanner.js');
    assert.match(injection, /foregroundContract/);
    assert.match(contract, /CONTINUITY CONTEXT/);
    assert.doesNotMatch(contract, /scanOutputContract|dossierExtractionPromptRules|npc_state_v1/);
    assert.match(read('src/scan-prompts.js'), /scanOutputContract/);
    assert.match(read('src/scan-prompts.js'), /semanticUpdatePrompt/);
    assert.match(scanner, /core\.applyScanResult/);
    assert.match(scanner, /applyModelLedSemanticUpdates/);
    assert.equal(fs.existsSync(path.join(root, 'src/foreground.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/completeness-coordinator.js')), false);
});

test('MESSAGE_SENT refreshes continuity without cancelling the preceding assistant scan', () => {
    const index = read('src/index.js');
    const block = index.match(/MESSAGE_SENT[\s\S]{0,500}updateInjection\(\)/)?.[0] || '';
    assert.match(block, /updateInjection\(\)/);
    assert.doesNotMatch(block, /engine\.invalidate/);
    assert.match(index, /NPCStateGenerationInterceptor/);
});

test('normal MESSAGE_RECEIVED handling remains nonblocking for post-response work', () => {
    const index = read('src/index.js');
    assert.match(index, /MESSAGE_RECEIVED[\s\S]{0,500}void processCompletedAssistantResponse\(messageId\)/);
    assert.doesNotMatch(index, /MESSAGE_RECEIVED[\s\S]{0,300}await processCompletedAssistantResponse\(messageId\)/);
});

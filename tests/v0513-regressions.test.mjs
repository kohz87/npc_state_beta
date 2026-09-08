import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZERO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'No relationship shift.' };

function completeExistingPatch(extra = {}) {
    return {
        id: 'npc-bessa-vond',
        name: 'Bessa Vond',
        evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: { unchanged: [], insufficient: [...DOSSIER_SEMANTIC_FIELDS], unavailable: [] },
        relationshipChange: structuredClone(ZERO_REL),
        ...extra,
    };
}

function payload(patch) {
    return {
        exchangeActiveNpcIds: ['npc-bessa-vond'],
        inChatNpcIds: ['npc-bessa-vond'],
        worldActiveNpcIds: [],
        npcs: [patch],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

function state() {
    const value = createEmptyState('chat:test');
    value.npcs = [normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond', role: 'Guild clerk' })];
    return value;
}

test('MESSAGE_RECEIVED delegates to the single scanner recursion guard and contains no retired depth identifier', () => {
    const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
    assert.doesNotMatch(source, /\bscannerGenerationDepth\b/);
    assert.match(source, /MESSAGE_RECEIVED[\s\S]{0,260}void processCompletedAssistantResponse\(messageId\)/);
    assert.match(source, /export function processCompletedAssistantResponse\(messageId\)\s*\{\s*if \(scannerGenerationInvocationDepth > 0\)/);
});

test('blank Current Dynamic must be explicitly evaluated instead of silently omitted', () => {
    const omitted = applyScanResult(state(), payload(completeExistingPatch()), { requireDossierCoverage: true });
    assert.ok(omitted.coverageDiagnostics.some(row => row.status === 'incomplete-evaluation' && row.missingFields?.includes('relationshipSummary')));

    const explicitInsufficient = applyScanResult(state(), payload(completeExistingPatch({ relationshipSummary: '' })), { requireDossierCoverage: true });
    assert.equal(explicitInsufficient.coverageDiagnostics.some(row => row.missingFields?.includes('relationshipSummary')), false);
});

test('scanner prompt permits narrow first-scene personality synthesis from reinforcing evidence', () => {
    const prompt = buildScanPrompt({
        state: createEmptyState('chat:test'),
        chat: [
            { is_user: true, name: 'Lucien', mes: 'I approach the counter.' },
            { is_user: false, mes: 'The clerk shoves the roster between your elbows, hauls you closer by the sleeve, and immediately points you toward the next contract.' },
        ],
        assistantMessageId: 1,
    });
    assert.match(prompt, /personality may be established narrowly from multiple reinforcing choices/i);
    assert.match(prompt, /Brisk and impatiently task-focused during professional intake/);
    assert.match(prompt, /For every exchange-active NPC, include relationshipSummary/i);
});

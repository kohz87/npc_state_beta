import test from 'node:test';
import assert from 'node:assert/strict';

import { dossierHtml } from '../src/dossier-view.js';
import { structuredEvidencePromptRules } from '../src/evidence-adapter.js';
import { compactForegroundNpc, foregroundStateRevisionSignature } from '../src/foreground-context.js';
import { dossierExtractionPromptRules } from '../src/scan-helpers.js';

function npc(overrides = {}) {
    return {
        id: 'npc-tessa',
        name: 'Tessa Morren',
        aliases: [],
        role: 'Guild Intake Clerk',
        species: '',
        age: '',
        apparentAge: '~23',
        birthday: '23 Thawrise',
        birthdayProvenance: 'generated',
        appearance: 'A young woman in a wool waistcoat and ink-stained linen sleeves.',
        currentForm: '',
        appearanceForms: [],
        personality: '',
        behaviorProfile: [],
        speech: '',
        mannerisms: [],
        keyRelationships: [],
        memories: [],
        background: '',
        mood: '',
        location: 'Adventurer Guild Post, Rimecross',
        goal: '',
        status: 'Processing intake paperwork.',
        lifeState: 'alive',
        relationshipSummary: '',
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },
        manualProfileFields: [],
        profileEvolutionEvidence: [],
        updatedAt: 1,
        ...overrides,
    };
}

test('private completeness treats supported permitted-source values as proposals, not default insufficient', () => {
    const extraction = dossierExtractionPromptRules().join('\n');
    const structured = structuredEvidencePromptRules().join('\n');
    assert.match(extraction, /directly supported values from permitted CURRENT sources are proposals, not insufficient/i);
    assert.match(structured, /NPC_Inner_Chatter> directly grounds stated current private mood\/goal/i);
    assert.match(structured, /never proves presence, action, speech, gesture, or visible reaction/i);
    assert.doesNotMatch(extraction + structured, /Gemini|provider-specific|second scan|historical backfill/i);
});

test('generated birthday provenance survives compact routine context while ordinary explicit provenance stays omitted', () => {
    const generated = compactForegroundNpc(npc(), 0);
    assert.equal(generated.birthday, '23 Thawrise');
    assert.equal(generated.birthdayProvenance, 'generated');

    const explicit = compactForegroundNpc(npc({ birthdayProvenance: 'explicit' }), 0);
    assert.equal(explicit.birthday, '23 Thawrise');
    assert.equal(explicit.birthdayProvenance, undefined);
});

test('foreground cache signature changes when generated birthday provenance changes', () => {
    const generatedState = { npcs: [npc()], lastObservation: {} };
    const explicitState = { npcs: [npc({ birthdayProvenance: 'explicit' })], lastObservation: {} };
    assert.notEqual(foregroundStateRevisionSignature(generatedState), foregroundStateRevisionSignature(explicitState));
});

test('dossier labels generated birthdays without relabeling evidence-backed birthdays', () => {
    const generatedHtml = dossierHtml(npc());
    assert.match(generatedHtml, /Birthday 23 Thawrise \(generated\)/);
    assert.match(generatedHtml, /<b>Birthday \(generated\)<\/b><span>23 Thawrise<\/span>/);

    const explicitHtml = dossierHtml(npc({ birthdayProvenance: 'explicit' }));
    assert.match(explicitHtml, /Birthday 23 Thawrise/);
    assert.doesNotMatch(explicitHtml, /Birthday \(generated\)/);
});

test('compact provenance does not expand the foreground contract into extraction or a second scan', () => {
    const compact = JSON.stringify(compactForegroundNpc(npc(), 0));
    assert.match(compact, /\"birthdayProvenance\":\"generated\"/);
    assert.doesNotMatch(compact, /semanticUpdates|fieldEvaluations|profileObservations|relationshipChange/);
});

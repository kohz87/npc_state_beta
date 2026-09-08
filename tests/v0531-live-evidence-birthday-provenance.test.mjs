import test from 'node:test';
import assert from 'node:assert/strict';

import { dossierHtml } from '../src/dossier-view.js';
import { structuredEvidencePromptRules } from '../src/evidence-adapter.js';
import { compactForegroundNpc, foregroundStateRevisionSignature } from '../src/foreground-context.js';
import { dossierExtractionPromptRules } from '../src/scan-helpers.js';

function npc(overrides = {}) {
    return {
        id: 'npc-tessa', name: 'Tessa Morren', aliases: [], role: 'Guild Intake Clerk', species: '', age: '', apparentAge: '~23',
        birthday: '23 Thawrise', birthdayProvenance: 'generated', appearance: 'A young woman in a wool waistcoat and ink-stained linen sleeves.',
        currentForm: '', appearanceForms: [], personality: '', behaviorProfile: [], speech: '', mannerisms: [], keyRelationships: [], memories: [], background: '',
        mood: '', location: 'Adventurer Guild Post, Rimecross', goal: '', status: 'Processing intake paperwork.', lifeState: 'alive', relationshipSummary: '',
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 }, manualProfileFields: [], profileEvolutionEvidence: [], updatedAt: 1, ...overrides,
    };
}

test('private completeness treats supported permitted-source values as proposals, not default insufficient', () => {
    const extraction = dossierExtractionPromptRules().join('\n');
    const structured = structuredEvidencePromptRules().join('\n');
    assert.match(extraction, /directly supported values from permitted CURRENT sources are proposals, not insufficient/i);
    assert.match(structured, /NPC_Inner_Chatter> directly grounds stated current private mood\/goal/i);
    assert.match(structured, /never proves presence, action, speech, gesture, or visible reaction/i);
    assert.doesNotMatch(extraction + structured, /Gemini|provider-specific|historical backfill/i);
});

test('generated birthday provenance stays internal to compact routine scanner context', () => {
    const generated = compactForegroundNpc(npc(), 0);
    const explicit = compactForegroundNpc(npc({ birthdayProvenance: 'explicit' }), 0);
    assert.equal(generated.birthday, '23 Thawrise');
    assert.equal(explicit.birthday, '23 Thawrise');
    assert.equal(generated.birthdayProvenance, undefined);
    assert.equal(explicit.birthdayProvenance, undefined);
});

test('foreground cache signature ignores internal birthday provenance when projected continuity is identical', () => {
    const generatedState = { npcs: [npc()], lastObservation: {} };
    const explicitState = { npcs: [npc({ birthdayProvenance: 'explicit' })], lastObservation: {} };
    assert.equal(foregroundStateRevisionSignature(generatedState), foregroundStateRevisionSignature(explicitState));
});

test('dossier renders deterministic generated birthdays as ordinary stable birthdays', () => {
    const generatedHtml = dossierHtml(npc());
    assert.match(generatedHtml, /Birthday 23 Thawrise/);
    assert.match(generatedHtml, /<b>Birthday<\/b><span>23 Thawrise<\/span>/);
    assert.doesNotMatch(generatedHtml, /generated/i);
});

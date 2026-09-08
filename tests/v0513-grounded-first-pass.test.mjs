import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeActualAge, normalizeApparentAge, normalizeNpc } from '../src/schema.js';

const GUILD_SCENE = `A slender young woman in a wool waistcoat and ink-stained linen sleeves catches Lucien's forearm and steers him toward the Adventurer Guild intake desk. She puts a registration form and contract notices in front of him, gives rapid instructions, then waits over the desk with her arms crossed for him to sign.`;

test('apparent age preserves legacy wording while accepting model-led ranges without weakening actual age', () => {
    assert.equal(normalizeApparentAge('young woman'), 'young woman');
    assert.equal(normalizeApparentAge('middle-aged man'), 'middle-aged man');
    assert.equal(normalizeApparentAge('elderly'), 'elderly');
    assert.equal(normalizeApparentAge('25'), '~25');
    assert.equal(normalizeApparentAge('about 25'), '~25');
    assert.equal(normalizeApparentAge('20-30'), '~20-30');
    assert.equal(normalizeApparentAge('20s'), '');

    assert.equal(normalizeActualAge('young woman'), '');
    assert.equal(normalizeActualAge('middle-aged man'), '');
    assert.equal(normalizeActualAge('20-30'), '');
    assert.equal(normalizeActualAge('25'), '25');
});

test('routine Scan asks for grounded first-pass background, portrait-ready appearance, non-habitual behavior and neutral Current Dynamic', () => {
    const state = createEmptyState('chat:v0513-first-pass');
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I enter the Adventurer Guild to register.' },
        { is_user: false, name: 'Narrator', mes: GUILD_SCENE },
    ];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1, playerName: 'Lucien' });

    assert.match(prompt, /BACKGROUND EVIDENCE:/);
    assert.match(prompt, /clearly established workplace or affiliation may populate background on first pass/i);
    assert.match(prompt, /APPARENT AGE:/);
    assert.match(prompt, /semantically infer a defensible numeric interval/i);
    assert.match(prompt, /APPEARANCE FIDELITY:/);
    assert.match(prompt, /portrait-ready overall visual synthesis/i);
    assert.match(prompt, /not a latest-detail delta/i);
    assert.match(prompt, /Preserve prior supported visible facts unless contradicted/i);
    assert.match(prompt, /Never invent missing portrait features/i);
    assert.match(prompt, /BEHAVIOR PROFILE EVIDENCE:/);
    assert.match(prompt, /must not be rewritten as a habitual behavior/i);
    assert.match(prompt, /first direct interaction may establish a neutral professional, transactional/i);
    assert.match(prompt, /do not leave it blank merely because no trust\/affection\/desire\/tension delta occurred/i);
});

test('targeted Refresh receives the shared apparent-age and portrait-ready appearance policies and can repair a blank professional Current Dynamic at zero scores', () => {
    const npc = normalizeNpc({
        id: 'npc-guild-clerk',
        name: 'Guild Clerk',
        role: 'Adventurer Guild intake clerk',
        apparentAge: '',
        appearance: 'Ink-stained fingers; sleeves rolled to the elbows.',
        relationshipSummary: '',
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },
    });
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I enter the Adventurer Guild to register.' },
        { is_user: false, name: 'Narrator', mes: GUILD_SCENE },
    ];
    const prompt = buildTargetedRefreshPrompt({ npc, chat, assistantMessageId: 1, playerName: 'Lucien' });

    assert.match(prompt, /apparentAge=~N-M/i);
    assert.match(prompt, /backend chooses and persists one stable ~N inside that interval/i);
    assert.match(prompt, /portrait-ready overall visual synthesis/i);
    assert.match(prompt, /Preserve prior supported visible facts unless contradicted/i);
    assert.match(prompt, /first direct role-defined interaction may establish a neutral professional or transactional Current Dynamic with zero score change/i);
});

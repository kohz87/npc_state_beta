import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';
import { dossierHtml } from '../v03/dossier-view.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const generatedNpc = normalizeNpc({
    id: 'npc-hidden-bday-provenance',
    name: 'Sora',
    age: '6',
    apparentAge: '~6',
    birthday: '14 Frostwane',
    birthdayProvenance: 'generated',
    present: true,
});
assert(generatedNpc.birthdayProvenance === 'generated', 'Generated birthday provenance was removed from backend state');

const state = createEmptyState('hidden-birthday-provenance');
state.npcs = [generatedNpc];
state.lastObservation = {
    exchangeActiveNpcIds: [generatedNpc.id],
    finalPresentNpcIds: [generatedNpc.id],
    worldActiveNpcIds: [],
};

const foreground = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1800 });
assert(foreground.includes('Birthday: 14 Frostwane'), 'Foreground continuity lost the generated birthday value');
assert(!/generated placeholder/i.test(foreground), 'Foreground continuity exposes generated-placeholder provenance label');

const html = dossierHtml(generatedNpc);
assert(html.includes('Birthday 14 Frostwane') && html.includes('<b>Birthday</b>'), 'Dossier lost generated birthday display');
assert(!/generated placeholder/i.test(html), 'Dossier exposes generated-placeholder provenance label');

// Hiding provenance from the model-facing dossier must not break the rule that explicit
// story canon can replace a generated value. The backend still owns that decision.
const explicitContext = "Sora states that her birthday is 3 Rainmoot.";
const reconciled = applyScanResult(state, {
    exchangeActiveNpcIds: [generatedNpc.id],
    inChatNpcIds: [generatedNpc.id],
    worldActiveNpcIds: [],
    npcs: [{
        id: generatedNpc.id,
        name: generatedNpc.name,
        birthday: '3 Rainmoot',
        relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
    }],
    socialEdges: [],
    familyFacts: [],
}, {
    sourceMessageId: 2,
    turn: 2,
    applyReturnedNpcPatches: true,
    profileContext: explicitContext,
    currentAdmissionText: explicitContext,
}).state;
assert(reconciled.npcs[0].birthday === '3 Rainmoot' && reconciled.npcs[0].birthdayProvenance === 'explicit', 'Explicit canon no longer supersedes hidden generated birthday provenance');

const injectionSource = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
const scannerSource = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const dossierSource = fs.readFileSync(new URL('../v03/dossier-view.js', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
assert(!/generated placeholder/i.test(injectionSource), 'Injection runtime still contains generated-placeholder label text');
assert(!/generated placeholder/i.test(scannerSource), 'Scanner runtime still contains generated-placeholder wording');
assert(!/generated placeholder/i.test(dossierSource), 'Dossier runtime still contains generated-placeholder label text');
assert(injectionSource.includes('backend provenance/correction rules decide whether replacement is authorized'), 'Foreground contract lost provenance-safe explicit birthday replacement instruction');
assert(!/tagged internally as generated placeholders/i.test(readme), 'README still advertises generated-placeholder labels');
assert(!/supersedes placeholders/i.test(changelog), 'Changelog still describes visible placeholder-style birthday handling');

console.log('NPC State 0.4.3 hidden generated-birthday provenance verification passed');

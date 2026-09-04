import fs from 'node:fs';
import { createEmptyState, normalizeActualAge, normalizeNpc } from '../v03/schema.js';
import { buildInjection } from '../v03/injection.js';
import { buildScanPrompt, buildStructuredDossierImportPrompt, buildTargetedRefreshPrompt } from '../v03/scanner.js';
import { resolvedCurrentAppearance } from '../v03/appearance.js';
import { buildPortraitCharacterBlock } from '../v03/portrait-prompt.js';
import { dossierHtml } from '../v03/dossier-view.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function file(path) { return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'); }
function count(source, needle) { return source.split(needle).length - 1; }

const npc = normalizeNpc({
    id: 'npc-contract-age', name: 'Mira', species: 'Human', age: '6', apparentAge: '~6',
    appearance: 'Silver hair, gray eyes, and a small child build.',
    appearanceForms: [
        { name: 'Base', appearance: 'Silver hair, gray eyes, and a small child build.' },
        { name: 'Beast', appearance: 'Silver-furred wolf body with gray eyes, pointed ears, and a long tail.' },
    ], currentForm: 'Base', present: true,
});
const state = createEmptyState('phase8-contract');
state.npcs = [npc];
state.lastObservation = { exchangeActiveNpcIds: [npc.id], finalPresentNpcIds: [npc.id], worldActiveNpcIds: [] };
const chat = [
    { is_user: true, is_system: false, mes: 'I bring out a cake for Mira.' },
    { is_user: false, is_system: false, mes: 'Mira celebrates her birthday and turns 7.' },
];

const scan = buildScanPrompt({ state, chat, assistantMessageId: 1 });
for (const needle of ['AGE-LINKED APPEARANCE EVOLUTION', 'ageProgression', 'ordinary|accelerated|long_lived|ageless|unknown', 'age_progression', 'unknown fantasy species', 'neutral and non-sexual']) {
    assert(scan.includes(needle), 'Full recovery scanner missing maturation contract: ' + needle);
}
assert(scan.includes('correction never causes physical maturation'), 'Full recovery scanner does not distinguish correction from maturation');
assert(scan.includes('affectedForms'), 'Full recovery scanner lacks form-specific progression authority');

const injection = buildInjection(state, { enabled: true, autoScan: true, inject: true, injectLimit: 2, injectBudgetTokens: 3000 });
for (const needle of ['AGE-LINKED APPEARANCE EVOLUTION', 'ageProgression', 'ordinary|accelerated|long_lived|ageless|unknown', 'age_progression', 'Unknown fantasy species', 'neutral and non-sexual']) {
    assert(injection.includes(needle), 'Foreground capture missing maturation contract: ' + needle);
}
assert(injection.includes('Current appearance: ' + resolvedCurrentAppearance(npc)), 'Foreground continuity does not use resolved current appearance');
assert(injection.includes('Shared / ordinary appearance: ' + npc.appearance), 'Foreground continuity does not expose stored shared/ordinary appearance separately');

const refresh = buildTargetedRefreshPrompt({ npc, chat, assistantMessageId: 1 });
for (const needle of ['AGE-LINKED APPEARANCE EVOLUTION', 'ageProgression', 'ordinary|accelerated|long_lived|ageless|unknown', 'age_progression']) {
    assert(refresh.includes(needle), 'Targeted Refresh missing maturation contract: ' + needle);
}
assert(refresh.includes('correction does not mature the body'), 'Targeted Refresh does not distinguish correction from maturation');

const structured = buildStructuredDossierImportPrompt({
    npc,
    blocks: [{ messageId: 1, role: 'assistant', tag: 'NPC_Update', body: 'Mira celebrated her birthday and turned 7.' }],
});
assert(structured.includes('accepted birthday/elapsed transition'), 'Structured import missing age-linked progression rule');
assert(structured.includes('ageProgression'), 'Structured import output contract lacks ageProgression');
assert(structured.includes('correction is bookkeeping only and never matures the body'), 'Structured import does not block correction maturation');
assert(structured.includes('unknown fantasy species'), 'Structured import does not keep unknown fantasy maturation conservative');

const portrait = buildPortraitCharacterBlock(npc, 'natural');
const dossier = dossierHtml(npc);
assert(portrait.includes(resolvedCurrentAppearance(npc)), 'Portrait diverged from shared current-appearance resolver');
assert(dossier.includes('Current appearance'), 'Dossier missing Current appearance label');
assert(dossier.includes('Shared / ordinary appearance'), 'Dossier missing Shared / ordinary appearance label');
assert(dossier.includes('Appearance forms'), 'Dossier missing Appearance forms registry');

const readme = file('README.md');
const changelog = file('CHANGELOG.md');
assert(readme.includes('## Form-aware current appearance and age-linked maturation'), 'README missing form/maturation section');
assert(readme.includes('Age parsing, normalization, units, storage, and existing age-continuity rules are unchanged'), 'README does not preserve age semantics boundary');
assert(readme.includes('Unknown fantasy species do not silently inherit human aging'), 'README missing conservative unknown-species rule');
assert(count(readme, '## Form-aware current appearance and age-linked maturation') === 1, 'README maturation section duplicated across rebuilds');
assert(changelog.includes('Appearance/maturation hardening synchronizes legacy Base-compatible appearance'), 'Changelog missing appearance/maturation entry');
assert(count(changelog, 'Appearance/maturation hardening synchronizes legacy Base-compatible appearance') === 1, 'Changelog maturation entry duplicated across rebuilds');

// These are deliberately redundant with the unchanged legacy age verifier. They make the
// feature boundary explicit: this phase did not redefine actual-age normalization.
assert(normalizeActualAge('25') === '25', 'Exact actual-age normalization changed');
assert(normalizeActualAge('25 years old') === '25', 'Year-worded actual-age normalization changed');
assert(normalizeActualAge('about 25 years old') === '~25', 'Approximate actual-age normalization changed');
assert(normalizeActualAge('6 months old') === '6 months', 'Sub-year actual-age normalization changed');
assert(normalizeActualAge('child') === '', 'Life-stage text became an actual age');

const coreSource = file('v03/age-progression.js');
const scannerSource = file('v03/scanner.js');
assert(coreSource.includes("const BEHAVIORS = new Set(['ordinary', 'accelerated', 'long_lived', 'ageless', 'unknown'])"), 'Backend maturation classes missing');
assert(!/species\s*===\s*['\"](?:human|elf|dragon)/i.test(coreSource), 'Backend hard-coded a fragile species-name rule');
assert(scannerSource.includes('changedAge = explicitAgeChange(npc, patch, options)'), 'Age progression no longer depends on the existing accepted ageChange path');

console.log('NPC State 0.4.3 phase 8C age-progression contract verification passed');

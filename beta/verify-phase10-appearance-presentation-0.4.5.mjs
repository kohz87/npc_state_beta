import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { resolvedCurrentAppearance } from '../v03/appearance.js';
import { buildInjection } from '../v03/injection.js';
import { dossierHtml } from '../v03/dossier-view.js';
import { buildPortraitCharacterBlock } from '../v03/portrait-prompt.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const npc = normalizeNpc({
    id: 'npc-appearance-v045',
    name: 'Astra',
    species: 'Dragon chimera',
    role: 'Companion',
    age: '7',
    appearance: 'Silver hair and gray eyes remain recognizable across biological forms.',
    appearanceForms: [
        { name: 'Base', appearance: 'Small humanoid girl with a soft rounded face and slender swept horns.' },
        { name: 'Half-Dragon', appearance: 'Humanoid body with scaled forearms, partially manifested wings, and a narrow tail.' },
        { name: 'Dragon', appearance: 'Large silver-scaled dragon with broad wings, swept horns, and a long tail.' },
    ],
    currentForm: 'Half-Dragon',
    present: true,
    personality: 'Soft-spoken and observant.',
});
const resolved = resolvedCurrentAppearance(npc);
assert(resolved.includes('Silver hair and gray eyes'), 'Resolved current appearance lost shared traits');
assert(resolved.includes('scaled forearms'), 'Resolved current appearance lost active form traits');

const state = createEmptyState('appearance-v045');
state.npcs = [npc];
state.lastObservation = { exchangeActiveNpcIds: [npc.id], finalPresentNpcIds: [npc.id], worldActiveNpcIds: [] };
const injection = buildInjection(state, {
    enabled: true,
    autoScan: true,
    inject: true,
    injectLimit: 2,
    injectBudgetTokens: 2600,
});
assert(injection.includes('[NPC STATE v0.4.5 BETA | FOREGROUND CONTINUITY]'), '0.4.5 injection header missing');
assert(injection.includes('Current appearance: ' + resolved), 'Foreground continuity lost resolved Current appearance');
assert(injection.includes('Appearance forms:'), 'Foreground continuity lost Appearance forms registry');
assert(injection.includes('Half-Dragon [CURRENT]:'), 'Active form is not marked inside Appearance forms');
assert(injection.includes('Base:') && injection.includes('Dragon:'), 'Foreground form registry omitted unrelated forms');
assert(!injection.includes('Current form: Half-Dragon'), 'Foreground continuity still exposes redundant standalone Current form');
assert(!injection.includes('Shared / ordinary appearance:'), 'Foreground continuity still exposes redundant Shared / ordinary appearance');
assert(!injection.includes('Known physical forms:'), 'Legacy appearance registry label still duplicates the new two-surface contract');

const dossier = dossierHtml(npc);
assert(dossier.includes('Current appearance'), 'Dossier lost Current appearance');
assert(dossier.includes(resolved), 'Dossier Current appearance does not use the shared resolver');
assert(dossier.includes('Appearance forms'), 'Dossier lost Appearance forms registry');
assert(dossier.includes('Half-Dragon · current'), 'Dossier form registry does not mark the active form');
assert(dossier.includes('Base') && dossier.includes('Dragon'), 'Dossier form registry omitted known forms');
assert(!dossier.includes('Shared / ordinary appearance'), 'Dossier still exposes redundant Shared / ordinary appearance');
assert(!dossier.includes('>Current form<'), 'Dossier still exposes redundant standalone Current form card');

const portrait = buildPortraitCharacterBlock(npc, 'natural');
assert(portrait.includes(resolved), 'Portrait prompt stopped using resolved Current appearance');
assert(!portrait.includes('Base:') && !portrait.includes('Dragon:'), 'Portrait prompt unexpectedly started feeding the whole form registry');

// Storage/editor architecture remains intact even though normal reading surfaces are compact.
const schemaSource = fs.readFileSync(new URL('../v03/schema.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../v03/ui.js', import.meta.url), 'utf8');
const injectionSource = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
assert(schemaSource.includes('appearanceForms') && schemaSource.includes('currentForm'), 'Underlying form storage was removed');
assert(uiSource.includes('appearanceFormsEditorText') && uiSource.includes('currentForm'), 'Manual editor lost form-level editing controls');
assert(injectionSource.includes('resolvedCurrentAppearance(npc)'), 'Foreground continuity stopped using the shared appearance resolver');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert(manifest.version === '0.4.5', 'Manifest was not bumped to 0.4.5');

console.log('NPC State 0.4.5 compact appearance presentation verification passed');

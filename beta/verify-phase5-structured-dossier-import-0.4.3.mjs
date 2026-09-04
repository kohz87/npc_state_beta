import fs from 'node:fs';
import {
    extractStructuredDossierBlocks,
    structuredDossierBlocksForNpc,
} from '../v03/evidence-adapter.js';
import {
    buildStructuredDossierImportPrompt,
    sanitizeStructuredDossierPatch,
} from '../v03/scanner.js';
import { normalizeNpc } from '../v03/schema.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const plain = '<New_NPC>Name: Sora\nSpecies: Thunderbird</New_NPC>';
assert(extractStructuredDossierBlocks(plain).length === 0, 'Structured dossier parser accepted New_NPC outside the Megumin <Blocks> master');

const master = `<Blocks>
<World_State>Sora is nearby.</World_State>
<New_NPC>Name: Sora\nSpecies: Stormcrown Thunderbird Chimera\nAppearance: golden-blue hair</New_NPC>
<NPC_Update>Name: Sora\nSpeech: softly formal\nImportant memory: Papa taught her to track boars.</NPC_Update>
<Story_Tracker>Name: Sora\nTrust +100</Story_Tracker>
<New_NPC>Name: Ryu\nSpecies: Silver Dragon Chimera</New_NPC>
</Blocks>`;
const extracted = extractStructuredDossierBlocks(master);
assert(extracted.length === 3, 'Structured dossier parser did not isolate exactly New_NPC/NPC_Update children');
assert(extracted.every(block => ['New_NPC', 'NPC_Update'].includes(block.tag)), 'Non-dossier reference block escaped structured import parser');

const sora = normalizeNpc({ id: 'npc-sora-structured', name: 'Sora', aliases: ['Sora Valentine'], role: 'Daughter' });
const chat = [
    { is_user: true, is_system: false, mes: 'ordinary prose with no blocks' },
    { is_user: false, is_system: false, mes: master },
];
const soraBlocks = structuredDossierBlocksForNpc(chat, sora, 30);
assert(soraBlocks.length === 2, 'Targeted structured source matching did not isolate Sora blocks');
assert(soraBlocks.every(block => /Sora/i.test(block.body)), 'Structured source matcher selected another NPC block');
const guard = normalizeNpc({ id: 'npc-guard-structured', name: 'Holt', role: 'Daughter' });
assert(structuredDossierBlocksForNpc(chat, guard, 30).length === 0, 'Generic shared role text was treated as structured identity evidence');
assert(structuredDossierBlocksForNpc([{ is_user: false, is_system: false, mes: 'No Megumin blocks here.' }], sora, 30).length === 0, 'Non-Megumin chat produced structured dossier sources');

const dirtyPatch = {
    id: sora.id,
    name: 'Sora',
    species: 'Stormcrown Thunderbird Chimera',
    personality: 'Bright and courteous.',
    memories: ['Papa taught her to track boars.'],
    mood: 'Ecstatic',
    location: 'Secret cave',
    goal: 'Run away',
    status: 'Flying',
    currentForm: 'Beast',
    importance: 100,
    lifeState: 'dead',
    lifeStateCertainty: 'explicit',
    relationshipSummary: 'Utterly devoted to Papa.',
    relationshipChange: { impact: 'extreme', delta: { trust: 10, affection: 10, desire: 10, tension: 10 }, evidence: 'block', reason: 'block' },
};
const clean = sanitizeStructuredDossierPatch(dirtyPatch, sora);
assert(clean.species === dirtyPatch.species && clean.personality === dirtyPatch.personality, 'Durable structured dossier fields were stripped');
assert(Array.isArray(clean.memories) && clean.memories.length === 1, 'Durable structured memory field was stripped');
for (const forbidden of ['mood', 'location', 'goal', 'status', 'currentForm', 'importance', 'lifeState', 'lifeStateCertainty', 'relationshipSummary']) {
    assert(!Object.prototype.hasOwnProperty.call(clean, forbidden), 'Structured import sanitizer retained forbidden live/player field: ' + forbidden);
}
assert(clean.relationshipChange?.impact === 'none', 'Structured import sanitizer retained numeric relationship progression');
assert(Object.values(clean.relationshipChange?.delta || {}).every(value => Number(value) === 0), 'Structured import sanitizer retained relationship deltas');

const prompt = buildStructuredDossierImportPrompt({ npc: sora, blocks: soraBlocks, dossierLimits: {}, memoryCriteria: 'Only durable memories.' });
assert(prompt.includes('DELIBERATE STRUCTURED DOSSIER IMPORT'), 'Dedicated structured import prompt missing');
assert(prompt.includes('reference-data reconciliation, NOT a current scene/event scan'), 'Structured import prompt does not separate reference data from events');
assert(prompt.includes('NEVER infer current In-chat presence'), 'Structured import prompt does not forbid presence/live-state inference');
assert(prompt.includes('NEVER create or change Trust/Affection/Desire/Tension'), 'Structured import prompt does not forbid player relationship changes');
assert(prompt.includes('canonChanges') && prompt.includes('profileChanges'), 'Structured import prompt bypasses durable canon/profile gates');

const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
const noSourceIndex = engineSource.indexOf("if (!blocks.length) return { ok: false, reason: 'no-structured-source'");
const generationIndex = engineSource.indexOf("invokeJson(prompt, 'structured-import-' + npc.id)");
assert(noSourceIndex >= 0 && generationIndex > noSourceIndex, 'Non-Megumin/no-source path does not exit before model generation');
assert(engineSource.includes('preservePresence: true') && engineSource.includes('preserveObservation: true'), 'Structured import does not preserve current presence/observation state');
assert(engineSource.includes('applyRelationship: false'), 'Structured import can apply relationship deltas');
assert(engineSource.includes("recordCheckpoint(applied.state, liveChat, messageId, 'structured-dossier-import')"), 'Structured import is not branch-checkpointed');

const dossierSource = fs.readFileSync(new URL('../v03/dossier-view.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../v03/ui.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
assert(dossierSource.includes('npc-state-v3-import-structured'), 'Dossier More menu has no deliberate structured import action');
assert(uiSource.includes('engine.importStructuredDossier(id)'), 'Structured import UI is not wired to engine');
assert(indexSource.includes('importStructuredDossier: reference => engine.importStructuredDossier(reference)'), 'Public structured import API missing');

console.log('NPC State 0.4.3 Phase 5 structured dossier import verification passed');

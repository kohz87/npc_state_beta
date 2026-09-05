import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy, profileEvidenceText } from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

function noChange(reason = 'No new player-relationship movement.') {
    return {
        evaluated: true,
        impact: 'none',
        delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
        priority: [], axisEvidence: {}, evidence: '', reason,
    };
}
function patch(name, extra = {}) {
    return {
        id: '', name, identityKind: 'named', aliases: [], role: '', species: '',
        relationshipChange: noChange(),
        ...extra,
    };
}
function payload(npcs, exchange = [], present = [], world = []) {
    return {
        exchangeActiveNpcIds: exchange,
        inChatNpcIds: present,
        worldActiveNpcIds: world,
        npcs,
        socialEdges: [], familyFacts: [],
    };
}
function exchange(visible, worldState = '', inner = '', excluded = '') {
    const blocks = (worldState || inner || excluded) ? `\n<Blocks>\n${worldState ? `<World_State>\n${worldState}\n</World_State>` : ''}\n${inner ? `<NPC_Inner_Chatter>\n${inner}\n</NPC_Inner_Chatter>` : ''}\n${excluded ? `<CYOA>\n${excluded}\n</CYOA>` : ''}\n</Blocks>` : '';
    return {
        user: { mes: 'Lucien continues the scene.' },
        assistant: { mes: visible + blocks },
    };
}
function apply(state, scanPayload, ex, messageId = 70, options = {}) {
    const evidencePolicy = buildExchangeEvidencePolicy(ex);
    return applyScanResult(state, scanPayload, {
        sourceMessageId: messageId,
        turn: messageId,
        evidencePolicy,
        currentAdmissionText: [ex.user?.mes, ex.assistant?.mes].map(profileEvidenceText).filter(Boolean).join('\n'),
        profileContext: [ex.user?.mes, ex.assistant?.mes].map(profileEvidenceText).filter(Boolean).join('\n'),
        applyReturnedNpcPatches: true,
        applyRelationship: false,
        admissionMode: options.admissionMode || 'balanced',
    });
}

const claraVisible = [
    'Brina said, "Clara keeps three rooms upstairs."',
    "Past the cooper's yard, Clara's guesthouse stood against the palisade wall.",
    'A woman with dark hair gathered into a loose wool scarf stood in the doorway.',
    '"The corner room upstairs is aired out. Five Gold for the night."',
    'She stepped back into the entry hall, gesturing toward the bench beside a ceramic stove.',
].join('\n');

function claraPatch(name = 'Clara') {
    return patch(name, {
        role: 'Civilian Innkeeper',
        identityEvidence: {
            anchor: 'Clara',
            excerpts: ['Brina said, "Clara keeps three rooms upstairs."', "Past the cooper's yard, Clara's guesthouse stood against the palisade wall."],
            explanation: 'The scene reaches the guesthouse previously identified with Clara, and the woman operating it is the same character.',
        },
        activityEvidence: {
            exchangeActive: { excerpts: ['"The corner room upstairs is aired out. Five Gold for the night."'], explanation: 'She speaks directly to Lucien in the current scene.' },
            inChat: { excerpts: ['She stepped back into the entry hall, gesturing toward the bench beside a ceramic stove.'], explanation: 'She remains in the entry hall at the end of the exchange.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
}

// 1. Plain narrative is sufficient. No Megumin/World_State is required.
{
    const state = createEmptyState('v0427-plain-clara');
    const ex = exchange(claraVisible);
    const result = apply(state, payload([claraPatch('Clara')], ['Clara'], ['Clara']), ex, 71);
    assert.equal(result.state.npcs.length, 1, 'Plain visible narrative did not admit Clara');
    assert.equal(result.state.npcs[0].name, 'Clara');
    assert.equal(result.state.npcs[0].present, true, 'Plain narrative Clara was not left in-chat');
    assert.equal(result.state.npcs[0].worldActive, false, 'Plain narrative Clara became off-screen');
}

// 2. Existing NPCs may be grounded through indirect/pronominal activity evidence even when
// their name is not repeated in the current visible lines.
{
    const state = createEmptyState('v0427-pronoun-existing');
    state.npcs = [normalizeNpc({ id: 'npc-clara', name: 'Clara', present: false })];
    const visible = 'She opened the door, quoted five Gold for the room, and remained beside the stove.';
    const ex = exchange(visible);
    const p = patch('Clara', {
        id: 'npc-clara',
        activityEvidence: {
            exchangeActive: { excerpts: [visible], explanation: 'She acts and speaks in the current exchange.' },
            inChat: { excerpts: [visible], explanation: 'She remains in the scene at the end.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
    const result = apply(state, payload([p], ['npc-clara'], ['npc-clara']), ex, 72);
    assert.equal(result.state.npcs[0].present, true, 'Verified pronoun-only activity did not keep an existing NPC in chat');
}

// 3. Public Clara alone cannot invent the unsupported surname Vane without an allowed
// corroborating structured canonical identity.
{
    const state = createEmptyState('v0427-no-invented-surname');
    const ex = exchange(claraVisible);
    const result = apply(state, payload([claraPatch('Clara Vane')], ['Clara Vane'], ['Clara Vane']), ex, 73);
    assert.equal(result.state.npcs.length, 0, 'Unsupported surname was admitted from plain narrative');
}

// 4. Optional World_State may enrich public Clara to one compatible canonical full name.
{
    const state = createEmptyState('v0427-structured-enrichment');
    const world = '**NPCs Present:**\n**Clara Vane:** Standing in the guesthouse entryway.\n\n**📡 Off-Screen:**\n* Brina Cole — Closing the guild ledger.';
    const ex = exchange(claraVisible, world);
    const result = apply(state, payload([claraPatch('Clara Vane')], ['Clara Vane'], ['Clara Vane']), ex, 74);
    assert.equal(result.state.npcs.length, 1, 'Public short-name + structured canonical enrichment failed');
    assert.equal(result.state.npcs[0].name, 'Clara Vane');
    assert.equal(result.state.npcs[0].present, true);
    assert.equal(result.state.npcs[0].worldActive, false);
}

// 5. Structured-only child names still cannot leak into new dossiers.
{
    const state = createEmptyState('v0427-structured-only-twins');
    const visible = 'Two small girls with identical round faces peeked from behind the woman.';
    const world = '**NPCs Present:**\n**Talia Vane & Tessa Vane:** Near the woodbox and kitchen threshold.';
    const ex = exchange(visible, world);
    const makeTwin = name => patch(name, {
        role: 'Child',
        identityEvidence: { anchor: name.split(' ')[0], excerpts: [visible], explanation: 'One of the two girls.' },
        activityEvidence: {
            exchangeActive: { excerpts: [visible], explanation: 'The girl is visibly present.' },
            inChat: { excerpts: [visible], explanation: 'The girl remains in the room.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
    const result = apply(state, payload([makeTwin('Talia Vane'), makeTwin('Tessa Vane')], ['Talia Vane', 'Tessa Vane'], ['Talia Vane', 'Tessa Vane']), ex, 75);
    assert.equal(result.state.npcs.length, 0, 'World_State-only twin names created NPC dossiers');
}

// 6. World_State NPCs Present is not off-screen evidence.
{
    const state = createEmptyState('v0427-present-not-world');
    state.npcs = [normalizeNpc({ id: 'npc-clara', name: 'Clara Vane', present: false, worldActive: false })];
    const ex = exchange('Clara Vane opened the door and remained in the entry hall.', '**NPCs Present:**\n**Clara Vane:** In the guesthouse entry hall.');
    const p = patch('Clara Vane', { id: 'npc-clara' });
    const result = apply(state, payload([p], [], [], ['npc-clara']), ex, 76);
    assert.deepEqual(result.worldActiveNpcIds, [], 'NPCs Present incorrectly corroborated worldActive');
    assert.equal(result.state.npcs[0].worldActive, false);
}

// 7. The Off-Screen section may corroborate world activity for an established NPC.
{
    const state = createEmptyState('v0427-offscreen-brina');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false, worldActive: false })];
    const ex = exchange('Lucien stepped into the guesthouse.', '**NPCs Present:**\n**Clara Vane:** At the door.\n\n**📡 Off-Screen:**\n* Brina Cole — Closing the guild ledger.');
    const p = patch('Brina Cole', { id: 'npc-brina' });
    const result = apply(state, payload([p], [], [], ['Brina Cole']), ex, 77);
    assert.deepEqual(result.worldActiveNpcIds, ['npc-brina'], 'Off-Screen section did not corroborate Brina world activity');
    assert.equal(result.state.npcs[0].worldActive, true);
}

// 8. Malformed scans cannot leave the same NPC both in-chat and world-active. In-chat wins.
{
    const state = createEmptyState('v0427-mutual-exclusive');
    state.npcs = [normalizeNpc({ id: 'npc-clara', name: 'Clara', present: false, worldActive: false })];
    const visible = 'Clara opened the door and remained beside the stove.';
    const ex = exchange(visible);
    const p = patch('Clara', {
        id: 'npc-clara',
        activityEvidence: {
            exchangeActive: { excerpts: [visible], explanation: 'Clara acts.' },
            inChat: { excerpts: [visible], explanation: 'Clara remains in scene.' },
            worldActive: { excerpts: [visible], explanation: 'Malformed fixture intentionally claims both.' },
        },
    });
    const result = apply(state, payload([p], ['Clara'], ['Clara'], ['Clara']), ex, 78);
    assert.deepEqual(result.finalPresentNpcIds, ['npc-clara']);
    assert.deepEqual(result.worldActiveNpcIds, [], 'worldActive survived an inChat collision');
    assert.equal(result.state.npcs[0].present, true);
    assert.equal(result.state.npcs[0].worldActive, false);
}

// 9. Ambiguous public anchors fail closed instead of choosing one structured full name.
{
    const state = createEmptyState('v0427-ambiguous-anchor');
    const visible = 'Clara was expected at the house before dusk.';
    const world = '**NPCs Present:**\n**Clara Vane:** At the west door.\n**Clara Vale:** At the east door.';
    const ex = exchange(visible, world);
    const make = name => patch(name, {
        identityEvidence: { anchor: 'Clara', excerpts: [visible], explanation: 'The fixture intentionally leaves which Clara ambiguous.' },
        activityEvidence: {
            exchangeActive: { excerpts: [visible], explanation: 'Ambiguous fixture.' },
            inChat: { excerpts: [visible], explanation: 'Ambiguous fixture.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
    const result = apply(state, payload([make('Clara Vane'), make('Clara Vale')], ['Clara Vane', 'Clara Vale'], ['Clara Vane', 'Clara Vale']), ex, 79);
    assert.equal(result.state.npcs.length, 0, 'Ambiguous short anchor selected a structured identity');
}

// 10. Direct full-name introductions remain valid without identityEvidence.
{
    const state = createEmptyState('v0427-direct-full-name');
    const visible = 'Clara Vane opened the guesthouse door and invited Lucien inside.';
    const ex = exchange(visible);
    const p = patch('Clara Vane', {
        activityEvidence: {
            exchangeActive: { excerpts: [visible], explanation: 'Direct action.' },
            inChat: { excerpts: [visible], explanation: 'She remains in the doorway.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
    const result = apply(state, payload([p], ['Clara Vane'], ['Clara Vane']), ex, 80);
    assert.equal(result.state.npcs[0]?.name, 'Clara Vane', 'Direct full-name admission regressed');
}

// 11. Fabricated activity quotations cannot resurrect a pronoun-only presence claim.
{
    const state = createEmptyState('v0427-fabricated-activity');
    state.npcs = [normalizeNpc({ id: 'npc-clara', name: 'Clara', present: false })];
    const ex = exchange('She remained beside the stove.');
    const p = patch('Clara', {
        id: 'npc-clara',
        activityEvidence: {
            exchangeActive: { excerpts: ['She waved from the doorway.'], explanation: 'Fabricated.' },
            inChat: { excerpts: ['She waved from the doorway.'], explanation: 'Fabricated.' },
            worldActive: { excerpts: [], explanation: '' },
        },
    });
    const result = apply(state, payload([p], ['npc-clara'], ['npc-clara']), ex, 81);
    assert.deepEqual(result.finalPresentNpcIds, [], 'Fabricated activity quotation grounded presence');
    assert.equal(result.state.npcs[0].present, false);
}

// 12. Inner chatter and CYOA/reference-only names remain non-admission evidence.
{
    const state = createEmptyState('v0427-private-only');
    const ex = exchange('Lucien stood alone in the entry hall.', '', '"CLARA: Five Gold will buy grain."', 'Ask Clara about breakfast.');
    const p = patch('Clara', {
        identityEvidence: { anchor: 'Clara', excerpts: ['Ask Clara about breakfast.'], explanation: 'Reference-only fixture.' },
    });
    const result = apply(state, payload([p], ['Clara'], ['Clara']), ex, 82);
    assert.equal(result.state.npcs.length, 0, 'Private/reference-only Clara created a dossier');
}

// 13. v0.4.24 established short-name presence remains intact.
{
    const state = createEmptyState('v0427-brina-regression');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false })];
    const ex = exchange('Brina looked up from the ledger and remained at the counter.', '**NPCs Present:**\n**Brina Cole:** Behind the reception counter.');
    const p = patch('Brina Cole', { id: 'npc-brina' });
    const result = apply(state, payload([p], ['Brina Cole'], ['Brina Cole']), ex, 83);
    assert.equal(result.state.npcs[0].present, true, 'v0.4.24 visible short-name presence regressed');
}

// 14. Section extraction itself distinguishes Present from Off-Screen.
{
    const ex = exchange('Clara spoke from the doorway.', '**NPCs Present:**\n**Clara Vane:** At the door.\n\n**📡 Off-Screen:**\n* Brina Cole — Closing the ledger.\n\n**🔥 Unresolved Threads:**\n* Clara needs winter coin.');
    const policy = buildExchangeEvidencePolicy(ex);
    assert(policy.worldPresentText.includes('Clara Vane'), 'World_State Present section was not extracted');
    assert(!policy.worldPresentText.includes('Brina Cole'), 'Off-screen text leaked into Present section');
    assert(policy.worldOffscreenText.includes('Brina Cole'), 'World_State Off-Screen section was not extracted');
    assert(!policy.worldOffscreenText.includes('Clara needs winter coin'), 'Later World_State section leaked into Off-Screen');
}

// Production prompts share the same source-agnostic guidance and evidence contract.
{
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    const adapter = fs.readFileSync(new URL('../v03/evidence-adapter.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    for (const marker of ['identityPresencePromptRules', 'identityEvidence', 'activityEvidence']) {
        assert(scanner.includes(marker), 'Recovery path lacks source-agnostic marker: ' + marker);
        assert(injection.includes(marker), 'Foreground path lacks source-agnostic marker: ' + marker);
    }
    for (const marker of ['worldPresentText', 'worldOffscreenText', 'splitWorldStatePresenceSections']) assert(adapter.includes(marker), 'Evidence adapter lacks section-aware marker: ' + marker);
    assert(scanner.includes("filter(id => !presentIds.includes(id))"), 'Final inChat/worldActive exclusivity guard missing');
    assert(scanner.includes('relationshipInertiaFactor'), 'Relationship progression mechanics disappeared');
    assert(scanner.includes('selectRelationshipAxes'), 'Relationship axis selection mechanics disappeared');
    assert(scanner.includes('relationshipAxisLooksDuplicate'), 'Relationship duplicate protection disappeared');
    assert(scanner.includes('FAMILY_KINSHIP_GROUPS'), 'v0.4.26 general kinship projection regressed');
    assert(!engine.includes('identityPresenceReview'), 'Unexpected additional identity/presence LLM review call introduced');
}

console.log('NPC State 0.4.27 source-agnostic identity and presence grounding verified');

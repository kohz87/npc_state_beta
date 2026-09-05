import assert from 'node:assert/strict';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

function payload(overrides = {}) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        ...overrides,
    };
}

function noChangePatch(id, name) {
    return {
        id,
        name,
        relationshipChange: {
            evaluated: true,
            impact: 'none',
            delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
            priority: [],
            axisEvidence: {},
            evidence: '',
            reason: 'No new relationship movement.',
        },
    };
}

function policy(visible, world = '', inner = '') {
    const blocks = (world || inner) ? `\n<Blocks>\n${world ? `<World_State>\n${world}\n</World_State>` : ''}\n${inner ? `<NPC_Inner_Chatter>\n${inner}\n</NPC_Inner_Chatter>` : ''}\n</Blocks>` : '';
    return buildExchangeEvidencePolicy({
        user: { mes: 'Lucien completes the current exchange.' },
        assistant: { mes: `${visible}${blocks}` },
    });
}

function scan(state, evidencePolicy, refs = ['Brina Cole'], messageId = 12) {
    return applyScanResult(state, payload({
        exchangeActiveNpcIds: refs,
        inChatNpcIds: refs,
        npcs: [noChangePatch('npc-brina', 'Brina Cole')],
    }), {
        sourceMessageId: messageId,
        turn: messageId,
        evidencePolicy,
        currentAdmissionText: evidencePolicy.visibleText,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
}

// Exact reproduction: visible narrative uses the first name while World_State uses the
// canonical full dossier name. A correct inChat claim must survive the evidence firewall.
{
    const state = createEmptyState('brina-short-name');
    state.npcs = [normalizeNpc({
        id: 'npc-brina',
        name: 'Brina Cole',
        role: 'Guild Clerk',
        present: false,
        worldActive: false,
        relationship: { trust: 7, affection: 3, desire: 0, tension: 1 },
    })];
    const evidence = policy(
        'Brina looked up from a stack of supply requisitions.\n"Three snouts. Clean cuts across the bridge."',
        '**NPCs Present:**\n**Brina Cole:** Behind the reception counter, drying the contract voucher with sand.',
        '"BRINA: Limping on that ankle, but he cleared three boars in half a day without whining."',
    );
    const result = scan(state, evidence);
    const brina = result.state.npcs.find(npc => npc.id === 'npc-brina');
    assert.equal(brina.present, true, 'Visible Brina did not ground canonical Brina Cole in-chat presence');
    assert.equal(brina.worldActive, false, 'In-chat Brina was incorrectly marked off-screen world-active');
    assert.deepEqual(result.finalPresentNpcIds, ['npc-brina'], 'Canonical Brina presence ref was filtered out');
    assert.deepEqual(brina.relationship, { trust: 7, affection: 3, desire: 0, tension: 1 }, 'Presence repair mutated relationship state');
}

// All-caps short names used by transcript labels are also acceptable visible identity tokens.
{
    const state = createEmptyState('brina-short-name-uppercase');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false })];
    const evidence = policy('BRINA turned the settlement ledger around and pointed to the signature line.', '**Brina Cole:** At the guild counter.');
    const result = scan(state, evidence, ['npc-brina'], 13);
    assert.equal(result.state.npcs[0].present, true, 'All-caps visible short name did not ground established identity');
}

// World_State alone is still not proof of in-chat presence.
{
    const state = createEmptyState('brina-world-only');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false })];
    const evidence = policy('The guild hall hearth burned low as Lucien waited at the counter.', '**NPCs Present:**\n**Brina Cole:** Behind the reception counter.');
    const result = scan(state, evidence, ['Brina Cole'], 14);
    assert.equal(result.state.npcs[0].present, false, 'World_State alone bypassed the in-chat evidence firewall');
    assert.deepEqual(result.finalPresentNpcIds, [], 'World-only Brina reference survived presence filtering');
}

// A short name found only in World_State must also remain structured-only evidence.
{
    const state = createEmptyState('brina-world-short-only');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false })];
    const evidence = policy('The guild hall hearth burned low as Lucien waited alone at the counter.', '**NPCs Present:**\n**Brina:** Behind the reception counter.');
    const result = scan(state, evidence, ['Brina Cole'], 15);
    assert.equal(result.state.npcs[0].present, false, 'World_State short name bypassed the in-chat evidence firewall');
    assert.deepEqual(result.finalPresentNpcIds, [], 'World-only short Brina reference survived presence filtering');
}

// Private inner chatter alone is still not proof of in-chat presence.
{
    const state = createEmptyState('brina-inner-only');
    state.npcs = [normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false })];
    const evidence = policy('Lucien stood alone near the guild hearth.', '', '"BRINA: He should rest that ankle before tomorrow."');
    const result = scan(state, evidence, ['Brina Cole'], 16);
    assert.equal(result.state.npcs[0].present, false, 'NPC_Inner_Chatter alone bypassed the in-chat evidence firewall');
    assert.deepEqual(result.finalPresentNpcIds, [], 'Inner-only Brina reference survived presence filtering');
}

// Shared first names fail closed. Visible "Brina" cannot choose between two established Brinas.
{
    const state = createEmptyState('brina-ambiguous-short-name');
    state.npcs = [
        normalizeNpc({ id: 'npc-brina', name: 'Brina Cole', present: false }),
        normalizeNpc({ id: 'npc-brina-vane', name: 'Brina Vane', present: false }),
    ];
    const evidence = policy('Brina looked up from the ledger.', '**NPCs Present:**\n**Brina Cole:** Behind the reception counter.');
    const result = scan(state, evidence, ['Brina Cole'], 17);
    assert.equal(result.state.npcs.find(npc => npc.id === 'npc-brina').present, false, 'Ambiguous shared first name selected Brina Cole');
    assert.equal(result.state.npcs.find(npc => npc.id === 'npc-brina-vane').present, false, 'Ambiguous short-name repair changed another Brina');
    assert.deepEqual(result.finalPresentNpcIds, [], 'Ambiguous short-name reference did not fail closed');
}

// Single-token canonical names continue to use the ordinary exact visible-reference path.
{
    const state = createEmptyState('single-name-control');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', present: false })];
    const evidence = policy('Mira closed the ledger and remained at the counter.', '**Mira:** At the counter.');
    const result = applyScanResult(state, payload({
        exchangeActiveNpcIds: ['Mira'],
        inChatNpcIds: ['Mira'],
        npcs: [noChangePatch('npc-mira', 'Mira')],
    }), {
        sourceMessageId: 18,
        turn: 18,
        evidencePolicy: evidence,
        currentAdmissionText: evidence.visibleText,
        applyReturnedNpcPatches: true,
        applyRelationship: false,
    });
    assert.equal(result.state.npcs[0].present, true, 'Existing single-token canonical identity regressed');
}

console.log('NPC State 0.4.24 visible short-name presence grounding verified');

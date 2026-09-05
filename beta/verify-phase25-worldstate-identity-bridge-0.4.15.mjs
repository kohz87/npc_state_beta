import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildExchangeEvidencePolicy, profileEvidenceText, structuredEvidencePromptRules } from '../v03/evidence-adapter.js';
import { applyScanResult } from '../v03/scanner.js';
import { createEmptyState } from '../v03/schema.js';

function payload() {
    return {
        exchangeActiveNpcIds: ['Kora Lind'],
        inChatNpcIds: ['Kora Lind'],
        worldActiveNpcIds: [],
        npcs: [{
            id: '',
            name: 'Kora Lind',
            identityKind: 'named',
            aliases: [],
            role: 'Guild Clerk / Intake Officer',
            behaviorProfile: [],
            mannerisms: [],
            keyRelationships: [],
            memories: [],
            relationshipChange: {
                impact: 'none',
                delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
                evidence: '',
                reason: '',
            },
        }],
        socialEdges: [],
        familyFacts: [],
    };
}

function applyAssistant(assistant, admissionMode = 'balanced') {
    const exchange = {
        user: { is_user: true, mes: 'I enter the guildhall.' },
        assistant: { is_user: false, mes: assistant },
    };
    const state = createEmptyState('world-identity-bridge');
    return applyScanResult(state, payload(), {
        sourceMessageId: 1,
        turn: 1,
        evidencePolicy: buildExchangeEvidencePolicy(exchange),
        currentAdmissionText: [exchange.user.mes, exchange.assistant.mes].map(profileEvidenceText).join('\n'),
        profileContext: [exchange.user.mes, exchange.assistant.mes].map(profileEvidenceText).join('\n'),
        relationshipContext: '',
        admissionMode,
        applyRelationship: false,
        applyReturnedNpcPatches: true,
    });
}

const reportedScene = `<font color="#c86432">"Wipe your boots on the coir mat."</font>
Behind the low counter stood a young woman with sleeves rolled to the elbows of a coarse woolen dress, hair pinned up with a notched bone bodkin.
The clerk paid the odd walking staff only a passing glance.
She slid the ink-wet quill an inch closer across the wood, waiting for your hand.
<Blocks>
<World_State>
**👥 NPCs Present:**
**Kora Lind:**
* *Soul Class:* I
* *G-Rank:* Unregistered (Guild Clerk / Intake Officer)
* *Outfit:* Coarse brown wool dress with rolled sleeves, sheepskin-lined bodice, hair pinned with a bone bodkin
* *Position:* Standing behind the reception counter, leaning over open ledgers and contract slips
* *Mood:* Brisk, efficient, mildly impatient with mountain wanderers
* *Agenda:* Register available laborers and fill outstanding local bounties before winter deepens
</World_State>
<NPC_Inner_Chatter>
"KORA: Another half-frozen drifter from the pass."
</NPC_Inner_Chatter>
<CYOA>1. Sign the registry.</CYOA>
</Blocks>`;

{
    const result = applyAssistant(reportedScene, 'balanced');
    assert.equal(result.state.npcs.length, 1, 'Visible clerk + matching World_State name failed to create a dossier');
    assert.equal(result.state.npcs[0].name, 'Kora Lind', 'World_State identity bridge did not preserve the canonical proper name');
    assert(result.exchangeActiveNpcIds.includes(result.state.npcs[0].id), 'Bridged new NPC lost current-exchange activity');
    assert(result.finalPresentNpcIds.includes(result.state.npcs[0].id), 'Bridged new NPC lost in-chat presence');
}

{
    const result = applyAssistant(reportedScene, 'named_preferred');
    assert.equal(result.state.npcs.length, 1, 'Named-preferred admission rejected a proper name resolved from a visible role + World_State identity');
}

{
    const result = applyAssistant(reportedScene, 'manual');
    assert.equal(result.state.npcs.length, 0, 'Manual new-NPC admission was weakened by the World_State identity bridge');
}

{
    const worldOnly = `<p>Snow rattled against the guildhall windows.</p>
<Blocks><World_State>
**NPCs Present:**
**Kora Lind:**
* *G-Rank:* Unregistered (Guild Clerk / Intake Officer)
</World_State></Blocks>`;
    const result = applyAssistant(worldOnly);
    assert.equal(result.state.npcs.length, 0, 'World_State alone incorrectly introduced a new NPC');
}

{
    const mismatchedVisibleRole = `The gate guard checked the latch and returned to his stool.
<Blocks><World_State>
**NPCs Present:**
**Kora Lind:**
* *G-Rank:* Unregistered (Guild Clerk / Intake Officer)
</World_State></Blocks>`;
    const result = applyAssistant(mismatchedVisibleRole);
    assert.equal(result.state.npcs.length, 0, 'An unrelated visible role incorrectly authorized a World_State identity');
}

{
    const innerOnly = `The clerk pushed the quill across the counter.
<Blocks><NPC_Inner_Chatter>
"KORA: If he signs, the boar notice is off my desk."
</NPC_Inner_Chatter></Blocks>`;
    const result = applyAssistant(innerOnly);
    assert.equal(result.state.npcs.length, 0, 'Private NPC_Inner_Chatter incorrectly introduced a structured proper name');
}

assert(structuredEvidencePromptRules().some(line => line.includes('IDENTITY BRIDGE')), 'Scanner prompt does not explain the World_State identity bridge');

const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
assert(scanner.includes('worldStateIdentityBridgesVisibleIntroduction'), 'Runtime scanner lacks the World_State identity bridge');
assert(scanner.includes('newReferenceAllowedByWorldIdentityBridge'), 'Runtime activity references are not bridge-aware');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.15');

console.log('NPC State 0.4.15 World_State identity bridge verified');

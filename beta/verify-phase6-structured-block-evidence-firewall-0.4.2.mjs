import fs from 'node:fs';
import {
    analyzeStructuredEvidence,
    buildExchangeEvidencePolicy,
    evidenceReferenceScope,
    hasRecognizedStructuredBlocks,
    profileEvidenceText,
    relationshipEvidenceText,
    scannerEvidenceText,
} from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

// Non-Megumin users are a true no-op: arbitrary XML/custom tags outside <Blocks>
// do not activate the adapter and scanner evidence remains byte-for-byte unchanged.
{
    const text = 'Visible story.\n<Custom_State>ordinary user markup</Custom_State>';
    assert(hasRecognizedStructuredBlocks(text) === false, 'Arbitrary non-Megumin XML activated the firewall');
    assert(scannerEvidenceText(text) === text, 'Non-Megumin evidence text was rewritten');
    assert(relationshipEvidenceText(text) === text, 'Non-Megumin relationship context was rewritten');
    assert(profileEvidenceText(text) === text, 'Non-Megumin profile context was rewritten');
}

const megumin = `Mira closes the ledger and nods to the player.
<Blocks>
<World_State>
Gate Guard | east gate | standing watch
</World_State>
<NPC_Inner_Chatter>
Sora privately worries that the player may leave and wants to stay close.
</NPC_Inner_Chatter>
<Story_Tracker>
SECRET_TRACKER_NPC is supposedly present and romantically obsessed.
</Story_Tracker>
<New_NPC>
FAKE_BLOCK_NPC | this must not bootstrap a dossier
</New_NPC>
</Blocks>`;

// Recognized Megumin blocks are split by authority, with reference/control content omitted
// from scanner evidence instead of merely being relabeled beside the narrative.
{
    const view = analyzeStructuredEvidence(megumin);
    assert(view.detected === true, 'Megumin master block was not detected');
    assert(view.visibleText.includes('Mira closes the ledger'), 'Visible narrative was lost');
    assert(!view.visibleText.includes('Gate Guard') && !view.visibleText.includes('Sora privately'), 'Structured blocks leaked into visible narrative');
    assert(view.worldStateText.includes('Gate Guard'), 'World_State was not isolated');
    assert(view.innerChatterText.includes('Sora privately worries'), 'NPC_Inner_Chatter was not isolated');
    assert(view.excludedText.includes('SECRET_TRACKER_NPC') && view.excludedText.includes('FAKE_BLOCK_NPC'), 'Reference/control block content was not isolated');
    const scannerText = scannerEvidenceText(megumin);
    assert(scannerText.includes('MEGUMIN World_State') && scannerText.includes('MEGUMIN NPC_Inner_Chatter'), 'Authority labels missing from scanner evidence');
    assert(!scannerText.includes('SECRET_TRACKER_NPC') && !scannerText.includes('FAKE_BLOCK_NPC'), 'Excluded block content leaked into scanner input');
    assert(scannerText.includes('Story_Tracker') && scannerText.includes('New_NPC'), 'Excluded tag names are not disclosed to the scanner');
    const rel = relationshipEvidenceText(megumin);
    assert(rel.includes('Mira closes') && rel.includes('Sora privately'), 'Relationship evidence did not retain visible + private relationship context');
    assert(!rel.includes('Gate Guard') && !rel.includes('SECRET_TRACKER_NPC'), 'World/reference blocks leaked into relationship evidence');
    const profile = profileEvidenceText(megumin);
    assert(profile.includes('Mira closes') && !profile.includes('Sora privately') && !profile.includes('Gate Guard'), 'Durable profile evidence is not visible-narrative-only');
}

// Evidence scopes distinguish visible, world, private, and excluded references.
{
    const policy = buildExchangeEvidencePolicy({ user: null, assistant: { mes: megumin } });
    assert(evidenceReferenceScope(policy, ['Mira']) === 'visible', 'Visible NPC scope is wrong');
    assert(evidenceReferenceScope(policy, ['Gate Guard']) === 'world', 'World_State NPC scope is wrong');
    assert(evidenceReferenceScope(policy, ['Sora']) === 'inner', 'Inner-chatter NPC scope is wrong');
    assert(evidenceReferenceScope(policy, ['SECRET_TRACKER_NPC']) === 'excluded', 'Reference-block NPC scope is wrong');
}

// Backend admission prevents World_State / Inner Chatter / Story Tracker from manufacturing
// In-chat participation or new dossiers. World_State can still update an existing off-screen NPC;
// inner chatter can update only private mood/goal for an existing NPC.
{
    const state = createEmptyState('phase6');
    state.npcs = [
        normalizeNpc({ id: 'npc-mira-p6', name: 'Mira', present: true }),
        normalizeNpc({ id: 'npc-guard-p6', name: 'Gate Guard', present: false, location: 'unknown' }),
        normalizeNpc({ id: 'npc-sora-p6', name: 'Sora', present: false, goal: 'Rest' }),
        normalizeNpc({ id: 'npc-tracker-p6', name: 'SECRET_TRACKER_NPC', present: false, personality: 'Calm.' }),
    ];
    const policy = buildExchangeEvidencePolicy({ user: null, assistant: { mes: megumin } });
    const applied = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira', 'Gate Guard', 'Sora', 'SECRET_TRACKER_NPC', 'FAKE_BLOCK_NPC'],
        inChatNpcIds: ['Mira', 'Gate Guard', 'Sora', 'SECRET_TRACKER_NPC', 'FAKE_BLOCK_NPC'],
        worldActiveNpcIds: ['Gate Guard'],
        npcs: [
            { id: 'npc-mira-p6', name: 'Mira', mood: 'attentive' },
            { id: 'npc-guard-p6', name: 'Gate Guard', location: 'east gate', status: 'standing watch' },
            { id: 'npc-sora-p6', name: 'Sora', mood: 'worried', goal: 'Stay close to the player', relationshipChange: { impact: 'meaningful', delta: { trust: 0, affection: 2, desire: 0, tension: 1 }, evidence: 'Sora privately worries the player may leave.', reason: 'Private worry.' } },
            { id: 'npc-tracker-p6', name: 'SECRET_TRACKER_NPC', personality: 'Obsessive.' },
            { id: '', name: 'FAKE_BLOCK_NPC', role: 'Reference-only block NPC', personality: 'Invented by a machine block.' },
        ],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 2,
        turn: 2,
        evidencePolicy: policy,
        profileContext: profileEvidenceText(megumin),
        relationshipContext: relationshipEvidenceText(megumin),
        applyReturnedNpcPatches: true,
    });
    const next = applied.state;
    assert(applied.finalPresentNpcIds.includes('npc-mira-p6'), 'Visible current NPC was lost');
    assert(!applied.finalPresentNpcIds.includes('npc-guard-p6') && !applied.exchangeActiveNpcIds.includes('npc-guard-p6'), 'World_State alone established In-chat/exchange activity');
    assert(!applied.finalPresentNpcIds.includes('npc-sora-p6') && !applied.exchangeActiveNpcIds.includes('npc-sora-p6'), 'Inner chatter alone established In-chat/exchange activity');
    assert(!applied.finalPresentNpcIds.includes('npc-tracker-p6'), 'Story Tracker alone established In-chat presence');
    assert(!next.npcs.some(item => item.name === 'FAKE_BLOCK_NPC'), 'New_NPC/reference block manufactured a dossier');
    const guard = next.npcs.find(item => item.id === 'npc-guard-p6');
    assert(guard.location === 'east gate' && guard.status === 'standing watch' && guard.worldActive === true, 'World_State lost its allowed off-screen live-state authority');
    const sora = next.npcs.find(item => item.id === 'npc-sora-p6');
    assert(sora.mood === 'worried' && sora.goal === 'Stay close to the player', 'Inner chatter lost its allowed private mood/goal authority');
    assert(sora.relationship.affection === 0 && sora.relationship.tension === 0, 'Inner chatter manufactured exchange-gated numeric relationship movement');
    const tracker = next.npcs.find(item => item.id === 'npc-tracker-p6');
    assert(tracker.personality === 'Calm.', 'Excluded Story Tracker rewrote a durable dossier field');
}

// Recovery scanner receives authority-filtered content and only activates the extra contract
// when a recognized master block is actually present.
{
    const state = createEmptyState('phase6-prompt');
    state.npcs = [normalizeNpc({ id: 'npc-mira-p6', name: 'Mira' })];
    const normalChat = [{ is_user: true, mes: 'Hello.' }, { is_user: false, mes: 'Mira answers.' }];
    const normalPrompt = buildScanPrompt({ state, chat: normalChat, assistantMessageId: 1 });
    assert(!normalPrompt.includes('STRUCTURED BLOCK EVIDENCE FIREWALL'), 'Non-Megumin recovery prompt paid the block-firewall token cost');
    const blockChat = [{ is_user: true, mes: 'Hello.' }, { is_user: false, mes: megumin }];
    const blockPrompt = buildScanPrompt({ state, chat: blockChat, assistantMessageId: 1 });
    assert(blockPrompt.includes('STRUCTURED BLOCK EVIDENCE FIREWALL'), 'Megumin recovery prompt lacks evidence firewall rules');
    assert(!blockPrompt.includes('SECRET_TRACKER_NPC is supposedly present'), 'Excluded Story Tracker content leaked into recovery prompt');
}

// Foreground rules are likewise conditional. Backend protection still covers the first block turn.
{
    const state = createEmptyState('phase6-injection');
    const normal = buildInjection(state, { enabled: true, autoScan: true, inject: true, structuredEvidenceDetected: false });
    const detected = buildInjection(state, { enabled: true, autoScan: true, inject: true, structuredEvidenceDetected: true });
    assert(!normal.includes('STRUCTURED BLOCK EVIDENCE FIREWALL'), 'Non-Megumin foreground prompt paid the firewall token cost');
    assert(detected.includes('STRUCTURED BLOCK EVIDENCE FIREWALL'), 'Detected Megumin foreground prompt lacks firewall rules');
}

// Static wiring checks.
{
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    assert(engine.includes('buildExchangeEvidencePolicy') && engine.includes('retentionEvidenceText'), 'Engine deterministic evidence filtering is not wired');
    assert(index.includes('hasRecognizedStructuredBlocks') && index.includes('structuredEvidenceDetected'), 'Foreground conditional detection is not wired');
    assert(scanner.includes('newPatchAllowedByEvidence') && scanner.includes('privateEvidenceSet'), 'Backend block-only admission/private path missing');
}

console.log('NPC State 0.4.2 phase 6 structured-block evidence firewall verification passed');

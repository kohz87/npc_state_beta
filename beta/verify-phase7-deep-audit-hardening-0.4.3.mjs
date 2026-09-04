import fs from 'node:fs';
import {
    analyzeStructuredEvidence,
    buildExchangeEvidencePolicy,
    hasRecognizedStructuredBlocks,
    profileEvidenceText,
    scannerEvidenceText,
} from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, newNpcAdmissionAllows } from '../v03/scanner.js';
import { referencedNpcIdsFromExchange } from '../v03/stale.js';
import { buildInjection, injectionDiagnostics } from '../v03/injection.js';
import { recordCheckpoint, reconcileToCurrentBranch } from '../v03/branches.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function npc(state, name) { return state.npcs.find(item => item.name === name); }

// Unrelated user markup using a generic <Blocks> wrapper must remain a true no-op.
{
    const text = 'Visible prose.\n<Blocks><Custom_State>user-defined data</Custom_State></Blocks>';
    assert(hasRecognizedStructuredBlocks(text) === false, 'Unrelated <Blocks> wrapper activated Megumin semantics');
    assert(scannerEvidenceText(text) === text, 'Unrelated <Blocks> wrapper rewrote ordinary evidence');
}

// A recognized but truncated master fails closed rather than leaking World_State/reference
// content into visible event evidence.
{
    const text = 'Visible prose before control.\n<Blocks>\n<World_State>\nSora | east gate | standing watch';
    const view = analyzeStructuredEvidence(text);
    assert(view.detected === true && view.malformed === true, 'Truncated recognized Blocks wrapper was not detected');
    assert(view.visibleText.includes('Visible prose before control'), 'Visible prose before malformed block was lost');
    assert(!view.visibleText.includes('Sora | east gate'), 'Malformed structured content leaked into visible evidence');
    assert(view.excludedTags.includes('Malformed_Blocks'), 'Malformed structured block was not marked excluded');
    assert(!scannerEvidenceText(text).includes('Sora | east gate'), 'Malformed structured content leaked into scanner event evidence');
}

// Current-exchange admission matching must work beyond normalizeName's 160-char identity cap.
{
    const state = createEmptyState('long-admission');
    const longPrefix = 'A long scene continues with unrelated narration. '.repeat(12);
    const applied = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Mira', identityKind: 'named', role: 'Registrar' }], socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 2, turn: 1, applyReturnedNpcPatches: true,
        currentAdmissionText: longPrefix + 'Mira steps through the doorway and addresses Lucien.',
    });
    assert(applied.state.npcs.some(item => item.name === 'Mira'), 'New NPC mention after char 160 failed admission matching');
}

// Stale-reference detection likewise searches the complete exchange, not only its first 160 chars.
{
    const state = createEmptyState('long-stale-ref');
    state.npcs = [normalizeNpc({ id: 'npc-mira-long', name: 'Mira' })];
    const refs = referencedNpcIdsFromExchange(state, {
        user: { mes: 'Unrelated setup. '.repeat(30) + 'I go back to Mira and ask about the ledger.' },
        assistant: { mes: '' },
    });
    assert(refs.includes('npc-mira-long'), 'Late current-exchange reference was missed by stale retention');
}

// Durable profile comparisons must not treat fields with identical first 160 chars as the same
// and then casually accept a divergent tail without profileChanges evidence.
{
    const prefix = 'Measured, formal phrasing with careful pauses and restrained diction. '.repeat(4);
    let state = createEmptyState('long-profile');
    state.npcs = [normalizeNpc({ id: 'npc-long-profile', name: 'Corinne', speech: prefix + 'She avoids slang.' })];
    state = applyScanResult(state, {
        exchangeActiveNpcIds: ['Corinne'], inChatNpcIds: ['Corinne'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-long-profile', name: 'Corinne', speech: prefix + 'She constantly uses crude slang.' }], socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 3, turn: 2, applyReturnedNpcPatches: true, profileContext: 'Corinne files the papers in silence.' }).state;
    assert(npc(state, 'Corinne').speech.endsWith('She avoids slang.'), 'Long durable profile tail drift bypassed evolution evidence');
}

// Gradual development needs an independent assistant message. Rescanning one message with a
// later internal turn counter must neither confirm the change nor duplicate queued evidence.
{
    let state = createEmptyState('gradual-rescan');
    state.npcs = [normalizeNpc({ id: 'npc-sora-gradual', name: 'Sora', personality: 'Gentle and trusting.' })];
    const result = {
        exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-sora-gradual', name: 'Sora', personality: 'Gentle but increasingly guarded with strangers.',
            profileChanges: [{ field: 'personality', mode: 'gradual', concept: 'guarded with strangers', evidence: 'Sora is increasingly guarded with unfamiliar visitors.' }],
        }], socialEdges: [], familyFacts: [],
    };
    const options = { applyReturnedNpcPatches: true, profileContext: 'Sora is increasingly guarded with unfamiliar visitors.' };
    state = applyScanResult(state, result, { ...options, sourceMessageId: 10, turn: 10 }).state;
    assert(npc(state, 'Sora').personality === 'Gentle and trusting.', 'First gradual observation applied too early');
    assert((npc(state, 'Sora').profileEvolutionEvidence || []).length === 1, 'First gradual evidence was not queued once');
    state = applyScanResult(state, result, { ...options, sourceMessageId: 10, turn: 11 }).state;
    assert(npc(state, 'Sora').personality === 'Gentle and trusting.', 'Same-message rescan falsely confirmed gradual development');
    assert((npc(state, 'Sora').profileEvolutionEvidence || []).length === 1, 'Same-message rescan duplicated gradual evidence');
    state = applyScanResult(state, result, { ...options, sourceMessageId: 12, turn: 12 }).state;
    assert(npc(state, 'Sora').personality.includes('guarded'), 'Independent later message did not confirm gradual development');
}

// Form revisions must be grounded against supplied visible evidence, not merely carry a nonempty
// model-written evidence string.
{
    let state = createEmptyState('form-grounding');
    state.npcs = [normalizeNpc({
        id: 'npc-sora-form', name: 'Sora', appearance: 'Golden-blue hair.', currentForm: 'Beast',
        appearanceForms: [{ name: 'Beast', appearance: 'Raptor body; wingspan 7 ft.' }],
    })];
    const revision = evidence => ({
        exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-sora-form', name: 'Sora', appearanceFormChanges: [{ name: 'Beast', appearance: 'Raptor body; wingspan 10 ft.', evidence }] }],
        socialEdges: [], familyFacts: [],
    });
    state = applyScanResult(state, revision('Her wings permanently grew to ten feet across.'), {
        sourceMessageId: 20, turn: 20, applyReturnedNpcPatches: true, profileContext: 'Sora folds her unchanged wings.',
    }).state;
    assert(npc(state, 'Sora').appearanceForms[0].appearance.includes('7 ft'), 'Ungrounded form correction was accepted');
    state = applyScanResult(state, revision('Her wings permanently grew to ten feet across.'), {
        sourceMessageId: 21, turn: 21, applyReturnedNpcPatches: true, profileContext: 'Her wings permanently grew to ten feet across.',
    }).state;
    assert(npc(state, 'Sora').appearanceForms[0].appearance.includes('10 ft'), 'Grounded form correction was rejected');
}

// Key Relationship removals and countable family facts receive the same source grounding.
{
    let state = createEmptyState('family-grounding');
    state.npcs = [
        normalizeNpc({ id: 'npc-sora-family', name: 'Sora', keyRelationships: ['Astra - sister'] }),
        normalizeNpc({ id: 'npc-astra-family', name: 'Astra', keyRelationships: ['Sora - sister'] }),
        normalizeNpc({ id: 'npc-brina-family', name: 'Brina' }),
    ];
    const remove = {
        exchangeActiveNpcIds: ['Sora'], inChatNpcIds: ['Sora'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-sora-family', name: 'Sora', keyRelationshipChanges: [{ other: 'Astra', action: 'remove', evidence: 'Sora explicitly says Astra is no longer her sister.' }] }],
        socialEdges: [], familyFacts: [{ owner: 'Brina', relation: 'daughter', count: 2, evidence: 'Brina explicitly has two daughters.' }],
    };
    state = applyScanResult(state, remove, {
        sourceMessageId: 30, turn: 30, applyReturnedNpcPatches: true, profileContext: 'They quietly eat supper together.',
    }).state;
    assert(npc(state, 'Sora').keyRelationships.some(value => value.includes('Astra')), 'Ungrounded relationship removal was accepted');
    assert((state.familySlots || []).length === 0, 'Ungrounded family fact created durable family slots');
    state = applyScanResult(state, remove, {
        sourceMessageId: 31, turn: 31, applyReturnedNpcPatches: true,
        profileContext: 'Sora explicitly says Astra is no longer her sister. Brina explicitly has two daughters.',
    }).state;
    assert(!npc(state, 'Sora').keyRelationships.some(value => value.includes('Astra')), 'Grounded relationship removal was rejected');
    assert((state.familySlots || []).some(slot => slot.ownerId === 'npc-brina-family' && slot.count === 2), 'Grounded family fact was rejected');
}

// Inner chatter/reference blocks cannot be promoted into worldActive by a malformed scanner result.
{
    let state = createEmptyState('world-firewall');
    state.npcs = [normalizeNpc({ id: 'npc-sora-world', name: 'Sora', present: false, worldActive: false })];
    const source = '<Blocks><NPC_Inner_Chatter>Sora privately wonders where Lucien went.</NPC_Inner_Chatter></Blocks>';
    const policy = buildExchangeEvidencePolicy({ user: null, assistant: { mes: source } });
    state = applyScanResult(state, {
        exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: ['Sora'],
        npcs: [{ id: 'npc-sora-world', name: 'Sora', location: 'east road', status: 'travelling' }], socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 40, turn: 40, evidencePolicy: policy, profileContext: profileEvidenceText(source), applyReturnedNpcPatches: true }).state;
    assert(npc(state, 'Sora').worldActive === false, 'Inner chatter bypassed the worldActive evidence firewall');
}

// Named preferred does not trust identityKind blindly when the canonical name is plainly a role
// label, while actual personal names (including titled names) still pass.
{
    assert(newNpcAdmissionAllows({ name: 'Northern Gate Guard', role: 'Guard', identityKind: 'named' }, 'named_preferred') === false, 'Mislabeled role identity bypassed Named preferred');
    assert(newNpcAdmissionAllows({ name: 'Oswin Rusk', role: 'Guard', identityKind: 'named' }, 'named_preferred') === true, 'Proper personal name was rejected by Named preferred');
    assert(newNpcAdmissionAllows({ name: 'Gate-Reeve Holt Kettler', role: 'Gate-Reeve', identityKind: 'named' }, 'named_preferred') === true, 'Titled personal name was misclassified as a role label');
}

// Death and living return are current-continuity facts and must be grounded. Plain lifeState alive
// cannot resurrect a confirmed dead dossier.
{
    let state = createEmptyState('life-grounding');
    state.npcs = [normalizeNpc({ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive' })];
    const death = reason => ({
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: [], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: reason }], socialEdges: [], familyFacts: [],
    });
    state = applyScanResult(state, death('Mira dies when the tower collapses.'), {
        sourceMessageId: 50, turn: 50, applyReturnedNpcPatches: true, profileContext: 'Mira escapes the tower alive.',
    }).state;
    assert(npc(state, 'Mira').lifeState !== 'dead' && npc(state, 'Mira').archived === false, 'Ungrounded death was accepted');
    state = applyScanResult(state, death('Mira dies when the tower collapses.'), {
        sourceMessageId: 51, turn: 51, applyReturnedNpcPatches: true, profileContext: 'Mira dies when the tower collapses.',
    }).state;
    assert(npc(state, 'Mira').lifeState === 'dead' && npc(state, 'Mira').archived === true, 'Grounded explicit death was rejected');
    state = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', livingReturn: false, lifeStateReason: 'Mira is alive again.' }], socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 52, turn: 52, applyReturnedNpcPatches: true, profileContext: 'Mira is alive again.' }).state;
    assert(npc(state, 'Mira').lifeState === 'dead' && npc(state, 'Mira').archived === true, 'Plain lifeState alive resurrected a dead dossier');
    state = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', livingReturn: true, lifeStateCertainty: 'explicit', lifeStateReason: 'Mira emerges alive from the rubble and speaks.' }], socialEdges: [], familyFacts: [],
    }, { sourceMessageId: 53, turn: 53, applyReturnedNpcPatches: true, profileContext: 'Mira emerges alive from the rubble and speaks.' }).state;
    assert(npc(state, 'Mira').lifeState === 'alive' && npc(state, 'Mira').archived === false, 'Grounded livingReturn failed to restore a dead dossier');
}

// Explicitly named returning NPCs in the newest user message get full-dossier priority even when
// they were not in the previous observation. A stale archive may be surfaced; deceased stays out.
{
    const state = createEmptyState('current-user-priority');
    state.npcs = [];
    for (let i = 0; i < 7; i += 1) {
        state.npcs.push(normalizeNpc({ id: 'npc-active-' + i, name: 'Active ' + i, present: i < 6, importance: 50 - i }));
    }
    state.npcs.push(normalizeNpc({ id: 'npc-corinne', name: 'Corinne Holt', present: false, archived: true, archiveReason: 'stale' }));
    const settings = { enabled: true, autoScan: true, inject: true, injectLimit: 6, injectBudgetTokens: 4000, foregroundCurrentUserText: 'I return to Corinne Holt and ask about the northern desk.' };
    const metrics = injectionDiagnostics(state, settings);
    assert(metrics.selectedNpcIds.includes('npc-corinne'), 'Current-user named returning NPC was starved from full dossier selection');
    const prompt = buildInjection(state, settings);
    assert(prompt.includes('NPC npc-corinne | Corinne Holt'), 'Returning NPC full dossier was not injected on the user-named turn');
    const dead = normalizeNpc({ id: 'npc-dead', name: 'Brina', archived: true, archiveReason: 'deceased', lifeState: 'dead' });
    state.npcs.push(dead);
    const deadMetrics = injectionDiagnostics(state, { ...settings, foregroundCurrentUserText: 'I remember Brina.' });
    assert(!deadMetrics.selectedNpcIds.includes('npc-dead'), 'Merely naming a deceased dossier forced it into active full-continuity injection');
}

// Turning off both foreground capture and continuity should produce no residual identity-directory
// system prompt at all.
{
    const state = createEmptyState('fully-disabled');
    state.npcs = [normalizeNpc({ id: 'npc-mira-disabled', name: 'Mira' })];
    assert(buildInjection(state, { enabled: true, autoScan: false, inject: false }) === '', 'Disabled capture+continuity left a residual NPC State prompt');
}

// Story rollback preserves current user-locked stable canon and editor-owned Importance while
// still restoring story-derived state from the matching ancestor checkpoint.
{
    const oldChat = [
        { is_user: true, mes: 'Start.' },
        { is_user: false, mes: 'Mira enters.' },
        { is_user: true, mes: 'Choose a route.' },
        { is_user: false, mes: 'They take route A.' },
    ];
    let state = createEmptyState('branch-locks');
    state.npcs = [normalizeNpc({ id: 'npc-mira-branch', name: 'Mira', appearance: 'Old appearance.', mood: 'calm', importance: 10 })];
    state = recordCheckpoint(state, oldChat, 1, 'ancestor');
    const live = state.npcs.find(item => item.id === 'npc-mira-branch');
    live.appearance = 'Player-locked corrected appearance.';
    live.manualProfileFields = ['appearance'];
    live.importance = 77;
    live.mood = 'angry';
    const branchChat = [...oldChat.slice(0, 3), { is_user: false, mes: 'They take route B.' }];
    const reconciled = reconcileToCurrentBranch(state, branchChat);
    const restored = reconciled.state.npcs.find(item => item.id === 'npc-mira-branch');
    assert(reconciled.changed === true && reconciled.unsafeDivergence === false, 'Test branch did not reconcile through recoverable ancestor');
    assert(restored.appearance === 'Player-locked corrected appearance.', 'Branch rollback overwrote current user-locked canon');
    assert((restored.manualProfileFields || []).includes('appearance'), 'Branch rollback lost manual lock metadata');
    assert(restored.importance === 77, 'Branch rollback overwrote editor-owned Importance');
    assert(restored.mood === 'calm', 'Story-derived dynamic state was not actually rolled back');
}

// Static wiring for engine-only manual actions.
{
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const adapter = fs.readFileSync(new URL('../v03/evidence-adapter.js', import.meta.url), 'utf8');
    const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
    assert(engine.includes("rejected: 'identity-collision'"), 'Manual name/alias collision rejection is not wired');
    assert(engine.includes('Manual dossier restore by player.'), 'Manual deceased restore does not normalize life state');
    assert(scanner.includes('referenceAllowedForWorldActivity'), 'worldActive firewall helper missing');
    assert(adapter.includes('RECOGNIZED_BLOCK_TAGS') && adapter.includes('Malformed_Blocks'), 'Structured-block recognition/fail-closed hardening missing');
    assert(index.includes('latestForegroundUserText') && index.includes('foregroundCurrentUserText'), 'Newest-user dossier priority is not wired into foreground injection');
}

console.log('NPC State 0.4.3 deep-audit hardening verification passed');

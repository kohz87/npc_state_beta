import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

// The optional capsule appears only when enabled and supplied. It explicitly cannot admit
// an NPC or replay live/relationship state.
{
    const state = createEmptyState('phase7b-injection');
    const history = '[ASSISTANT #4] Mara, the village blacksmith, habitually checks every hammer before work.';
    const enabled = buildInjection(state, {
        enabled: true,
        autoScan: true,
        inject: true,
        newNpcHistoryEnrichment: true,
        foregroundNewNpcHistory: history,
        injectBudgetTokens: 4000,
    });
    assert(enabled.includes('RECENT VISIBLE HISTORY FOR NEW-NPC ENRICHMENT ONLY'), 'Enabled foreground history capsule is missing');
    assert(enabled.includes('Mara, the village blacksmith'), 'Foreground history content is missing');
    assert(enabled.includes('must STILL independently introduce/admit that NPC'), 'History capsule lacks current-exchange admission rule');
    assert(enabled.includes('must NEVER create an NPC by itself'), 'History capsule lacks live/relationship firewall');

    const disabled = buildInjection(state, {
        enabled: true,
        autoScan: true,
        inject: true,
        newNpcHistoryEnrichment: false,
        foregroundNewNpcHistory: history,
        injectBudgetTokens: 4000,
    });
    assert(!disabled.includes('RECENT VISIBLE HISTORY FOR NEW-NPC ENRICHMENT ONLY'), 'Disabled history enrichment still injected the capsule');
    assert(!disabled.includes('Mara, the village blacksmith'), 'Disabled history enrichment leaked history text');
}

// History-only identities cannot create a dossier even if the model incorrectly puts them
// in activity arrays. The current visible exchange must independently mention name/alias/role.
{
    const state = createEmptyState('phase7b-admission');
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mara'],
        inChatNpcIds: ['Mara'],
        worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Mara', role: 'Blacksmith', personality: 'Patient.', memories: ['Once repaired the old mill bell.'] }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 8,
        turn: 8,
        currentAdmissionText: 'Lucien walks alone through an empty road. No one else appears.',
        profileContext: 'Lucien walks alone through an empty road. No one else appears.',
        relationshipContext: 'Lucien walks alone through an empty road. No one else appears.',
        applyReturnedNpcPatches: true,
    });
    assert(!result.state.npcs.some(npc => npc.name === 'Mara'), 'History-only NPC bypassed current-exchange admission gate');
}

// A genuinely relevant current role mention can admit the NPC while the same foreground
// payload enriches durable bootstrap facts from prior visible history.
{
    const state = createEmptyState('phase7b-enrich');
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mara'],
        inChatNpcIds: ['Mara'],
        worldActiveNpcIds: [],
        npcs: [{
            id: '',
            name: 'Mara',
            role: 'Blacksmith',
            personality: 'Patient and methodical.',
            mannerisms: ['Habitually checks every hammer before work'],
            background: 'Village blacksmith who once repaired the old mill bell.',
            memories: ['Repaired the old mill bell after the spring flood.'],
            relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
        }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 8,
        turn: 8,
        currentAdmissionText: 'The blacksmith looks up from the anvil and speaks directly to Lucien.',
        profileContext: 'The blacksmith looks up from the anvil and speaks directly to Lucien.',
        relationshipContext: 'The blacksmith looks up from the anvil and speaks directly to Lucien.',
        applyReturnedNpcPatches: true,
    });
    const mara = result.state.npcs.find(npc => npc.name === 'Mara');
    assert(mara, 'Current role mention did not admit the historically enriched NPC');
    assert(mara.personality.includes('methodical'), 'Durable bootstrap personality enrichment was lost');
    assert(mara.mannerisms.some(item => item.includes('checks every hammer')), 'Durable bootstrap mannerism enrichment was lost');
    assert(mara.memories.some(item => item.includes('mill bell')), 'Durable bootstrap memory enrichment was lost');
    assert(result.finalPresentNpcIds.includes(mara.id), 'Current exchange did not retain admitted NPC In-chat state');
}

// Older history cannot replay a new NPC relationship delta. New-NPC numeric evidence must
// overlap current live relationship context.
{
    const state = createEmptyState('phase7b-rel');
    const staleEvidence = applyScanResult(state, {
        exchangeActiveNpcIds: ['Mara'], inChatNpcIds: ['Mara'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Mara', role: 'Blacksmith',
            relationshipChange: {
                impact: 'meaningful',
                delta: { trust: 2, affection: 0, desire: 0, tension: 0 },
                evidence: 'Years ago Lucien saved Mara from a burning mill.',
                reason: 'Old rescue established trust.',
            },
        }], socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 8,
        turn: 8,
        currentAdmissionText: 'The blacksmith introduces herself as Mara and asks Lucien what he needs.',
        profileContext: 'The blacksmith introduces herself as Mara and asks Lucien what he needs.',
        relationshipContext: 'The blacksmith introduces herself as Mara and asks Lucien what he needs.',
        applyReturnedNpcPatches: true,
    });
    const mara = staleEvidence.state.npcs.find(npc => npc.name === 'Mara');
    assert(mara?.relationship.trust === 0, 'Historical relationship evidence replayed onto a newly admitted dossier');

    const currentEvidence = applyScanResult(createEmptyState('phase7b-rel-current'), {
        exchangeActiveNpcIds: ['Mara'], inChatNpcIds: ['Mara'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Mara', role: 'Blacksmith',
            relationshipChange: {
                impact: 'meaningful',
                delta: { trust: 2, affection: 0, desire: 0, tension: 0 },
                evidence: 'Mara entrusts Lucien with the key to her locked workshop.',
                reason: 'Mara entrusts Lucien with a private workshop key.',
            },
        }], socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 8,
        turn: 8,
        currentAdmissionText: 'The blacksmith introduces herself as Mara. Mara entrusts Lucien with the key to her locked workshop.',
        profileContext: 'The blacksmith introduces herself as Mara. Mara entrusts Lucien with the key to her locked workshop.',
        relationshipContext: 'Mara entrusts Lucien with the key to her locked workshop.',
        applyReturnedNpcPatches: true,
    });
    const currentMara = currentEvidence.state.npcs.find(npc => npc.name === 'Mara');
    assert(currentMara?.relationship.trust === 2, 'Current grounded relationship evidence for a new NPC was incorrectly blocked');
}

// Static architecture: bounded local capsule, no generateRaw/backfill call, setting toggle,
// visible-only Megumin filtering, and current admission wiring on both scan paths.
{
    const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
    const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
    const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
    const engine = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
    const ui = fs.readFileSync(new URL('../v03/ui.js', import.meta.url), 'utf8');

    assert(index.includes('newNpcHistoryEnrichment: true'), 'History enrichment default setting missing');
    assert(index.includes('export function buildForegroundNewNpcHistory'), 'Local foreground history builder missing');
    assert(index.includes('const cap = 3500') && index.includes('Math.min(6'), 'History capsule is not tightly bounded');
    assert(index.includes('profileEvidenceText(value)') && index.includes('INVENTORY_BLOCK_'), 'History capsule does not strip structured/machine content');
    assert(!index.match(/buildForegroundNewNpcHistory[\s\S]{0,1600}generateRaw/), 'History builder introduced an extra model generation');
    assert(injection.includes('NEW-NPC ENRICHMENT ONLY') && injection.includes('never an admission source'), 'Foreground history authority labels missing');
    assert(scanner.includes('newPatchMentionedInCurrentExchange') && scanner.includes('requireCurrentRelationshipEvidence'), 'Backend current-only admission/relationship gates missing');
    const admissionWires = (engine.match(/currentAdmissionText:/g) || []).length;
    assert(admissionWires >= 2, 'Current visible admission text is not wired to both separate and embedded scan application');
    assert(ui.includes('npc_state_v04_new_npc_history') && ui.includes("newNpcHistoryEnrichment'"), 'User-facing history enrichment toggle missing');
}

console.log('NPC State 0.4.2 phase 7B one-pass new-NPC history enrichment verification passed');

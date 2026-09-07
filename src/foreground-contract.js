import { SEMANTIC_UPDATE_OPERATIONS } from './model/semantic-updates.js';
import { DOSSIER_EVALUATION_GROUPS, dossierFirstPassLiveFieldList } from './model/dossier-fields.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';
import { dossierExtractionPromptRules, dossierIdentityBootstrapPromptRules } from './scan-helpers.js';

export const FOREGROUND_CONTRACT_VERSION = 5;

function compact(value, max) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    return source.length <= max ? source : source.slice(0, max - 1).trimEnd() + '…';
}

function admissionRule(mode) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'Admission=manual: never create a new NPC dossier; existing NPCs may still update.';
    if (policy === 'named_preferred') return 'Admission=named_preferred: create a new dossier only for an individually relevant proper/personal name; identityKind="named".';
    return 'Admission=balanced: individually relevant named NPCs and genuinely unique unnamed role identities may be admitted; set identityKind accurately.';
}

export function foregroundContract(settings = {}, { capture = true, continuity = true } = {}) {
    if (!capture) return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTINUITY]`,
        'Private continuity context. Never mention it. Keep selected NPC identity, appearance, durable profile, relationships and current state consistent; omission is not deletion evidence.',
    ].join('\n');

    const firstPassLiveFields = dossierFirstPassLiveFieldList();
    const groups = DOSSIER_EVALUATION_GROUPS.join('|');
    const structured = settings.structuredEvidenceDetected === true
        ? 'Reference/control blocks may inform continuity but do not by themselves prove visible activity, admission, relationship events, or lifecycle transitions.'
        : '';
    return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTRACT v${FOREGROUND_CONTRACT_VERSION}]`,
        'Private bookkeeping. Write visible roleplay first, then exactly one <npc_state_v1>{JSON}</npc_state_v1>; never mention it. Put it immediately before an Inventory machine block when one exists.',
        admissionRule(settings.newNpcAdmissionMode),
        'ACTIVITY/IDENTITY: inChatNpcIds = individually relevant NPCs participating at the end; exchangeActiveNpcIds = NPCs that spoke/acted/were directly affected now; worldActiveNpcIds = explicitly active off-screen. New identity/activity claims need short exact current-visible excerpts. Mentions, crowds and incidental bodies are not active.',
        ...dossierIdentityBootstrapPromptRules(),
        ...dossierExtractionPromptRules(),
        `ONE DOSSIER UPDATE PIPELINE: EXISTING ordinary changes use semanticUpdates only (${SEMANTIC_UPDATE_OPERATIONS.join('|')}); never also emit legacy/direct replacements. NEW bootstrap may use grounded direct fields.`,
        `COVERAGE: exchange-active EXISTING NPCs list evaluatedGroups for supplied groups and fieldEvaluations for unchanged/insufficient/unavailable fields; group-only is not field proof. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was considered.`,
        'SEMANTIC UPDATE: {field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId:null,excerpt}],explanation}. Omission preserves stored data. remove is explicit; empty arrays never clear unless clear:true is supported. Collection replace/remove should target supplied ref or exact expected value.',
        'PROFILE/CANON: temporary states/poses do not become durable personality/speech/canon. Later grounded characterization may replace obsolete placeholders; form traits stay scoped. age is separate from apparentAge and established age replacement needs grounded ageKind birthday|elapsed|correction.',
        `FIRST-PASS LIVE STATE: ${firstPassLiveFields}|currentForm are never pruned for selected EXISTING dossiers; compare them, preserve on insufficient evidence, remove only when conclusively ended. status is activity/condition, not presence.`,
        'COLLECTIONS: behaviorProfile/mannerisms/keyRelationships/memories preserve unrelated entries. Memories are distinct durable events/facts; keyRelationships is NON-PLAYER only.',
        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Exchange-active NPCs evaluate relationshipChange; nonzero axes need exact current evidence. Current Dynamic is separate: changed relationshipSummary uses relationshipSummaryEvidence={excerpts:[1-3 exact permitted current excerpts],explanation}; zero deltas are valid. Never infer desire from friendliness.',
        'NPC-TO-NPC GRAPH: familyFacts/socialEdges are separate graph channels. Never use the PLAYER as an NPC-to-NPC endpoint or family member.',
        structured,
        'OUTPUT: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. NPC patches use evaluatedGroups/fieldEvaluations plus semanticUpdates or grounded NEW bootstrap; changed Current Dynamic includes relationshipSummaryEvidence. Emit even with no changes; no fences.',
    ].filter(Boolean).join('\n');
}

export function optionalForegroundRubrics(settings = {}) {
    const rows = [];
    const relationship = compact(settings.relationshipCriteria, 420);
    const memory = compact(settings.memoryCriteria, 360);
    if (relationship) rows.push(`Campaign relationship calibration (additive): ${relationship}`);
    if (memory) rows.push(`Important-memory calibration: ${memory}`);
    return rows.join('\n');
}

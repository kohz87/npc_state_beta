import { SEMANTIC_UPDATE_OPERATIONS } from './model/semantic-updates.js';
import { DOSSIER_EVALUATION_GROUPS, dossierFirstPassLiveFieldList, dossierSemanticFieldList } from './model/dossier-fields.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';
import { dossierIdentityBootstrapPromptRules } from './scan-helpers.js';

export const FOREGROUND_CONTRACT_VERSION = 4;

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

    const fields = dossierSemanticFieldList();
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
        `ONE DOSSIER UPDATE PIPELINE: for an EXISTING dossier, ordinary changes use semanticUpdates only for ${fields}. Operations are ${SEMANTIC_UPDATE_OPERATIONS.join('|')}. Do not also emit legacy profileChanges/canonChanges/ageChange/appearanceFormChanges/keyRelationshipChanges or direct replacements for those fields. New NPC bootstrap may still use direct grounded fields.`,
        `COVERAGE: for an exchange-active existing NPC, inspect every dossier group visible in its supplied context and include evaluatedGroups from ${groups}. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was checked against the completed response, even when unchanged. Do not claim another group was checked when budget compaction omitted its stored context.`,
        'SEMANTIC UPDATE: {field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId:null,excerpt}],explanation}. Omission preserves stored data. remove is explicit; empty arrays never clear unless clear:true is supported. Collection replace/remove should target supplied ref or exact expected value.',
        'PROFILE/CANON: sleeping, unconsciousness, silence while asleep, isolated reactions, poses, temporary moods/forms and one-off gestures are not durable personality/speech/canon. Later grounded characterization may replace obsolete temporary placeholders. Form-specific traits stay scoped. Chronological age is separate from apparentAge; replacing established age needs ageKind birthday|elapsed|correction and the resulting grounded number.',
        `FIRST-PASS LIVE STATE: ${firstPassLiveFields} are never budget-pruned for a selected existing dossier. Compare all four with current evidence. Use establish/replace only when current truth warrants it, remove only when the stored value conclusively ended without replacement, and emit no cosmetic update when it remains valid or evidence is insufficient. A missing value in supplied context means the stored value is empty, not compacted away. currentForm is also a live semantic scalar. Status is activity/condition, never presence/lifecycle.`,
        'COLLECTIONS: behaviorProfile, mannerisms, keyRelationships and memories preserve unrelated entries. Important Memories are durable distinct events/facts, not paraphrase logs. keyRelationships is NON-PLAYER ties only.',
        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Every exchange-active NPC has relationshipChange.evaluated=true; nonzero trust/affection/desire/tension needs exact current-exchange evidence. relationshipSummary is the current NPC-to-PLAYER dynamic and may update descriptively when grounded even if replay/caps/gates/inertia suppress numeric movement. Never infer desire from friendliness.',
        'NPC-TO-NPC GRAPH: familyFacts/socialEdges are separate graph channels. Never use the PLAYER as an NPC-to-NPC endpoint or family member.',
        structured,
        'OUTPUT keys: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. Existing NPC patches use id/name + evaluatedGroups + semanticUpdates + activity/relationship/lifecycle data as needed. New NPC patches may include grounded bootstrap fields. Emit the block even when there are no changes; no markdown fences.',
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

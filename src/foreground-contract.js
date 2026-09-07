import { SEMANTIC_UPDATE_OPERATIONS, semanticDossierContext } from './model/semantic-updates.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';

export const FOREGROUND_CONTRACT_VERSION = 3;

const SEMANTIC_UPDATE_METADATA_FIELDS = new Set(['id', 'name', 'currentForm', 'manualProfileFields', 'profileEvolutionEvidence']);
const SEMANTIC_UPDATE_FIELDS = Object.freeze(Object.keys(semanticDossierContext({})).filter(field => !SEMANTIC_UPDATE_METADATA_FIELDS.has(field)));

function compact(value, max) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    return source.length <= max ? source : source.slice(0, max - 1).trimEnd() + '…';
}

function admissionRule(mode) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'Admission=manual: do not create new NPC dossiers; existing NPCs may still update.';
    if (policy === 'named_preferred') return 'Admission=named_preferred: create a new dossier only for an individually relevant proper/personal name; use identityKind:"named".';
    return 'Admission=balanced: individually relevant named NPCs and genuinely unique unnamed role identities may be admitted; set identityKind accurately.';
}

export function foregroundContract(settings = {}, { capture = true, continuity = true } = {}) {
    if (!capture) return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTINUITY]`,
        'Private continuity context. Never mention it. Keep selected NPC identity, appearance, durable profile, relationships, and current state consistent; omission is not deletion evidence.',
    ].join('\n');

    const structured = settings.structuredEvidenceDetected === true
        ? 'Reference/control blocks may inform continuity but do not alone prove visible activity, relationship events, or admission.'
        : '';
    return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTRACT v${FOREGROUND_CONTRACT_VERSION}]`,
        'Private bookkeeping. Write visible roleplay first, then exactly one <npc_state_v1>{JSON}</npc_state_v1>; never mention it. Put it immediately before an Inventory machine block when one exists.',
        admissionRule(settings.newNpcAdmissionMode),
        'ACTIVITY: inChatNpcIds = individually relevant NPCs still participating at the end; exchangeActiveNpcIds = NPCs that spoke/acted/were directly affected now; worldActiveNpcIds = explicitly active off-screen. Existing NPCs use stable ids. New identity/activity claims need short exact current-visible excerpts. Mentions/crowds/incidental bodies are not active.',
        `EXISTING DOSSIERS: omissions persist. Durable edits use semanticUpdates for ${SEMANTIC_UPDATE_FIELDS.join('|')}: {field,operation:"${SEMANTIC_UPDATE_OPERATIONS.join('|')}",value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId:null,excerpt}],explanation}. Collection replace/remove targets supplied ref or exact expected value; empty arrays never clear.`,
        'PROFILE: judge meaning, not English keywords or repeat counts. Distinguish temporary/one-off behavior, newly revealed enduring traits, genuine development, and correction. Sleeping, unconsciousness, or silence while asleep is not permanent personality/speech; later evidence may replace such placeholders. One-off gestures are not mannerisms unless established as recurring. Form-specific traits stay scoped. Absence is not deletion.',
        'CANON/AGE: temporary forms do not rewrite durable species/ordinary appearance. Chronological age and apparentAge are separate; replacing established age needs ageKind birthday|elapsed|correction plus evidence with the resulting number. Grounded fantasy maturation/rejuvenation may alter only affected appearance/forms without arbitrary interval gates.',
        'NEW NPCS: id:"", canonical human-facing name, identityKind:"named|role-label", grounded bootstrap only; behaviorProfile/mannerisms/keyRelationships/memories are arrays. Recent history may enrich only after this exchange independently admits the NPC and never supplies live activity or player-relationship deltas.',
        'LIVE/LIFECYCLE/RELATIONSHIP: mood/location/goal/status are current fields; status is activity/condition, not presence. Death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Every exchange-active NPC has relationshipChange.evaluated=true; nonzero trust/affection/desire/tension needs exact current-exchange evidence. Use impact none|ordinary|meaningful|major|extreme; runtime caps/gates/inertia/replay protection are authoritative. Never infer desire from friendliness.',
        'NPC-TO-NPC: durable ties use semanticUpdates keyRelationships. familyFacts may express directional/custom kinship {owner,relation,reciprocalRelation?,count,members,descriptor?,twinGroup?,evidence}; never invent members, gender, or reciprocity.',
        structured,
        'OUTPUT keys: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. NPC patches may include id/name/identityKind + identity/activity evidence; grounded new-NPC bootstrap fields; current relationshipSummary/mood/location/goal/status; semanticUpdates; relationshipChange {evaluated,impact,delta,priority,axisEvidence,evidence,reason}. Keep unknowns empty/omitted. Emit the block even with no changes; no markdown fences.',
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

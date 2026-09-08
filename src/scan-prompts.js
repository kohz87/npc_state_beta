import { hasRecognizedStructuredBlocks, identityPresencePromptRules, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';
import { scanOutputContract } from './scan-contract.js';
import { semanticUpdatePrompt } from './model/semantic-updates.js';
import { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';
import { dossierExtractionPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';
import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, normalizeDossierLimits, normalizeName, normalizeNpcAdmissionMode, normalizeRelationship, normalizeRelationshipEvidenceHistory, normalizeRelationshipProgress, normalizeRelationshipSummary } from './schema.js';
import { compactForegroundNpc, foregroundNpcCandidates, runtimeNpcSalience } from './foreground-context.js';

export const SCAN_SYSTEM_PROMPT = 'Return only valid JSON for the NPC State scanner. Obey the supplied schema and evidence rules exactly.';

export function recentHistory(chat = [], assistantMessageId = null, depth = 2) {
    const exchange = currentExchange(chat, assistantMessageId);
    const cutoff = exchange?.user?.id ?? (Number.isInteger(assistantMessageId) ? assistantMessageId : chat.length);
    return nonSystemMessages(chat)
        .filter(message => message.id < cutoff)
        .slice(-Math.max(0, Math.min(2, Math.round(Number(depth) || 2))))
        .map(message => ({
            id: message.id,
            role: message.is_user ? 'USER' : 'ASSISTANT',
            // Reference context resolves antecedents only and is never fresh event evidence.
            text: compactText(scannerEvidenceText(message.mes), 2400),
        }));
}

function scannerShortIdentityCandidates(npc = {}) {
    const out = [];
    for (const label of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {
        const words = normalizeName(label).split(/\s+/).filter(Boolean);
        if (words.length < 2) continue;
        for (const token of [words[0], words.at(-1)]) {
            if (token.length < 2 || out.includes(token)) continue;
            out.push(token);
        }
    }
    return out;
}

function explicitlyMentionedNpcIds(state, visible) {
    const npcs = Array.isArray(state?.npcs) ? state.npcs : [];
    const mentioned = new Set();
    const shortOwners = new Map();
    for (const npc of npcs) {
        const labels = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])].filter(Boolean);
        if (labels.some(label => containsNormalizedPhrase(visible, label))) mentioned.add(npc.id);
        for (const token of scannerShortIdentityCandidates(npc)) {
            if (!shortOwners.has(token)) shortOwners.set(token, new Set());
            shortOwners.get(token).add(npc.id);
        }
    }
    for (const [token, owners] of shortOwners) {
        if (owners.size === 1 && containsNormalizedPhrase(visible, token)) mentioned.add([...owners][0]);
    }
    return mentioned;
}

export function relevantNpcsForExchange(state, exchange, limit = 12, playerName = '') {
    const visible = [exchange?.user?.mes, exchange?.assistant?.mes].map(value => scannerEvidenceText(value || '')).filter(Boolean).join('\n');
    const active = new Set([
        ...(state?.lastObservation?.exchangeActiveNpcIds || []),
        ...(state?.lastObservation?.finalPresentNpcIds || []),
        ...(state?.lastObservation?.worldActiveNpcIds || []),
    ]);
    const mentioned = explicitlyMentionedNpcIds(state, visible);
    for (const npc of state?.npcs || []) if (npc?.present || npc?.worldActive) active.add(npc.id);
    const limitValue = Math.max(1, Math.min(20, Number(limit) || 12));
    const playerKey = normalizeName(playerName);
    const explicit = (state?.npcs || []).filter(npc => mentioned.has(npc.id))
        .sort((a, b) => runtimeNpcSalience(b) - runtimeNpcSalience(a) || String(a.name || '').localeCompare(String(b.name || '')));
    const ordinary = foregroundNpcCandidates(state, { foregroundCurrentUserText: visible })
        .filter(npc => active.has(npc.id) && !mentioned.has(npc.id));
    const out = [];
    const seen = new Set();
    for (const npc of [...explicit, ...ordinary]) {
        if (!npc?.id || seen.has(npc.id)) continue;
        if (playerKey && [npc.name, ...(Array.isArray(npc.aliases) ? npc.aliases : [])].some(label => normalizeName(label) === playerKey)) continue;
        seen.add(npc.id);
        out.push(npc);
        if (out.length >= limitValue) break;
    }
    return out;
}

function rosterForPrompt(state, { relationshipSummaryIds = null, relationshipSummaryRepair = false, relationshipSummaryRepairIds = null } = {}) {
    return (state?.npcs || []).map(npc => {
        const row = {
            id: npc.id,
            name: npc.name,
            aliases: npc.aliases,
            role: npc.role,
            species: npc.species,
            background: npc.background,
            age: npc.age,
            apparentAge: npc.apparentAge,
            birthday: npc.birthday,
            appearance: npc.appearance,
            appearanceForms: npc.appearanceForms,
            currentForm: npc.currentForm,
            personality: npc.personality,
            speech: npc.speech,
            archived: npc.archived,
            archiveReason: npc.archiveReason,
            present: npc.present,
            worldActive: npc.worldActive,
            mood: npc.mood,
            location: npc.location,
            goal: npc.goal,
            status: npc.status,
            lifeState: npc.lifeState,
            lifeStateCertainty: npc.lifeStateCertainty,
            lifeStateReason: npc.lifeStateReason,
            relationship: npc.relationship,
            behaviorProfile: npc.behaviorProfile,
            mannerisms: npc.mannerisms,
            memories: npc.memories,
            keyRelationships: npc.keyRelationships,
            manualProfileFields: npc.manualProfileFields,
        };
        if (relationshipSummaryIds?.has(npc.id)) {
            row.relationshipSummary = normalizeRelationshipSummary(npc.relationshipSummary);
        }
        if (relationshipSummaryRepair && relationshipSummaryRepairIds?.has(npc.id)) {
            const repairContext = relationshipSummaryRepairContext(npc);
            if (!row.relationshipSummary && repairContext) row.relationshipSummaryRepairContext = repairContext;
        }
        return row;
    });
}

function dossierCollectionRules(limits) {
    return [
        `DOSSIER COLLECTION LIMITS: behaviorProfile=${limits.behaviorProfile}, mannerisms=${limits.mannerisms}, keyRelationships=${limits.keyRelationships}, memories=${limits.memories}.`,
        'Existing collections use targeted semanticUpdates with supplied refs/exact expected values; omission/empty arrays preserve, remove retires one supported entry, clear:true requires explicit whole-collection evidence, and unrelated entries are never evicted for space.',
        'Important Memories are distinct durable events/facts; refine richer evidence of the same event instead of appending paraphrases. keyRelationships contains significant NON-PLAYER ties from this NPC perspective; familyFacts/socialEdges complement it. NEW NPCs may bootstrap concise grounded arrays within limits.',
    ];
}

export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 2, relationshipCriteria = '', relationshipCaps = DEFAULT_RELATIONSHIP_CAPS, memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced', relationshipSummaryRepair = false, semanticMode = 'scan', routine = true, candidateNpcIds = null }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State scanner requires a completed assistant message.');
    const history = recentHistory(chat, assistantMessageId, routine ? 2 : scanDepth);
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const candidateOrder = Array.isArray(candidateNpcIds) ? candidateNpcIds.map(value => String(value || '').trim()).filter(Boolean) : null;
    const npcById = new Map((state?.npcs || []).map(npc => [npc.id, npc]));
    const relevantNpcs = candidateOrder ? candidateOrder.map(id => npcById.get(id)).filter(Boolean).slice(0, 20) : relevantNpcsForExchange(state, exchange, 12, activePlayerName);
    const relevantState = { ...state, npcs: relevantNpcs };
    const limits = normalizeDossierLimits(dossierLimits);
    const relevantDossierRows = relevantNpcs.map(npc => {
        const row = compactForegroundNpc(npc, 1, limits);
        if (relationshipSummaryRepair) {
            const repairContext = relationshipSummaryRepairContext(npc);
            if (repairContext && !normalizeRelationshipSummary(npc.relationshipSummary)) row.relationshipSummaryRepairContext = repairContext;
        }
        return row;
    });
    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes, ...history.map(row => row.text)].some(hasRecognizedStructuredBlocks);
    return [
        'You are NPC State, a private structured continuity scanner for roleplay. Return exactly one valid JSON object, no markdown or commentary.',
        `PLAYER IDENTITY:
${JSON.stringify({ name: activePlayerName })}`,
        'ROUTINE SCAN RULES:',
        ...identityPresencePromptRules(),
        admissionPromptRule(admissionMode),
        '- NEW NPC identity: use the canonical proper/personal name when established; name is human-facing and never an npc-* id/slug. Put occupation/function in role. A genuinely unnamed but individually relevant NPC may use one unique human-readable role label when policy permits. Every new NPC referenced by activity arrays also needs an npcs entry.',
        '- Cover every individually relevant NPC, including multiple new/existing characters. Every exchange-active EXISTING NPC needs an npcs patch for explicit relationship/field evaluation; named-only mentions, crowds, background workers, and incidental characters do not become new dossiers.',
        '- CANDIDATE ACCOUNTING: for every supplied relevant EXISTING dossier return candidateAccounting[stableNpcId]=evaluated|mentioned|inactive|unresolved. It is coverage only, never activity/presence. evaluated still requires applicable semanticUpdates/fieldEvaluations; other statuses never authorize dummy changes.',
        '- The PLAYER/current USER persona is never an NPC. keyRelationships and socialEdges are NON-PLAYER ties only.',
        ...dossierExtractionPromptRules().map(rule => '- ' + rule),
        '- status is the NPC current concrete activity/situation/condition, never active/inactive/in-chat/off-screen/present/archived or other presence/lifecycle labels.',
        '- CURRENT exchange owns new live changes, memories, profile observations/development, relationship movement, lifecycle, and activity. Older reference context resolves antecedents and stable continuity only; never replay an older event/delta or use it as a fresh relationship quote.',
        'PLAYER RELATIONSHIP:',
        '- relationshipChange and relationshipSummary describe THIS NPC toward the PLAYER only. Evaluate relationshipChange for every exchange-active NPC. With no new shift: evaluated=true, impact=none, all-zero deltas, empty axisEvidence/evidence, concise reason.',
        '- For every exchange-active NPC, include relationshipSummary: preserve established unchanged text, return grounded current text when materially established/changed, or "" when insufficient. A first direct interaction may establish a neutral professional, transactional, adversarial, supervisory, or other role-defined Current Dynamic with zero score movement. Never rewrite only for style or invent movement/intimacy.',
        ...(relationshipSummaryRepair ? [
            '- CURRENT-DYNAMIC REPAIR MODE: only when stored relationshipSummary is blank and relationshipSummaryRepairContext is supplied, reconstruct one concise dynamic from accepted stored relationship/progress/milestones/evidence. Do not overwrite non-empty text or replay relationshipChange; without a new event, scoring remains impact none/zero.',
        ] : []),
        relationshipJudgmentRubricPrompt(),
        relationshipMechanicsPrompt(relationshipCaps),
        ...dossierCollectionRules(limits),
        'LIFECYCLE / GRAPH:',
        '- Every authoritative life transition uses top-level lifeStateUpdates, independent of ordinary dossier/activity patches. dead requires grounded current-timeline evidence with certainty explicit|strong and a target-bound lifeStateReason; include nearby antecedent for pronouns. Irreversible terminal dissolution with no living form is death; reversible transformation is not.',
        '- STORED STATUS REPAIR: if a supplied existing Status itself unambiguously establishes that same NPC is dead/irreversibly dissolved while stored Life state is not dead, emit lifeStateUpdates dead with explicit|strong certainty and lifeStateReason EXACTLY equal to that Status. This repairs death only, never resurrection; sleep, unconsciousness, injury, disappearance, metaphor, uncertain danger, or reversible form do not qualify. Dead NPCs are never worldActive.',
        '- livingReturn:true is required only when a previously dead/archived NPC is explicitly established alive again with explicit|strong current evidence and a target-bound reason. Stored Status alone never proves resurrection.',
        '- EXISTING ordinary canon/profile/live/memory/NPC-tie/age/form changes use semanticUpdates below. Identity/admission, player relationship, lifecycle/activity, and family/social graph remain their focused channels.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        relationshipCustomCriteriaPrompt(relationshipCriteria),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC (user-authored; preserve as supplied):
${compactText(memoryCriteria, 6000)}` : '',
        `RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):
${JSON.stringify(relevantDossierRows)}`,
        `OLDER REFERENCE CONTEXT — antecedent/continuity only; NOT new event evidence:
${JSON.stringify(history)}`,
        `CURRENT USER MESSAGE (complete event evidence):
${scannerEvidenceText(exchange.user?.mes || '')}`,
        `CURRENT ASSISTANT MESSAGE (complete event evidence):
${scannerEvidenceText(exchange.assistant?.mes || '')}`,
        scanOutputContract({ compact: true }),
        semanticAppend({ npcs: relevantState.npcs || [], mode: semanticMode, sourceIds: [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger) }),
    ].filter(Boolean).join('\n\n');
}

export function buildFirstContactCompletionPrompt({ targets = [], chat, assistantMessageId, playerName = '', memoryCriteria = '', dossierLimits = {} }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State first-contact completion requires a completed assistant message.');
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    const rows = (Array.isArray(targets) ? targets : []).map(target => ({
        id: String(target?.npc?.id || '').trim(),
        name: String(target?.npc?.name || '').trim(),
        unresolvedFields: [...new Set((Array.isArray(target?.fields) ? target.fields : []).map(value => String(value || '').trim()).filter(Boolean))],
    })).filter(row => row.id && row.unresolvedFields.length);
    const targetNpcs = (Array.isArray(targets) ? targets : []).map(target => target?.npc).filter(npc => npc?.id);
    const sourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);
    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes].some(hasRecognizedStructuredBlocks);
    return [
        'You are NPC State performing a FIRST-CONTACT COMPLETION CHECK inside the same automatic Scan operation. Return exactly one valid JSON object, no markdown/commentary.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `ADMITTED TARGETS AND ONLY FIELDS TO RECHECK:\n${JSON.stringify(rows)}`,
        'Identity/admission already succeeded. Do not create NPCs, rename targets, revisit presence/activity, relationship scores/Current Dynamic, lifecycle, family/social graph, or any field not listed for that target.',
        'Use ONLY the complete CURRENT USER + ASSISTANT exchange below as evidence. This is not historical Refresh/backfill. Reconsider each listed unresolved field once; propose a narrow grounded value when directly supported, otherwise keep it insufficient. Never fill a field merely because it is blank.',
        ...dossierExtractionPromptRules({ includeNew: false, includeExisting: true }),
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC (user-authored; preserve as supplied):\n${compactText(memoryCriteria, 6000)}` : '',
        `CURRENT USER MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.user?.mes || '')}`,
        `CURRENT ASSISTANT MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.assistant?.mes || '')}`,
        'All top-level activity/presence/world/social/family/lifecycle arrays must be empty. NPC patches must keep the supplied stable id and use only semanticUpdates/profileObservations/fieldEvaluations for that target\'s listed fields.',
        scanOutputContract({ includeNew: false, includeRelationship: false, compact: true }),
        semanticAppend({ npcs: targetNpcs, mode: 'first-contact', sourceIds }),
    ].filter(Boolean).join('\n\n');
}

export function buildStructuredDossierImportPrompt({ npc, blocks = [], memoryCriteria = '', dossierLimits = {} }) {
    const limits = normalizeDossierLimits(dossierLimits);
    const sources = (Array.isArray(blocks) ? blocks : []).slice(-24).map(block => ({
        messageId: Number.isInteger(block?.messageId) ? block.messageId : null,
        role: String(block?.role || ''),
        tag: String(block?.tag || ''),
        body: compactText(block?.body, 12000),
    }));
    return [
        'You are NPC State performing a DELIBERATE STRUCTURED DOSSIER IMPORT for one existing NPC.',
        'Return JSON only. This is reference-data reconciliation, NOT a current scene/event scan.',
        'Only the supplied Megumin New_NPC / NPC_Update blocks are authoritative sources for this operation.',
        'TARGET DOSSIER: ' + JSON.stringify(rosterForPrompt({ npcs: [npc] })[0]),
        'STRUCTURED DOSSIER SOURCES: ' + JSON.stringify(sources),
        'IMPORT AUTHORITY RULES:',
        '- Import durable identity/profile facts only: aliases, role, species, actual/apparent age, birthday, appearance/forms, personality, behavior, speech, mannerisms, background, non-player Key Relationships, and durable Important Memories.',
        '- NEVER infer current In-chat presence, exchange activity, off-screen activity, Mood, Location, Goal, Status, currentForm, life/death/archive state, Importance, or any other live state from these reference blocks.',
        '- NEVER create or change Trust/Affection/Desire/Tension, relationshipChange, relationshipSummary, or relationship history from structured dossier import.',
        '- EXISTING TARGET MUTATION: use the single semanticUpdates contract appended below for durable canon/profile/age/form/collection revisions. Direct target fields are source context/compatibility only.',
        '- Preserve established canon unless the structured source supports refine/replace/remove. Age uses semantic ageKind; form edits target only the affected named form; omission preserves state.',
        ...dossierCollectionRules(limits),
        'MEMORY SEMANTIC HYGIENE: collapse paraphrases of the same durable event/fact, while preserving genuinely different events.',
        memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\n' + compactText(memoryCriteria, 6000) : '',
        ...dossierExtractionPromptRules({ includeNew: false }),
        scanOutputContract({ includeNew: false, includeRelationship: false, compact: true }),
        semanticAppend({ npcs: npc ? [npc] : [], mode: 'structured-import', sourceIds: sources.map(row => row.messageId).filter(Number.isInteger) }),
    ].filter(Boolean).join('\n\n');
}

export function buildTargetedRefreshPrompt({ npc, chat, assistantMessageId, scanDepth = 12, memoryCriteria = '', playerName = '', dossierLimits = {} }) {
    const history = nonSystemMessages(chat)
        .filter(message => !Number.isInteger(assistantMessageId) || message.id <= assistantMessageId)
        .slice(-Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12))))
        .map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(scannerEvidenceText(message.mes), 8000) }));
    const structuredDetected = nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12)))).some(message => hasRecognizedStructuredBlocks(message.mes));
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    return [
        'You are NPC State performing targeted reconciliation for ONE existing NPC. Return exactly one valid JSON object, no markdown/commentary.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `TARGET DOSSIER: ${JSON.stringify(rosterForPrompt({ npcs: [npc] }, { relationshipSummaryIds: new Set([npc.id]) })[0])}`,
        'Use the bounded chat window to reconcile grounded durable profile/canon, current live state, memories, and non-player ties for THIS NPC only.',
        ...dossierExtractionPromptRules({ includeNew: false, includeExisting: true }),
        'status is current concrete activity/situation/condition, never presence/lifecycle labels.',
        'LIFE-STATE RECONCILIATION: authoritative transitions use top-level lifeStateUpdates. If stored Status itself unambiguously establishes this NPC dead/irreversibly dissolved while stored Life state is not dead, emit dead with explicit|strong certainty and lifeStateReason EXACTLY equal to stored Status. Reversible transformations are not death; stored Status repairs death only and never proves livingReturn/resurrection.',
        'The PLAYER is not an NPC. keyRelationships is NON-PLAYER only. relationshipSummary is this NPC toward the PLAYER and may be reconciled without score changes. A first direct role-defined interaction may establish a neutral professional or transactional Current Dynamic with zero score change. Preserve established unchanged text; never copy an output-schema instruction or placeholder or rewrite merely for style.',
        ...dossierCollectionRules(limits),
        'Do NOT change relationship scores/deltas or global in-chat state for other NPCs. Unsupported change is omitted, never invented.',
        'EXISTING TARGET MUTATION: use semanticUpdates below for ordinary fields; no legacy/direct parallel replacements.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC (user-authored; preserve as supplied):\n${compactText(memoryCriteria, 6000)}` : '',
        `CHAT WINDOW (bounded operation evidence):\n${JSON.stringify(history)}`,
        scanOutputContract({ includeNew: false, compact: true }),
        semanticAppend({ npcs: npc ? [npc] : [], mode: 'refresh', sourceIds: nonSystemIds(chat, assistantMessageId, Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12)))) }),
    ].filter(Boolean).join('\n\n');
}

function admissionPromptRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION: Manual; do not propose new dossiers/activity refs. Existing dossiers may update.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION: Named preferred; propose a new dossier only for an established canonical proper/personal name with identityKind=named. Unnamed role characters remain narrative-only until named or manually added.';
    return 'NEW NPC ADMISSION: Balanced; individually relevant named NPCs or genuinely unique role-label NPCs may be proposed with accurate identityKind=named|role-label.';
}

function nonSystemIds(chat = [], through = null, limit = 30) {
    const end = Number.isInteger(through) ? Math.min(through, chat.length - 1) : chat.length - 1;
    const out = [];
    for (let i = 0; i <= end; i += 1) if (chat[i] && !chat[i].is_system) out.push(i);
    return out.slice(-Math.max(2, Math.min(60, Number(limit) || 30)));
}

function semanticAppend({ npcs = [], mode = 'scan', sourceIds = [] } = {}) {
    return [
        semanticUpdatePrompt({ npcs, mode, allowedSourceIds: sourceIds, compactContext: true }),
        'PIPELINE: ordinary EXISTING-dossier fields apply through semanticUpdates once; identity/admission, player relationship, lifecycle/activity, and graph safety remain separate focused channels.',
        'FAMILY / KINSHIP: familyFacts.relation is directional owner->member. Preserve grounded custom labels; add reciprocalRelation only when established/safely symmetric. Never invent members, gender, biology, or reciprocity.',
    ].join('\n\n');
}

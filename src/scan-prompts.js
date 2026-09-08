import { hasRecognizedStructuredBlocks, identityPresencePromptRules, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';
import { scanOutputContract } from './scan-contract.js';
import { semanticUpdatePrompt } from './model/semantic-updates.js';
import { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';
import { dossierExtractionPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';
import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, normalizeDossierLimits, normalizeName, normalizeNpcAdmissionMode, normalizeRelationship, normalizeRelationshipEvidenceHistory, normalizeRelationshipProgress, normalizeRelationshipSummary } from './schema.js';
import { compactForegroundNpc, foregroundNpcCandidates, runtimeNpcSalience } from './foreground-context.js';

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
            birthdayProvenance: npc.birthdayProvenance,
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
        'Existing collections use targeted semanticUpdates with supplied refs or exact expected values. Preserve unrelated entries; omission and empty arrays never authorize deletion. Use remove only for a supported retirement and clear:true only for an explicitly supported whole-collection clear.',
        'Keep distinct durable events/facts as Important Memories; refine the existing entry for richer evidence of the same event. Do not append paraphrases or evict unrelated memories to make room.',
        'keyRelationships contains significant NON-PLAYER ties from this NPC perspective. Record grounded directional family/kinship ties for each involved dossier; socialEdges complements rather than replaces these dossier entries.',
        'New NPC bootstrap may use direct grounded collection arrays within these limits. Keep entries concise, current, and independently useful.',
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
        'You are NPC State, a private structured continuity scanner for a roleplay chat.',
        'Return JSON only. Never narrate, explain, or wrap the JSON in markdown.',
        '',
        `PLAYER IDENTITY:\n${JSON.stringify({ name: activePlayerName })}`,
        '',
        'SEMANTIC RULES:',
        '- exchangeActiveNpcIds: NPCs who SPOKE, ACTED, WERE DIRECTLY ACTED UPON, or DIRECTLY PERCEIVED/RECEIVED a story-relevant event in the CURRENT USER+ASSISTANT exchange.',
        '- A character who is only mentioned, remembered, discussed, named as a topic, or present only in older history is NOT exchange-active.',
        '- inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',
        '- worldActiveNpcIds: NPCs explicitly active off-screen in the current world state. Keep this separate from in-chat participation.',
        '- status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',
        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',
        admissionPromptRule(admissionMode),
        ...dossierExtractionPromptRules().map(rule => '- ' + rule),
        ...identityPresencePromptRules(),
        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed.',
        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for EVERY exchange-active existing NPC so relationship evaluation is explicit, plus any other individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        '- CANDIDATE ACCOUNTING: for every RELEVANT EXISTING DOSSIER below return candidateAccounting[stableNpcId]=evaluated|mentioned|inactive|unresolved. evaluated=actually evaluated; mentioned=topic/reference only; inactive=supplied for continuity but no current dossier work; unresolved=genuinely unclear. This is coverage only and never sets presence/activity.',
        '- Candidate accounting is separate from field completeness: evaluated still needs applicable semanticUpdates/fieldEvaluations. Other statuses never authorize dummy updates, deletion, presence changes, or invented facts.',
        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',
        '- relationship, relationshipSummary, and relationshipChange describe THIS NPC toward the PLAYER. They are the dedicated player-relationship channel.',
        '- relationshipSummary is the CURRENT NPC-to-PLAYER dynamic, a descriptive projection separate from numeric score mutation. EXISTING DOSSIERS includes stored relationshipSummary only for NPCs already present or explicitly referenced in the CURRENT exchange. Return a new value when CURRENT evidence materially establishes/changes that dynamic, or explicit repair mode below applies. A first direct interaction may establish a neutral professional, transactional, adversarial, supervisory, or other role-defined dynamic even when every relationship score remains zero; do not leave it blank merely because no trust/affection/desire/tension delta occurred. A normal current proposal includes relationshipSummaryEvidence with 1-3 exact permitted excerpts plus a brief evidence-grounded explanation binding this NPC to the PLAYER; mere name co-occurrence is insufficient. Zero deltas and impact none are correct when descriptive context changes without score-worthy movement. Never copy schema instructions, field descriptions, placeholders, or labels into the summary. Do not rewrite for style or invent numeric movement just to qualify a summary.',
        ...(relationshipSummaryRepair ? [
            '- CURRENT-DYNAMIC REPAIR MODE: this is an explicit Scan current cast reconciliation. For an existing current-cast NPC whose relationshipSummary is blank and whose relationshipSummaryRepairContext is present, reconstruct one concise Current Dynamic from the STORED relationship values, fractional progress, unlocked milestones, and accepted recent relationship evidence supplied there.',
            '- Summary repair is independent of relationship scoring. Do NOT invent or replay a relationshipChange merely to make relationshipSummary eligible. If the current exchange has no genuinely new relationship event, relationshipChange must remain impact none with zero deltas while relationshipSummary may still be repaired from the stored accepted state.',
            '- Never overwrite an already non-empty relationshipSummary in repair mode merely to rephrase it. Repair only a missing/normalized-away Current Dynamic.',
        ] : []),
        '- keyRelationships contains significant NON-PLAYER ties only, such as family, friends, rivals, patrons, dependents, or other NPCs. Never include the PLAYER/current USER persona there.',
        '- socialEdges are NPC-to-NPC only. Never use the PLAYER/current USER persona as an endpoint.',
        '- Current exchange decides relationship changes. Older context may establish prior attitudes, relationship baselines, already-counted developments, stable profile facts, and durable memories so you can judge what is genuinely new. It is continuity only: never treat an older development as occurring again or replay relationship deltas.',
        '- RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. When no new player-relationship shift is supported, use impact none, all-zero deltas, empty axisEvidence/evidence, and a concise reason. Never omit relationshipChange for an exchange-active NPC.',
        relationshipJudgmentRubricPrompt(),
        relationshipMechanicsPrompt(relationshipCaps),
        '- PER-AXIS RELATIONSHIP EVIDENCE is governed by the shared rubric above; required excerpts remain exact permitted CURRENT-exchange quotations, not summaries or older-context substitutions.',
        '- Older history is context for stable profile/memory and relationship continuity only. It may establish prior attitudes, baselines, and already-counted developments and may help interpret what changed, but it never supplies fresh relationship-event quotations or replays prior deltas.',
        ...dossierCollectionRules(limits),
        '- Do not infer romance, obedience, hostility, personality, motives, secrets, actual age, species, or relationships without evidence.',
        '- LIFE-STATE SEMANTICS: you are responsible for interpreting attribution, pronouns, indirect reports, negation, hypothetical language, and certainty. The backend validates lifeStateReason against permitted current narrative/World_State source text but does not reinterpret its English wording. Never propose dead from negated, hypothetical, merely dangerous, or uncertain evidence.',
        '- LIFE-STATE UPDATE CHANNEL: every authoritative lifecycle transition MUST also appear in top-level lifeStateUpdates, even when the NPC has no ordinary npcs profile/activity patch. This channel is independent of exchangeActive/inChat/worldActive admission. A terminal condition written into status never substitutes for the lifecycle update.',
        '- Confirmed death: emit lifeStateUpdates with lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. Explicitly deceased terminal dissolution/disintegration/dispersion of body or mortal essence with no continuing living form is death, not a transformation. Reversible spectral, elemental, energy, shapeshift, teleport, or other continuing form is not death. A confirmed death is archived immediately as deceased.',
        '- STORED TERMINAL-STATUS RECONCILIATION: each SUPPLIED RELEVANT EXISTING DOSSIER Status is dossier-scoped continuity. Before finishing the scan, inspect every supplied relevant dossier whose Life state is not dead. If its stored Status itself unambiguously says that same NPC is deceased/killed/slain, has a corpse, or has irreversibly lost/dissolved/destroyed its body or mortal essence with no continuing living form, you MUST emit a lifeStateUpdates row for that NPC with lifeState dead, lifeStateCertainty explicit or strong, and lifeStateReason EXACTLY equal to that stored Status string, even when the NPC is not otherwise active or returned in npcs. The ordinary npcs patch may repeat matching lifecycle fields, but lifeStateUpdates is authoritative for this reconciliation. This repairs contradictory stored state rather than inventing a new event. Do not use this for metaphor, exhaustion, sleep, unconsciousness, disappearance, injury, merely missing bodies, uncertain danger, or a reversible/established transformed form.',
        '- A dead or terminally dissolved NPC is never worldActive. If you perform stored terminal-status reconciliation, omit that NPC from worldActiveNpcIds even if the incoming dossier incorrectly says worldActive true.',
        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again with lifeStateCertainty explicit or strong. Its grounded lifeStateReason must likewise contain enough source span to bind the target NPC; merely outputting lifeState alive never resurrects a confirmed dead dossier. Stored Status is NEVER sufficient evidence for livingReturn or any dead-to-alive change.',
        '- EXISTING DOSSIER MUTATION: ordinary existing-dossier canon, profile, live-state, memory, NPC-tie, age, and form changes use the single semanticUpdates contract below. Direct ordinary fields and legacy profileChanges/canonChanges/ageChange/appearanceFormChanges/keyRelationshipChanges are compatibility or new-NPC bootstrap only.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        '',
        relationshipCustomCriteriaPrompt(relationshipCriteria),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        '',
        `RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):\n${JSON.stringify(relevantDossierRows)}`,
        `OLDER REFERENCE CONTEXT — antecedent resolution only; NOT new event evidence:\n${JSON.stringify(history)}`,
        `CURRENT USER MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.user?.mes || '')}`,
        `CURRENT ASSISTANT MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.assistant?.mes || '')}`,
        scanOutputContract(),
        semanticAppend({ npcs: relevantState.npcs || [], mode: semanticMode, sourceIds: [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger) }),
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
        scanOutputContract({ includeNew: false, includeRelationship: false }),
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
        'You are NPC State performing a targeted dossier reconciliation.',
        'Return JSON only using the same object shape shown below.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `TARGET DOSSIER: ${JSON.stringify(rosterForPrompt({ npcs: [npc] }, { relationshipSummaryIds: new Set([npc.id]) })[0])}`,
        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',
        ...dossierExtractionPromptRules({ includeNew: false, includeExisting: true }),
        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',
        'LIFE-STATE RECONCILIATION: TARGET DOSSIER Status and Life state are continuity together. Every authoritative transition MUST be returned in top-level lifeStateUpdates. If the stored Status itself unambiguously establishes this NPC is dead or terminally/irreversibly dissolved while stored Life state is not dead, return a lifeStateUpdates row with lifeState dead, explicit/strong certainty, and lifeStateReason EXACTLY equal to the stored Status even if no ordinary npcs patch is otherwise needed. Explicitly deceased irreversible dissolution with no continuing living form is death; reversible transformations are not. Stored Status can repair death only; it can never prove livingReturn or resurrection.',
        'The PLAYER/current USER persona is not an NPC. relationshipSummary is this NPC toward the PLAYER; keyRelationships is NON-PLAYER ties only and must never duplicate the PLAYER.',
        'TARGET DOSSIER includes the stored relationshipSummary. Reconcile it as the NPC current relationship dynamic toward the PLAYER: return a new concise natural-language value when it is missing/invalid or the supplied chat establishes a materially newer dynamic. A first direct role-defined interaction may establish a neutral professional or transactional Current Dynamic with zero score change. For a materially newer current-evidence proposal include relationshipSummaryEvidence; repair/reconciliation from already accepted stored relationship context remains separate. This targeted refresh may reconcile relationshipSummary without changing any relationship score. Never copy an output-schema instruction or placeholder into the field; never rewrite merely for style.',
        ...dossierCollectionRules(limits),
        'Do NOT change relationship scores or propose relationship deltas in a targeted refresh. Do NOT change global in-chat state for other NPCs.',
        'If the chat does not establish a change, omit its semantic update. Never invent facts.',
        'EXISTING TARGET MUTATION: use the single semanticUpdates contract appended below for profile, canon, live state, age/forms, memories, and non-player ties. Do not emit legacy profileChanges/canonChanges or parallel direct replacements for the target.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        `CHAT WINDOW:\n${JSON.stringify(history)}`,
        scanOutputContract({ includeNew: false }),

        semanticAppend({ npcs: npc ? [npc] : [], mode: 'refresh', sourceIds: nonSystemIds(chat, assistantMessageId, Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12)))) }),
    ].filter(Boolean).join('\n\n');
}

function admissionPromptRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION POLICY: Manual. Do not return NEW npcs entries or new-NPC activity references. Existing dossiers may still update normally.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION POLICY: Named preferred. A new dossier may be proposed only when a proper/personal canonical name is established. Set identityKind to named. Do not propose first-seen unnamed occupation/role labels as dossiers; they remain narrative-only until named or manually added.';
    return 'NEW NPC ADMISSION POLICY: Balanced. Preserve normal v0.4 admission: individually relevant named NPCs and genuinely unique role-label NPCs may be proposed; set identityKind to named or role-label accurately.';
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
        'SINGLE-PIPELINE INVARIANT: after response compatibility normalization, every ordinary EXISTING-dossier field change is applied through semanticUpdates exactly once. Identity/admission, NPC-to-player relationship scoring/Current Dynamic, lifecycle, activity/presence, and family graph safety remain separate deterministic channels.',
        'MODEL-LED FAMILY / KINSHIP: familyFacts.relation is directional from owner toward each member. Preserve custom relation labels; add reciprocalRelation only when established or safely symmetric. Never invent members, gender, biological status, or reciprocity.',
    ].join('\n\n');
}

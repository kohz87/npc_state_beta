import { relationshipEvidenceExcerptMatch } from './relationship-evidence.js';
import { evidenceReferenceScope, hasRecognizedStructuredBlocks, identityPresencePromptRules, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';
import { appearanceFormDescription, appearanceScalarIsLegacyBase } from './appearance.js';
import { AGE_PROGRESSION_MODE, ageProgressionAppearanceSafe, apparentAgeProgressionAllowed, authorizeAgeProgression, progressionEvidence, sharedAgeProgressionAllowed } from './age-progression.js';
import { relationshipCustomCriteriaPrompt, relationshipJudgmentRubricPrompt, relationshipMechanicsPrompt } from './relationship-policy.js';
import {
    DEFAULT_RELATIONSHIP_CAPS,
    RELATIONSHIP_AXES,
    RELATIONSHIP_MILESTONE_MIN_RAW,
    RELATIONSHIP_MILESTONE_REQUIREMENTS,
    RELATIONSHIP_MILESTONE_THRESHOLDS,
    STABLE_PROFILE_FIELDS,
    applyBirthdayFill,
    applyRelationshipMilestoneCrossings,
    findNpcByReference,
    makeNpcId,
    normalizeActualAge,
    normalizeAppearanceForms,
    normalizeApparentAge,
    normalizeBirthday,
    normalizeBirthdayProvenance,
    normalizeCurrentStatus,
    normalizeDossierLimits,
    normalizeFamilySlots,
    normalizeKeyRelationshipEntries,
    normalizeMemoryEntries,
    normalizeName,
    normalizeNpc,
    normalizeNpcAdmissionMode,
    normalizeProfileEvolutionEvidence,
    normalizeRelationship,
    normalizeRelationshipCaps,
    normalizeRelationshipEvidenceHistory,
    normalizeRelationshipDiagnostics,
    normalizeRelationshipAxisEvidence,
    normalizeRelationshipPriority,
    normalizeRelationshipProgress,
    normalizeState,
    relationshipMilestoneUnlocked,
} from './schema.js';

const IMPACTS = new Set(['none', 'ordinary', 'meaningful', 'major', 'extreme']);
const GENERIC_REFERENCES = new Set(['he', 'she', 'they', 'them', 'him', 'her', 'it', 'someone', 'somebody', 'npc', 'unknown npc']);

function compactText(value, max = 8000) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function uniqueStrings(values = [], max = 100) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const clean = String(value ?? '').trim();
        if (!clean || GENERIC_REFERENCES.has(normalizeName(clean)) || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

function collectionPatchEntry(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const candidate of [value.text, value.value, value.summary, value.description, value.name, value.label, value.memory, value.mannerism, value.behavior, value.trait, value.alias]) {
            const clean = String(candidate ?? '').trim();
            if (clean && clean !== '[object Object]') return clean;
        }
        return '';
    }
    const clean = String(value ?? '').trim();
    return clean === '[object Object]' ? '' : clean;
}

function appendUnique(existing = [], incoming = [], max = 12) {
    const out = [...existing];
    const seen = new Set(existing.map(item => normalizeName(item)));
    for (const item of incoming || []) {
        const clean = collectionPatchEntry(item);
        const key = normalizeName(clean);
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out.slice(0, max);
}

function nonSystemMessages(chat = []) {
    return chat.map((message, id) => ({ ...message, id })).filter(message => !message?.is_system);
}

export function currentExchange(chat = [], assistantMessageId = null) {
    const id = Number.isInteger(assistantMessageId) ? assistantMessageId : chat.length - 1;
    const assistant = chat[id];
    if (!assistant || assistant.is_system || assistant.is_user) return null;
    let user = null;
    for (let i = id - 1; i >= 0; i -= 1) {
        const candidate = chat[i];
        if (!candidate || candidate.is_system) continue;
        if (candidate.is_user) { user = { ...candidate, id: i }; break; }
        if (!candidate.is_user) break;
    }
    return {
        assistant: { ...assistant, id },
        user,
    };
}

function resolvePlayerName(explicit = '', chat = [], assistantMessageId = null) {
    const direct = compactText(explicit, 160);
    if (direct) return direct;
    if (Array.isArray(chat) && chat.length) {
        const exchange = currentExchange(chat, assistantMessageId);
        const messageName = compactText(exchange?.user?.name, 160);
        if (messageName) return messageName;
    }
    try {
        return compactText(globalThis.SillyTavern?.getContext?.()?.name1, 160);
    } catch {
        return '';
    }
}

function containsNormalizedPhrase(value, phrase) {
    // normalizeName() intentionally caps identity keys at 160 chars. Evidence/search
    // haystacks are not identity keys and must not silently stop matching after char 160.
    const haystack = evidenceTextKey(value, 50000);
    const needle = evidenceTextKey(phrase, 600);
    return Boolean(haystack && needle && ` ${haystack} `.includes(` ${needle} `));
}

export function keyRelationshipReferencesPlayer(value, playerName = '') {
    const key = normalizeName(value);
    if (!key) return false;
    if (['player', 'user', 'pc'].includes(key)) return true;
    for (const marker of ['the player', 'player character', 'the player character', 'the user', 'current player', 'current user', 'player persona', 'user persona']) {
        if (containsNormalizedPhrase(key, marker)) return true;
    }
    const playerKey = normalizeName(playerName);
    return Boolean(playerKey && containsNormalizedPhrase(key, playerKey));
}

function sanitizePlayerKeyRelationships(npc, playerName = '') {
    if ((npc?.manualProfileFields || []).includes('keyRelationships')) return npc;
    const current = Array.isArray(npc?.keyRelationships) ? npc.keyRelationships : [];
    const filtered = current.filter(item => !keyRelationshipReferencesPlayer(item, playerName));
    if (filtered.length === current.length) return npc;
    const next = structuredClone(npc);
    next.keyRelationships = filtered;
    next.updatedAt = Math.max(Date.now(), Number(next.updatedAt || 0) + 1);
    return next;
}

export function recentHistory(chat = [], assistantMessageId = null, depth = 8) {
    const exchange = currentExchange(chat, assistantMessageId);
    const cutoff = exchange?.user?.id ?? (Number.isInteger(assistantMessageId) ? assistantMessageId : chat.length);
    return nonSystemMessages(chat)
        .filter(message => message.id < cutoff)
        .slice(-Math.max(0, Math.min(30, Math.round(Number(depth) || 8))))
        .map(message => ({
            id: message.id,
            role: message.is_user ? 'USER' : 'ASSISTANT',
            text: compactText(scannerEvidenceText(message.mes), 7000),
        }));
}

function rosterForPrompt(state) {
    return (state?.npcs || []).map(npc => ({
        id: npc.id,
        name: npc.name,
        aliases: npc.aliases,
        role: npc.role,
        species: npc.species,
        age: npc.age,
        apparentAge: npc.apparentAge,
        birthday: npc.birthday,
        birthdayProvenance: npc.birthdayProvenance,
        appearance: npc.appearance,
        appearanceForms: npc.appearanceForms,
        currentForm: npc.currentForm,
        archived: npc.archived,
        archiveReason: npc.archiveReason,
        present: npc.present,
        worldActive: npc.worldActive,
        relationship: npc.relationship,
        behaviorProfile: npc.behaviorProfile,
        mannerisms: npc.mannerisms,
        memories: npc.memories,
        keyRelationships: npc.keyRelationships,
        manualProfileFields: npc.manualProfileFields,
    }));
}

function dossierCollectionRules(limits) {
    return [
        `DOSSIER COLLECTION LIMITS: behaviorProfile=${limits.behaviorProfile}, mannerisms=${limits.mannerisms}, keyRelationships=${limits.keyRelationships}, memories=${limits.memories}.`,
        '- behaviorProfile, mannerisms, and memories are EVOLVING CURATED COLLECTIONS. Use null when unchanged; when revised, return the COMPLETE authoritative replacement set.',
        '- keyRelationships is counterpart-merge continuity, not a fragile whole-list replacement. Use null when unchanged. When a tie is newly established or materially revised, return only the affected canonical Other NPC - relationship entries; NPC State preserves omitted still-valid ties locally. Use keyRelationshipChanges only for an explicit supported removal.',
        '- Replacement-array behavior applies to behaviorProfile, mannerisms, and memories. Key relationships instead merge by named counterpart so omission cannot silently erase family/friend/guardian continuity.',
        '- Prefer current canonical truth, lasting importance, and future usefulness over chronology. Merge redundant or overlapping entries instead of keeping old and rewritten duplicates beside each other.',
        '- Never exceed the configured limit for that collection. When full, a more important or more current entry should displace a lower-value one.',
        '- For behaviorProfile, mannerisms, and memories, use [] only when evidence supports deliberately clearing the whole collection. For keyRelationships, [] means no relationship additions/changes; it never clears existing ties.',
        '- Keep individual collection entries concise, grounded, and independently useful later.',
        '- MEMORY SEMANTIC HYGIENE: Important Memories represent distinct durable events/facts, not paraphrase logs. If two candidate memories describe the same event with the same participants/outcome, return one concise richest version. Do not merge merely because the same people or topic recur: rescue and later training, two different promises, or separate injuries remain separate memories.',
        '- For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the affected counterpart entry; omitted existing counterparts are preserved by NPC State. Remove an established tie only through keyRelationshipChanges with action remove and explicit evidence.',
        '- KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful.',
    ];
}

export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', relationshipCaps = DEFAULT_RELATIONSHIP_CAPS, memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced' }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State v0.4.28 recovery scanner requires an assistant message and its preceding user exchange.');
    const history = recentHistory(chat, assistantMessageId, scanDepth);
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes, ...nonSystemMessages(chat).slice(-Math.max(2, Math.min(30, Number(scanDepth) || 8))).map(message => message.mes)].some(hasRecognizedStructuredBlocks);
    const contract = {
        exchangeActiveNpcIds: ['existing dossier id OR exact canonical name'],
        inChatNpcIds: ['existing dossier id OR exact canonical name'],
        worldActiveNpcIds: ['existing dossier id OR exact canonical name'],
        npcs: [{
            id: 'existing id when known, otherwise empty',
            name: 'human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*',
            identityKind: 'named|role-label',
            identityEvidence: { anchor: 'proper-name or unique-role anchor from current visible narrative', excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'brief contextual identity binding' },
            activityEvidence: { exchangeActive: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC is exchange-active' }, inChat: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC remains in-chat at the end' }, worldActive: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC is explicitly active off-screen' } },
            aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: 'why this maturation behavior applies', evidence: 'grounded accepted age-transition evidence', affectsShared: false, affectedForms: [] }, apparentAge: '~N only, e.g. ~25, or empty', birthday: 'explicit compact freeform calendar birthday or empty; never infer from age', appearance: 'shared/common appearance, or ordinary single-form appearance', currentForm: 'current named physical form or empty', appearanceForms: [{ name: 'newly established physical form', appearance: 'durable canonical appearance for this form' }], appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', mode: 'change|age_progression', evidence: 'explicit correction/growth/change or accepted age-transition evidence' }], personality: '',
            behaviorProfile: [], speech: '', mannerisms: [], keyRelationshipChanges: [{ other: 'existing NPC name/id', action: 'remove', evidence: 'explicit evidence the durable tie no longer applies' }], profileChanges: [{ field: 'personality|behaviorProfile|speech|mannerisms', mode: 'refine|gradual|explicit|batch', concept: 'short stable concept label', evidence: 'grounded evidence for this durable profile update' }], canonChanges: [{ field: 'appearance|species|background|role|birthday', mode: 'refine|change|correction|revelation|age_progression', value: 'replacement durable canon', evidence: 'grounded evidence for this durable scalar revision' }], background: '', keyRelationships: [], memories: [],
            relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,
            lifeState: 'alive|dead|unknown', lifeStateCertainty: 'explicit|strong|uncertain', lifeStateReason: '', livingReturn: false,
            relationshipChange: { evaluated: true, impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: ['supported nonzero axes strongest/most central first'], axisEvidence: { trust: { excerpts: ['1-3 exact current-exchange quotations'], explanation: 'why this changes Trust toward the PLAYER' }, affection: { excerpts: [], explanation: '' }, desire: { excerpts: [], explanation: '' }, tension: { excerpts: [], explanation: '' } }, evidence: 'optional compact overall event summary', reason: 'overall evaluation; required concise reason when impact is none' },
        }],
        socialEdges: [{ from: 'NPC id/name only', to: 'NPC id/name only', relation: '', summary: '', provenance: 'explicit|strong-context' }],
        familyFacts: [{ owner: 'existing NPC id/name', relation: 'family/kinship role, e.g. daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional family detail e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit family/kinship fact' }],
    };
    return [
        'You are NPC State v0.4.28, a private structured continuity scanner for a roleplay chat.',
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
        ...identityPresencePromptRules(),
        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',
        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',
        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for EVERY exchange-active existing NPC so relationship evaluation is explicit, plus any other individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',
        '- relationship, relationshipSummary, and relationshipChange describe THIS NPC toward the PLAYER. They are the dedicated player-relationship channel.',
        '- keyRelationships contains significant NON-PLAYER ties only, such as family, friends, rivals, patrons, dependents, or other NPCs. Never include the PLAYER/current USER persona there.',
        '- socialEdges are NPC-to-NPC only. Never use the PLAYER/current USER persona as an endpoint.',
        '- Current exchange decides relationship changes. Older context may establish prior attitudes, relationship baselines, already-counted developments, stable profile facts, and durable memories so you can judge what is genuinely new. It is continuity only: never treat an older development as occurring again or replay relationship deltas.',
        '- RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. When no new player-relationship shift is supported, use impact none, all-zero deltas, empty axisEvidence/evidence, and a concise reason. Never omit relationshipChange for an exchange-active NPC.',
        relationshipJudgmentRubricPrompt(),
        relationshipMechanicsPrompt(relationshipCaps),
        '- PER-AXIS RELATIONSHIP EVIDENCE is governed by the shared rubric above; required excerpts remain exact permitted CURRENT-exchange quotations, not summaries or older-context substitutions.',
        '- Older history is context for stable profile/memory and relationship continuity only. It may establish prior attitudes, baselines, and already-counted developments and may help interpret what changed, but it never supplies fresh relationship-event quotations or replays prior deltas.',
        '- age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; if canon explicitly gives a smaller unit, use N days, N weeks, or N months. Never write child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label in age. Never infer actual age from appearance. For an EXISTING NPC with an established age, a different number MUST NOT be placed in age. Use ageChange instead.',
        '- ageChange is the only automatic channel allowed to change an already-established chronological age. kind birthday requires explicit birthday/turned-N evidence; elapsed requires explicit elapsed-time narration that also states the resulting age; correction requires explicit correction/mistake evidence that states the corrected age. The evidence must contain the new numeric age. Casual contradictory age prose, appearance-based guesses, and unstated arithmetic are rejected by the backend. Leave ageChange null/omit when no authoritative chronological change occurred.',
        '- birthday is OPTIONAL passive continuity metadata, separate from age and apparentAge. Preserve compact freeform values exactly, including fantasy calendars such as 14 Frostwane. Never infer birthday from age, calculate age from birthday, or automatically increment age when a stored birthday date passes. For a new NPC or an existing blank/generated birthday, return birthday only when the supplied evidence explicitly establishes it. An established explicit/manual birthday is sticky; revise it only with canonChanges field birthday mode correction and grounded correction evidence. A birthday value by itself never authorizes ageProgression.',
        '- AGE-LINKED APPEARANCE EVOLUTION: after every valid birthday or elapsed ageChange, reconsider apparentAge and age-sensitive appearance in the SAME scan. Use ageProgression {maturation: ordinary|accelerated|long_lived|ageless|unknown, meaningful, basis, evidence, affectsShared, affectedForms}. Choose maturation behavior from established species, setting lore, existing apparent age, or known biology; unknown fantasy species stay unknown rather than silently using human aging. correction never causes physical maturation. It is valid to conclude meaningful false and leave appearance unchanged, especially for insignificant adult birthdays, long-lived races, ageless beings, or small intervals. Minor maturation descriptions must remain neutral and non-sexual.',
        '- AGE-PROGRESSION CHANNELS: canonChanges mode age_progression revises only age-sensitive shared/ordinary appearance. appearanceFormChanges mode age_progression revises only existing forms named in ageProgression.affectedForms. Preserve hair/eye colors, scars, species markers, magical traits, horn/wing/tail structure, and unrelated anatomy. Never replace the entire form registry because one form matured. When appearance still duplicates Base, revise Base and let NPC State synchronize the legacy scalar instead of separately rewriting shared appearance.',
        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',
        '- appearance remains the shared/common physical description, or the ordinary baseline appearance for an NPC with no distinct transforming forms. Do not rewrite appearance merely because a multi-form NPC changed form. For an EXISTING NPC that already has ordinary appearance but no appearanceForms, that stored appearance represents the baseline body; when the first alternate form is discovered NPC State preserves it locally as a neutral Base form.',
        '- currentForm is live physical-form state only, such as Human, Demihuman, Beast, Partial manifestation, or another grounded freeform label. Leave it empty for ordinary non-transforming NPCs. A physical form MAY be temporary, reversible, magical, elemental, spectral, or energy-made when the NPC enters a coherent transformed body state that materially changes anatomy, body plan, or silhouette. Partial transformations count when they add form-defining anatomy such as horns, wings, tails, scales, feathers, claws, or a changed body shape, even when those parts are ethereal or made of energy. Mere aura, glow, weather effect, spell particles, outfit, pose, disguise, mood, or injury is not a form. If an EXISTING NPC first reveals alternate forms in this exchange and ends back in the ordinary body represented by its stored appearance, use currentForm Base.',
        '- appearanceForms stores durable canonical descriptions of distinct transformed body states. Durable means the DESCRIPTION becomes continuity canon once observed; the transformation itself does NOT need to be permanent. Capture every distinct form state explicitly shown in the CURRENT exchange, including a partial/hybrid manifestation and a later full beast body when they are separately entered. For an unnamed transformed state, use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy like Demihuman unless the story establishes that term. For a NEW multi-form NPC, return every grounded form established by the current exchange, including its baseline form when that baseline is actually described. For an EXISTING NPC, appearanceForms must contain only genuinely NEW forms not already present in EXISTING DOSSIERS; never resend an existing form with a newly guessed description. RECOVERY: if an older scan already captured an alternate form but no Base entry, and this exchange explicitly ends with the NPC back in the ordinary body represented by stored appearance, set currentForm to Base; NPC State will recover that stored appearance into Base locally.',
        '- Existing form descriptions are sticky continuity facts. Never change an established form because later prose casually uses different dimensions, colors, anatomy, or proportions. Normally appearanceFormChanges requires an explicit CURRENT-exchange correction or real persistent physical change/growth/evolution. The only inferred exception is mode age_progression after an accepted birthday/elapsed ageChange and an authorized meaningful maturation interval, and it may touch only forms listed in ageProgression.affectedForms. Every revision still requires grounded transition/change evidence.',
        ...dossierCollectionRules(limits),
        '- Do not infer romance, obedience, hostility, personality, motives, secrets, age, species, or relationships without evidence.',
        '- Confirmed death requires explicit current-timeline evidence. Ambiguous danger/injury is not death. lifeStateReason must state the concrete evidence and is backend-grounded against visible narrative or World_State.',
        '- livingReturn is true only when a previously archived/dead dossier is explicitly alive, surviving, resurrected, or physically returned. It also requires a grounded lifeStateReason; merely outputting lifeState alive never resurrects a confirmed dead dossier.',
        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',
        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, Role, and Birthday are sticky. Do not restate them with a different value merely because wording drifts. Any real revision must include canonChanges with the same field/value plus grounded evidence. appearance refine adds compatible lasting detail; appearance change needs a lasting physical change; appearance age_progression is allowed only by the accepted birthday/elapsed maturation gate above; species accepts explicit correction/revelation or a genuine permanent species change; background accepts grounded refinement/revelation/correction; role change needs an actual promotion/reassignment/retirement/etc. Scanner importance is non-authoritative and must not be used to raise dossier priority.',
        '- DURABLE PROFILE EVOLUTION: a new NPC may establish grounded foundational personality/behavior/speech/mannerisms from its first rich scene. For an EXISTING established field, never rewrite personality, behaviorProfile, speech, or mannerisms merely because one scene looks different. Any genuine change requires a matching profileChanges entry with field, mode, stable concept label, and concrete evidence. refine adds compatible detail only and must not smuggle no-longer/became/increasingly transitions or morality flips. gradual development requires the same concept to be independently supported on a later scan. explicit requires narration that clearly establishes a lasting/corrective change. batch requires an actual narrated time skip plus development across that skipped period. A one-off gesture is not a permanent mannerism; mannerism seeding needs recurring/habit language or repeated confirmation.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        '',
        relationshipCustomCriteriaPrompt(relationshipCriteria),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        '',
        `EXISTING DOSSIERS:\n${JSON.stringify(rosterForPrompt(state))}`,
        `OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE:\n${JSON.stringify(history)}`,
        `CURRENT USER MESSAGE:\n${compactText(scannerEvidenceText(exchange.user?.mes || ''), 10000)}`,
        `CURRENT ASSISTANT MESSAGE:\n${compactText(scannerEvidenceText(exchange.assistant?.mes || ''), 14000)}`,
        `OUTPUT CONTRACT:\n${JSON.stringify(contract)}`,
    ].filter(Boolean).join('\n\n');
}

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = {
        id: String(npc?.id || patch?.id || '').trim(),
        name: String(npc?.name || patch?.name || '').trim(),
        relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' },
    };
    for (const field of [
        'aliases', 'role', 'species', 'age', 'ageChange', 'ageProgression', 'apparentAge', 'birthday', 'appearance', 'appearanceForms', 'appearanceFormChanges',
        'personality', 'behaviorProfile', 'speech', 'mannerisms', 'profileChanges', 'canonChanges', 'background',
        'keyRelationships', 'keyRelationshipChanges', 'memories',
    ]) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, field)) out[field] = structuredClone(patch[field]);
    }
    return out;
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
        'You are NPC State v0.4.28 performing a DELIBERATE STRUCTURED DOSSIER IMPORT for one existing NPC.',
        'Return JSON only. This is reference-data reconciliation, NOT a current scene/event scan.',
        'Only the supplied Megumin New_NPC / NPC_Update blocks are authoritative sources for this operation.',
        'TARGET DOSSIER: ' + JSON.stringify(rosterForPrompt({ npcs: [npc] })[0]),
        'STRUCTURED DOSSIER SOURCES: ' + JSON.stringify(sources),
        'IMPORT AUTHORITY RULES:',
        '- Import durable identity/profile facts only: aliases, role, species, actual/apparent age, birthday, appearance/forms, personality, behavior, speech, mannerisms, background, non-player Key Relationships, and durable Important Memories.',
        '- NEVER infer current In-chat presence, exchange activity, off-screen activity, Mood, Location, Goal, Status, currentForm, life/death/archive state, Importance, or any other live state from these reference blocks.',
        '- NEVER create or change Trust/Affection/Desire/Tension, relationshipChange, relationshipSummary, or relationship history from structured dossier import.',
        '- Preserve established canon when the blocks merely phrase it differently. Birthday is passive freeform calendar text and must never be inferred from age; an explicit source birthday may seed a blank/generated birthday, while an established explicit/manual birthday changes only through canonChanges field birthday mode correction. For a real correction/revelation/revision of established Appearance/Species/Background/Role/Birthday, return canonChanges with concrete evidence quoted/paraphrased from the source block.',
        '- For established Personality/Behavior/Speech/Mannerisms revisions, use profileChanges and source-block evidence under the normal durable-evolution rules. A structured profile description may seed an empty field, but it does not waive contradiction safeguards.',
        '- Existing appearanceForms remain sticky; add genuinely new forms normally. For a known form, appearanceFormChanges normally requires an explicit structured-source correction/change; mode age_progression is the narrow exception when that same structured source establishes an accepted meaningful birthday/elapsed maturation transition and names the affected existing form.',
        '- Existing actual Age remains sticky; use ageChange only when the structured source explicitly establishes a correction/birthday/elapsed-time result with the resulting numeric age.',
        '- If the structured source establishes an accepted birthday/elapsed transition, reconsider visual maturation with ageProgression under the same conservative rules. correction is bookkeeping only and never matures the body. Unknown maturation stays visually unchanged; do not infer human aging for an unknown fantasy species. Use age_progression only when the source transition and established maturation behavior make the interval visually meaningful.',
        ...dossierCollectionRules(limits),
        'MEMORY SEMANTIC HYGIENE: collapse paraphrases of the same durable event/fact, while preserving genuinely different events.',
        memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\n' + compactText(memoryCriteria, 6000) : '',
        'OUTPUT CONTRACT: ' + JSON.stringify({
            exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
            npcs: [{
                id: npc.id, name: npc.name, aliases: null, role: '', species: '', age: '', ageChange: null, ageProgression: null, apparentAge: '', birthday: '',
                appearance: '', appearanceForms: null, appearanceFormChanges: null,
                personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null,
                canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null,
                relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' },
            }], socialEdges: [], familyFacts: [],
        }),
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
        'You are NPC State v0.4.28 performing a targeted dossier reconciliation.',
        'Return JSON only using the same object shape shown below.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `TARGET DOSSIER: ${JSON.stringify(rosterForPrompt({ npcs: [npc] })[0])}`,
        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',
        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',
        'The PLAYER/current USER persona is not an NPC. relationshipSummary is this NPC toward the PLAYER; keyRelationships is NON-PLAYER ties only and must never duplicate the PLAYER.',
        'age is ACTUAL chronological age only. Use grounded numeric age data only: N or ~N years, or N days/weeks/months when explicitly established. Never use child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label. If the target already has an age, leave age empty for any different number and use ageChange only for an explicit birthday, elapsed-time update, or correction that states the resulting numeric age.',
        'ageChange is the only automatic revision channel for an established chronological age: {age, kind birthday|elapsed|correction, evidence}. Evidence must explicitly state the new age and the birthday/elapsed/correction basis. Casual contradictions and appearance guesses are not revisions.',
        'birthday is passive freeform calendar continuity metadata. Never infer it from age or calculate age from it. Explicit chat evidence may seed a blank/generated birthday; an established explicit/manual value changes only through canonChanges field birthday mode correction. Birthday metadata alone never triggers ageChange or ageProgression.',
        'AGE-LINKED APPEARANCE EVOLUTION: after a valid birthday/elapsed ageChange, reconsider apparentAge and age-sensitive appearance with ageProgression. Use established species/setting lore/known maturation behavior; unknown fantasy species are conservative, long-lived races mature slowly, accelerated-growth species may mature faster, and ageless beings remain visually unchanged unless explicit canon says otherwise. correction does not mature the body, and insignificant intervals may correctly produce no visual update. Use canonChanges/appearanceFormChanges mode age_progression only for the shared or named forms actually affected, preserving unrelated traits. Minor maturation descriptions stay neutral and non-sexual.',
        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',
        'appearance is shared/common physical description, or the ordinary baseline appearance. currentForm is live physical-form state only and should stay empty for a non-transforming NPC. A form may be temporary, reversible, magical, spectral, elemental, or energy-made if it is a coherent transformed body state with materially different anatomy/body plan/silhouette. Partial transformations with manifested horns, wings, tails, scales, feathers, claws, or other form-defining anatomy count; mere aura/glow/spell particles/outfit/pose/injury do not. If this existing NPC first reveals alternate forms and ends back in its stored ordinary body, use currentForm Base.',
        'appearanceForms contains only newly established distinct transformed body states. Capture multiple distinct states from the same scene when they are separately entered, including partial manifestation and full beast states. Durable refers to continuity of the stored description, not permanence of the transformation. Preserve every existing form shown in TARGET DOSSIER. Never rewrite a stored form from a casual contradictory description. If TARGET DOSSIER has alternate forms but no Base and the chat explicitly ends with the NPC back in its stored ordinary appearance, set currentForm to Base so NPC State can recover that baseline locally.',
        'appearanceFormChanges may revise a stored form only when this chat explicitly corrects canon or establishes persistent physical growth/change/evolution; mode age_progression is the narrow exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence for every revision.',
        ...dossierCollectionRules(limits),
        'Do NOT change relationship scores or propose relationship deltas in a targeted refresh. Do NOT change global in-chat state for other NPCs.',
        'If the chat does not establish a scalar field, leave it empty. Never invent facts.',
        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',
        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, Role, and Birthday unless this window supports an authorized canonChanges revision. Use field/value/evidence and mode refine|change|correction|revelation, plus age_progression only for Appearance after the accepted maturation gate above. Never use scanner importance to reprioritize the dossier.',
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        `CHAT WINDOW:\n${JSON.stringify(history)}`,
        `OUTPUT CONTRACT:\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only or empty', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', birthday: 'explicit freeform birthday or empty', appearance: 'shared/common or ordinary single-form appearance', currentForm: 'current physical form or empty', appearanceForms: null, appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null, canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }], socialEdges: [] })}`,
    ].filter(Boolean).join('\n\n');
}

function isPlainScannerObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function scannerStringArrayValid(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}
function scannerObjectArrayValid(value) {
    return Array.isArray(value) && value.every(isPlainScannerObject);
}
function scannerIdentityString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}
function scannerNpcArrayValid(value) {
    return scannerObjectArrayValid(value) && value.every(item => {
        const has = key => Object.prototype.hasOwnProperty.call(item, key);
        if (has('id') && typeof item.id !== 'string') return false;
        if (has('name') && typeof item.name !== 'string') return false;
        if (has('aliases') && (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === 'string'))) return false;
        const direct = scannerIdentityString(item.id) || scannerIdentityString(item.name);
        const alias = Array.isArray(item.aliases) && item.aliases.some(scannerIdentityString);
        return Boolean(direct || alias);
    });
}
function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false } = {}) {
    if (!isPlainScannerObject(parsed)) throw new Error('NPC State v0.4.28 recovery scanner JSON must be an object.');
    const has = key => Object.prototype.hasOwnProperty.call(parsed, key);
    const presentKey = has('inChatNpcIds') ? 'inChatNpcIds' : (has('finalPresentNpcIds') ? 'finalPresentNpcIds' : '');
    if (requireContract) {
        const invalid = [];
        if (!scannerStringArrayValid(parsed.exchangeActiveNpcIds)) invalid.push('exchangeActiveNpcIds[string]');
        if (!presentKey || !scannerStringArrayValid(parsed[presentKey])) invalid.push('inChatNpcIds[string]');
        if ((!allowOmittedSupplemental || has('worldActiveNpcIds')) && !scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');
        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-string-identity]');
        if ((!allowOmittedSupplemental || has('socialEdges')) && !scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');
        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');
        if (invalid.length) throw new Error('NPC State v0.4.28 recovery scanner JSON has invalid payload structure or members: ' + invalid.join(', ') + '.');
    }
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],
    };
}

export function parseScanJson(raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('NPC State v0.4.28 recovery scanner returned an empty response.');
    const unfenced = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('NPC State v0.4.28 recovery scanner returned no JSON object.');
    let parsed;
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch (error) { throw new Error('NPC State v0.4.28 recovery scanner returned malformed JSON: ' + error.message); }
    return normalizeScanPayload(parsed, { requireContract: true });
}

function isTechnicalNpcIdentity(value) {
    return /^npc(?:[-_:]|$)/i.test(String(value ?? '').trim());
}

function humanIdentityCandidate(value, role = '') {
    const clean = String(value ?? '').trim();
    if (!clean || isTechnicalNpcIdentity(clean) || GENERIC_REFERENCES.has(normalizeName(clean))) return '';
    if (role && normalizeName(clean) === normalizeName(role)) return '';
    return clean;
}

function machineIdentityContainsCandidate(machineValue, candidate) {
    const machine = normalizeName(String(machineValue ?? '').replace(/^npc[-_:]*/i, ''));
    const human = normalizeName(candidate);
    return Boolean(machine && human && (machine === human || ` ${machine} `.includes(` ${human} `)));
}

function canonicalPatchName(patch = {}, referenceCandidates = []) {
    const direct = humanIdentityCandidate(patch?.name, patch?.role);
    if (direct) return direct;

    const machine = String(patch?.name || patch?.id || '').trim();
    const candidates = [];
    const push = (value, requireMachineMatch = false) => {
        const clean = humanIdentityCandidate(value, patch?.role);
        if (!clean) return;
        if (requireMachineMatch && machine && !machineIdentityContainsCandidate(machine, clean)) return;
        if (!candidates.some(item => normalizeName(item) === normalizeName(clean))) candidates.push(clean);
    };
    for (const alias of Array.isArray(patch?.aliases) ? patch.aliases : []) push(alias);
    for (const reference of Array.isArray(referenceCandidates) ? referenceCandidates : []) push(reference, true);
    candidates.sort((a, b) => {
        const aWords = normalizeName(a).split(/\s+/).filter(Boolean).length;
        const bWords = normalizeName(b).split(/\s+/).filter(Boolean).length;
        return bWords - aWords || b.length - a.length;
    });
    return candidates[0] || '';
}

function identityOwnerForValue(state, value) {
    const key = normalizeName(value);
    if (!key) return null;
    return (state?.npcs || []).find(candidate =>
        normalizeName(candidate?.name) === key
        || (candidate?.aliases || []).some(alias => normalizeName(alias) === key)) || null;
}

function automaticIdentityPatchConflicts(state, npc, patch, referenceCandidates = []) {
    const values = [
        canonicalPatchName(patch, referenceCandidates),
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
    ].map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
    for (const value of values) {
        const owner = identityOwnerForValue(state, value);
        if (owner && (!npc || owner.id !== npc.id)) return true;
    }
    return false;
}

function preflightAutomaticIdentityPatches(state, patches = [], referenceCandidates = []) {
    const owners = new Map();
    const initialIdentityKeys = new Set();
    for (const npc of state?.npcs || []) {
        for (const value of [npc?.name, ...(npc?.aliases || [])]) {
            const key = normalizeName(value);
            if (key) { owners.set(key, npc.id); initialIdentityKeys.add(key); }
        }
    }
    for (let index = 0; index < patches.length; index += 1) {
        const patch = patches[index];
        const patchId = String(patch?.id || '').trim();
        const canonicalName = canonicalPatchName(patch, referenceCandidates);
        const byId = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        const existing = byId || (canonicalName ? findNpcByReference(state, canonicalName) : null);
        const prospectiveOwner = existing?.id || ('pending:' + index);
        const values = [canonicalName, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])]
            .map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
        for (const value of values) {
            const key = normalizeName(value);
            const owner = owners.get(key);
            if (owner && owner !== prospectiveOwner) {
                // A collision with canon that already existed before this observation is
                // handled by automaticIdentityPatchConflicts() as a local patch rejection.
                // A newly claimed key is a same-observation conflict and invalidates the payload.
                if (!initialIdentityKeys.has(key)) {
                    throw new Error('NPC State v0.4.28 scanner identity collision inside one observation: ' + value + '.');
                }
            }
        }
        for (const value of values) {
            const key = normalizeName(value);
            if (key && (!initialIdentityKeys.has(key) || owners.get(key) === prospectiveOwner)) owners.set(key, prospectiveOwner);
        }
    }
}

function repairTechnicalStoredName(npc) {
    if (!isTechnicalNpcIdentity(npc?.name)) return npc;
    if (npc?.manual === true || (npc?.manualProfileFields || []).includes('name')) return npc;
    const candidates = (Array.isArray(npc?.aliases) ? npc.aliases : [])
        .map(alias => humanIdentityCandidate(alias, npc?.role))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    const name = candidates[0] || '';
    if (!name) return npc;
    const next = structuredClone(npc);
    next.name = name;
    next.aliases = (next.aliases || []).filter(alias => {
        const key = normalizeName(alias);
        return key && key !== normalizeName(name) && !isTechnicalNpcIdentity(alias);
    });
    next.updatedAt = Math.max(Date.now(), Number(next.updatedAt || 0) + 1);
    return normalizeNpc(next);
}

function patchReferenceMatches(patch, reference) {
    const key = normalizeName(reference);
    if (!key) return false;
    if (String(patch?.id || '').trim() === String(reference || '').trim()) return true;
    if (normalizeName(patch?.name) === key) return true;
    if ((Array.isArray(patch?.aliases) ? patch.aliases : []).some(alias => normalizeName(alias) === key)) return true;
    return normalizeName(canonicalPatchName(patch, [reference])) === key;
}

function createFromPatch(patch, sourceMessageId, referenceCandidates = []) {
    const name = canonicalPatchName(patch, referenceCandidates);
    // Never persist an LLM transport key as a human-facing dossier name. If no grounded
    // human identity can be recovered from the patch/aliases/activity references, fail
    // closed and let a later scan recover it rather than poisoning canonical identity.
    if (!name || isTechnicalNpcIdentity(name) || GENERIC_REFERENCES.has(normalizeName(name))) return null;
    return normalizeNpc({
        id: makeNpcId(name, `${sourceMessageId}-${Math.random()}`),
        name,
        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
        createdAt: Date.now(),
    });
}

function mergeAppearanceFormPatch(existingValue, newValue, revisionValue, evidenceContext = '', ageProgression = null, npc = null, patch = null) {
    const out = normalizeAppearanceForms(existingValue);
    const indexByName = () => new Map(out.map((form, index) => [normalizeName(form.name), index]));
    let indices = indexByName();

    // Ordinary scan output may only add genuinely new forms. Existing form descriptions
    // are intentionally sticky so incidental prose cannot resize/recolor a known body.
    for (const form of normalizeAppearanceForms(newValue)) {
        const key = normalizeName(form.name);
        if (!key || indices.has(key)) continue;
        out.push(form);
        indices.set(key, out.length - 1);
        if (out.length >= 12) break;
    }

    // Existing forms can change only through the explicit revision channel with evidence.
    for (const raw of Array.isArray(revisionValue) ? revisionValue : []) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const evidence = String(raw.evidence || raw.reason || '').trim();
        if (!evidence) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        const revised = normalizeAppearanceForms([raw])[0];
        if (!revised) continue;
        const key = normalizeName(revised.name);
        indices = indexByName();
        const index = indices.get(key);
        const mode = String(raw.mode || '').trim().toLocaleLowerCase();
        if (mode === AGE_PROGRESSION_MODE) {
            if (!ageProgression?.allowed || !Number.isInteger(index) || !ageProgression.affectedForms?.has(key)) continue;
            if (!ageProgressionAppearanceSafe(out[index]?.appearance, revised.appearance, npc || {}, patch || {})) continue;
        }
        if (Number.isInteger(index)) out[index] = revised;
        else if (mode !== AGE_PROGRESSION_MODE && out.length < 12) out.push(revised);
    }
    return normalizeAppearanceForms(out);
}

const PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);
const PROFILE_TRANSITION_CUES = /\b(no longer|formerly|became|becomes|becoming|increasingly|from now on|now (?:speaks?|acts?|behaves?|tends?|prefers?|refuses?)|started|stopped|began|developed|grew (?:more|less)|learned to|hardened|softened|reformed|changed)\b/i;
const PROFILE_LASTING_CUES = /\b(permanent(?:ly)?|lasting|enduring|from now on|no longer|became|becomes|developed|learned to|habit(?:ual|ually)?|now consistently|changed for good|settled into|adopted as a habit)\b/i;
const PROFILE_TIME_SKIP_CUES = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?)\s+(?:later|passed|had passed)|\bover the (?:next|following)\s+(?:days?|weeks?|months?|years?)|\bafter\s+(?:\d+|several|many|a few)\s+(?:days?|weeks?|months?|years?)|\bduring the (?:following|next|intervening)\s+(?:days?|weeks?|months?|years?)|\btime[- ]skip\b/i;
const PROFILE_HABIT_CUES = /\b(always|often|usually|habitually|regularly|repeatedly|tends? to|keeps? doing|whenever|every time|habit|mannerism|recurring|characteristically)\b/i;
const PROFILE_KIND_CUES = /\b(kind|gentle|compassionate|empathetic|merciful|caring|warm|benevolent)\b/i;
const PROFILE_CRUEL_CUES = /\b(cruel|callous|sadistic|merciless|brutal|ruthless|heartless)\b/i;

function profileValueKey(value) {
    if (Array.isArray(value)) return value.map(item => evidenceTextKey(item, 1400)).filter(Boolean).join(' | ');
    return evidenceTextKey(value, 5000);
}

function profileChangeForField(patch, field) {
    const changes = Array.isArray(patch?.profileChanges) ? patch.profileChanges : [];
    return changes.find(raw => raw && typeof raw === 'object' && String(raw.field || '').trim() === field) || null;
}

function evidenceTextKey(value, max = 20000) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim()
        .slice(0, max);
}

function profileEvidenceGrounded(evidence, context) {
    // Identity normalization is intentionally short (160 chars); evidence grounding is not.
    // Using normalizeName() here silently hid evidence appearing later in a normal scene.
    const proof = evidenceTextKey(evidence, 1200);
    const source = evidenceTextKey(context, 20000);
    if (!proof || !source) return false;
    if (source.includes(proof)) return true;
    const stop = new Set(['the','and','that','this','with','from','into','their','they','them','then','when','while','because','after','before','more','less','very','some','current','exchange','npc','player']);
    const proofTokens = proof.split(/\s+/).filter(token => token.length >= 3 && !stop.has(token));
    const sourceTokens = new Set(source.split(/\s+/).filter(token => token.length >= 3));
    if (!proofTokens.length) return false;
    const matched = proofTokens.filter(token => sourceTokens.has(token)).length;
    return matched >= Math.min(2, proofTokens.length) && matched / proofTokens.length >= 0.34;
}

function profilePolarityConflict(currentValue, proposedValue) {
    const current = String(currentValue || '');
    const proposed = String(proposedValue || '');
    const currentKind = PROFILE_KIND_CUES.test(current);
    const currentCruel = PROFILE_CRUEL_CUES.test(current);
    const proposedKind = PROFILE_KIND_CUES.test(proposed);
    const proposedCruel = PROFILE_CRUEL_CUES.test(proposed);
    return (currentKind && proposedCruel && !proposedKind) || (currentCruel && proposedKind && !proposedCruel);
}

function appendProfileEvolutionEvidence(npc, change, field, options = {}) {
    const concept = String(change?.concept || '').trim().slice(0, 180);
    const evidence = String(change?.evidence || '').trim().slice(0, 600);
    if (!concept || !evidence) return;
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : null;
    const existing = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence);
    const duplicateSource = existing.some(entry =>
        entry.field === field
        && normalizeName(entry.concept) === normalizeName(concept)
        && (sourceMessageId !== null ? entry.sourceMessageId === sourceMessageId : (turn !== null && entry.sourceMessageId == null && entry.turn === turn)));
    if (duplicateSource) return;
    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...existing, {
        field,
        mode: String(change?.mode || 'gradual').trim(),
        concept,
        evidence,
        sourceMessageId,
        turn,
        at: Date.now(),
    }]);
}

function profileEvolutionDecision(npc, patch, field, incomingValue, options = {}) {
    if (!PROFILE_EVOLUTION_FIELDS.has(field)) return { apply: true };
    const currentValue = npc?.[field];
    const currentKey = profileValueKey(currentValue);
    const incomingKey = profileValueKey(incomingValue);
    if (!incomingKey || incomingKey === currentKey) return { apply: Boolean(incomingKey) };

    // A genuinely new dossier may establish its foundational characterization from the
    // first rich scene. This does not authorize later one-scene rewrites.
    if (options.isBootstrap === true) return { apply: true };

    // Sparse existing dossiers can be seeded only through explicit grounded profile
    // evidence. Mannerisms additionally need narration that marks recurrence/habit.
    const change = profileChangeForField(patch, field);
    const context = String(options.profileContext || '');
    const evidence = String(change?.evidence || '').trim();
    const grounded = Boolean(change && evidence && profileEvidenceGrounded(evidence, context));
    if (!currentKey) {
        if (!grounded) return { apply: false };
        if (field === 'mannerisms' && !PROFILE_HABIT_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (!grounded) return { apply: false };
    const mode = ['refine', 'gradual', 'explicit', 'batch'].includes(String(change.mode)) ? String(change.mode) : 'gradual';
    const concept = normalizeName(change.concept);
    if (!concept) return { apply: false };

    if (mode === 'refine') {
        if (PROFILE_TRANSITION_CUES.test(evidence + ' ' + String(incomingValue))) return { apply: false, queue: true, change };
        if (profilePolarityConflict(currentValue, incomingValue)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (mode === 'explicit') {
        if (!PROFILE_LASTING_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    if (mode === 'batch') {
        if (!PROFILE_TIME_SKIP_CUES.test(context) || !PROFILE_TRANSITION_CUES.test(evidence + ' ' + context)) return { apply: false, queue: true, change };
        return { apply: true, queue: true, change };
    }

    // Gradual development needs the same labeled concept on a different prior scan.
    const prior = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence).find(entry => {
        if (entry.field !== field || normalizeName(entry.concept) !== concept) return false;
        // A rescan of the same assistant message may advance the internal turn counter.
        // Message identity is authoritative whenever both sides have one; turn is fallback.
        if (Number.isInteger(entry.sourceMessageId) && Number.isInteger(options.sourceMessageId)) {
            return entry.sourceMessageId !== options.sourceMessageId;
        }
        if (Number.isInteger(entry.turn) && Number.isInteger(options.turn)) return entry.turn !== options.turn;
        return true;
    });
    return { apply: Boolean(prior), queue: true, change };
}

function keyRelationshipParts(entry) {
    const clean = String(entry || '').trim();
    const match = clean.match(/^(.+?)\s+(?:-|–|—)\s+(.+)$/);
    if (!match) return { other: '', relation: clean };
    return { other: match[1].trim(), relation: match[2].trim() };
}

function keyRelationshipOtherKey(entry) {
    return normalizeName(keyRelationshipParts(entry).other);
}

function mergeKeyRelationshipPatch(existingValue, incomingValue, changesValue, limit, evidenceContext = '') {
    const out = normalizeKeyRelationshipEntries(existingValue, Math.max(limit, 30), 500);
    const indexFor = () => new Map(out.map((entry, index) => [keyRelationshipOtherKey(entry), index]).filter(([key]) => key));
    let indices = indexFor();
    for (const entry of normalizeKeyRelationshipEntries(incomingValue, limit, 500)) {
        const key = keyRelationshipOtherKey(entry);
        if (key && indices.has(key)) out[indices.get(key)] = entry;
        else if (!out.some(item => normalizeName(item) === normalizeName(entry))) out.push(entry);
        indices = indexFor();
    }
    for (const raw of Array.isArray(changesValue) ? changesValue : []) {
        if (!raw || typeof raw !== 'object' || String(raw.action || '').trim() !== 'remove') continue;
        const evidence = String(raw.evidence || raw.reason || '').trim();
        const key = normalizeName(raw.other || raw.name || raw.target);
        if (!evidence || !key) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        for (let i = out.length - 1; i >= 0; i -= 1) if (keyRelationshipOtherKey(out[i]) === key) out.splice(i, 1);
    }
    return normalizeKeyRelationshipEntries(out, limit, 500);
}

const FAMILY_KINSHIP_GROUPS = Object.freeze({
    child: new Set(['child', 'daughter', 'son', 'adopted child', 'adopted daughter', 'adopted son', 'stepchild', 'step daughter', 'step son', 'foster child', 'foster daughter', 'foster son']),
    parent: new Set(['parent', 'mother', 'father', 'guardian parent', 'adoptive parent', 'adoptive mother', 'adoptive father', 'stepparent', 'step mother', 'step father', 'foster parent', 'foster mother', 'foster father']),
    sibling: new Set(['sibling', 'sister', 'brother', 'twin sibling', 'twin sister', 'twin brother', 'half sibling', 'half sister', 'half brother', 'step sibling', 'step sister', 'step brother']),
    aunt_uncle: new Set(['aunt', 'uncle', 'great aunt', 'great uncle', 'grandaunt', 'granduncle']),
    niece_nephew: new Set(['niece', 'nephew', 'great niece', 'great nephew', 'grandniece', 'grandnephew']),
    grandparent: new Set(['grandparent', 'grandmother', 'grandfather', 'great grandparent', 'great grandmother', 'great grandfather']),
    grandchild: new Set(['grandchild', 'granddaughter', 'grandson', 'great grandchild', 'great granddaughter', 'great grandson']),
    cousin: new Set(['cousin', 'first cousin', 'second cousin']),
    spouse: new Set(['spouse', 'wife', 'husband']),
    guardian: new Set(['guardian', 'legal guardian']),
    ward: new Set(['ward']),
    parent_in_law: new Set(['parent in law', 'mother in law', 'father in law']),
    child_in_law: new Set(['child in law', 'daughter in law', 'son in law']),
    sibling_in_law: new Set(['sibling in law', 'sister in law', 'brother in law']),
});
function familyRole(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    for (const [group, values] of Object.entries(FAMILY_KINSHIP_GROUPS)) if (values.has(text)) return group;
    // Permit ordinary modifiers such as younger sister or paternal uncle without requiring
    // an exhaustive vocabulary. Order matters so compound/in-law and grand relations do
    // not collapse into their simpler parent/child/sibling words.
    if (/\b(?:mother|father|parent)\s+in\s+law\b/.test(text)) return 'parent_in_law';
    if (/\b(?:daughter|son|child)\s+in\s+law\b/.test(text)) return 'child_in_law';
    if (/\b(?:sister|brother|sibling)\s+in\s+law\b/.test(text)) return 'sibling_in_law';
    if (/\b(?:great\s+)?grand(?:mother|father|parent)\b/.test(text)) return 'grandparent';
    if (/\b(?:great\s+)?grand(?:daughter|son|child)\b/.test(text)) return 'grandchild';
    if (/\b(?:aunt|uncle)\b/.test(text)) return 'aunt_uncle';
    if (/\b(?:niece|nephew)\b/.test(text)) return 'niece_nephew';
    if (/\bcousin\b/.test(text)) return 'cousin';
    if (/\b(?:spouse|wife|husband)\b/.test(text)) return 'spouse';
    if (/\bguardian\b/.test(text)) return 'guardian';
    if (/\bward\b/.test(text)) return 'ward';
    if (/\b(?:sister|brother|sibling)\b/.test(text)) return 'sibling';
    if (/\b(?:daughter|son|child)\b/.test(text)) return 'child';
    if (/\b(?:mother|father|parent)\b/.test(text)) return 'parent';
    return '';
}

function reciprocalFamilyRelation(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    switch (familyRole(text)) {
        case 'child': return 'parent';
        case 'parent': return 'child';
        case 'sibling':
            if (/\btwin\b/.test(text)) return 'twin sibling';
            if (/\bhalf\b/.test(text)) return 'half sibling';
            if (/\bstep\b/.test(text)) return 'step sibling';
            return 'sibling';
        case 'aunt_uncle': return /\b(?:great|grand)\b/.test(text) ? 'great-niece/nephew' : 'niece/nephew';
        case 'niece_nephew': return /\b(?:great|grand)\b/.test(text) ? 'great-aunt/uncle' : 'aunt/uncle';
        case 'grandparent': return /\bgreat\b/.test(text) ? 'great-grandchild' : 'grandchild';
        case 'grandchild': return /\bgreat\b/.test(text) ? 'great-grandparent' : 'grandparent';
        case 'cousin': return 'cousin';
        case 'spouse': return 'spouse';
        case 'guardian': return 'ward';
        case 'ward': return 'guardian';
        case 'parent_in_law': return 'child-in-law';
        case 'child_in_law': return 'parent-in-law';
        case 'sibling_in_law': return 'sibling-in-law';
        default: return '';
    }
}

function resolveFamilySlotMember(slots, ownerId, relation, memberId) {
    const group = familyRole(relation);
    if (!group || !ownerId || !memberId || ownerId === memberId) return false;
    const relationKey = normalizeName(relation);
    const candidates = slots
        .filter(slot => slot.ownerId === ownerId
            && familyRole(slot.relation) === group
            && !slot.resolvedNpcIds.includes(memberId)
            && slot.resolvedNpcIds.length < slot.count)
        .sort((left, right) => Number(normalizeName(right.relation) === relationKey) - Number(normalizeName(left.relation) === relationKey));
    const slot = candidates[0];
    if (!slot) return false;
    slot.resolvedNpcIds.push(memberId);
    slot.updatedAt = Date.now();
    return true;
}

function familySlotKey(ownerId, relation, twinGroup = '') {
    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);
}

function groundedFamilyMemberNames(raw, count, evidenceContext = '', owner = null, playerName = '') {
    const source = Array.isArray(raw?.members) ? raw.members : (Array.isArray(raw?.memberNames) ? raw.memberNames : []);
    const out = [];
    const seen = new Set();
    for (const value of source) {
        const member = String(value || '').trim().slice(0, 160);
        const key = normalizeName(member);
        if (!member || !key || seen.has(key) || isTechnicalNpcIdentity(member) || GENERIC_REFERENCES.has(key)) continue;
        if (owner && [owner.name, ...(owner.aliases || [])].some(label => normalizeName(label) === key)) continue;
        if (keyRelationshipReferencesPlayer(member, playerName)) continue;
        // Runtime profileContext contains public exchange evidence with structured/private
        // blocks removed. A name found only in World_State or private chatter therefore
        // cannot be smuggled into durable family continuity. Test/import callers with no
        // evidence context retain backward-compatible trusted-object behavior.
        if (String(evidenceContext || '').trim() && !containsNormalizedPhrase(evidenceContext, member)) continue;
        seen.add(key);
        out.push(member);
        if (out.length >= count) break;
    }
    return out;
}

function familyMemberNpc(state, reference) {
    const direct = findNpcByReference(state, reference);
    if (direct) return direct;
    const key = normalizeName(reference);
    if (!key || key.length < 3) return null;
    const matches = (state?.npcs || []).filter(npc =>
        [npc?.name, ...(npc?.aliases || [])].some(label => {
            const tokens = String(label || '').normalize('NFKC').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
            return tokens.length >= 2 && tokens.some(token => normalizeName(token) === key);
        }));
    return matches.length === 1 ? matches[0] : null;
}

function familyCounterpartMatches(state, entry, memberName, memberNpc = null) {
    const other = keyRelationshipParts(entry).other;
    if (!other) return false;
    if (normalizeName(other) === normalizeName(memberName)) return true;
    if (!memberNpc) return false;
    return familyMemberNpc(state, other)?.id === memberNpc.id;
}

function upsertFamilyRelationship(state, npc, counterpartName, counterpartNpc, relation, limit) {
    if (!npc || !relation || (npc.manualProfileFields || []).includes('keyRelationships')) return;
    const displayName = String(counterpartNpc?.name || counterpartName || '').trim();
    if (!displayName) return;
    let entries = normalizeKeyRelationshipEntries(npc.keyRelationships, Math.max(limit, 30), 500);
    const matches = [];
    for (let index = 0; index < entries.length; index += 1) {
        if (familyCounterpartMatches(state, entries[index], counterpartName || displayName, counterpartNpc)) matches.push(index);
    }
    if (matches.length) {
        const first = matches[0];
        const existingRelation = keyRelationshipParts(entries[first]).relation;
        const preservedRelation = familyRole(existingRelation) === familyRole(relation) ? existingRelation : relation;
        entries[first] = displayName + ' - ' + preservedRelation;
        for (let index = matches.length - 1; index >= 1; index -= 1) entries.splice(matches[index], 1);
    } else if (entries.length < limit) {
        entries.push(displayName + ' - ' + relation);
    }
    npc.keyRelationships = normalizeKeyRelationshipEntries(entries, limit, 500);
}

function projectFamilySlotMembers(state, slot, limit) {
    const owner = (state?.npcs || []).find(npc => npc.id === slot?.ownerId);
    if (!owner) return;
    const members = Array.isArray(slot?.memberNames) ? slot.memberNames.slice(0, slot.count) : [];
    if (!members.length) return;

    for (const memberName of members) {
        const memberNpc = familyMemberNpc(state, memberName);
        if (memberNpc && memberNpc.id !== owner.id && !slot.resolvedNpcIds.includes(memberNpc.id) && slot.resolvedNpcIds.length < slot.count) {
            slot.resolvedNpcIds.push(memberNpc.id);
            slot.updatedAt = Date.now();
        }
        if (memberNpc?.id === owner.id) continue;
        upsertFamilyRelationship(state, owner, memberName, memberNpc, slot.relation, limit);
        const reciprocal = memberNpc ? reciprocalFamilyRelation(slot.relation) : '';
        if (memberNpc && reciprocal) upsertFamilyRelationship(state, memberNpc, owner.name, owner, reciprocal, limit);
    }
}

function addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '', playerName = '') {
    const slots = normalizeFamilySlots(state.familySlots, new Set(state.npcs.map(npc => npc.id)));
    const byKey = new Map(slots.map((slot, index) => [familySlotKey(slot.ownerId, slot.relation, slot.twinGroup), index]));
    for (const raw of Array.isArray(facts) ? facts : []) {
        const owner = resolveReference(raw?.owner);
        const relation = String(raw?.relation || '').trim().slice(0, 120);
        const evidence = String(raw?.evidence || '').trim().slice(0, 600);
        const role = familyRole(relation);
        if (!owner || !role || !relation || !evidence) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        const count = Math.max(1, Math.min(20, Math.round(Number(raw?.count) || 1)));
        const memberNames = groundedFamilyMemberNames(raw, count, evidenceContext, owner, playerName);
        const descriptor = String(raw?.descriptor || '').trim().slice(0, 240);
        const twinGroup = String(raw?.twinGroup || '').trim().slice(0, 160);
        const key = familySlotKey(owner.id, relation, twinGroup);
        const index = byKey.get(key);
        if (Number.isInteger(index)) {
            const slot = slots[index];
            slot.count = Math.max(slot.count, count);
            if (memberNames.length) {
                const merged = [...(slot.memberNames || []), ...memberNames];
                const seen = new Set();
                slot.memberNames = merged.filter(name => {
                    const key = normalizeName(name);
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                }).slice(0, slot.count);
            }
            if (descriptor) slot.descriptor = descriptor;
            if (twinGroup) slot.twinGroup = twinGroup;
            slot.evidence = evidence;
            slot.sourceMessageId = sourceMessageId;
            slot.updatedAt = Date.now();
            continue;
        }
        slots.push({
            id: 'family:' + owner.id + ':' + normalizeName(relation).replace(/\s+/g, '_') + ':' + normalizeName(twinGroup || descriptor).replace(/\s+/g, '_'),
            ownerId: owner.id,
            relation,
            count,
            resolvedNpcIds: [],
            memberNames,
            descriptor,
            twinGroup,
            evidence,
            provenance: 'explicit',
            confidence: 1,
            sourceMessageId,
            updatedAt: Date.now(),
        });
        byKey.set(key, slots.length - 1);
    }
    state.familySlots = normalizeFamilySlots(slots, new Set(state.npcs.map(npc => npc.id)));
}

function keyRelationshipToNpc(state, entry) {
    const parts = keyRelationshipParts(entry);
    if (!parts.other) return null;
    return familyMemberNpc(state, parts.other);
}

export function reconcileFamilyGraphState(stateInput, { sourceMessageId = null, dossierLimits = null } = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    const validIds = new Set(state.npcs.map(npc => npc.id));
    const slots = normalizeFamilySlots(state.familySlots, validIds);
    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;
    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));

    // Explicitly named members are durable family canon even when they are not dossiers.
    // Project them into the owner's key relationships first, then let ordinary slot
    // resolution and sibling inference consume any members that already have dossiers.
    for (const slot of slots) projectFamilySlotMembers(state, slot, limit);

    for (const npc of state.npcs) {
        for (const entry of npc.keyRelationships || []) {
            const parts = keyRelationshipParts(entry);
            const other = keyRelationshipToNpc(state, entry);
            if (!other || other.id === npc.id || !familyRole(parts.relation)) continue;
            if (resolveFamilySlotMember(slots, npc.id, parts.relation, other.id)) continue;
            const reciprocal = reciprocalFamilyRelation(parts.relation);
            if (reciprocal) resolveFamilySlotMember(slots, other.id, reciprocal, npc.id);
        }
    }

    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    for (const slot of slots) {
        const resolved = [...new Set(slot.resolvedNpcIds)].filter(id => byId.has(id)).slice(0, slot.count);
        slot.resolvedNpcIds = resolved;
        if (familyRole(slot.relation) !== 'child' || resolved.length < 2) continue;
        const isTwin = Boolean(slot.twinGroup || /\btwins?\b/i.test(slot.descriptor));
        const relation = isTwin ? 'twin sibling' : 'sibling';
        for (let i = 0; i < resolved.length; i += 1) for (let j = i + 1; j < resolved.length; j += 1) {
            const left = byId.get(resolved[i]);
            const right = byId.get(resolved[j]);
            if (!left || !right) continue;
            const edge = { fromId: left.id, toId: right.id, relation, summary: 'Inferred from shared confirmed parent/family slot.', updatedAt: Date.now(), sourceMessageId, provenance: 'inferred', confidence: isTwin ? 0.9 : 0.75, inferred: true };
            if (![...edgeMap.values()].some(existing => {
                const ids = new Set([existing.fromId, existing.toId]);
                return ids.has(left.id) && ids.has(right.id) && /sibling/i.test(existing.relation);
            })) edgeMap.set(socialEdgeKey(edge), edge);
            for (const [owner, other] of [[left, right], [right, left]]) {
                const hasCounterpart = (owner.keyRelationships || []).some(entry => keyRelationshipOtherKey(entry) === normalizeName(other.name));
                const keyRelationshipsLocked = (owner.manualProfileFields || []).includes('keyRelationships');
                if (!keyRelationshipsLocked && !hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);
            }
        }
    }
    state.familySlots = normalizeFamilySlots(slots, validIds);
    state.socialGraph = [...edgeMap.values()].slice(-200);
    state.npcs = state.npcs.map(npc => normalizeNpc(npc));
    return normalizeState(state, state.chatKey);
}

const AGE_CHANGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);
const AGE_BIRTHDAY_CUES = /\b(birthday|turned|turns|turning)\b/i;
const AGE_ELAPSED_CUES = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|several)\s+(?:days?|weeks?|months?|years?)\s+(?:later|passed|have passed|had passed)|\bafter\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?)\b/i;
const AGE_CORRECTION_CUES = /\b(correct(?:s|ed|ion)?|actually|mistaken|mistake|wrong|misstated|rather than|not\s+\d{1,4}[^.!?]{0,30}\bbut\b)\b/i;

function ageEvidenceMentionsTarget(evidence, targetAge) {
    const target = normalizeActualAge(targetAge);
    if (!target) return false;
    const number = target.match(/\d{1,4}/)?.[0] || '';
    if (!number) return false;
    const unit = /\bdays?\b/i.test(target) ? 'day'
        : (/\bweeks?\b/i.test(target) ? 'week'
            : (/\bmonths?\b/i.test(target) ? 'month' : ''));
    if (!unit) return new RegExp('(^|\\D)' + number + '(?!\\d)').test(String(evidence || ''));
    return new RegExp('(^|\\D)' + number + '\\s+' + unit + 's?\\b', 'i').test(String(evidence || ''));
}

function explicitAgeChange(npc, patch, options = {}) {
    const raw = patch?.ageChange;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const current = normalizeActualAge(npc?.age);
    const age = normalizeActualAge(raw.age ?? raw.value);
    const kind = String(raw.kind || '').trim().toLocaleLowerCase();
    const evidence = String(raw.evidence || raw.reason || '').trim().slice(0, 600);
    const context = String(options.profileContext || '');
    if (!current || !age || age === current || !AGE_CHANGE_KINDS.has(kind) || !evidence) return '';
    if (!profileEvidenceGrounded(evidence, context) || !ageEvidenceMentionsTarget(evidence, age)) return '';
    if (kind === 'birthday' && !AGE_BIRTHDAY_CUES.test(evidence)) return '';
    if (kind === 'elapsed' && !AGE_ELAPSED_CUES.test(evidence)) return '';
    if (kind === 'correction' && !AGE_CORRECTION_CUES.test(evidence)) return '';
    return age;
}

const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role', 'birthday']);
const BIRTHDAY_EVIDENCE_CUES = /\b(?:birthday|birth date|date of birth|born(?:\s+on)?|name day|nameday)\b/i;
function birthdayEvidenceGrounded(value, context) {
    const birthday = normalizeBirthday(value);
    const source = String(context || '');
    return Boolean(birthday && source.trim() && BIRTHDAY_EVIDENCE_CUES.test(source) && profileEvidenceGrounded(birthday, source));
}
const CANON_CORRECTION_CUES = /\b(actually|correction|corrected|mistaken|mistake|wrong|misidentified|misstated|in fact|rather than|true (?:species|identity|origin))\b/i;
const CANON_REVELATION_CUES = /\b(reveal(?:s|ed)?|turns out|true (?:species|identity|origin)|secretly|had always been|was born|comes from|originally from|confesses?|admits?)\b/i;
const CANON_ROLE_CHANGE_CUES = /\b(promot(?:ed|ion)|demot(?:ed|ion)|appointed|assigned|reassigned|retired|resigned|dismissed|became|becomes|now serves?|takes? the role|takes? over as|elected|installed as)\b/i;
const CANON_APPEARANCE_CHANGE_CUES = /\b(permanent(?:ly)?|lasting|scar(?:red|ring)?|lost|gained|grew|growth|cut (?:her|his|their) hair|hair (?:was|is) cut|dyed|tattoo(?:ed)?|branded|aged|rejuvenat(?:ed|ion)|transformed permanently|body changed|now has|no longer has)\b/i;
const CANON_SPECIES_CHANGE_CUES = /\b(became|becomes|transformed into|turned into|reborn as|ascended into|changed species|permanently transformed)\b/i;

function canonChangeForField(patch, field) {
    if (!DURABLE_CANON_FIELDS.has(field)) return null;
    return (Array.isArray(patch?.canonChanges) ? patch.canonChanges : []).find(raw =>
        raw && typeof raw === 'object' && !Array.isArray(raw) && String(raw.field || '').trim() === field) || null;
}

function durableCanonDecision(npc, patch, field, incomingValue, options = {}) {
    const incoming = String(incomingValue ?? '').trim();
    const current = String(npc?.[field] ?? '').trim();
    if (!incoming) return false;
    if (options.isBootstrap === true || !current) return true;
    if (evidenceTextKey(incoming, 5000) === evidenceTextKey(current, 5000)) return false;
    const change = canonChangeForField(patch, field);
    if (!change) return false;
    const value = String(change.value ?? change[field] ?? incoming).trim();
    const evidence = String(change.evidence || change.reason || '').trim().slice(0, 700);
    const mode = String(change.mode || '').trim().toLocaleLowerCase();
    const context = String(options.profileContext || '');
    if (!value || evidenceTextKey(value, 5000) !== evidenceTextKey(incoming, 5000) || !evidence || !profileEvidenceGrounded(evidence, context)) return false;
    if (field === 'birthday') {
        return mode === 'correction'
            && birthdayEvidenceGrounded(incoming, context)
            && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }
    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'revelation') return CANON_REVELATION_CUES.test(evidence + ' ' + context);
        if (mode === 'change') return CANON_SPECIES_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }
    if (field === 'role') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'change') return CANON_ROLE_CHANGE_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        return false;
    }
    if (field === 'appearance') {
        if (mode === AGE_PROGRESSION_MODE) return sharedAgeProgressionAllowed(npc, incoming, patch, options.ageProgression);
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        if (mode === 'change') return CANON_APPEARANCE_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }
    if (field === 'background') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'revelation') return CANON_REVELATION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        return false;
    }
    return false;
}

function applyStablePatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
    const limits = normalizeDossierLimits(options.dossierLimits);
    const canonicalName = canonicalPatchName(patch);
    const stringFields = ['name', 'age'];
    for (const field of stringFields) {
        if (locked.has(field)) continue;
        const value = field === 'name'
            ? canonicalName
            : (field === 'age'
                ? normalizeActualAge(patch?.[field])
                : (field === 'apparentAge' ? normalizeApparentAge(patch?.[field]) : String(patch?.[field] ?? '').trim()));
        if (!value) continue;
        if (field === 'age') {
            const current = normalizeActualAge(next.age);
            if (current && current !== value) {
                // Scanner age is sticky once grounded. Only refine ~N to the same exact N.
                // Genuine later corrections/aging remain available through manual dossier edit.
                const exactRefinement = current.startsWith('~') && !value.startsWith('~') && current.slice(1) === value;
                if (!exactRefinement) continue;
            }
        }
        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);
        next[field] = value;
    }
    let changedAge = '';
    if (!locked.has('age')) {
        changedAge = explicitAgeChange(npc, patch, options);
        if (changedAge) next.age = changedAge;
    }
    const progressionProof = progressionEvidence(patch);
    const ageProgression = authorizeAgeProgression(npc, patch, changedAge, {
        evidenceGrounded: Boolean(progressionProof && profileEvidenceGrounded(progressionProof, String(options.profileContext || ''))),
    });
    if (!locked.has('apparentAge')) {
        const apparent = normalizeApparentAge(patch?.apparentAge);
        const currentApparent = normalizeApparentAge(next.apparentAge);
        if (apparent && !currentApparent) next.apparentAge = apparent;
        else if (apparent && apparent === currentApparent) next.apparentAge = apparent;
        else if (apparent && apparentAgeProgressionAllowed(npc, apparent, ageProgression)) next.apparentAge = apparent;
    }
    if (!locked.has('birthday')) {
        const incomingBirthday = normalizeBirthday(patch?.birthday);
        const currentBirthday = normalizeBirthday(npc?.birthday);
        const currentProvenance = normalizeBirthdayProvenance(npc?.birthdayProvenance, currentBirthday);
        const groundedBirthday = incomingBirthday && birthdayEvidenceGrounded(incomingBirthday, String(options.profileContext || ''));
        if (groundedBirthday && (options.isBootstrap === true || !currentBirthday || currentProvenance === 'generated')) {
            next.birthday = incomingBirthday;
            next.birthdayProvenance = 'explicit';
        } else if (incomingBirthday && currentBirthday && normalizeName(incomingBirthday) !== normalizeName(currentBirthday)
            && durableCanonDecision(npc, patch, 'birthday', incomingBirthday, options)) {
            next.birthday = incomingBirthday;
            next.birthdayProvenance = 'explicit';
        } else if (groundedBirthday && normalizeName(incomingBirthday) === normalizeName(currentBirthday) && currentProvenance === 'generated') {
            next.birthdayProvenance = 'explicit';
        }
    }
    for (const field of ['role', 'species', 'background']) {
        if (locked.has(field)) continue;
        const value = String(patch?.[field] ?? '').trim();
        if (durableCanonDecision(npc, patch, field, value, options)) next[field] = value;
    }
    for (const field of ['personality', 'speech']) {
        if (locked.has(field)) continue;
        const value = String(patch?.[field] ?? '').trim();
        if (!value) continue;
        const decision = profileEvolutionDecision(npc, patch, field, value, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, field, options);
        if (decision.apply) next[field] = value;
    }
    if (!locked.has('appearance')) {
        const appearance = String(patch?.appearance ?? '').trim();
        // appearance remains durable canon for both ordinary and form-aware NPCs. A form
        // switch alone never reaches this branch, but a grounded canonChanges.appearance
        // revision may update genuinely shared/common appearance even when forms exist.
        if (appearance && !next.appearance) next.appearance = appearance;
        else if (appearance && durableCanonDecision(npc, patch, 'appearance', appearance, { ...options, ageProgression })) next.appearance = appearance;
    }
    if (!locked.has('appearanceForms')) {
        const incomingForms = normalizeAppearanceForms(patch?.appearanceForms);
        const existingForms = normalizeAppearanceForms(next.appearanceForms);
        const hasBase = existingForms.some(form => normalizeName(form.name) === 'base');
        const wantsBase = normalizeName(patch?.currentForm) === 'base';
        const firstAlternate = !existingForms.length && incomingForms.length > 0;
        const legacyBaseBefore = appearanceScalarIsLegacyBase(npc);
        const previousBaseAppearance = appearanceFormDescription(npc, 'Base');
        // Preserve the legacy ordinary body as Base when alternates first appear. Also
        // repair an already-half-migrated dossier on rescan: if an older scan captured
        // only Beast/another alternate but the new scan explicitly says the NPC ended
        // back in Base, recover Base from the pre-existing canonical appearance.
        if (!hasBase && (firstAlternate || wantsBase) && String(npc.appearance || '').trim()) {
            next.appearanceForms = [...existingForms, { name: 'Base', appearance: String(npc.appearance).trim() }];
        }
        const effectiveFormChanges = legacyBaseBefore && locked.has('appearance')
            ? (Array.isArray(patch?.appearanceFormChanges) ? patch.appearanceFormChanges : []).filter(raw => normalizeName(raw?.name) !== 'base')
            : patch?.appearanceFormChanges;
        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, effectiveFormChanges, String(options.profileContext || ''), ageProgression, npc, patch);

        // v0.4.1 copied the old scalar ordinary appearance into Base for compatibility.
        // If that duplicated Base is authoritatively revised later, keep the legacy scalar
        // synchronized only while it is still the same old Base. Once the scalar diverges
        // into genuine shared/common traits it becomes independent and is never overwritten.
        const revisedBaseAppearance = appearanceFormDescription(next, 'Base');
        if (!locked.has('appearance')
            && legacyBaseBefore
            && previousBaseAppearance
            && revisedBaseAppearance
            && evidenceTextKey(previousBaseAppearance, 5000) !== evidenceTextKey(revisedBaseAppearance, 5000)
            && evidenceTextKey(next.appearance, 5000) === evidenceTextKey(previousBaseAppearance, 5000)) {
            next.appearance = revisedBaseAppearance;
        }
    }
    if (changedAge) {
        const ageProgressionKind = String(patch?.ageChange?.kind || '').trim().toLocaleLowerCase();
        if (ageProgressionKind === 'correction') {
            // A correction changes the chronological reference point but never matures the body.
            next.ageProgressionBaselineAge = changedAge;
        } else if (['birthday', 'elapsed'].includes(ageProgressionKind)) {
            const priorBaseline = normalizeActualAge(npc?.ageProgressionBaselineAge);
            if (!priorBaseline) next.ageProgressionBaselineAge = normalizeActualAge(npc?.age) || changedAge;
            const apparentProgressed = normalizeApparentAge(next.apparentAge) !== normalizeApparentAge(npc?.apparentAge);
            const sharedProgressionRequested = String(canonChangeForField(patch, 'appearance')?.mode || '').trim().toLocaleLowerCase() === AGE_PROGRESSION_MODE;
            const sharedProgressed = sharedProgressionRequested
                && evidenceTextKey(next.appearance, 5000) !== evidenceTextKey(npc?.appearance, 5000);
            const formProgressionRequested = (Array.isArray(patch?.appearanceFormChanges) ? patch.appearanceFormChanges : [])
                .some(raw => String(raw?.mode || '').trim().toLocaleLowerCase() === AGE_PROGRESSION_MODE);
            const formsProgressed = formProgressionRequested
                && JSON.stringify(normalizeAppearanceForms(next.appearanceForms)) !== JSON.stringify(normalizeAppearanceForms(npc?.appearanceForms));
            if (ageProgression.allowed && (apparentProgressed || sharedProgressed || formsProgressed)) {
                next.ageProgressionBaselineAge = changedAge;
            }
        }
    }
    if (!locked.has('aliases')) {
        const safeAliases = (Array.isArray(patch?.aliases) ? patch.aliases : []).filter(alias => humanIdentityCandidate(alias, patch?.role));
        next.aliases = appendUnique(next.aliases, safeAliases, 10);
    }
    if (!locked.has('behaviorProfile') && Array.isArray(patch?.behaviorProfile)) {
        const incoming = appendUnique([], patch.behaviorProfile, limits.behaviorProfile);
        const decision = profileEvolutionDecision(npc, patch, 'behaviorProfile', incoming, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, 'behaviorProfile', options);
        if (decision.apply) next.behaviorProfile = incoming;
    }
    if (!locked.has('mannerisms') && Array.isArray(patch?.mannerisms)) {
        const incoming = appendUnique([], patch.mannerisms, limits.mannerisms);
        const decision = profileEvolutionDecision(npc, patch, 'mannerisms', incoming, options);
        if (decision.queue && decision.change) appendProfileEvolutionEvidence(next, decision.change, 'mannerisms', options);
        if (decision.apply) next.mannerisms = incoming;
    }
    if (!locked.has('keyRelationships') && (Array.isArray(patch?.keyRelationships) || Array.isArray(patch?.keyRelationshipChanges))) {
        const incoming = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
        next.keyRelationships = mergeKeyRelationshipPatch(next.keyRelationships, incoming, patch?.keyRelationshipChanges, limits.keyRelationships, String(options.profileContext || ''));
    }
    return next;
}

function applyLivePatch(npc, patch) {
    const next = structuredClone(npc);
    for (const field of ['mood', 'location', 'goal']) {
        const value = String(patch?.[field] ?? '').trim();
        if (value) next[field] = value;
    }
    const status = normalizeCurrentStatus(patch?.status);
    if (status) next.status = status;
    const requestedForm = String(patch?.currentForm || '').trim().slice(0, 80);
    if (requestedForm) {
        const matchedForm = normalizeAppearanceForms(next.appearanceForms)
            .find(form => normalizeName(form.name) === normalizeName(requestedForm));
        next.currentForm = matchedForm?.name || requestedForm;
    }
    // importance is user/editor-owned durable prioritization. Scanner proposals are ignored;
    // runtime relevance is computed separately and never ratchets this stored value upward.
    return next;
}

function applyDynamicPatch(npc, patch, options = {}) {
    const next = applyLivePatch(npc, patch);
    // relationshipSummary is player-relationship state. It is deliberately deferred to
    // applyRelationshipChange so a blocked/duplicate/unsupported event cannot rewrite it.
    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = normalizeMemoryEntries(patch.memories, limits.memories, 700);
    }
    return next;
}

function relationshipImpactRank(value) {
    return { none: 0, ordinary: 1, meaningful: 2, major: 3, extreme: 4 }[String(value || '').trim()] || 0;
}

function relationshipMilestoneEventQualifies(change, axis, threshold) {
    const requiredImpact = RELATIONSHIP_MILESTONE_REQUIREMENTS[Number(threshold)] || 'extreme';
    if (relationshipImpactRank(change?.impact) < relationshipImpactRank(requiredImpact)) return false;
    const rawWeight = Math.abs(Number(change?.delta?.[axis]) || 0);
    // Milestone minima are evidence invariants. Relationship tier caps may constrain how
    // much raw evidence can be proposed, but must never silently make a gate easier.
    // If a configured cap is below a gate minimum, that gate remains unreachable until
    // an event/configuration can supply the required raw weight.
    const requiredRaw = Math.max(1, Number(RELATIONSHIP_MILESTONE_MIN_RAW[Number(threshold)]) || 1);
    return rawWeight >= requiredRaw;
}

function relationshipInertiaFactor(currentValue, proposedDelta, impact = 'ordinary') {
    const current = Number(currentValue) || 0;
    const delta = Number(proposedDelta) || 0;
    if (!delta) return 0;
    const magnitude = Math.abs(current);
    const deepening = current === 0 || Math.sign(current) === Math.sign(delta);
    if (deepening) {
        // Deepening difficulty is deliberately aligned to the same narrative bands as
        // the 25/50/75/90 milestone gates. Fractional progress carries between events.
        if (magnitude <= 25) return 1;
        if (magnitude <= 50) return 0.8;
        if (magnitude <= 75) return 0.6;
        if (magnitude <= 90) return 0.4;
        return 0.25;
    }
    // Moving back toward neutral remains easier than deepening. Impact-sensitive recovery
    // is intentionally preserved so a relationship can thaw or de-escalate naturally.
    if (impact === 'extreme') return 1;
    if (impact === 'major') {
        if (magnitude < 50) return 1;
        if (magnitude < 70) return 0.9;
        if (magnitude < 85) return 0.8;
        if (magnitude < 95) return 0.7;
        return 0.6;
    }
    if (impact === 'meaningful') {
        if (magnitude < 30) return 1;
        if (magnitude < 50) return 0.9;
        if (magnitude < 70) return 0.8;
        if (magnitude < 85) return 0.65;
        if (magnitude < 95) return 0.5;
        return 0.4;
    }
    if (magnitude < 30) return 1;
    if (magnitude < 50) return 0.85;
    if (magnitude < 70) return 0.7;
    if (magnitude < 85) return 0.55;
    if (magnitude < 95) return 0.4;
    return 0.3;
}

function relationshipAxisLimit(impact) {
    if (impact === 'ordinary') return 1;
    if (impact === 'meaningful') return 2;
    if (impact === 'major') return 3;
    if (impact === 'extreme') return 4;
    return 0;
}

function selectRelationshipAxes(delta, axisLimit, priority = []) {
    if (!axisLimit) return new Set();
    const moving = RELATIONSHIP_AXES.filter(axis => Number(delta?.[axis]) !== 0);
    if (!moving.length) return new Set();
    const ordered = [];
    for (const axis of normalizeRelationshipPriority(priority)) {
        if (moving.includes(axis) && !ordered.includes(axis)) ordered.push(axis);
    }
    const remainder = moving.filter(axis => !ordered.includes(axis)).sort((left, right) =>
        Math.abs(Number(delta[right]) || 0) - Math.abs(Number(delta[left]) || 0)
        || RELATIONSHIP_AXES.indexOf(left) - RELATIONSHIP_AXES.indexOf(right));
    // Legacy/fallback order is deterministic: raw magnitude, then canonical axis order.
    // Equal candidates always fill available slots instead of being rejected as a tied group.
    return new Set([...ordered, ...remainder].slice(0, axisLimit));
}

function relationshipAxisEvidenceText(change, axis) {
    return (change?.axisEvidence?.[axis]?.excerpts || []).join(' ');
}

function relationshipDuplicateEvidenceKey(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase()
        .slice(0, 2400);
}

function relationshipAxisLooksDuplicate(npc, change, axis, { sourceMessageId = null, turn = null } = {}) {
    const currentEvidence = relationshipDuplicateEvidenceKey(relationshipAxisEvidenceText(change, axis));
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        if (Number.isInteger(sourceMessageId) && Number.isInteger(previous.sourceMessageId)
            && previous.sourceMessageId === sourceMessageId) return true;
        if (Number.isInteger(turn) && Number.isInteger(previous.turn) && previous.turn === turn) return true;
        if (!currentEvidence) return false;
        const previousEvidence = relationshipDuplicateEvidenceKey(
            (previous.axisEvidence?.[axis]?.excerpts || []).join(' ') || previous.evidence,
        );
        return Boolean(previousEvidence && previousEvidence === currentEvidence);
    });
}

function relationshipEvidenceSourcesForOptions(options = {}) {
    const explicit = Array.isArray(options.relationshipEvidenceSources) ? options.relationshipEvidenceSources : [];
    if (explicit.length) return explicit.slice(0, 8);
    // Compatibility for direct deterministic callers that predate evidencePolicy plumbing.
    // The new per-axis excerpt contract is still mandatory, and production engine paths pass
    // bounded user/assistant visible/private sources so this fallback cannot cross real source boundaries.
    const legacy = String(options.relationshipContext || '').trim();
    return legacy ? [{ id: 'legacy-context', kind: 'visible', text: legacy }] : [];
}

function relationshipAcceptedEvidenceSummary(change, allowedAxes) {
    const rows = [];
    for (const axis of RELATIONSHIP_AXES) {
        if (!allowedAxes.has(axis)) continue;
        for (const excerpt of change?.axisEvidence?.[axis]?.excerpts || []) if (!rows.includes(excerpt)) rows.push(excerpt);
    }
    return rows.join(' | ').slice(0, 800);
}

function relationshipAcceptedAxisEvidence(change, allowedAxes) {
    return Object.fromEntries(RELATIONSHIP_AXES
        .filter(axis => allowedAxes.has(axis) && change?.axisEvidence?.[axis])
        .map(axis => [axis, change.axisEvidence[axis]]));
}

function relationshipSummarySupported(value, relationship, milestones) {
    const summary = String(value || '').trim();
    if (!summary) return false;
    const rel = normalizeRelationship(relationship || {});
    const positiveStrength = Math.max(0, rel.trust, rel.affection, rel.desire);
    const unlocked = (axis, polarity, threshold) => relationshipMilestoneUnlocked(milestones, axis, polarity, threshold);
    const desireClaims = /\b(madly in love|in love|romantic|romance|sexually|sexual attraction|lust|desire[sd]?|intimate attraction|physically attracted|yearns? for)\b/i;
    const tropeClaims = /\b(possessive|jealous|obsessive|obsessed|would kill|kill anyone|belongs to (?:him|her|them|the player)|unconditionally devoted|utterly devoted)\b/i;
    const absoluteClaims = /\b(indispensable|everything to (?:her|him|them)|cannot live without|can't live without|completely dependent|utterly dependent)\b/i;
    const deepTrustClaims = /\b(deep(?:est)? trust|deeply trusts?|profound trust|unwavering trust|unquestion(?:ing|ed) trust|complete trust|implicit trust)\b/i;
    const exceptionalTrustClaims = /\b(absolute trust|unbreakable trust|trusts? (?:him|her|them|the player) with (?:her|his|their) life|without reservation)\b/i;
    const deepAffectionClaims = /\b(deep affection|deeply attached|profound attachment|one of (?:her|his|their) most important people)\b/i;
    const exceptionalAffectionClaims = /\b(inseparable|irreplaceable|life-defining bond|devoted to (?:him|her|them|the player))\b/i;
    const deepDistrustClaims = /\b(deep distrust|profound distrust|deeply distrusts?|cannot trust (?:him|her|them|the player) at all)\b/i;
    const deepDislikeClaims = /\b(deep hatred|profound hatred|deep resentment|utterly hates?)\b/i;
    if (rel.desire < 30 && desireClaims.test(summary)) return false;
    if (tropeClaims.test(summary)) return false;
    if (positiveStrength < 70 && absoluteClaims.test(summary)) return false;
    if (deepTrustClaims.test(summary) && !unlocked('trust', 1, 50)) return false;
    if (exceptionalTrustClaims.test(summary) && !unlocked('trust', 1, 75)) return false;
    if (deepAffectionClaims.test(summary) && !unlocked('affection', 1, 50)) return false;
    if (exceptionalAffectionClaims.test(summary) && !unlocked('affection', 1, 75)) return false;
    if (deepDistrustClaims.test(summary) && !unlocked('trust', -1, 50)) return false;
    if (deepDislikeClaims.test(summary) && !unlocked('affection', -1, 50)) return false;
    return true;
}

function relationshipDeltaForPatch(patch, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)
        ? patch.relationshipChange : null;
    const reasons = [];
    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };
    if (!raw) return { evaluated: false, impactValid: false, impact: 'none', proposed: zero, delta: zero, axisEvidence: {}, priority: [], evidence: '', reason: '', reasons, hasRawMovement: false };
    const impactText = String(raw.impact || '').trim();
    const impactValid = IMPACTS.has(impactText);
    const impact = impactValid ? impactText : 'none';
    const proposedRaw = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};
    const proposed = { ...zero };
    const delta = { ...zero };
    const effectiveCaps = normalizeRelationshipCaps(caps);
    const cap = impact === 'none' ? 0 : Number(effectiveCaps[impact] ?? 0);
    let hasRawMovement = false;
    for (const key of Object.keys(proposedRaw)) {
        if (!RELATIONSHIP_AXES.includes(String(key))) reasons.push('proposal:unknown-axis:' + String(key).slice(0, 40));
    }
    for (const axis of RELATIONSHIP_AXES) {
        if (!Object.prototype.hasOwnProperty.call(proposedRaw, axis)) continue;
        const number = Number(proposedRaw[axis]);
        if (!Number.isFinite(number)) {
            hasRawMovement = true;
            reasons.push(axis + ':non-finite');
            continue;
        }
        const rounded = Math.round(number);
        proposed[axis] = rounded;
        if (!rounded) continue;
        hasRawMovement = true;
        delta[axis] = Math.max(-cap, Math.min(cap, rounded));
        if (delta[axis] !== rounded) reasons.push(axis + ':cap-clamped');
    }

    const rawAxisEvidence = raw.axisEvidence && typeof raw.axisEvidence === 'object' && !Array.isArray(raw.axisEvidence) ? raw.axisEvidence : {};
    for (const key of Object.keys(rawAxisEvidence)) if (!RELATIONSHIP_AXES.includes(String(key))) reasons.push('proposal:unknown-axis-evidence:' + String(key).slice(0, 40));
    const axisEvidence = {};
    const axisEvidenceStatus = {};
    for (const axis of RELATIONSHIP_AXES) {
        if (!delta[axis]) continue;
        const item = rawAxisEvidence[axis];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            axisEvidenceStatus[axis] = 'missing-axis-evidence';
            continue;
        }
        const rawExcerpts = item.excerpts;
        const explanation = String(item.explanation || '').trim().slice(0, 800);
        if (!Array.isArray(rawExcerpts) || rawExcerpts.length < 1 || rawExcerpts.length > 3
            || rawExcerpts.some(excerpt => typeof excerpt !== 'string' || !excerpt.trim())) {
            axisEvidenceStatus[axis] = 'malformed-axis-evidence';
            axisEvidence[axis] = { excerpts: [], explanation };
            continue;
        }
        const excerpts = rawExcerpts.map(excerpt => String(excerpt).trim().slice(0, 800));
        axisEvidence[axis] = { excerpts, explanation };
        axisEvidenceStatus[axis] = explanation ? 'valid' : 'missing-explanation';
    }

    let priority = [];
    if (raw.priority != null) {
        if (!Array.isArray(raw.priority)) reasons.push('priority:malformed');
        else {
            for (const entry of raw.priority) {
                const axis = String(entry || '').trim().toLocaleLowerCase();
                if (!RELATIONSHIP_AXES.includes(axis)) { reasons.push('priority:unknown-axis:' + axis.slice(0, 40)); continue; }
                if (!delta[axis]) { reasons.push('priority:nonmoving-axis:' + axis); continue; }
                if (!priority.includes(axis)) priority.push(axis);
            }
        }
    }
    priority = normalizeRelationshipPriority(priority);
    return {
        evaluated: raw.evaluated === true,
        impactValid,
        impact,
        proposed,
        delta,
        axisEvidence: normalizeRelationshipAxisEvidence(axisEvidence),
        axisEvidenceStatus,
        priority,
        evidence: String(raw.evidence || '').trim().slice(0, 800),
        reason: String(raw.reason || '').trim().slice(0, 800),
        reasons,
        hasRawMovement,
        verifiedSources: {},
    };
}

function relationshipAxisReasons(reasons = []) {
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, reasons
        .filter(reason => String(reason).startsWith(axis + ':'))
        .map(reason => String(reason).slice(axis.length + 1))]).filter(([, rows]) => rows.length));
}

function relationshipDiagnostic(npc, next, change, options, reasons = [], unlocks = []) {
    const event = {
        impact: change.impact, reason: change.reason, evidence: change.evidence,
        before: npc.relationship, after: next.relationship,
        proposed: change.proposed || change.delta,
        capped: change.delta,
        applied: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, (next.relationship?.[axis] || 0) - (npc.relationship?.[axis] || 0)])),
        progressBefore: npc.relationshipProgress, progressAfter: next.relationshipProgress,
        axisEvidence: change.axisEvidence || {}, priority: change.priority || [], verifiedSources: change.verifiedSources || {},
        axisReasons: relationshipAxisReasons(reasons),
        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),
    };
    return { ...next, relationshipDiagnostics: normalizeRelationshipDiagnostics([...(npc.relationshipDiagnostics || []), event]) };
}

function relationshipEvaluationDiagnostic(npc, patch, options = {}) {
    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)
        ? patch.relationshipChange : null;
    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };
    if (!raw) {
        return relationshipDiagnostic(npc, npc, {
            impact: 'none', proposed: zero, delta: zero, axisEvidence: {}, priority: [], verifiedSources: {}, evidence: '',
            reason: 'Scanner omitted relationship evaluation for an exchange-active NPC.',
        }, options, ['evaluation-missing']);
    }
    const proposal = relationshipDeltaForPatch(patch, options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS);
    const rawDelta = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};
    const hasRawDelta = RELATIONSHIP_AXES.some(axis => Number(rawDelta?.[axis]) !== 0);
    const reason = String(raw.reason || '').trim().slice(0, 800);
    if (proposal.evaluated && proposal.impactValid && proposal.impact === 'none' && !hasRawDelta && reason) {
        return relationshipDiagnostic(npc, npc, { ...proposal, proposed: zero, delta: zero, reason }, options, ['evaluated-no-change']);
    }
    const diagnosticReason = proposal.evaluated
        ? (reason || 'Scanner returned an incomplete relationship evaluation.')
        : 'Scanner omitted the required relationshipChange.evaluated flag for an exchange-active NPC.';
    const diagnosticReasons = [...proposal.reasons, proposal.evaluated ? 'evaluation-invalid' : 'evaluation-missing'];
    return relationshipDiagnostic(npc, npc, { ...proposal, reason: diagnosticReason }, options, diagnosticReasons);
}

function relationshipAxisProvenance(change, options, delta, reasons) {
    const filtered = { ...delta };
    const sources = relationshipEvidenceSourcesForOptions(options);
    const verifiedSources = {};
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(filtered[axis])) continue;
        const status = change.axisEvidenceStatus?.[axis] || 'missing-axis-evidence';
        if (status !== 'valid') {
            filtered[axis] = 0;
            reasons.push(axis + ':' + status);
            continue;
        }
        if (!sources.length) {
            filtered[axis] = 0;
            reasons.push(axis + ':no-permitted-evidence-source');
            continue;
        }
        const matched = [];
        let valid = true;
        for (const excerpt of change.axisEvidence?.[axis]?.excerpts || []) {
            const provenance = relationshipEvidenceExcerptMatch(excerpt, sources);
            if (!provenance) { valid = false; break; }
            const label = provenance.sourceId + ':' + provenance.kind;
            if (!matched.includes(label)) matched.push(label);
        }
        if (!valid) {
            filtered[axis] = 0;
            reasons.push(axis + ':unverifiable-excerpt');
            continue;
        }
        verifiedSources[axis] = matched;
    }
    return { delta: filtered, verifiedSources };
}

function applyRelationshipChange(npc, patch, options = {}) {
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (!change.evaluated || !change.impactValid || change.impact === 'none') return relationshipEvaluationDiagnostic(npc, patch, { ...options, relationshipCaps: caps });
    const reasons = [...change.reasons];
    if (!change.hasRawMovement) return relationshipDiagnostic(npc, npc, change, options, [...reasons, 'evaluation-invalid']);
    if (!RELATIONSHIP_AXES.some(axis => Number(change.delta[axis]) !== 0)) {
        return relationshipDiagnostic(npc, npc, change, options, reasons.length ? reasons : ['evaluation-invalid']);
    }

    let filteredDelta = { ...change.delta };
    const provenance = relationshipAxisProvenance(change, options, filteredDelta, reasons);
    filteredDelta = provenance.delta;
    change.verifiedSources = provenance.verifiedSources;
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(filteredDelta[axis])) continue;
        if (!relationshipAxisLooksDuplicate(npc, { ...change, delta: filteredDelta }, axis, options)) continue;
        filteredDelta[axis] = 0;
        reasons.push(axis + ':duplicate');
    }
    if (!RELATIONSHIP_AXES.some(axis => Number(filteredDelta[axis]) !== 0)) {
        if (!reasons.length) reasons.push('no-valid-axis');
        return relationshipDiagnostic(npc, npc, change, options, reasons);
    }

    const axisLimit = relationshipAxisLimit(change.impact);
    const allowedAxes = selectRelationshipAxes(filteredDelta, axisLimit, change.priority);
    for (const axis of RELATIONSHIP_AXES) if (filteredDelta[axis] && !allowedAxes.has(axis)) reasons.push(axis + ':axis-limit');

    const next = structuredClone(npc);
    const baseline = normalizeRelationship(next.relationship);
    const priorProgress = normalizeRelationshipProgress(next.relationshipProgress);
    const updated = { ...baseline };
    const progress = { ...priorProgress };
    const actualDelta = { trust: 0, affection: 0, desire: 0, tension: 0 };
    const crossings = [];
    let acceptedEvidence = false;

    for (const axis of RELATIONSHIP_AXES) {
        const raw = allowedAxes.has(axis) ? Number(filteredDelta[axis]) || 0 : 0;
        if (!raw) continue;
        acceptedEvidence = true;
        const weighted = raw * relationshipInertiaFactor(baseline[axis], raw, change.impact);
        let accumulated = priorProgress[axis] + weighted;
        const baselineValue = baseline[axis];
        const baselinePolarity = Math.sign(baselineValue);
        const proposedPolarity = Math.sign(raw);

        if (baselinePolarity === proposedPolarity) {
            const lockedBoundary = RELATIONSHIP_MILESTONE_THRESHOLDS.find(threshold =>
                Math.abs(baselineValue) === threshold
                && !relationshipMilestoneUnlocked(next.relationshipMilestones, axis, proposedPolarity, threshold));
            if (lockedBoundary) {
                if (!relationshipMilestoneEventQualifies({ ...change, delta: filteredDelta }, axis, lockedBoundary, caps)) {
                    accumulated = 0;
                    reasons.push(axis + ':gate-tier');
                } else if (!crossings.some(entry => entry.axis === axis && entry.polarity === proposedPolarity && entry.threshold === lockedBoundary)) {
                    crossings.push({ axis, polarity: proposedPolarity, threshold: lockedBoundary });
                }
            }
        }

        let whole = Math.trunc(accumulated);
        let candidate = Math.max(-100, Math.min(100, baselineValue + whole));
        let blockedAt = null;
        if (Math.abs(candidate) >= Math.abs(baselineValue)) {
            const movementPolarity = Math.sign(candidate) || proposedPolarity;
            const lowMagnitude = baselinePolarity === movementPolarity ? Math.abs(baselineValue) : 0;
            let highMagnitude = Math.abs(candidate);
            for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
                if (threshold < lowMagnitude || highMagnitude < threshold) continue;
                if (relationshipMilestoneUnlocked(next.relationshipMilestones, axis, movementPolarity, threshold)) continue;
                const qualifies = relationshipMilestoneEventQualifies({ ...change, delta: filteredDelta }, axis, threshold, caps);
                if (highMagnitude === threshold) {
                    if (lowMagnitude < threshold && qualifies && !crossings.some(entry => entry.axis === axis && entry.polarity === movementPolarity && entry.threshold === threshold)) {
                        crossings.push({ axis, polarity: movementPolarity, threshold });
                    }
                    break;
                }
                if (qualifies) {
                    if (!crossings.some(entry => entry.axis === axis && entry.polarity === movementPolarity && entry.threshold === threshold)) crossings.push({ axis, polarity: movementPolarity, threshold });
                    continue;
                }
                blockedAt = threshold;
                if (!reasons.includes(axis + ':gate-tier')) reasons.push(axis + ':gate-tier');
                candidate = movementPolarity * threshold;
                highMagnitude = threshold;
                break;
            }
        }

        whole = candidate - baselineValue;
        let remainder = accumulated - whole;
        const finalPolarity = Math.sign(candidate);
        const lockedFinalBoundary = finalPolarity && RELATIONSHIP_MILESTONE_THRESHOLDS.find(threshold =>
            Math.abs(candidate) === threshold
            && !relationshipMilestoneUnlocked(next.relationshipMilestones, axis, finalPolarity, threshold)
            && !crossings.some(entry => entry.axis === axis && entry.polarity === finalPolarity && entry.threshold === threshold));
        if (blockedAt || (lockedFinalBoundary && Math.sign(remainder) === finalPolarity)) remainder = 0;
        if ((candidate >= 100 && remainder > 0) || (candidate <= -100 && remainder < 0)) remainder = 0;
        if (Math.abs(remainder) < 0.000001) remainder = 0;

        updated[axis] = candidate;
        actualDelta[axis] = whole;
        progress[axis] = Number(Math.max(-0.999999, Math.min(0.999999, remainder)).toFixed(6));
    }

    if (!acceptedEvidence) return relationshipDiagnostic(npc, npc, change, options, reasons);

    next.relationship = updated;
    next.relationshipProgress = normalizeRelationshipProgress(progress);
    const acceptedEvidenceText = relationshipAcceptedEvidenceSummary(change, allowedAxes);
    const acceptedAxisEvidence = relationshipAcceptedAxisEvidence(change, allowedAxes);
    const acceptedVerifiedSources = Object.fromEntries(RELATIONSHIP_AXES
        .filter(axis => allowedAxes.has(axis) && change.verifiedSources?.[axis]?.length)
        .map(axis => [axis, change.verifiedSources[axis]]));
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: acceptedEvidenceText || change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });

    const evidenceEvent = {
        delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, allowedAxes.has(axis) ? filteredDelta[axis] : 0])),
        impact: change.impact,
        evidence: acceptedEvidenceText || change.evidence,
        reason: change.reason,
        axisEvidence: acceptedAxisEvidence,
        priority: change.priority,
        verifiedSources: acceptedVerifiedSources,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };
    next.relationshipEvidenceHistory = normalizeRelationshipEvidenceHistory([...(next.relationshipEvidenceHistory || []), evidenceEvent]);

    const visibleChanged = Object.values(actualDelta).some(Boolean);
    if (visibleChanged) {
        const event = { ...evidenceEvent, delta: actualDelta };
        next.lastRelationshipChange = event;
        next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    }

    const progressChanged = RELATIONSHIP_AXES.some(axis => Number(next.relationshipProgress?.[axis] || 0) !== Number(priorProgress?.[axis] || 0));
    const relationshipStateChanged = visibleChanged || progressChanged || crossings.length > 0;
    const summary = String(patch?.relationshipSummary ?? '').trim();
    if (summary && relationshipStateChanged && relationshipSummarySupported(summary, next.relationship, next.relationshipMilestones)) {
        next.relationshipSummary = summary.slice(0, 1000);
    }
    if (progressChanged && !visibleChanged) reasons.push('fractional-progress');
    const partialAxisRejection = reasons.some(reason => /^(?:trust|affection|desire|tension):(?:non-finite|missing-axis-evidence|malformed-axis-evidence|missing-explanation|no-permitted-evidence-source|unverifiable-excerpt|duplicate|axis-limit)$/.test(reason));
    if (relationshipStateChanged && partialAxisRejection && !reasons.includes('partial-applied')) reasons.push('partial-applied');
    if (!reasons.length) reasons.push(relationshipStateChanged ? 'applied' : 'no-visible-change');
    return relationshipDiagnostic(npc, next, change, options, reasons, crossings);
}
const AFFIRMATIVE_DEATH_CUE = /\b(?:dies|died|dead|killed|slew|slain|murdered|lifeless|no pulse|stopped breathing|ceased breathing)\b/i;
const AFFIRMATIVE_LIVING_CUE = /\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|not dead|was not dead|did not die|never died|returns? alive|returned alive|emerges? alive|emerged alive)\b/i;
const LIFE_ASSERTION_BLOCKER = new Set(['if', 'unless', 'whether', 'might', 'may', 'could', 'would', 'will', 'shall', 'should', 'perhaps', 'possibly', 'maybe', 'likely', 'expected', 'expect', 'expects', 'predicted', 'predicts', 'almost', 'nearly', 'not', 'never']);
function lifeEvidenceText(value) {
    return String(value || '').normalize('NFKC')
        .replace(/[’]/g, "'")
        .replace(/\b(\w+)n['’]t\b/gi, '$1 not')
        .replace(/\s+/g, ' ')
        .trim();
}
function lifeEvidenceComparable(value) {
    return lifeEvidenceText(value).toLocaleLowerCase();
}
function lifeEvidenceKey(value) {
    return lifeEvidenceComparable(value).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function escapedLifeName(value) {
    return lifeEvidenceKey(value).split(/\s+/).filter(Boolean)
        .map(token => token.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('\\s+');
}
function lifeAssertionBlocked(text, index) {
    const prefix = text.slice(0, Math.max(0, index)).trim().split(/\s+/).filter(Boolean).slice(-6);
    return prefix.some(word => LIFE_ASSERTION_BLOCKER.has(word.replace(/[^\p{L}\p{N}]+/gu, '')));
}
function clauseAssertsNpcLiving(clause, variant) {
    const text = lifeEvidenceComparable(clause);
    const name = escapedLifeName(variant);
    if (!text || !name) return false;
    const patterns = [
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|remains|remained|appears|appeared)\\s+(?:still\\s+)?alive\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:(?:has|had)\\s+)?surviv(?:ed|es)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|has\\s+been|had\\s+been)\\s+(?:revived|resurrected)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:returns?|returned|emerges?|emerged)\\s+alive\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was)\\s+not\\s+dead\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:did|does)\\s+not\\s+die\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+never\\s+died\\b', 'i'),
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match && !lifeAssertionBlocked(text, match.index || 0)) return true;
    }
    return false;
}
function clauseAssertsNpcDeath(clause, variant) {
    const text = lifeEvidenceComparable(clause);
    const name = escapedLifeName(variant);
    if (!text || !name || clauseAssertsNpcLiving(clause, variant)) return false;
    const patterns = [
        new RegExp('\\b' + name + '\\b\\s+(?:(?:has|had)\\s+)?(?:died|dies)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|lay|lies|remained|remains|appeared|appears)\\s+(?:already\\s+)?(?:dead|lifeless)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:has|had)\\s+no\\s+pulse\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:stopped|ceased)\\s+breathing\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:was|is|has\\s+been|had\\s+been)\\s+(?:killed|slain|murdered)\\b', 'i'),
        new RegExp("\\b(?:killed|slew|slain|murdered)\\s+(?:the\\s+)?" + name + "\\b(?!\\s*'s\\b)", 'i'),
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match && !lifeAssertionBlocked(text, match.index || 0)) return true;
    }
    return false;
}
function npcLifeVariants(npc) {
    return [npc?.name, ...(npc?.aliases || [])].map(value => String(value || '').trim()).filter(Boolean);
}
function lifeEvidenceClauses(value) {
    return lifeEvidenceText(value).split(/[.!?;\n]+|\b(?:but|however|although|yet)\b/i).map(item => item.trim()).filter(Boolean);
}
function affirmativeDeathEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    const variants = npcLifeVariants(npc);
    if (!proof || !variants.length || !AFFIRMATIVE_DEATH_CUE.test(proof)) return false;
    if (!variants.some(value => clauseAssertsNpcDeath(proof, value))) return false;
    const clauses = lifeEvidenceClauses(context);
    if (!clauses.length) return true;
    return clauses.some(clause => variants.some(value => clauseAssertsNpcDeath(clause, value)) && profileEvidenceGrounded(proof, clause));
}
function affirmativeLivingReturnEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    const variants = npcLifeVariants(npc);
    if (!proof || !variants.length || !AFFIRMATIVE_LIVING_CUE.test(proof)) return false;
    if (!variants.some(value => clauseAssertsNpcLiving(proof, value))) return false;
    const clauses = lifeEvidenceClauses(context);
    if (!clauses.length) return true;
    return clauses.some(clause => variants.some(value => clauseAssertsNpcLiving(clause, value)) && profileEvidenceGrounded(proof, clause));
}


function applyLifeState(npc, patch, options = {}) {
    const next = structuredClone(npc);
    const lifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();
    const certainty = String(patch?.lifeStateCertainty || '').trim();
    const reason = String(patch?.lifeStateReason || '').trim();
    const policy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;
    const lifeContext = policy?.detected
        ? [policy.visibleText, policy.worldStateText].filter(Boolean).join('\n')
        : String(options.profileContext || '');
    const grounded = Boolean(reason && (!lifeContext.trim() || profileEvidenceGrounded(reason, lifeContext)));
    const deathCue = affirmativeDeathEvidence(npc, reason, lifeContext);
    const livingReturnCue = affirmativeLivingReturnEvidence(npc, reason, lifeContext);
    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'
        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');

    // A dead/archived dossier may return only through the explicit livingReturn channel,
    // and that channel must point back to visible/world current-continuity evidence.
    if (patch?.livingReturn === true) {
        if (!grounded || !livingReturnCue) return next;
        next.archived = false;
        next.archiveReason = '';
        next.archivedAt = null;
        next.lifeState = 'alive';
        next.lifeStateCertainty = certainty || 'explicit';
        next.lifeStateReason = reason;
        return next;
    }

    if (lifeState === 'dead') {
        if (!['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase()) || !grounded || !deathCue) return next;
        next.lifeState = 'dead';
        next.lifeStateCertainty = certainty;
        next.lifeStateReason = reason;
        next.archived = true;
        next.archiveReason = 'deceased';
        next.archivedAt = Date.now();
        next.present = false;
        next.worldActive = false;
        return next;
    }

    // Merely outputting alive must never resurrect a confirmed dead dossier.
    if (lifeState === 'alive' && wasDead) return next;
    if (['alive', 'unknown'].includes(lifeState) && grounded) {
        next.lifeState = lifeState;
        next.lifeStateCertainty = certainty;
        next.lifeStateReason = reason;
    }
    return next;
}

function socialEdgeKey(edge) {
    const ids = [String(edge.fromId || ''), String(edge.toId || '')].sort();
    return `${ids[0]}\0${ids[1]}\0${normalizeName(edge.relation)}`;
}

function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([npc?.name, ...(npc?.aliases || []), patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : []), patch?.role].map(value => String(value || '').trim()).filter(Boolean))];
}

const ACTIVITY_SHORT_IDENTITY_STOP = new Set([
    'a', 'an', 'the', 'of', 'de', 'da', 'del', 'di', 'la', 'le', 'van', 'von',
    'mr', 'mrs', 'ms', 'miss', 'sir', 'dame', 'lady', 'lord', 'dr', 'doctor',
    'captain', 'commander', 'lieutenant', 'sergeant', 'master', 'mistress',
    'father', 'mother', 'sister', 'brother', 'elder', 'saint', 'st',
    'may', 'will', 'can', 'shall',
]);
function shortActivityIdentityTokens(value) {
    return String(value || '').normalize('NFKC').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
}
function shortActivityIdentityCandidates(npc) {
    const out = [];
    const seen = new Set();
    for (const value of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {
        const tokens = shortActivityIdentityTokens(value);
        if (tokens.length < 2) continue;
        for (const token of tokens) {
            const key = normalizeName(token);
            if (!key || key.length < 3 || GENERIC_REFERENCES.has(key) || ACTIVITY_SHORT_IDENTITY_STOP.has(key) || seen.has(key)) continue;
            seen.add(key);
            out.push(token);
        }
    }
    return out;
}
function shortActivityIdentityUnique(state, npc, candidate) {
    const key = normalizeName(candidate);
    if (!key) return false;
    return !(state?.npcs || []).some(other => {
        if (!other || other.id === npc?.id) return false;
        return [other.name, ...(Array.isArray(other.aliases) ? other.aliases : [])].some(value =>
            shortActivityIdentityTokens(value).some(token => normalizeName(token) === key));
    });
}
function identityTokenMention(text, candidate) {
    const clean = String(candidate || '').trim();
    if (!clean) return false;
    const upper = clean.toLocaleUpperCase();
    return shortActivityIdentityTokens(text).some(observed => observed === clean || observed === upper);
}
function visibleShortActivityIdentityMention(state, npc, visibleText = '') {
    for (const candidate of shortActivityIdentityCandidates(npc)) {
        if (!shortActivityIdentityUnique(state, npc, candidate)) continue;
        if (identityTokenMention(visibleText, candidate)) return true;
    }
    return false;
}
function shortActivityIdentityScope(state, npc, policy) {
    for (const candidate of shortActivityIdentityCandidates(npc)) {
        if (!shortActivityIdentityUnique(state, npc, candidate)) continue;
        if (identityTokenMention(policy?.visibleText, candidate)) return 'visible';
        if (identityTokenMention(policy?.worldStateText, candidate)) return 'world';
        if (identityTokenMention(policy?.innerChatterText, candidate)) return 'inner';
        if (identityTokenMention(policy?.excludedText, candidate)) return 'excluded';
    }
    return '';
}
function restrictedEvidenceScope(state, patch, policy) {
    if (!policy?.detected) return 'unrestricted';
    const patchId = String(patch?.id || '').trim();
    const existing = patchId ? state.npcs.find(npc => npc.id === patchId) : findNpcByReference(state, patch?.name || '');
    return evidenceReferenceScope(policy, npcEvidenceVariants(existing, patch));
}
function referenceAllowedForActivity(state, reference, policy, channel = 'exchangeActive', patches = [], currentAdmissionText = '') {
    const npc = findNpcByReference(state, reference);
    const patch = activityPatchForReference(state, reference, patches);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const variants = npc ? npcEvidenceVariants(npc, patch) : [reference, patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])].filter(Boolean);
    const sections = structuredReferenceSections(policy, variants);
    // A final structured Off-Screen placement contradicts inChat at the end, but it does not
    // erase exchangeActive participation that may have occurred earlier in the same exchange.
    if (channel === 'inChat' && sections.offscreen && !sections.present) return false;
    if (patch && activityEvidenceVerified(patch, channel, visible)) return true;
    // A valid nonzero relationship proposal already carries exact CURRENT-visible evidence.
    // Let that evidence prove exchange participation as well so identity/presence hardening
    // cannot suppress otherwise-valid relationship scoring merely because an older model or
    // deterministic fixture omitted the newer activityEvidence field.
    if (channel === 'exchangeActive' && patch && relationshipChangeCurrentEvidenceVerified(patch, visible)) return true;
    // Preserve v0.4.20 diagnostic observability for an already-present established NPC:
    // a malformed nonzero proposal must reach relationshipDeltaForPatch so it can be
    // rejected with precise reasons such as missing-axis-evidence. This fallback cannot
    // create a new NPC, cannot establish final presence, and cannot authorize movement.
    const hasRawRelationshipProposal = patch?.relationshipChange?.evaluated === true
        && RELATIONSHIP_AXES.some(axis => Number(patch?.relationshipChange?.delta?.[axis]) !== 0);
    if (channel === 'exchangeActive' && npc?.present === true && hasRawRelationshipProposal) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));
    const shortVisible = npc ? visibleShortActivityIdentityMention(state, npc, visible) : false;
    if (exactVisible || shortVisible) return true;
    // Production always supplies current visible text. Keep empty-context direct callers
    // backward-compatible without weakening real chat provenance checks.
    return !visible && !policy?.detected;
}
function referenceAllowedForWorldActivity(state, reference, policy, patches = [], currentAdmissionText = '') {
    const npc = findNpcByReference(state, reference);
    const patch = activityPatchForReference(state, reference, patches);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const variants = npc ? npcEvidenceVariants(npc, patch) : [reference, patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])].filter(Boolean);
    const sections = structuredReferenceSections(policy, variants);
    // Structured final placement is authoritative only as a structural section invariant:
    // Present must not become world-active merely because the name exists in World_State.
    if (sections.present && !sections.offscreen) return false;
    if (sections.offscreen) return true;
    // Pre-sectioned World_State formats historically used the whole block as explicit
    // off-screen live-state context. Preserve that compatibility only when no Present or
    // Off-Screen placement section exists anywhere in the current World_State.
    if (sections.legacyWorld) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;
    // A visible name alone says only that the NPC was mentioned. It cannot establish that
    // the NPC is currently active somewhere off-screen. Plain-narrative worldActive claims
    // therefore require the model's exact current-visible activityEvidence. Structured
    // Off-Screen placement and legacy unsectioned World_State remain the only non-quote paths.
    return !visible && !policy?.detected;
}
function identityEvidenceRecord(patch) {
    const raw = patch?.identityEvidence;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}
function currentVisibleEvidenceText(policy, currentAdmissionText = '') {
    return String(policy?.visibleText || currentAdmissionText || '').trim();
}
function currentVisibleExcerptSources(visibleText = '') {
    const text = String(visibleText || '').trim();
    return text ? [{ id: 'current-visible', kind: 'visible', text }] : [];
}
function verifiedCurrentVisibleExcerpts(record, visibleText = '') {
    const excerpts = Array.isArray(record?.excerpts) ? record.excerpts.map(value => String(value || '').trim()).filter(Boolean) : [];
    if (!excerpts.length || excerpts.length > 3) return false;
    const sources = currentVisibleExcerptSources(visibleText);
    return Boolean(sources.length && excerpts.every(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources)));
}
function identityEvidenceVerified(patch, policy, currentAdmissionText = '') {
    const record = identityEvidenceRecord(patch);
    if (!record) return null;
    const anchor = humanIdentityCandidate(record.anchor, patch?.role);
    const explanation = String(record.explanation || '').trim();
    const canonicalName = canonicalPatchName(patch, []);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    if (!anchor || !explanation || !canonicalName || !visible) return null;
    if (!containsNormalizedPhrase(canonicalName, anchor) && normalizeName(canonicalName) !== normalizeName(anchor)) return null;
    if (!containsNormalizedPhrase(visible, anchor)) return null;
    if (!verifiedCurrentVisibleExcerpts(record, visible)) return null;
    return { anchor, explanation };
}
function activityEvidenceVerified(patch, channel, visibleText = '') {
    const activity = patch?.activityEvidence;
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return false;
    const record = activity?.[channel];
    return Boolean(record && typeof record === 'object' && !Array.isArray(record) && verifiedCurrentVisibleExcerpts(record, visibleText));
}
function relationshipChangeCurrentEvidenceVerified(patch, visibleText = '') {
    const change = patch?.relationshipChange;
    if (!change || typeof change !== 'object' || Array.isArray(change)) return false;
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(change?.delta?.[axis])) continue;
        const record = change?.axisEvidence?.[axis];
        if (record && verifiedCurrentVisibleExcerpts(record, visibleText)) return true;
    }
    return false;
}
function activityPatchForReference(state, reference, patches = []) {
    const direct = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (direct) return direct;
    const npc = findNpcByReference(state, reference);
    if (!npc) return null;
    return (Array.isArray(patches) ? patches : []).find(item => String(item?.id || '').trim() === npc.id || patchReferenceMatches(item, npc.name)) || null;
}
function structuredReferenceSections(policy, variants = []) {
    const values = [...new Set((Array.isArray(variants) ? variants : [variants]).map(value => String(value || '').trim()).filter(Boolean))];
    const present = values.some(value => containsNormalizedPhrase(policy?.worldPresentText || '', value));
    const offscreen = values.some(value => containsNormalizedPhrase(policy?.worldOffscreenText || '', value));
    const hasPlacementSections = Boolean(String(policy?.worldPresentText || '').trim() || String(policy?.worldOffscreenText || '').trim());
    const legacyWorld = !hasPlacementSections && values.some(value => containsNormalizedPhrase(policy?.worldStateText || '', value));
    return { present, offscreen, legacyWorld };
}
function identityAnchorUnique(state, patch, anchor, patches = []) {
    const key = normalizeName(anchor);
    if (!key) return false;
    const owners = new Set();
    for (const npc of state?.npcs || []) {
        for (const label of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {
            if (containsNormalizedPhrase(label, anchor)) owners.add('npc:' + npc.id);
        }
    }
    for (const candidate of Array.isArray(patches) ? patches : []) {
        const name = canonicalPatchName(candidate, []);
        if (!name || !containsNormalizedPhrase(name, anchor)) continue;
        owners.add('patch:' + normalizeName(name));
    }
    const target = 'patch:' + normalizeName(canonicalPatchName(patch, []));
    return owners.size === 1 && owners.has(target);
}
function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = '') {
    const source = String(currentAdmissionText || '').trim();
    if (!source) return true;
    const variants = [...new Set([
        patch?.name,
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
        patch?.role,
    ].map(value => String(value || '').trim()).filter(value => value && !isTechnicalNpcIdentity(value) && !GENERIC_REFERENCES.has(normalizeName(value))))];
    return variants.some(value => containsNormalizedPhrase(source, value));
}

const WORLD_IDENTITY_GENERIC_ROLE_HEADS = new Set([
    'person', 'people', 'someone', 'somebody', 'stranger', 'figure', 'individual',
    'man', 'woman', 'boy', 'girl', 'child', 'adult', 'youth', 'elder',
]);
const WORLD_IDENTITY_INTRO_WORDS = new Set([
    'a', 'an', 'the', 'this', 'that', 'young', 'old', 'older', 'elderly', 'female', 'male', 'another', 'same',
]);
function roleIdentityCues(role = '') {
    const out = [];
    const seen = new Set();
    for (const raw of String(role || '').split(/[\/|;,()[\]{}]+/)) {
        const phrase = evidenceTextKey(raw, 240);
        if (!phrase) continue;
        if (!seen.has(phrase)) { seen.add(phrase); out.push(phrase); }
        const words = phrase.split(/\s+/).filter(Boolean);
        const head = words.at(-1) || '';
        if (head.length >= 4 && !WORLD_IDENTITY_GENERIC_ROLE_HEADS.has(head) && !seen.has(head)) {
            seen.add(head);
            out.push(head);
        }
    }
    return out;
}
function visibleRoleIntroductionForPatch(patch, visibleText = '') {
    const source = evidenceTextKey(visibleText, 50000);
    if (!source) return false;
    const words = source.split(/\s+/).filter(Boolean);
    for (const cue of roleIdentityCues(patch?.role)) {
        if (cue.includes(' ')) {
            if (containsNormalizedPhrase(source, cue)) return true;
            continue;
        }
        for (let index = 0; index < words.length; index += 1) {
            if (words[index] !== cue) continue;
            const prefix = words.slice(Math.max(0, index - 4), index);
            if (prefix.some(word => WORLD_IDENTITY_INTRO_WORDS.has(word))) return true;
        }
    }
    return false;
}
function worldStateIdentityBridgesVisibleIntroduction(state, patch, policy, currentAdmissionText = '', patches = []) {
    if (!policy?.detected) return false;
    const canonicalName = canonicalPatchName(patch, []);
    if (!canonicalName || looksLikeRoleLabel(canonicalName, patch?.role)) return false;
    const structuredCanonical = containsNormalizedPhrase(policy.worldPresentText || '', canonicalName)
        || containsNormalizedPhrase(policy.worldOffscreenText || '', canonicalName);
    if (!structuredCanonical) return false;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const identity = identityEvidenceVerified(patch, policy, currentAdmissionText);
    if (identity && identityAnchorUnique(state, patch, identity.anchor, patches)) return true;
    // Preserve the older role bridge as a compatibility fallback, but only for explicit
    // Present/Off-Screen sections rather than any arbitrary World_State occurrence.
    return visibleRoleIntroductionForPatch(patch, visible);
}
function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '', patches = []) {
    if (findNpcByReference(state, patch?.name || '')) return true;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const directlyMentioned = newPatchMentionedInCurrentExchange(patch, visible);
    if (directlyMentioned) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    if (scope === 'inner' || scope === 'excluded') return false;
    if (scope === 'world') return worldStateIdentityBridgesVisibleIntroduction(state, patch, policy, visible, patches);
    return false;
}
function newReferenceAllowedByWorldIdentityBridge(state, reference, patches, policy, currentAdmissionText = '', channel = 'exchangeActive') {
    const patch = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (!patch) return false;
    const patchId = String(patch?.id || '').trim();
    if (patchId && state.npcs.some(item => item.id === patchId)) return false;
    const canonicalName = canonicalPatchName(patch, [reference]);
    if (!canonicalName || findNpcByReference(state, canonicalName)) return false;
    if (!newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText, patches)) return false;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    if (activityEvidenceVerified(patch, channel, visible)) return true;
    if (containsNormalizedPhrase(visible, canonicalName)) return true;
    if (identityEvidenceVerified(patch, policy, currentAdmissionText)) return true;
    return visibleRoleIntroductionForPatch(patch, visible);
}

const ROLE_LABEL_MODIFIERS = new Set([
    'north','northern','south','southern','east','eastern','west','western','upper','lower','inner','outer','front','rear',
    'first','second','third','senior','junior','night','day','city','town','village','castle','palace','guild','gate','door',
    'dock','harbor','market','temple','road','bridge','watch','local','royal','main','outermost','inner-most',
]);
function looksLikeRoleLabel(name, role) {
    const nameKey = normalizeName(name);
    const roleKey = normalizeName(role);
    if (!nameKey) return true;
    if (!roleKey) return false;
    if (nameKey === roleKey) return true;
    const roleTokens = roleKey.split(/\s+/).filter(Boolean);
    const nameTokens = nameKey.split(/\s+/).filter(Boolean);
    if (roleTokens.length && nameTokens.length >= roleTokens.length) {
        const tail = nameTokens.slice(-roleTokens.length).join(' ');
        if (tail === roleKey) {
            const prefix = nameTokens.slice(0, -roleTokens.length);
            if (prefix.length && prefix.every(token => ROLE_LABEL_MODIFIERS.has(token))) return true;
        }
    }
    return false;
}

export function newNpcAdmissionAllows(patch, mode = 'balanced', referenceCandidates = []) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'balanced') return true;
    if (policy === 'manual') return false;
    const kind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    if (['role-label', 'role', 'unnamed'].includes(kind)) return false;
    const name = canonicalPatchName(patch, referenceCandidates);
    if (!name || looksLikeRoleLabel(name, patch?.role)) return false;
    if (['named', 'proper-name', 'proper'].includes(kind)) return true;
    return true;
}

function admissionPromptRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION POLICY: Manual. Do not return NEW npcs entries or new-NPC activity references. Existing dossiers may still update normally.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION POLICY: Named preferred. A new dossier may be proposed only when a proper/personal canonical name is established. Set identityKind to named. Do not propose first-seen unnamed occupation/role labels as dossiers; they remain narrative-only until named or manually added.';
    return 'NEW NPC ADMISSION POLICY: Balanced. Preserve normal v0.4 admission: individually relevant named NPCs and genuinely unique role-label NPCs may be proposed; set identityKind to named or role-label accurately.';
}
function applyPrivateEvidencePatch(npc, patch) {
    const next = structuredClone(npc);
    for (const field of ['mood', 'goal']) {
        const value = String(patch?.[field] ?? '').trim();
        if (value) next[field] = value;
    }
    return next;
}

export function applyScanResult(stateInput, resultInput, options = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    const result = typeof resultInput === 'string'
        ? parseScanJson(resultInput)
        : normalizeScanPayload(resultInput || {}, { requireContract: true, allowOmittedSupplemental: true });
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : state.turn;
    const preservePresence = options.preservePresence === true;
    const applyRelationship = options.applyRelationship !== false;
    const allowHistoricalProfilePatches = options.allowHistoricalProfilePatches === true;
    const playerName = resolvePlayerName(options.playerName);
    const dossierLimits = normalizeDossierLimits(options.dossierLimits);
    const admissionMode = normalizeNpcAdmissionMode(options.admissionMode);

    state.npcs = state.npcs.map(npc => repairTechnicalStoredName(sanitizePlayerKeyRelationships(npc, playerName)));

    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;
    const currentAdmissionText = String(options.currentAdmissionText || '').trim();
    const newActivityBridge = (ref, channel) => newReferenceAllowedByWorldIdentityBridge(state, ref, result.npcs, evidencePolicy, currentAdmissionText, channel);
    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'exchangeActive', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'exchangeActive'));
    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'inChat', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'inChat'));
    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy, result.npcs, currentAdmissionText));
    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);
    preflightAutomaticIdentityPatches(state, result.npcs, identityRefs);
    // A new returned dossier may contain a bad machine-shaped name even when the same
    // payload also contains its real human name in aliases/activity references. Resolve the
    // human-facing identity first and bootstrap only from that canonical display name.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = canonicalPatchName(patch, identityRefs);
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !findNpcByReference(state, name)
                && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs)
                && newNpcAdmissionAllows(patch, admissionMode, identityRefs);
        })
        .map(patch => canonicalPatchName(patch, identityRefs)));
    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];

    const deletedIds = new Set(state.deletedNpcIds || []);
    const createdNpcIds = new Set();
    const patchByNpcId = new Map();
    for (const patch of result.npcs) {
        const patchId = String(patch?.id || '').trim();
        if (patchId && deletedIds.has(patchId)) continue;
        const canonicalName = canonicalPatchName(patch, identityRefs);
        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        if (!npc && canonicalName) {
            // Unknown model ids are never authoritative. Resolve through the grounded
            // human-facing canonical name/alias instead of the model's transport key.
            npc = findNpcByReference(state, canonicalName);
        }
        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));
        if (!npc && !automaticIdentityPatchConflicts(state, null, patch, identityRefs) && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs) && newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {
            const created = createFromPatch(patch, sourceMessageId, identityRefs);
            if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                state.npcs.push(created);
                createdNpcIds.add(created.id);
                npc = created;
            }
        }
        if (npc && automaticIdentityPatchConflicts(state, npc, patch, identityRefs)) continue;
        if (npc) patchByNpcId.set(npc.id, patch);
    }

    const resolveRefs = refs => {
        const ids = [];
        for (const ref of refs) {
            let npc = findNpcByReference(state, ref);
            if (!npc) {
                const patch = result.npcs.find(item => patchReferenceMatches(item, ref));
                if (patch) {
                    // The first bootstrap pass may already have created this patch under a
                    // locally allocated id. Resolve by its human-facing canonical name first.
                    const canonicalName = canonicalPatchName(patch, [...identityRefs, ref]);
                    npc = canonicalName ? findNpcByReference(state, canonicalName) : null;
                    if (!npc && !automaticIdentityPatchConflicts(state, null, patch, [...identityRefs, ref]) && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs) && newNpcAdmissionAllows(patch, admissionMode, [...identityRefs, ref])) {
                        const created = createFromPatch(patch, sourceMessageId, [...identityRefs, ref]);
                        if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                            state.npcs.push(created);
                            createdNpcIds.add(created.id);
                            npc = created;
                        }
                    }
                    if (npc && automaticIdentityPatchConflicts(state, npc, patch, identityRefs)) continue;
            if (npc) patchByNpcId.set(npc.id, patch);
                }
            }
            if (npc && !ids.includes(npc.id)) ids.push(npc.id);
        }
        return ids;
    };

    const exchangeIds = resolveRefs(exchangeRefs);
    const presentIds = resolveRefs(presentRefs);
    // Final presence is single-valued: a malformed proposal cannot leave the same NPC both
    // in-chat and off-screen. In-chat wins because it is the stronger current-scene claim.
    const worldIds = resolveRefs(worldRefs).filter(id => !presentIds.includes(id));
    const bootstrapIds = resolveRefs(bootstrapRefs);
    const targetIds = [...new Set([...exchangeIds, ...presentIds, ...bootstrapIds])];
    const targetSet = new Set(targetIds);
    const exchangeSet = new Set(exchangeIds);
    const worldSet = new Set(worldIds);
    // A returned dossier patch is itself meaningful structured output. When enabled by the
    // caller, apply it even if the model imperfectly omitted this existing NPC from the
    // activity arrays. Keep world-only NPCs on their restricted live-state path unless they
    // are also an exchange/in-chat target. Relationship deltas remain exchange-gated.
    const privateEvidenceSet = new Set();
    const excludedEvidenceSet = new Set();
    for (const [id, patch] of patchByNpcId.entries()) {
        const existing = state.npcs.find(npc => npc.id === id);
        const scope = evidenceReferenceScope(evidencePolicy, npcEvidenceVariants(existing, patch));
        if (scope === 'inner' && !targetSet.has(id) && !worldSet.has(id)) privateEvidenceSet.add(id);
        if (scope === 'excluded' && !targetSet.has(id) && !worldSet.has(id)) excludedEvidenceSet.add(id);
    }
    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => (!worldSet.has(id) || targetSet.has(id)) && !privateEvidenceSet.has(id) && !excludedEvidenceSet.has(id)));

    for (let i = 0; i < state.npcs.length; i += 1) {
        let npc = state.npcs[i];
        const patch = patchByNpcId.get(npc.id);
        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));
        if (canPatch) {
            npc = applyStablePatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || ''), sourceMessageId, turn });
            npc = applyDynamicPatch(npc, patch, { dossierLimits });
            npc = applyLifeState(npc, patch, options);
            if (applyRelationship && exchangeSet.has(npc.id)) npc = applyRelationshipChange(npc, patch, {
                relationshipCaps: options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: String(options.relationshipContext || ''),
                relationshipEvidenceSources: Array.isArray(options.evidencePolicy?.relationshipSources) ? options.evidencePolicy.relationshipSources : [],
                playerName,
                otherNpcNames: state.npcs.filter(other => other.id !== npc.id).flatMap(other => [other.name, ...(other.aliases || [])]),
                // Automatic relationship movement is always current-exchange evidence.
                // Existing NPCs are not allowed to bypass grounding merely because their
                // dossier already exists. Direct/manual relationship editing uses engine
                // mutation and does not pass through this scanner path.
                requireCurrentRelationshipEvidence: createdNpcIds.has(npc.id) || Boolean(String(options.relationshipContext || '').trim()),
                sourceMessageId,
                turn,
            });
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        } else if (patch && privateEvidenceSet.has(npc.id)) {
            npc = applyPrivateEvidencePatch(npc, patch);
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        } else if (patch && worldSet.has(npc.id)) {
            // Off-screen activity may update current whereabouts/status and explicit life-state
            // continuity, but never stable profile, memories, or relationship progression.
            npc = applyLivePatch(npc, patch);
            npc = applyLifeState(npc, patch, options);
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        }
        if (applyRelationship && exchangeSet.has(npc.id) && !patch) {
            npc = relationshipEvaluationDiagnostic(npc, null, { sourceMessageId, turn });
        }
        if (exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;
        if (presentIds.includes(npc.id)) {
            npc.lastSeenMessageId = sourceMessageId;
            npc.seenCount = Math.max(0, Number(npc.seenCount) || 0) + 1;
        }
        state.npcs[i] = normalizeNpc(npc);
    }

    if (!preservePresence) {
        const presentSet = new Set(presentIds);
        state.npcs = state.npcs.map(raw => {
            const npc = structuredClone(raw);
            npc.present = !npc.archived && presentSet.has(npc.id);
            npc.worldActive = !npc.archived && worldSet.has(npc.id);
            return normalizeNpc(npc);
        });
    }

    const resolveReturnedReference = reference => {
        const direct = findNpcByReference(state, reference);
        if (direct) return direct;
        const patch = result.npcs.find(item => patchReferenceMatches(item, reference));
        const canonicalName = patch ? canonicalPatchName(patch, [...identityRefs, reference]) : '';
        return canonicalName ? findNpcByReference(state, canonicalName) : null;
    };
    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    for (const raw of result.socialEdges) {
        if (keyRelationshipReferencesPlayer(raw?.from, playerName) || keyRelationshipReferencesPlayer(raw?.to, playerName)) continue;
        const from = resolveReturnedReference(raw?.from);
        const to = resolveReturnedReference(raw?.to);
        if (!from || !to || from.id === to.id) continue;
        const returnedPair = options.applyReturnedNpcPatches === true && returnedPatchSet.has(from.id) && returnedPatchSet.has(to.id);
        if (!targetSet.has(from.id) && !targetSet.has(to.id) && !allowHistoricalProfilePatches && !returnedPair) continue;
        const relation = String(raw?.relation || '').trim().slice(0, 160);
        if (!relation) continue;
        const provenance = ['explicit', 'strong-context'].includes(String(raw?.provenance)) ? String(raw.provenance) : 'explicit';
        const edge = { fromId: from.id, toId: to.id, relation, summary: String(raw?.summary || '').trim().slice(0, 500), updatedAt: Date.now(), sourceMessageId, provenance, confidence: provenance === 'explicit' ? 1 : 0.8, inferred: false };
        edgeMap.set(socialEdgeKey(edge), edge);
    }
    state.socialGraph = [...edgeMap.values()].slice(-200);
    if (options.reconcileFamilyGraph !== false) {
        addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''), playerName);
        const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });
        state.npcs = familyReconciled.npcs;
        state.socialGraph = familyReconciled.socialGraph;
        state.familySlots = familyReconciled.familySlots;
    }

    // Passive birthday fill is metadata only. It applies after grounded reconciliation to
    // participating dossiers, and never manufactures ageChange or age-progression authority.
    const birthdayFillIds = new Set([...targetIds, ...returnedPatchSet]);
    if (options.birthdayFill && birthdayFillIds.size) {
        state.npcs = state.npcs.map(raw => birthdayFillIds.has(raw.id)
            ? normalizeNpc(applyBirthdayFill(raw, options.birthdayFill))
            : raw);
    }

    if (options.preserveObservation !== true) {
        state.lastObservation = {
            messageId: sourceMessageId,
            exchangeActiveNpcIds: exchangeIds,
            finalPresentNpcIds: presentIds,
            worldActiveNpcIds: worldIds,
            targetNpcIds: targetIds,
        };
        state.lastScannedMessageId = sourceMessageId;
    }
    state.updatedAt = Date.now();
    return { state: normalizeState(state, state.chatKey), exchangeActiveNpcIds: exchangeIds, finalPresentNpcIds: presentIds, worldActiveNpcIds: worldIds, targetNpcIds: targetIds };
}

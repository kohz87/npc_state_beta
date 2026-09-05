import { relationshipEvidenceGrounding, relationshipOutcomesConflict } from './relationship-evidence.js';
import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';
import { appearanceFormDescription, appearanceScalarIsLegacyBase } from './appearance.js';
import { AGE_PROGRESSION_MODE, ageProgressionAppearanceSafe, apparentAgeProgressionAllowed, authorizeAgeProgression, progressionEvidence, sharedAgeProgressionAllowed } from './age-progression.js';
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
    normalizeRelationshipEvidenceHistory,
    normalizeRelationshipDiagnostics,
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

export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced' }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State v0.4.9 recovery scanner requires an assistant message and its preceding user exchange.');
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
            aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only, or same-value refinement; use ageChange for an established age changing', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence that states the new age' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: 'why this maturation behavior applies', evidence: 'grounded accepted age-transition evidence', affectsShared: false, affectedForms: [] }, apparentAge: '~N only, e.g. ~25, or empty', birthday: 'explicit compact freeform calendar birthday or empty; never infer from age', appearance: 'shared/common appearance, or ordinary single-form appearance', currentForm: 'current named physical form or empty', appearanceForms: [{ name: 'newly established physical form', appearance: 'durable canonical appearance for this form' }], appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', mode: 'change|age_progression', evidence: 'explicit correction/growth/change or accepted age-transition evidence' }], personality: '',
            behaviorProfile: [], speech: '', mannerisms: [], keyRelationshipChanges: [{ other: 'existing NPC name/id', action: 'remove', evidence: 'explicit evidence the durable tie no longer applies' }], profileChanges: [{ field: 'personality|behaviorProfile|speech|mannerisms', mode: 'refine|gradual|explicit|batch', concept: 'short stable concept label', evidence: 'grounded evidence for this durable profile update' }], canonChanges: [{ field: 'appearance|species|background|role|birthday', mode: 'refine|change|correction|revelation|age_progression', value: 'replacement durable canon', evidence: 'grounded evidence for this durable scalar revision' }], background: '', keyRelationships: [], memories: [],
            relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,
            lifeState: 'alive|dead|unknown', lifeStateCertainty: 'explicit|strong|uncertain', lifeStateReason: '', livingReturn: false,
            relationshipChange: { impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
        }],
        socialEdges: [{ from: 'NPC id/name only', to: 'NPC id/name only', relation: '', summary: '', provenance: 'explicit|strong-context' }],
        familyFacts: [{ owner: 'existing NPC id/name', relation: 'daughter|son|child|other countable family role', count: 2, descriptor: 'optional e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit countable family fact' }],
    };
    return [
        'You are NPC State v0.4.9, a private structured continuity scanner for a roleplay chat.',
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
        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',
        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',
        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',
        '- relationship, relationshipSummary, and relationshipChange describe THIS NPC toward the PLAYER. They are the dedicated player-relationship channel.',
        '- keyRelationships contains significant NON-PLAYER ties only, such as family, friends, rivals, patrons, dependents, or other NPCs. Never include the PLAYER/current USER persona there.',
        '- socialEdges are NPC-to-NPC only. Never use the PLAYER/current USER persona as an endpoint.',
        '- Current exchange decides relationship changes. Older history may recover stable profile facts and durable memories, but must NEVER replay relationship deltas.',
        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',
        '- RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events must be zero. High relationship depth has increasing inertia, so raw deltas are evidence weights rather than guaranteed visible points. Desire requires explicit romantic/intimate/physical attraction evidence in the CURRENT narration, not friendship, gratitude, rescue, beauty, proximity, trust, or generic affection. Relationship Summary must describe only depth actually supported by the accepted relationship state.',
        '- RELATIONSHIP EVIDENCE: quote a short concrete event from the current exchange; preserve who acted, negation, and the outcome. Do not replace a quote with an inferred absolute trust/affection claim. Opposite outcomes are new events, while repeated aftermath earns zero. RELATIONSHIP MILESTONE GATES are enforced by NPC State at absolute depth 25, 50, 75, and 90 independently for each axis and positive/negative polarity. Ordinary evidence may reach a locked boundary but cannot deepen beyond it. Crossing 25 requires meaningful-or-stronger evidence; crossing 50 requires a major-or-stronger event with at least 3 raw points on that axis; crossing 75 requires extreme evidence with at least 5 raw points; crossing 90 requires extreme relationship-defining evidence with at least 8 raw points. Movement back toward neutral is never gate-blocked. Classify impact and deltas from the story honestly; never inflate them merely to open a gate.',
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
        relationshipCriteria ? `RELATIONSHIP RUBRIC:\n${compactText(relationshipCriteria, 6000)}` : '',
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        '',
        `EXISTING DOSSIERS:\n${JSON.stringify(rosterForPrompt(state))}`,
        `OLDER CONTEXT FOR PROFILE/MEMORY ONLY:\n${JSON.stringify(history)}`,
        `CURRENT USER MESSAGE:\n${compactText(scannerEvidenceText(exchange.user?.mes || ''), 10000)}`,
        `CURRENT ASSISTANT MESSAGE:\n${compactText(scannerEvidenceText(exchange.assistant?.mes || ''), 14000)}`,
        `OUTPUT CONTRACT:\n${JSON.stringify(contract)}`,
    ].filter(Boolean).join('\n\n');
}

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = {
        id: String(npc?.id || patch?.id || '').trim(),
        name: String(npc?.name || patch?.name || '').trim(),
        relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
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
        'You are NPC State v0.4.9 performing a DELIBERATE STRUCTURED DOSSIER IMPORT for one existing NPC.',
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
                relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
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
        'You are NPC State v0.4.9 performing a targeted dossier reconciliation.',
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
        `OUTPUT CONTRACT:\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'initial actual chronological numeric age only or empty', ageChange: { age: 'new actual chronological age', kind: 'birthday|elapsed|correction', evidence: 'explicit grounded age-change evidence' }, ageProgression: { maturation: 'ordinary|accelerated|long_lived|ageless|unknown', meaningful: false, basis: '', evidence: '', affectsShared: false, affectedForms: [] }, apparentAge: '~N only or empty', birthday: 'explicit freeform birthday or empty', appearance: 'shared/common or ordinary single-form appearance', currentForm: 'current physical form or empty', appearanceForms: null, appearanceFormChanges: null, personality: '', behaviorProfile: null, speech: '', mannerisms: null, profileChanges: null, canonChanges: null, background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`,
    ].filter(Boolean).join('\n\n');
}

export function parseScanJson(raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('NPC State v0.4.9 recovery scanner returned an empty response.');
    const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('NPC State v0.4.9 recovery scanner returned no JSON object.');
    let parsed;
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch (error) { throw new Error(`NPC State v0.4.9 recovery scanner returned malformed JSON: ${error.message}`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NPC State v0.4.9 recovery scanner JSON must be an object.');
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.filter(item => item && typeof item === 'object').slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.filter(item => item && typeof item === 'object').slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.filter(item => item && typeof item === 'object').slice(0, 100) : [],
    };
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

const FAMILY_CHILD_ROLES = new Set(['child', 'daughter', 'son', 'adopted child', 'stepchild']);
const FAMILY_PARENT_ROLES = new Set(['parent', 'mother', 'father', 'guardian parent', 'adoptive parent', 'stepparent']);
function familyRole(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    if (FAMILY_CHILD_ROLES.has(text)) return 'child';
    if (FAMILY_PARENT_ROLES.has(text)) return 'parent';
    if (/\b(?:daughter|son|child)\b/.test(text)) return 'child';
    if (/\b(?:mother|father|parent)\b/.test(text)) return 'parent';
    return '';
}

function familySlotKey(ownerId, relation, twinGroup = '') {
    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);
}

function addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '') {
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
        const descriptor = String(raw?.descriptor || '').trim().slice(0, 240);
        const twinGroup = String(raw?.twinGroup || '').trim().slice(0, 160);
        const key = familySlotKey(owner.id, relation, twinGroup);
        const index = byKey.get(key);
        if (Number.isInteger(index)) {
            const slot = slots[index];
            slot.count = Math.max(slot.count, count);
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
    return findNpcByReference(state, parts.other);
}

export function reconcileFamilyGraphState(stateInput, { sourceMessageId = null, dossierLimits = null } = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    const validIds = new Set(state.npcs.map(npc => npc.id));
    const slots = normalizeFamilySlots(state.familySlots, validIds);

    for (const npc of state.npcs) {
        for (const entry of npc.keyRelationships || []) {
            const parts = keyRelationshipParts(entry);
            const other = keyRelationshipToNpc(state, entry);
            if (!other || other.id === npc.id) continue;
            const role = familyRole(parts.relation);
            if (role === 'child') {
                for (const slot of slots) {
                    if (slot.ownerId !== npc.id || familyRole(slot.relation) !== 'child' || slot.resolvedNpcIds.includes(other.id) || slot.resolvedNpcIds.length >= slot.count) continue;
                    slot.resolvedNpcIds.push(other.id);
                    slot.updatedAt = Date.now();
                    break;
                }
            } else if (role === 'parent') {
                for (const slot of slots) {
                    if (slot.ownerId !== other.id || familyRole(slot.relation) !== 'child' || slot.resolvedNpcIds.includes(npc.id) || slot.resolvedNpcIds.length >= slot.count) continue;
                    slot.resolvedNpcIds.push(npc.id);
                    slot.updatedAt = Date.now();
                    break;
                }
            }
        }
    }

    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;
    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));
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
                if (!hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);
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
    if (normalizeName(incoming) === normalizeName(current)) return false;
    const change = canonChangeForField(patch, field);
    if (!change) return false;
    const value = String(change.value ?? change[field] ?? incoming).trim();
    const evidence = String(change.evidence || change.reason || '').trim().slice(0, 700);
    const mode = String(change.mode || '').trim().toLocaleLowerCase();
    const context = String(options.profileContext || '');
    if (!value || normalizeName(value) !== normalizeName(incoming) || !evidence || !profileEvidenceGrounded(evidence, context)) return false;
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
            && normalizeName(previousBaseAppearance) !== normalizeName(revisedBaseAppearance)
            && normalizeName(next.appearance) === normalizeName(previousBaseAppearance)) {
            next.appearance = revisedBaseAppearance;
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
        if (magnitude < 30) return 1;
        if (magnitude < 50) return 0.75;
        if (magnitude < 70) return 0.5;
        if (magnitude < 85) return 0.35;
        if (magnitude < 95) return 0.2;
        return 0.1;
    }
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

function selectRelationshipAxes(delta, axisLimit) {
    const ranked = RELATIONSHIP_AXES
        .filter(axis => Number(delta?.[axis]) !== 0)
        .map(axis => ({ axis, magnitude: Math.abs(Number(delta[axis]) || 0) }))
        .sort((a, b) => b.magnitude - a.magnitude || RELATIONSHIP_AXES.indexOf(a.axis) - RELATIONSHIP_AXES.indexOf(b.axis));
    if (!axisLimit || !ranked.length) return new Set();
    if (ranked.length <= axisLimit) return new Set(ranked.map(item => item.axis));
    const cutoff = ranked[axisLimit - 1]?.magnitude ?? Infinity;
    const above = ranked.filter(item => item.magnitude > cutoff);
    const tied = ranked.filter(item => item.magnitude === cutoff);
    const slots = Math.max(0, axisLimit - above.length);
    // Do not create a fixed Trust/Affection bias when too many equal axes compete for
    // too few legal slots. Ambiguous tied overflow is rejected as a group.
    const acceptedTied = tied.length <= slots ? tied : [];
    return new Set([...above, ...acceptedTied].map(item => item.axis));
}

const DESIRE_EVIDENCE_CUES = /\b(desire|desires|desired|desiring|attract|attracts|attracted|attraction|romantic|romance|intimacy|intimate|kiss|kisses|kissed|kissing|sexual|sexually|lust|longing|yearn|yearns|yearned|yearning|flirt|flirts|flirted|flirting|date|dating|lover|physical closeness|physical contact|physically drawn|wants? (?:him|her|them|the player) physically|drawn to)\b/i;

function relationshipTextTokens(value) {
    return evidenceTextKey(value, 1600).split(/\s+/).filter(token => token.length >= 3);
}

function relationshipTextSimilarity(a, b) {
    const leftText = evidenceTextKey(a, 1600);
    const rightText = evidenceTextKey(b, 1600);
    if (!leftText || !rightText) return 0;
    if (leftText === rightText) return 1;
    const left = new Set(relationshipTextTokens(leftText));
    const right = new Set(relationshipTextTokens(rightText));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection += 1;
    const union = new Set([...left, ...right]).size;
    const jaccard = union ? intersection / union : 0;
    const containment = intersection / Math.min(left.size, right.size);
    return Math.max(jaccard, containment * 0.85);
}

function relationshipChangeLooksDuplicate(npc, change, { sourceMessageId = null, turn = null } = {}) {
    const currentText = [change?.reason, change?.evidence].filter(Boolean).join(' ');
    if (!currentText) return false;
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        const priorTurn = previous.turn;
        const currentTurn = turn;
        const recentByTurn = Number.isInteger(priorTurn) && Number.isInteger(currentTurn) && currentTurn >= priorTurn && currentTurn - priorTurn <= 8;
        const recentByMessage = Number.isInteger(sourceMessageId) && Number.isInteger(previous.sourceMessageId)
            && sourceMessageId >= previous.sourceMessageId && sourceMessageId - previous.sourceMessageId <= 10;
        if (!recentByTurn && !recentByMessage) return false;
        if (evidenceTextKey(previous.evidence) === evidenceTextKey(change.evidence)) return true;
        if (RELATIONSHIP_AXES.some(axis => previous.delta?.[axis] && change.delta?.[axis]
            && Math.sign(previous.delta[axis]) !== Math.sign(change.delta[axis]))) return false;
        if (relationshipOutcomesConflict(previous.evidence, change.evidence)) return false;
        return relationshipTextSimilarity(previous.evidence, change.evidence) >= 0.68;
    });
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
    const change = patch?.relationshipChange && typeof patch.relationshipChange === 'object' ? patch.relationshipChange : {};
    const impact = IMPACTS.has(String(change.impact)) ? String(change.impact) : 'none';
    const evidence = String(change.evidence || '').trim();
    const reason = String(change.reason || '').trim();
    if (impact === 'none' || !evidence || !reason) return { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' };
    const cap = Math.max(0, Number(caps?.[impact] ?? DEFAULT_RELATIONSHIP_CAPS[impact] ?? 0));
    const proposed = change.delta && typeof change.delta === 'object' ? change.delta : {};
    const delta = {};
    for (const axis of RELATIONSHIP_AXES) {
        const number = Number(proposed[axis]);
        delta[axis] = Number.isFinite(number) ? Math.max(-cap, Math.min(cap, Math.round(number))) : 0;
    }
    if (!Object.values(delta).some(Boolean)) return { impact: 'none', delta, evidence: '', reason: '' };
    return { impact, delta, evidence: evidence.slice(0, 800), reason: reason.slice(0, 800) };
}

function relationshipDiagnostic(npc, next, change, options, reasons = [], unlocks = []) {
    const event = {
        impact: change.impact, reason: change.reason, evidence: change.evidence,
        before: npc.relationship, after: next.relationship, proposed: change.delta,
        applied: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, (next.relationship?.[axis] || 0) - (npc.relationship?.[axis] || 0)])),
        progressBefore: npc.relationshipProgress, progressAfter: next.relationshipProgress,
        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),
    };
    return { ...next, relationshipDiagnostics: normalizeRelationshipDiagnostics([...(npc.relationshipDiagnostics || []), event]) };
}

function applyRelationshipChange(npc, patch, options = {}) {
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (change.impact === 'none') return npc;
    if (options.requireCurrentRelationshipEvidence === true) {
        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext);
        if (rejection) return relationshipDiagnostic(npc, npc, change, options, [rejection]);
    }
    if (relationshipChangeLooksDuplicate(npc, change, options)) return relationshipDiagnostic(npc, npc, change, options, ['duplicate']);
    const reasons = [];

    const context = String(options.relationshipContext || '').trim();
    const filteredDelta = { ...change.delta };
    if (filteredDelta.desire !== 0) {
        const evidenceSupportsDesire = DESIRE_EVIDENCE_CUES.test(change.evidence) || DESIRE_EVIDENCE_CUES.test(change.reason);
        const narrationSupportsDesire = !context || DESIRE_EVIDENCE_CUES.test(context);
        if (!evidenceSupportsDesire || !narrationSupportsDesire) { filteredDelta.desire = 0; reasons.push('desire:unsupported'); }
    }

    const axisLimit = relationshipAxisLimit(change.impact);
    const allowedAxes = selectRelationshipAxes(filteredDelta, axisLimit);
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
    next.relationshipMilestones = applyRelationshipMilestoneCrossings(next.relationshipMilestones, crossings, {
        reason: change.reason,
        evidence: change.evidence,
        sourceMessageId: options.sourceMessageId,
        turn: options.turn,
    });

    const evidenceEvent = {
        delta: Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, allowedAxes.has(axis) ? filteredDelta[axis] : 0])),
        impact: change.impact,
        evidence: change.evidence,
        reason: change.reason,
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
    if (!reasons.length) reasons.push(relationshipStateChanged ? 'applied' : 'no-visible-change');
    return relationshipDiagnostic(npc, next, change, options, reasons, crossings);
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
    const deathCue = /\b(?:dies?|died|dead|death|killed|slain|lifeless|no pulse|stopped breathing|ceased breathing)\b/i.test(lifeContext);
    const livingReturnCue = /\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|not dead|wasn't dead|was not dead|death reports? (?:were|was) false|emerges? alive|returns? alive)\b/i.test(lifeContext);
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
function restrictedEvidenceScope(state, patch, policy) {
    if (!policy?.detected) return 'unrestricted';
    const patchId = String(patch?.id || '').trim();
    const existing = patchId ? state.npcs.find(npc => npc.id === patchId) : findNpcByReference(state, patch?.name || '');
    return evidenceReferenceScope(policy, npcEvidenceVariants(existing, patch));
}
function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}
function referenceAllowedForWorldActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    return scope === 'visible' || scope === 'world';
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
function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '') {
    if (findNpcByReference(state, patch?.name || '')) return true;
    if (!newPatchMentionedInCurrentExchange(patch, currentAdmissionText)) return false;
    if (!policy?.detected) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    return !['world', 'inner', 'excluded'].includes(scope);
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
    const result = parseScanJson(typeof resultInput === 'string' ? resultInput : JSON.stringify(resultInput || {}));
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
    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));
    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));
    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy));
    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);
    // A new returned dossier may contain a bad machine-shaped name even when the same
    // payload also contains its real human name in aliases/activity references. Resolve the
    // human-facing identity first and bootstrap only from that canonical display name.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = canonicalPatchName(patch, identityRefs);
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !findNpcByReference(state, name)
                && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)
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
        if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {
            const created = createFromPatch(patch, sourceMessageId, identityRefs);
            if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                state.npcs.push(created);
                createdNpcIds.add(created.id);
                npc = created;
            }
        }
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
                    if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, [...identityRefs, ref])) {
                        const created = createFromPatch(patch, sourceMessageId, [...identityRefs, ref]);
                        if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                            state.npcs.push(created);
                            createdNpcIds.add(created.id);
                            npc = created;
                        }
                    }
                    if (npc) patchByNpcId.set(npc.id, patch);
                }
            }
            if (npc && !ids.includes(npc.id)) ids.push(npc.id);
        }
        return ids;
    };

    const exchangeIds = resolveRefs(exchangeRefs);
    const presentIds = resolveRefs(presentRefs);
    const worldIds = resolveRefs(worldRefs);
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
    addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''));
    const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });
    state.npcs = familyReconciled.npcs;
    state.socialGraph = familyReconciled.socialGraph;
    state.familySlots = familyReconciled.familySlots;

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

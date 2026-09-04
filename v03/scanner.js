import {
    DEFAULT_RELATIONSHIP_CAPS,
    RELATIONSHIP_AXES,
    STABLE_PROFILE_FIELDS,
    findNpcByReference,
    makeNpcId,
    normalizeApparentAge,
    normalizeCurrentStatus,
    normalizeDossierLimits,
    normalizeKeyRelationshipEntries,
    normalizeName,
    normalizeNpc,
    normalizeRelationship,
    normalizeState,
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
    const haystack = normalizeName(value);
    const needle = normalizeName(phrase);
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
            text: compactText(message.mes, 7000),
        }));
}

function rosterForPrompt(state) {
    return (state?.npcs || []).map(npc => ({
        id: npc.id,
        name: npc.name,
        aliases: npc.aliases,
        role: npc.role,
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
        '- behaviorProfile, mannerisms, keyRelationships, and memories are EVOLVING CURATED COLLECTIONS, not append-only logs.',
        '- For each evolving collection, use null when nothing materially changed and the existing collection should be preserved exactly.',
        '- When an evolving collection needs revision, return an array containing the COMPLETE authoritative replacement set, not only additions.',
        '- A replacement array may rewrite, merge, retire, reorder, or displace older entries as the NPC grows and canon changes. Preserve still-relevant durable facts from EXISTING DOSSIERS even when the current exchange does not repeat them.',
        '- Prefer current canonical truth, lasting importance, and future usefulness over chronology. Merge redundant or overlapping entries instead of keeping old and rewritten duplicates beside each other.',
        '- Never exceed the configured limit for that collection. When full, a more important or more current entry should displace a lower-value one.',
        '- Use [] only when the evidence supports deliberately clearing the whole collection. Do not clear a collection merely because the supplied chat window does not mention its existing entries.',
        '- Keep individual collection entries concise, grounded, and independently useful later.',
        '- For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',
        '- KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful.',
    ];
}

export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', memoryCriteria = '', playerName = '', dossierLimits = {} }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State v0.4.1 recovery scanner requires an assistant message and its preceding user exchange.');
    const history = recentHistory(chat, assistantMessageId, scanDepth);
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    const contract = {
        exchangeActiveNpcIds: ['existing dossier id OR exact canonical name'],
        inChatNpcIds: ['existing dossier id OR exact canonical name'],
        worldActiveNpcIds: ['existing dossier id OR exact canonical name'],
        npcs: [{
            id: 'existing id when known, otherwise empty',
            name: 'canonical proper name when known; unique role label only if genuinely unnamed',
            aliases: [], role: '', species: '', age: '', apparentAge: '~N only, e.g. ~25, or empty', appearance: '', personality: '',
            behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [],
            relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,
            lifeState: 'alive|dead|unknown', lifeStateCertainty: 'explicit|strong|uncertain', lifeStateReason: '', livingReturn: false,
            relationshipChange: { impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
        }],
        socialEdges: [{ from: 'NPC id/name only', to: 'NPC id/name only', relation: '', summary: '' }],
    };
    return [
        'You are NPC State v0.4.1, a private structured continuity scanner for a roleplay chat.',
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
        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',
        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',
        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',
        '- relationship, relationshipSummary, and relationshipChange describe THIS NPC toward the PLAYER. They are the dedicated player-relationship channel.',
        '- keyRelationships contains significant NON-PLAYER ties only, such as family, friends, rivals, patrons, dependents, or other NPCs. Never include the PLAYER/current USER persona there.',
        '- socialEdges are NPC-to-NPC only. Never use the PLAYER/current USER persona as an endpoint.',
        '- Current exchange decides relationship changes. Older history may recover stable profile facts and durable memories, but must NEVER replay relationship deltas.',
        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',
        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',
        ...dossierCollectionRules(limits),
        '- Do not infer romance, obedience, hostility, personality, motives, secrets, age, species, or relationships without evidence.',
        '- Confirmed death requires explicit current-timeline evidence. Ambiguous danger/injury is not death.',
        '- livingReturn is true only when a previously archived/dead dossier is explicitly alive, surviving, resurrected, or physically returned.',
        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',
        '',
        relationshipCriteria ? `RELATIONSHIP RUBRIC:\n${compactText(relationshipCriteria, 6000)}` : '',
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        '',
        `EXISTING DOSSIERS:\n${JSON.stringify(rosterForPrompt(state))}`,
        `OLDER CONTEXT FOR PROFILE/MEMORY ONLY:\n${JSON.stringify(history)}`,
        `CURRENT USER MESSAGE:\n${compactText(exchange.user?.mes || '', 10000)}`,
        `CURRENT ASSISTANT MESSAGE:\n${compactText(exchange.assistant?.mes || '', 14000)}`,
        `OUTPUT CONTRACT:\n${JSON.stringify(contract)}`,
    ].filter(Boolean).join('\n\n');
}

export function buildTargetedRefreshPrompt({ npc, chat, assistantMessageId, scanDepth = 12, memoryCriteria = '', playerName = '', dossierLimits = {} }) {
    const history = nonSystemMessages(chat)
        .filter(message => !Number.isInteger(assistantMessageId) || message.id <= assistantMessageId)
        .slice(-Math.max(2, Math.min(30, Math.round(Number(scanDepth) || 12))))
        .map(message => ({ id: message.id, role: message.is_user ? 'USER' : 'ASSISTANT', text: compactText(message.mes, 8000) }));
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    return [
        'You are NPC State v0.4.1 performing a targeted dossier reconciliation.',
        'Return JSON only using the same object shape shown below.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `TARGET DOSSIER: ${JSON.stringify(rosterForPrompt({ npcs: [npc] })[0])}`,
        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',
        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',
        'The PLAYER/current USER persona is not an NPC. relationshipSummary is this NPC toward the PLAYER; keyRelationships is NON-PLAYER ties only and must never duplicate the PLAYER.',
        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',
        ...dossierCollectionRules(limits),
        'Do NOT change relationship scores or propose relationship deltas in a targeted refresh. Do NOT change global in-chat state for other NPCs.',
        'If the chat does not establish a scalar field, leave it empty. Never invent facts.',
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC:\n${compactText(memoryCriteria, 6000)}` : '',
        `CHAT WINDOW:\n${JSON.stringify(history)}`,
        `OUTPUT CONTRACT:\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: '', apparentAge: '~N only or empty', appearance: '', personality: '', behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`,
    ].filter(Boolean).join('\n\n');
}

export function parseScanJson(raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('NPC State v0.4.1 recovery scanner returned an empty response.');
    const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('NPC State v0.4.1 recovery scanner returned no JSON object.');
    let parsed;
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch (error) { throw new Error(`NPC State v0.4.1 recovery scanner returned malformed JSON: ${error.message}`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NPC State v0.4.1 recovery scanner JSON must be an object.');
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.filter(item => item && typeof item === 'object').slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.filter(item => item && typeof item === 'object').slice(0, 100) : [],
    };
}

function patchReferenceMatches(patch, reference) {
    const key = normalizeName(reference);
    if (!key) return false;
    if (String(patch?.id || '').trim() === String(reference || '').trim()) return true;
    if (normalizeName(patch?.name) === key) return true;
    return (Array.isArray(patch?.aliases) ? patch.aliases : []).some(alias => normalizeName(alias) === key);
}

function createFromPatch(patch, sourceMessageId) {
    const name = String(patch?.name || '').trim();
    if (!name || GENERIC_REFERENCES.has(normalizeName(name))) return null;
    return normalizeNpc({
        // Never trust a model-supplied id for a dossier that does not already exist.
        // Stable ids are allocated by NPC State itself from the canonical returned name.
        id: makeNpcId(name, `${sourceMessageId}-${Math.random()}`),
        name,
        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
        createdAt: Date.now(),
    });
}

function applyStablePatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
    const limits = normalizeDossierLimits(options.dossierLimits);
    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'appearance', 'personality', 'speech', 'background'];
    for (const field of stringFields) {
        if (locked.has(field)) continue;
        const value = field === 'apparentAge'
            ? normalizeApparentAge(patch?.[field])
            : String(patch?.[field] ?? '').trim();
        if (!value) continue;
        if (field === 'name' && value !== next.name && next.name) next.aliases = appendUnique(next.aliases, [next.name], 10);
        next[field] = value;
    }
    if (!locked.has('aliases')) next.aliases = appendUnique(next.aliases, patch?.aliases, 10);
    if (!locked.has('behaviorProfile') && Array.isArray(patch?.behaviorProfile)) {
        next.behaviorProfile = appendUnique([], patch.behaviorProfile, limits.behaviorProfile);
    }
    if (!locked.has('mannerisms') && Array.isArray(patch?.mannerisms)) {
        next.mannerisms = appendUnique([], patch.mannerisms, limits.mannerisms);
    }
    if (!locked.has('keyRelationships') && Array.isArray(patch?.keyRelationships)) {
        const incoming = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
        next.keyRelationships = appendUnique([], incoming, limits.keyRelationships);
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
    if (Number.isFinite(Number(patch?.importance))) next.importance = Math.max(next.importance || 0, Math.min(100, Math.max(0, Math.round(Number(patch.importance)))));
    return next;
}

function applyDynamicPatch(npc, patch, options = {}) {
    const next = applyLivePatch(npc, patch);
    const relationshipSummary = String(patch?.relationshipSummary ?? '').trim();
    if (relationshipSummary) next.relationshipSummary = relationshipSummary;
    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = appendUnique([], patch.memories, limits.memories);
    }
    return next;
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
        const value = Number(proposed[axis]);
        delta[axis] = Number.isFinite(value) ? Math.max(-cap, Math.min(cap, Math.round(value))) : 0;
    }
    if (!Object.values(delta).some(Boolean)) return { impact: 'none', delta, evidence: '', reason: '' };
    return { impact, delta, evidence: evidence.slice(0, 800), reason: reason.slice(0, 800) };
}

function applyRelationshipChange(npc, patch, options) {
    const change = relationshipDeltaForPatch(patch, options.relationshipCaps);
    if (change.impact === 'none') return npc;
    const next = structuredClone(npc);
    const current = normalizeRelationship(next.relationship);
    const updated = {};
    for (const axis of RELATIONSHIP_AXES) updated[axis] = Math.max(-100, Math.min(100, current[axis] + change.delta[axis]));
    next.relationship = updated;
    const event = {
        ...change,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    };
    next.lastRelationshipChange = event;
    next.relationshipHistory = [...(next.relationshipHistory || []), event].slice(-24);
    return next;
}

function applyLifeState(npc, patch, options) {
    const next = structuredClone(npc);
    const lifeState = String(patch?.lifeState || '').trim();
    const certainty = String(patch?.lifeStateCertainty || '').trim();
    const reason = String(patch?.lifeStateReason || '').trim();
    if (patch?.livingReturn === true) {
        next.archived = false;
        next.archiveReason = '';
        next.archivedAt = null;
        next.lifeState = 'alive';
        next.lifeStateCertainty = certainty || 'explicit';
        next.lifeStateReason = reason || 'Explicit living return in current continuity.';
        return next;
    }
    if (['alive', 'dead', 'unknown'].includes(lifeState)) {
        next.lifeState = lifeState;
        next.lifeStateCertainty = certainty;
        if (reason) next.lifeStateReason = reason;
    }
    if (lifeState === 'dead' && ['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase())) {
        next.archived = true;
        next.archiveReason = 'deceased';
        next.archivedAt = Date.now();
        next.present = false;
        next.worldActive = false;
    }
    return next;
}

function socialEdgeKey(edge) {
    const ids = [String(edge.fromId || ''), String(edge.toId || '')].sort();
    return `${ids[0]}\0${ids[1]}\0${normalizeName(edge.relation)}`;
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

    state.npcs = state.npcs.map(npc => sanitizePlayerKeyRelationships(npc, playerName));

    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);
    const presentRefs = uniqueStrings(result.finalPresentNpcIds);
    const worldRefs = uniqueStrings(result.worldActiveNpcIds);
    // New idless patches are themselves explicit bootstrap observations. Trust them as
    // bootstrap candidates so an imperfect reference array cannot silently discard the
    // second or third new NPC from an otherwise valid embedded scan. The prompt forbids
    // background/mentioned-only characters from being emitted as new npcs entries.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = String(patch?.name || '').trim();
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !GENERIC_REFERENCES.has(normalizeName(name)) && !findNpcByReference(state, name);
        })
        .map(patch => String(patch.name).trim()));
    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];

    const deletedIds = new Set(state.deletedNpcIds || []);
    const patchByNpcId = new Map();
    for (const patch of result.npcs) {
        const patchId = String(patch?.id || '').trim();
        if (patchId && deletedIds.has(patchId)) continue;
        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        if (!npc && patch?.name) {
            // Unknown model ids are never authoritative. Exact canonical name/alias may
            // still reconcile the returned patch to an existing dossier safely.
            npc = findNpcByReference(state, String(patch.name));
        }
        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));
        if (!npc && referenced) {
            const created = createFromPatch(patch, sourceMessageId);
            if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                state.npcs.push(created);
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
                    // locally allocated id. Resolve by its canonical returned name first.
                    npc = patch?.name ? findNpcByReference(state, String(patch.name)) : null;
                    if (!npc) {
                        const created = createFromPatch(patch, sourceMessageId);
                        if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                            state.npcs.push(created);
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
    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => !worldSet.has(id) || targetSet.has(id)));

    for (let i = 0; i < state.npcs.length; i += 1) {
        let npc = state.npcs[i];
        const patch = patchByNpcId.get(npc.id);
        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));
        if (canPatch) {
            npc = applyStablePatch(npc, patch, { playerName, dossierLimits });
            npc = applyDynamicPatch(npc, patch, { dossierLimits });
            npc = applyLifeState(npc, patch, options);
            if (applyRelationship && exchangeSet.has(npc.id)) npc = applyRelationshipChange(npc, patch, {
                relationshipCaps: options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                sourceMessageId,
                turn,
            });
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
        return patch?.name ? findNpcByReference(state, String(patch.name)) : null;
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
        const edge = { fromId: from.id, toId: to.id, relation, summary: String(raw?.summary || '').trim().slice(0, 500), updatedAt: Date.now(), sourceMessageId };
        edgeMap.set(socialEdgeKey(edge), edge);
    }
    state.socialGraph = [...edgeMap.values()].slice(-200);

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

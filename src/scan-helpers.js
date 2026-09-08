const ACTIVITY_SHORT_IDENTITY_STOP = new Set([
    'a', 'an', 'the', 'of', 'de', 'da', 'del', 'di', 'la', 'le', 'van', 'von',
    'mr', 'mrs', 'ms', 'miss', 'sir', 'dame', 'lady', 'lord', 'dr', 'doctor',
    'captain', 'commander', 'lieutenant', 'sergeant', 'master', 'mistress',
    'father', 'mother', 'sister', 'brother', 'elder', 'saint', 'st',
    'may', 'will', 'can', 'shall',
]);

import { DOSSIER_EVALUATION_GROUPS, DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS } from './model/dossier-fields.js';
import { RELATIONSHIP_AXES, normalizeRelationship, normalizeRelationshipProgress, normalizeRelationshipEvidenceHistory, normalizeName } from './schema.js';

export const GENERIC_REFERENCES = new Set(['he', 'she', 'they', 'them', 'him', 'her', 'it', 'someone', 'somebody', 'npc', 'unknown npc']);

export function compactText(value, max = 8000) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

export function uniqueStrings(values = [], max = 100) {
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

export function appendUnique(existing = [], incoming = [], max = 12) {
    const out = [...existing];
    const seen = new Set(existing.map(item => normalizeName(item)));
    for (const item of incoming || []) {
        if (typeof item !== 'string') continue;
        const clean = item.trim();
        const key = normalizeName(clean);
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out.slice(0, max);
}

function dossierExtractionGroupSummary() {
    return DOSSIER_EVALUATION_GROUPS.map(group => {
        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field]?.group === group);
        return `${group}:${fields.map(field => field + (DOSSIER_FIELD_DEFINITIONS[field].kind === 'collection' ? '[]' : '')).join(',')}`;
    }).join(';');
}

export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const modes = [];
    if (includeNew) modes.push('NEW: capture supported facts only; unknown is valid');
    if (includeExisting) modes.push('EXISTING: compare supplied context; semanticUpdates only');
    return [
        `DOSSIER EXTRACTION MAP: ${dossierExtractionGroupSummary()}. ${modes.join('. ')}.`,
        'FIELD EVALUATION: propose each applicable field or list it once in fieldEvaluations unchanged|insufficient|unavailable. evaluatedGroups are group labels only; omission is unaccounted, and contextCoverage unavailable/partial is not empty.',
        'PROFILE EVIDENCE: personality may be established narrowly from multiple reinforcing choices, reactions, or interaction patterns in one scene when they support the same scoped trait; one isolated gesture, mood, pose, or line does not prove a broad lifelong trait.',
        'PROFILE OBSERVATIONS: EXISTING NPCs may emit evidence-only profileObservations:[{field,observation,concept?,sources:[{messageId,excerpt}],explanation?}] for personality|behaviorProfile|speech|mannerisms. They never directly mutate dossier, relationship, presence, or lifecycle. Distinct concepts may share an excerpt; same owned source+concept retries are not independent. If the same fact also drives an update, reuse its source excerpt.',
        'PROFILE DEVELOPMENT: refine compatible detail. Lasting change needs explicit sustained development or independent observations plus new support; elapsed time, temporary mood/sleep/injury/stress/silence, or one interaction is insufficient. Player-specific attitude belongs in Current Dynamic when appropriate.',
        'PROFILE CONSOLIDATION: keep behaviorProfile/mannerisms compact. Use supplied refs with targeted replace/remove/add to merge substantial overlap while preserving distinct facts, scope, exceptions, unrelated entries, and ownership. One-off gestures may remain observations.',
        'BACKGROUND EVIDENCE: background is durable affiliation/employment, origin, training, prior history, or lasting circumstance. A clearly established workplace or affiliation may populate background on first pass; never invent tenure, origin, family history, or earlier events.',
        'APPARENT AGE: actual age is chronological and separate. Specific visual age -> apparentAge=~N. A broad visible age band may semantically infer a defensible numeric interval apparentAge=~N-M; do not use a fixed phrase-to-range lookup. The backend chooses and persists one stable ~N inside that interval. Never copy it into actual age; unsupported visual age is insufficient.',
        'APPEARANCE FIDELITY: appearance/form is a portrait-ready overall visual synthesis, not a latest-detail delta. Preserve prior supported visible facts unless contradicted and fold in new grounded traits. Never invent missing portrait features, uniform pieces, accessories, colors, materials, or body traits.',
        'BEHAVIOR PROFILE EVIDENCE: behaviorProfile is recurring or explicitly generalized behavior; one isolated action may support current status or an observed mannerism but must not be rewritten as a habitual behavior.',
        'PRIVATE COMPLETENESS CHECK: silently check all dossier fields + Current Dynamic before payload; unknown is valid and needs no invented fact.',
    ];
}

export function nonSystemMessages(chat = []) {
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

export function resolvePlayerName(explicit = '', chat = [], assistantMessageId = null) {
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

export function containsNormalizedPhrase(value, phrase) {
    // normalizeName() intentionally caps identity keys at 160 chars. Evidence/search
    // haystacks are not identity keys and must not silently stop matching after char 160.
    const haystack = evidenceTextKey(value, 50000);
    const needle = evidenceTextKey(phrase, 600);
    return Boolean(haystack && needle && ` ${haystack} `.includes(` ${needle} `));
}

export function evidenceTextKey(value, max = 20000) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim()
        .slice(0, max);
}

function shortActivityIdentityTokens(value) {
    return String(value || '').normalize('NFKC').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
}

export function shortActivityIdentityCandidates(npc) {
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

export function shortActivityIdentityUnique(state, npc, candidate) {
    const key = normalizeName(candidate);
    if (!key) return false;
    return !(state?.npcs || []).some(other => {
        if (!other || other.id === npc?.id) return false;
        return [other.name, ...(Array.isArray(other.aliases) ? other.aliases : [])].some(value =>
            shortActivityIdentityTokens(value).some(token => normalizeName(token) === key));
    });
}

export function identityTokenMention(text, candidate) {
    const clean = String(candidate || '').trim();
    if (!clean) return false;
    const upper = clean.toLocaleUpperCase();
    return shortActivityIdentityTokens(text).some(observed => observed === clean || observed === upper);
}

export function relationshipSummaryRepairContext(npc = {}) {
    const relationship = normalizeRelationship(npc.relationship || {});
    const progress = normalizeRelationshipProgress(npc.relationshipProgress || {});
    const recentEvidence = normalizeRelationshipEvidenceHistory(npc.relationshipEvidenceHistory).slice(-4).map(item => ({
        impact: item.impact,
        delta: item.delta,
        evidence: compactText(item.evidence, 320),
        reason: compactText(item.reason, 320),
    }));
    const milestones = (Array.isArray(npc.relationshipMilestones) ? npc.relationshipMilestones : []).slice(-8).map(item => ({
        axis: item?.axis,
        polarity: item?.polarity,
        threshold: item?.threshold,
        reason: compactText(item?.reason, 180),
    }));
    const recentChanges = (Array.isArray(npc.relationshipHistory) ? npc.relationshipHistory : []).slice(-4).map(item => ({
        impact: item?.impact,
        delta: normalizeRelationship(item?.delta || {}),
        evidence: compactText(item?.evidence, 320),
        reason: compactText(item?.reason, 320),
    }));
    const hasEstablishedState = RELATIONSHIP_AXES.some(axis => Number(relationship[axis]) !== 0 || Number(progress[axis]) !== 0)
        || recentEvidence.length > 0
        || recentChanges.length > 0
        || milestones.length > 0;
    if (!hasEstablishedState) return null;
    return { relationship, progress, milestones, recentEvidence, recentChanges };
}

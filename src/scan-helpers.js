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
        'FIRST-PASS SUFFICIENCY: One scene can contain multiple distinct observations supporting a narrow initial field; repeated encounters are not required. It remains ONE owned source for later development, not multiple independent events. Unknown is valid when evidence is insufficient.',
        'PROFILE EVIDENCE: personality may be established narrowly from multiple reinforcing choices/reactions; one isolated gesture, mood, pose, or line does not prove a broad lifelong trait.',
        'PROFILE OBSERVATIONS: NEW and EXISTING NPCs may retain tentative personality|behaviorProfile|speech|mannerisms evidence via profileObservations (shape below), even when the field is insufficient. Admission must succeed first. Observations never mutate fields/activity/relationships. Distinct concepts may share an excerpt; reuse the same source for the same fact and update, never count retries twice.',
        'PROFILE DEVELOPMENT: refine compatible detail. Lasting change needs explicit sustained development or independent observations plus new support; elapsed time or temporary mood/sleep/injury/stress/silence is insufficient. Player-specific attitude belongs in Current Dynamic.',
        'PROFILE CONSOLIDATION: keep behaviorProfile/mannerisms compact; merge substantial overlap while preserving distinct facts/scope, unrelated entries, and ownership. One-off gestures may remain observations.',
        'BACKGROUND EVIDENCE: role=current function/title; background=durable affiliation/employment, origin, training, prior history, or lasting circumstance. A clearly established workplace or affiliation may populate background on first pass, even if it also supports role; do not mark background insufficient merely because role is populated. Never invent tenure, origin, family history, or earlier events.',
        'APPARENT AGE: Direct visible life-stage wording in either CURRENT USER or ASSISTANT (child, adolescent, young woman/man/adult, middle-aged, elderly) is positive evidence. Infer a defensible interval ~N-M or specific visual age ~N; no fixed phrase-to-range lookup. Backend persists one stable ~N within the interval. Actual age is separate and never inferred from appearance.',
        'APPEARANCE FIDELITY: appearance/form is a portrait-ready overall visual synthesis, not a latest-detail delta. Preserve prior supported visible facts unless contradicted and fold in new grounded traits. Never invent missing portrait features, uniform pieces, accessories, colors, materials, or body traits.',
        'BEHAVIOR PROFILE EVIDENCE: MANNERISM SUFFICIENCY: behaviorProfile is what the NPC tends to do; explicit recurrence/generalization or multiple reinforcing actions can establish one narrow pattern even first-scene. One isolated action may support status/observation but must not be rewritten as a habitual behavior. mannerisms are repeated characteristic gestures/object-handling/social habits; multiple related instances may consolidate into one narrow mannerism; one isolated gesture is insufficient.',
        'PRIVATE COMPLETENESS CHECK: directly supported values from permitted CURRENT sources are proposals, not insufficient. Unknown is valid; never invent.',
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

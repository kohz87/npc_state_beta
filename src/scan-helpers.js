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
        'FIELD EVALUATION DETAIL: propose each applicable field or list it in fieldEvaluations unchanged|insufficient|unavailable. evaluatedGroups are group labels only; omission=unaccounted. contextCoverage.unavailable/partial != empty.',
        'PROFILE EVIDENCE: personality may be established narrowly from multiple reinforcing choices, reactions, or interaction patterns in the same scene when they support the same trait. Qualify the trait to the observed context when needed; one isolated gesture, pose, mood, or line never proves a broad lifelong personality.',
        'BACKGROUND EVIDENCE: background is durable biographical or contextual information such as established affiliation, employment/position, origin, training, prior history, or lasting circumstances. A clearly established workplace or affiliation may populate background on first pass even when no past-tense biography is given. Keep it concise; never invent tenure, origin, family history, or earlier events.',
        'APPEARANCE FIDELITY: appearance and form descriptions may contain only visible physical, clothing, equipment, or form details grounded in permitted evidence. Do not add plausible uniform pieces, accessories, colors, materials, or body features that were not described.',
        'BEHAVIOR PROFILE EVIDENCE: behaviorProfile describes recurring or explicitly generalized patterns. One isolated action may support current status or an observed mannerism, but must not be rewritten as a habitual behavior unless the scene repeats it or the narrative generalizes it.',
        'PRIVATE COMPLETENESS CHECK: same generation; silently check all dossier fields + Current Dynamic before payload. One-off gestures may be observed mannerisms, never recurring/lifelong traits. No reasoning.',
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

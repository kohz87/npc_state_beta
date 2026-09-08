import { resolvedCurrentAppearance } from './appearance.js';
import { semanticEntryRef } from './model/semantic-updates.js';
import { DOSSIER_FIRST_PASS_LIVE_FIELDS } from './model/dossier-fields.js';
import { normalizeDossierLimits } from './schema.js';

export function hashForegroundText(value) {
    const source = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function clipForegroundText(value, max = 600) {
    const source = String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
    if (!source || source.length <= max) return source;
    const floor = Math.max(24, Math.floor(max * 0.65));
    const head = source.slice(0, max - 1);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '), head.lastIndexOf(', '), head.lastIndexOf(' '));
    const cut = sentence >= floor ? sentence + (head[sentence] === ' ' ? 0 : 1) : max - 1;
    return head.slice(0, cut).trimEnd() + '…';
}

function compactArray(values, maxEntries, maxChars) {
    if (maxEntries <= 0) return [];
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
        const value = clipForegroundText(raw, maxChars);
        const key = value.toLocaleLowerCase();
        if (!value || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= maxEntries) break;
    }
    return out;
}

function referenceText(value, max = 12000) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim().slice(0, max);
}

function refEntries(field, values, maxEntries, maxChars) {
    if (maxEntries <= 0) return [];
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
        const original = String(raw ?? '').replace(/\u0000/g, '').trim();
        const key = referenceText(original, 2000);
        if (!original || !key || seen.has(key)) continue;
        seen.add(key);
        out.push({ ref: semanticEntryRef(field, original), value: clipForegroundText(original, maxChars) });
        if (out.length >= maxEntries) break;
    }
    return out;
}

function relationshipBand(value, positive, negative) {
    const score = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
    const magnitude = Math.abs(score);
    if (magnitude < 10) return 'little established signal';
    if (magnitude < 30) return score > 0 ? `slightly ${positive}` : `slightly ${negative}`;
    if (magnitude < 70) return score > 0 ? `established ${positive}` : `established ${negative}`;
    if (magnitude < 90) return score > 0 ? `strong ${positive}` : `strong ${negative}`;
    return score > 0 ? `very deep ${positive}` : `very deep ${negative}`;
}

export function qualitativeRelationshipLens(npc = {}) {
    const rel = npc.relationship || {};
    return [
        `trust=${relationshipBand(rel.trust, 'confidence/reliance', 'distrust/wariness')}`,
        `affection=${relationshipBand(rel.affection, 'warmth/attachment', 'dislike/distance')}`,
        `desire=${relationshipBand(rel.desire, 'attraction/intimate interest', 'aversion/lack of intimate interest')}`,
        `tension=${relationshipBand(rel.tension, 'strain/charged friction', 'ease/low strain')}`,
    ].join('; ');
}

function currentUserReferencedNpcIds(state, currentUserText = '') {
    const haystack = ` ${referenceText(currentUserText)} `;
    const ids = new Set();
    if (!haystack.trim()) return ids;
    for (const npc of state?.npcs || []) {
        const labels = [npc?.name, ...(npc?.aliases || [])]
            .map(value => referenceText(value, 600))
            .filter(value => value.length >= 2);
        if (labels.some(label => haystack.includes(` ${label} `))) ids.add(npc.id);
    }
    return ids;
}

export function runtimeNpcSalience(npc, state = {}) {
    const activeIds = new Set([
        ...(state?.lastObservation?.exchangeActiveNpcIds || []),
        ...(state?.lastObservation?.finalPresentNpcIds || []),
        ...(state?.lastObservation?.worldActiveNpcIds || []),
    ]);
    return (npc?.present ? 1000 : 0)
        + (npc?.worldActive ? 400 : 0)
        + (activeIds.has(npc?.id) ? 300 : 0)
        + Math.max(0, Math.min(100, Number(npc?.importance) || 0));
}

export function foregroundNpcCandidates(state = {}, settings = {}) {
    const explicitlyReferenced = currentUserReferencedNpcIds(state, settings.foregroundCurrentUserText || '');
    return (state?.npcs || [])
        .filter(npc => !npc.archived || (explicitlyReferenced.has(npc.id) && String(npc.archiveReason || '').toLocaleLowerCase() !== 'deceased'))
        .sort((a, b) =>
            Number(explicitlyReferenced.has(b.id)) - Number(explicitlyReferenced.has(a.id))
            || runtimeNpcSalience(b, state) - runtimeNpcSalience(a, state)
            || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1)
            || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export function selectForegroundNpcs(state = {}, settings = {}) {
    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    return foregroundNpcCandidates(state, settings).slice(0, limit);
}

function formEntries(npc, maxEntries, maxChars) {
    if (maxEntries <= 0) return [];
    const forms = Array.isArray(npc?.appearanceForms) ? npc.appearanceForms.filter(Boolean) : [];
    const current = String(npc?.currentForm || '').trim().toLocaleLowerCase();
    return [...forms]
        .sort((a, b) => Number(String(b?.name || '').trim().toLocaleLowerCase() === current) - Number(String(a?.name || '').trim().toLocaleLowerCase() === current))
        .slice(0, maxEntries)
        .map(form => {
            const name = clipForegroundText(form?.name, 80);
            return name && form?.appearance ? {
                ref: semanticEntryRef('appearanceForms', name),
                name,
                current: name.toLocaleLowerCase() === current,
                appearance: clipForegroundText(form.appearance, maxChars),
            } : null;
        })
        .filter(Boolean);
}

function hasRelationshipSignal(npc = {}) {
    const rel = npc.relationship || {};
    return ['trust', 'affection', 'desire', 'tension'].some(key => Math.abs(Number(rel[key]) || 0) >= 10);
}


const FIRST_PASS_LIVE_LIMITS = Object.freeze([
    Object.freeze({ mood: 160, location: 180, goal: 220, status: 220 }),
    Object.freeze({ mood: 160, location: 180, goal: 220, status: 220 }),
    Object.freeze({ mood: 140, location: 160, goal: 180, status: 180 }),
    Object.freeze({ mood: 90, location: 100, goal: 120, status: 120 }),
    Object.freeze({ mood: 72, location: 84, goal: 96, status: 90 }),
]);

function compactFirstPassLiveState(npc, level) {
    const limits = FIRST_PASS_LIVE_LIMITS[Math.max(0, Math.min(FIRST_PASS_LIVE_LIMITS.length - 1, Number(level) || 0))];
    return Object.fromEntries(DOSSIER_FIRST_PASS_LIVE_FIELDS.map(field => [field, clipForegroundText(npc?.[field], limits[field])]));
}

function pruneEmpty(value) {
    if (Array.isArray(value)) return value.map(pruneEmpty).filter(item => item !== undefined);
    if (!value || typeof value !== 'object') {
        if (value === '' || value === null || value === undefined) return undefined;
        return value;
    }
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
        const item = pruneEmpty(raw);
        if (item === undefined) continue;
        if (Array.isArray(item) && item.length === 0) continue;
        if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) continue;
        out[key] = item;
    }
    return Object.keys(out).length ? out : undefined;
}

export function compactForegroundNpc(npc, level = 0, limits = {}) {
    const dossierLimits = normalizeDossierLimits(limits);
    const sizes = level === 0
        ? { forms: 4, formChars: 520, behavior: 5, mannerisms: 5, relationships: 6, memories: 4, entryChars: 320, scalar: 620, background: 520, evidence: 3 }
        : level === 1
            ? { forms: 3, formChars: 360, behavior: 4, mannerisms: 4, relationships: 4, memories: 3, entryChars: 240, scalar: 430, background: 320, evidence: 2 }
            : level === 2
                ? { forms: 2, formChars: 240, behavior: 3, mannerisms: 3, relationships: 3, memories: 2, entryChars: 170, scalar: 280, background: 160, evidence: 1 }
                : level === 3
                    ? { forms: 1, formChars: 150, behavior: 2, mannerisms: 2, relationships: 1, memories: 0, entryChars: 110, scalar: 170, background: 0, evidence: 0 }
                    : { forms: 0, formChars: 0, behavior: 1, mannerisms: 1, relationships: 0, memories: 0, entryChars: 90, scalar: 120, background: 0, evidence: 0 };
    const unavailable = [];
    if (sizes.forms <= 0) unavailable.push('appearanceForms');
    if (sizes.relationships <= 0) unavailable.push('keyRelationships');
    if (sizes.memories <= 0) unavailable.push('memories');
    if (sizes.background <= 0) unavailable.push('background');
    const partial = [];
    if ((npc.appearanceForms || []).length > sizes.forms && sizes.forms > 0) partial.push('appearanceForms');
    if ((npc.behaviorProfile || []).length > Math.min(sizes.behavior, dossierLimits.behaviorProfile)) partial.push('behaviorProfile');
    if ((npc.mannerisms || []).length > Math.min(sizes.mannerisms, dossierLimits.mannerisms)) partial.push('mannerisms');
    if ((npc.keyRelationships || []).length > Math.min(sizes.relationships, dossierLimits.keyRelationships) && sizes.relationships > 0) partial.push('keyRelationships');
    if ((npc.memories || []).length > Math.min(sizes.memories, dossierLimits.memories) && sizes.memories > 0) partial.push('memories');
    const profileEvidence = (Array.isArray(npc?.profileEvolutionEvidence) ? npc.profileEvolutionEvidence : [])
        .slice(sizes.evidence > 0 ? -sizes.evidence : 0, sizes.evidence > 0 ? undefined : 0)
        .map(row => ({
            field: clipForegroundText(row?.field, 40),
            kind: row?.kind === 'observation' ? 'observation' : 'applied',
            ...(row?.kind === 'observation' ? {} : { mode: clipForegroundText(row?.mode, 40) }),
            sourceMessageId: Number.isInteger(row?.sourceMessageId) ? row.sourceMessageId : null,
            evidence: clipForegroundText(row?.evidence, 220),
        }))
        .filter(row => row.field && row.evidence);
    const out = {
        id: npc.id,
        name: npc.name,
        aliases: compactArray(npc.aliases, level === 0 ? 4 : (level >= 4 ? 0 : 2), 100),
        role: clipForegroundText(npc.role, 180),
        species: clipForegroundText(npc.species, 180),
        age: clipForegroundText(npc.age, 60),
        apparentAge: clipForegroundText(npc.apparentAge, 60),
        birthday: clipForegroundText(npc.birthday, 100),
        birthdayProvenance: npc.birthdayProvenance === 'generated' ? 'generated' : '',
        appearance: clipForegroundText(npc.appearance || resolvedCurrentAppearance(npc), sizes.scalar),
        currentForm: clipForegroundText(npc.currentForm, 100),
        appearanceForms: formEntries(npc, sizes.forms, sizes.formChars),
        personality: clipForegroundText(npc.personality, sizes.scalar),
        behaviorProfile: refEntries('behaviorProfile', npc.behaviorProfile, Math.min(sizes.behavior, dossierLimits.behaviorProfile), sizes.entryChars),
        speech: clipForegroundText(npc.speech, sizes.scalar),
        mannerisms: refEntries('mannerisms', npc.mannerisms, Math.min(sizes.mannerisms, dossierLimits.mannerisms), sizes.entryChars),
        keyRelationships: refEntries('keyRelationships', npc.keyRelationships, Math.min(sizes.relationships, dossierLimits.keyRelationships), sizes.entryChars),
        memories: refEntries('memories', npc.memories, Math.min(sizes.memories, dossierLimits.memories), sizes.entryChars),
        background: sizes.background > 0 ? clipForegroundText(npc.background, sizes.background) : '',
        live: {
            ...compactFirstPassLiveState(npc, level),
            lifeState: clipForegroundText(npc.lifeState, 40),
        },
        playerRelationship: {
            lens: level >= 3 ? '' : (hasRelationshipSignal(npc) ? qualitativeRelationshipLens(npc) : ''),
            summary: level >= 4 ? '' : clipForegroundText(npc.relationshipSummary, level >= 3 ? 120 : 320),
        },
        manualProfileFields: compactArray(npc.manualProfileFields, 16, 60),
        recentProfileEvidence: profileEvidence,
        ...(unavailable.length || partial.length ? { contextCoverage: {
            ...(unavailable.length ? { unavailable } : {}),
            ...(partial.length ? { partial } : {}),
        } } : {}),
    };
    if (level >= 2) {
        if (!out.background) delete out.background;
        if (!out.memories.length) delete out.memories;
        if (!out.keyRelationships.length) delete out.keyRelationships;
        if (!out.appearanceForms.length) delete out.appearanceForms;
        if (!out.recentProfileEvidence.length) delete out.recentProfileEvidence;
        if (!out.aliases.length) delete out.aliases;
    }
    return pruneEmpty(out) || { id: npc.id, name: npc.name };
}

function npcContentSignature(npc = {}) {
    const formText = (npc.appearanceForms || []).map(form => `${form?.name || ''}:${form?.appearance || ''}`).join('|');
    const profileEvidence = (npc.profileEvolutionEvidence || []).slice(-6).map(row => `${row?.field || ''}:${row?.kind || ''}:${row?.mode || ''}:${row?.sourceMessageId ?? ''}:${row?.evidence || ''}`).join('|');
    return hashForegroundText([
        npc.id, npc.name, (npc.aliases || []).join('|'), npc.role, npc.species, npc.age, npc.apparentAge, npc.birthday, npc.birthdayProvenance,
        npc.appearance, npc.currentForm, formText, npc.personality, (npc.behaviorProfile || []).join('|'), npc.speech,
        (npc.mannerisms || []).join('|'), (npc.keyRelationships || []).join('|'), (npc.memories || []).join('|'), npc.background,
        npc.mood, npc.location, npc.goal, npc.status, npc.lifeState, npc.relationshipSummary,
        JSON.stringify(npc.relationship || {}), (npc.manualProfileFields || []).join('|'), profileEvidence,
    ].join('\u001f'));
}

export function foregroundStateRevisionSignature(state = {}) {
    const observation = state?.lastObservation || {};
    return [
        String(state?.branchSafety?.status || 'safe'),
        (observation.exchangeActiveNpcIds || []).join(','),
        (observation.finalPresentNpcIds || []).join(','),
        (observation.worldActiveNpcIds || []).join(','),
        ...(state?.npcs || []).map(npc => `${npc?.id || ''}:${Number(npc?.updatedAt) || 0}:${npc?.present ? 1 : 0}:${npc?.worldActive ? 1 : 0}:${npc?.archived ? 1 : 0}:${npcContentSignature(npc)}`),
    ].join('|');
}

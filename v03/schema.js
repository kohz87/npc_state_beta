export const NPC_STATE_VERSION = '0.4.6';
export const NPC_STATE_SCHEMA_VERSION = 1;
export const NPC_ADMISSION_MODES = Object.freeze(['balanced', 'named_preferred', 'manual']);
export function normalizeNpcAdmissionMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return NPC_ADMISSION_MODES.includes(mode) ? mode : 'balanced';
}

export const BIRTHDAY_FILL_MODES = Object.freeze(['off', 'unknown', 'random']);
export const DEFAULT_BIRTHDAY_RANDOM_CALENDAR = Object.freeze([
    'January:31', 'February:28', 'March:31', 'April:30', 'May:31', 'June:30',
    'July:31', 'August:31', 'September:30', 'October:31', 'November:30', 'December:31',
].join('\n'));
export function normalizeBirthdayFillMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return BIRTHDAY_FILL_MODES.includes(mode) ? mode : 'off';
}
export function normalizeBirthday(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
export function normalizeBirthdayProvenance(value, birthday = '') {
    const source = String(value || '').trim().toLocaleLowerCase();
    if (['explicit', 'generated', 'manual'].includes(source)) return source;
    return normalizeBirthday(birthday) ? 'explicit' : '';
}
export function normalizeBirthdayCalendar(value, fallbackDays = 30) {
    const fallback = Math.max(1, Math.min(999, Math.round(Number(fallbackDays) || 30)));
    const out = [];
    const seen = new Set();
    for (const raw of String(value ?? '').split(/\r?\n|;/)) {
        const line = raw.trim();
        if (!line) continue;
        const match = line.match(/^(.*?)(?:\s*:\s*(\d{1,3}))?$/);
        const name = normalizeBirthday(match?.[1] || '');
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        const days = Math.max(1, Math.min(999, Math.round(Number(match?.[2]) || fallback)));
        out.push({ name, days });
        if (out.length >= 48) break;
    }
    return out;
}
function birthdayHash(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function generatedBirthdayForNpc(npc = {}, calendarValue = '', fallbackDays = 30) {
    const months = normalizeBirthdayCalendar(calendarValue, fallbackDays);
    if (!months.length) return '';
    const seed = String(npc?.id || npc?.name || 'npc');
    const month = months[birthdayHash(seed + '|birthday-month-v1') % months.length];
    const day = 1 + (birthdayHash(seed + '|birthday-day-v1') % month.days);
    return String(day) + ' ' + month.name;
}
export function applyBirthdayFill(npcInput = {}, options = {}) {
    const npc = structuredClone(npcInput || {});
    const current = normalizeBirthday(npc.birthday);
    const provenance = normalizeBirthdayProvenance(npc.birthdayProvenance, current);
    npc.birthday = current;
    npc.birthdayProvenance = provenance;
    if (current || (npc.manualProfileFields || []).includes('birthday') || provenance === 'manual') return npc;
    const mode = normalizeBirthdayFillMode(options.mode);
    if (mode === 'off') return npc;
    const value = mode === 'unknown'
        ? 'Unknown'
        : generatedBirthdayForNpc(npc, options.calendar, options.fallbackDays);
    if (!value) return npc;
    npc.birthday = value;
    npc.birthdayProvenance = 'generated';
    npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
    return npc;
}

export const RELATIONSHIP_AXES = Object.freeze(['trust', 'affection', 'desire', 'tension']);
export const STABLE_PROFILE_FIELDS = Object.freeze([
    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'birthday', 'appearance', 'appearanceForms',
    'personality', 'behaviorProfile', 'speech', 'mannerisms', 'background', 'keyRelationships',
]);
export const DEFAULT_RELATIONSHIP = Object.freeze({ trust: 0, affection: 0, desire: 0, tension: 0 });
export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });
export const DEFAULT_RELATIONSHIP_PROGRESS = Object.freeze({ trust: 0, affection: 0, desire: 0, tension: 0 });
export const RELATIONSHIP_EVIDENCE_HISTORY_LIMIT = 6;
export const RELATIONSHIP_MILESTONE_THRESHOLDS = Object.freeze([25, 50, 75, 90]);
export const RELATIONSHIP_MILESTONE_REQUIREMENTS = Object.freeze({ 25: 'meaningful', 50: 'major', 75: 'extreme', 90: 'extreme' });
export const RELATIONSHIP_MILESTONE_MIN_RAW = Object.freeze({ 25: 1, 50: 3, 75: 5, 90: 8 });
export const RELATIONSHIP_MILESTONE_LIMIT = RELATIONSHIP_AXES.length * 2 * RELATIONSHIP_MILESTONE_THRESHOLDS.length;
export const MEMORY_LIMIT = 5;
export const KEY_RELATIONSHIP_LIMIT = 12;
export const MANNERISM_LIMIT = 8;
export const BEHAVIOR_PROFILE_LIMIT = 8;
export const DOSSIER_LIMIT_DEFAULTS = Object.freeze({
    memories: MEMORY_LIMIT,
    keyRelationships: KEY_RELATIONSHIP_LIMIT,
    mannerisms: MANNERISM_LIMIT,
    behaviorProfile: BEHAVIOR_PROFILE_LIMIT,
});
export const DOSSIER_LIMIT_MAXIMUMS = Object.freeze({
    memories: 20,
    keyRelationships: 30,
    mannerisms: 16,
    behaviorProfile: 16,
});
export const CHECKPOINT_LIMIT = 48;
export const APPEARANCE_FORM_LIMIT = 12;
export const PROFILE_EVOLUTION_EVIDENCE_LIMIT = 12;
export const FAMILY_SLOT_LIMIT = 100;

function text(value, max = 1200) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function collectionEntry(value, itemMax = 500) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const candidates = [value.text, value.value, value.summary, value.description, value.name, value.label, value.memory, value.mannerism, value.behavior, value.trait, value.alias];
        for (const candidate of candidates) {
            const clean = text(candidate, itemMax);
            if (clean && clean !== '[object Object]') return clean;
        }
        return '';
    }
    const clean = text(value, itemMax);
    return clean === '[object Object]' ? '' : clean;
}

function list(value, max = 12, itemMax = 500) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const clean = collectionEntry(item, itemMax);
        const key = clean.toLocaleLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

const MEMORY_STOP_WORDS = new Set([
    'the','a','an','and','or','but','to','of','in','on','at','for','from','with','without','into','onto','by','as','is','was','were','be','been','being',
    'he','she','they','them','his','her','their','this','that','these','those','when','while','after','before','during','then','later','still','very','really',
    'npc','player','remember','remembers','remembered','memory','that','who','which','what','where','how','it','its',
]);
const MEMORY_EVENT_GROUPS = Object.freeze([
    ['rescue', /\b(rescue(?:d|s|ing)?|sav(?:e|ed|es|ing)|protect(?:ed|s|ing)? from)\b/i],
    ['promise', /\b(promis(?:e|ed|es|ing)|vow(?:ed|s|ing)?|swore|sworn)\b/i],
    ['betray', /\b(betray(?:ed|s|ing|al)?|backstab(?:bed|s|bing)?)\b/i],
    ['wound', /\b(wound(?:ed|s|ing)?|injur(?:e|ed|es|ing)|hurt)\b/i],
    ['discover', /\b(discover(?:ed|s|ing|y)?|found|finds?|uncover(?:ed|s|ing)?)\b/i],
    ['reveal', /\b(reveal(?:ed|s|ing)?|confess(?:ed|es|ing)?|admit(?:ted|s|ting)?)\b/i],
    ['teach', /\b(teach(?:es|ing)?|taught|train(?:ed|s|ing)?)\b/i],
    ['fight', /\b(fight(?:s|ing)?|fought|battle(?:d|s|ing)?|combat)\b/i],
    ['heal', /\b(heal(?:ed|s|ing)?|treat(?:ed|s|ing)?|cure(?:d|s|ing)?)\b/i],
    ['kill', /\b(kill(?:ed|s|ing)?|slay(?:s|ing)?|slew|slain)\b/i],
    ['death', /\b(die(?:d|s|ing)?|dead|death|passed away)\b/i],
    ['give', /\b(give(?:s|n|ing)?|gave|gift(?:ed|s|ing)?)\b/i],
    ['return', /\b(return(?:ed|s|ing)?|gave back|brought back)\b/i],
    ['marry', /\b(marry|married|marries|marriage|wed(?:ded|s|ding)?)\b/i],
    ['separate', /\b(leave|left|depart(?:ed|s|ing)?|separat(?:e|ed|es|ing)|estrang(?:ed|ement))\b/i],
]);

function memorySemanticText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\p{P}\p{S}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
}

function memorySemanticParts(value) {
    const text = memorySemanticText(value);
    const tokens = text.split(/\s+/).filter(token => token.length >= 2 && !MEMORY_STOP_WORDS.has(token));
    const tokenSet = new Set(tokens);
    const events = new Set(MEMORY_EVENT_GROUPS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    return { text, tokens, tokenSet, events };
}

function memoryIntersectionSize(left, right) {
    let count = 0;
    for (const token of left) if (right.has(token)) count += 1;
    return count;
}

export function memoriesSemanticallyDuplicate(a, b) {
    const left = memorySemanticParts(a);
    const right = memorySemanticParts(b);
    if (!left.text || !right.text) return false;
    if (left.text === right.text) return true;
    if (Math.min(left.text.length, right.text.length) >= 28 && (left.text.includes(right.text) || right.text.includes(left.text))) return true;
    const shared = memoryIntersectionSize(left.tokenSet, right.tokenSet);
    const union = new Set([...left.tokenSet, ...right.tokenSet]).size || 1;
    const jaccard = shared / union;
    const sharedEvent = [...left.events].some(event => right.events.has(event));
    const isEventToken = token => MEMORY_EVENT_GROUPS.some(([, pattern]) => pattern.test(token));
    const sharedAnchors = [...left.tokenSet].filter(token => right.tokenSet.has(token) && !isEventToken(token)).length;
    // A shared event verb plus three concrete anchors (typically actor/target/object/place)
    // is strong enough to tolerate richer paraphrasing. Requiring three anchors avoids
    // collapsing two separate rescues merely because the same pair of people is involved.
    if (sharedEvent && sharedAnchors >= 3 && jaccard >= 0.28) return true;
    return shared >= 4 && jaccard >= 0.70;
}

function memoryInformationScore(value) {
    const parts = memorySemanticParts(value);
    return parts.tokenSet.size * 8 + parts.events.size * 4 + Math.min(120, parts.text.length) / 20;
}

export function normalizeMemoryEntries(value, max = MEMORY_LIMIT, itemMax = 700) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    for (const raw of input) {
        const clean = collectionEntry(raw, itemMax);
        if (!clean) continue;
        const duplicateIndex = out.findIndex(existing => memoriesSemanticallyDuplicate(existing, clean));
        if (duplicateIndex >= 0) {
            // Keep the richer of two paraphrases rather than spending two memory slots on
            // the same event. Equal-information ties preserve the earlier established wording.
            if (memoryInformationScore(clean) > memoryInformationScore(out[duplicateIndex]) + 1) out[duplicateIndex] = clean;
            continue;
        }
        out.push(clean);
        if (out.length >= max) break;
    }
    return out.slice(0, max);
}

function keyRelationshipEntry(value, itemMax = 500) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const pick = (keys, max = 240) => {
            for (const key of keys) {
                const clean = text(value?.[key], max);
                if (clean && clean !== '[object Object]') return clean;
            }
            return '';
        };
        const name = pick(['name', 'npc', 'person', 'target', 'otherNpc', 'other', 'with', 'character'], 200);
        const relation = pick(['relationship', 'relation', 'type', 'kind', 'role', 'tie'], 200);
        const summary = pick(['summary', 'description', 'details', 'note'], 300);
        if (name && relation) return text(name + ' - ' + relation + (summary && normalizeName(summary) !== normalizeName(relation) ? ': ' + summary : ''), itemMax);
        if (name && summary) return text(name + ' - ' + summary, itemMax);
        if (name) return text(name, itemMax);
        if (relation && summary) return text(relation + ': ' + summary, itemMax);
        if (summary) return text(summary, itemMax);
        return '';
    }
    const clean = text(value, itemMax);
    return clean === '[object Object]' ? '' : clean;
}

export function normalizeKeyRelationshipEntries(value, max = KEY_RELATIONSHIP_LIMIT, itemMax = 500) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const clean = keyRelationshipEntry(item, itemMax);
        const key = normalizeName(clean);
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

function clampRelationship(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(-100, Math.min(100, Math.round(number))) : 0;
}

function normalizeSocialEdges(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of value) {
        const fromId = text(raw?.fromId, 160);
        const toId = text(raw?.toId, 160);
        const relation = text(raw?.relation, 160);
        if (!fromId || !toId || fromId === toId || !relation) continue;
        const key = `${fromId}\0${toId}\0${normalizeName(relation)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            fromId,
            toId,
            relation,
            summary: text(raw?.summary, 500),
            updatedAt: Number(raw?.updatedAt) || Date.now(),
            sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,
            provenance: ['manual', 'explicit', 'strong-context', 'migration', 'inferred'].includes(String(raw?.provenance)) ? String(raw.provenance) : 'explicit',
            confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,
            inferred: raw?.inferred === true,
        });
        if (out.length >= 200) break;
    }
    return out;
}

export function normalizeFamilySlots(value = [], validNpcIds = null) {
    const valid = validNpcIds instanceof Set ? validNpcIds : null;
    const source = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const ownerId = text(raw.ownerId, 160);
        const relation = text(raw.relation, 120);
        if (!ownerId || !relation || (valid && !valid.has(ownerId))) continue;
        const count = Math.max(1, Math.min(20, Math.round(Number(raw.count) || 1)));
        const descriptor = text(raw.descriptor, 240);
        const twinGroup = text(raw.twinGroup, 160);
        const id = text(raw.id, 260) || ('family:' + ownerId + ':' + normalizeName(relation).replace(/\s+/g, '_') + ':' + normalizeName(twinGroup || descriptor).replace(/\s+/g, '_'));
        if (seen.has(id)) continue;
        seen.add(id);
        const resolvedNpcIds = list(raw.resolvedNpcIds, count, 160).filter(item => item !== ownerId && (!valid || valid.has(item))).slice(0, count);
        out.push({
            id,
            ownerId,
            relation,
            count,
            resolvedNpcIds,
            descriptor,
            twinGroup,
            evidence: text(raw.evidence, 600),
            provenance: ['manual', 'explicit', 'strong-context', 'migration', 'inferred'].includes(String(raw.provenance)) ? String(raw.provenance) : 'explicit',
            confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            updatedAt: Number(raw.updatedAt) || Date.now(),
        });
        if (out.length >= FAMILY_SLOT_LIMIT) break;
    }
    return out;
}

export function normalizeName(value) {
    return text(value, 160).normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
}

export function normalizeApparentAge(value) {
    const raw = text(value, 80);
    if (!raw) return '';
    // Apparent age is deliberately one approximate number, never a decade or range.
    if (/\b\d{1,4}\s*['’]?\s*s\b/i.test(raw)) return '';
    const matches = [...raw.matchAll(/(^|[^\d])(\d{1,4})(?!\d)/g)].map(match => Number(match[2]));
    if (matches.length !== 1 || !Number.isInteger(matches[0]) || matches[0] < 0) return '';
    return `~${matches[0]}`;
}

export function normalizeActualAge(value) {
    const raw = text(value, 80);
    if (!raw) return '';
    // Actual age is chronological numeric data, not a life-stage label or a broad band.
    // Preserve small-unit ages for infants/newborns, while years use the compact N/~N form.
    if (/\b\d{1,4}\s*['’]?\s*s\b/i.test(raw)) return '';
    if (/\d{1,4}\s*(?:-|–|—|to)\s*\d{1,4}/i.test(raw)) return '';
    const matches = [...raw.matchAll(/(^|[^\d])(\d{1,4})(?!\d)/g)].map(match => Number(match[2]));
    if (matches.length !== 1 || !Number.isInteger(matches[0]) || matches[0] < 0) return '';
    const number = matches[0];
    const approximate = /~|\b(?:about|around|approx(?:imately)?|roughly|circa)\b/i.test(raw);
    const prefix = approximate ? '~' : '';
    const lower = raw.toLocaleLowerCase();
    const unit = /\bdays?\b/.test(lower) ? 'day'
        : (/\bweeks?\b/.test(lower) ? 'week'
            : (/\bmonths?\b/.test(lower) ? 'month' : ''));
    if (unit) return `${prefix}${number} ${unit}${number === 1 ? '' : 's'}`;
    return `${prefix}${number}`;
}

const LIFECYCLE_ONLY_CURRENT_STATUSES = new Set([
    'active', 'inactive', 'not active', 'currently active', 'currently inactive',
    'present', 'not present', 'currently present', 'currently not present',
    'in chat', 'not in chat', 'in the chat', 'not in the chat',
    'in scene', 'not in scene', 'in the scene', 'not in the scene',
    'on screen', 'off screen', 'active on screen', 'active off screen', 'inactive off screen',
    'world active', 'world inactive', 'archived', 'unarchived', 'not archived',
    'dossier active', 'dossier inactive',
]);

export function normalizeCurrentStatus(value) {
    const clean = text(value, 360);
    if (!clean) return '';
    return LIFECYCLE_ONLY_CURRENT_STATUSES.has(normalizeName(clean)) ? '' : clean;
}

export function normalizeAppearanceForms(value) {
    const source = Array.isArray(value)
        ? value
        : (value && typeof value === 'object'
            ? Object.entries(value).map(([name, appearance]) => ({ name, appearance }))
            : []);
    const out = [];
    const seen = new Set();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const name = text(raw.name ?? raw.form ?? raw.label, 80);
        const appearance = text(raw.appearance ?? raw.description ?? raw.text, 1800);
        const key = normalizeName(name);
        if (!name || !key || !appearance || seen.has(key)) continue;
        seen.add(key);
        out.push({ name, appearance });
        if (out.length >= APPEARANCE_FORM_LIMIT) break;
    }
    return out;
}

export function appearanceFormByName(forms, reference) {
    const key = normalizeName(reference);
    if (!key) return null;
    return normalizeAppearanceForms(forms).find(form => normalizeName(form.name) === key) || null;
}

export function normalizeDossierLimits(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.keys(DOSSIER_LIMIT_DEFAULTS).map(key => {
        const number = Math.round(Number(source[key]));
        const fallback = DOSSIER_LIMIT_DEFAULTS[key];
        const maximum = DOSSIER_LIMIT_MAXIMUMS[key];
        return [key, Number.isFinite(number) ? Math.max(1, Math.min(maximum, number)) : fallback];
    }));
}

export function makeNpcId(name = 'npc', nonce = '') {
    const slug = text(name, 60).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLocaleLowerCase().slice(0, 36) || 'npc';
    const seed = `${name}\0${nonce || `${Date.now()}-${Math.random()}`}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `npc-${slug}-${(hash >>> 0).toString(36)}`;
}

export function normalizeRelationship(value = {}) {
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, clampRelationship(value?.[axis])]));
}

export function normalizeRelationshipProgress(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(RELATIONSHIP_AXES.map(axis => {
        const number = Number(source[axis]);
        const safe = Number.isFinite(number) ? Math.max(-0.999999, Math.min(0.999999, number)) : 0;
        return [axis, Math.abs(safe) < 0.000001 ? 0 : Number(safe.toFixed(6))];
    }));
}

export function normalizeRelationshipEvidenceHistory(value = []) {
    const source = Array.isArray(value) ? value : [];
    return source.slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT * 2).map(raw => ({
        impact: ['ordinary', 'meaningful', 'major', 'extreme'].includes(String(raw?.impact)) ? String(raw.impact) : 'ordinary',
        reason: text(raw?.reason, 800),
        evidence: text(raw?.evidence, 800),
        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,
        turn: Number.isInteger(raw?.turn) ? raw.turn : null,
        at: Number(raw?.at) || null,
    })).filter(item => item.reason || item.evidence).slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT);
}

function normalizeMilestonePolarity(value) {
    const number = Number(value);
    return number > 0 ? 1 : (number < 0 ? -1 : 0);
}

function milestoneIdentity(entry) {
    return String(entry?.axis || '') + ':' + String(entry?.polarity || 0) + ':' + String(entry?.threshold || 0);
}

function inferredRelationshipMilestones(relationship = DEFAULT_RELATIONSHIP, { includeBoundary = false, reason = 'Existing relationship depth predates milestone tracking.' } = {}) {
    const rel = normalizeRelationship(relationship || DEFAULT_RELATIONSHIP);
    const out = [];
    for (const axis of RELATIONSHIP_AXES) {
        const score = Number(rel[axis]) || 0;
        const polarity = Math.sign(score);
        if (!polarity) continue;
        const magnitude = Math.abs(score);
        for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
            const established = includeBoundary ? magnitude >= threshold : magnitude > threshold;
            if (!established) continue;
            out.push({
                axis,
                polarity,
                threshold,
                reason,
                evidence: '',
                sourceMessageId: null,
                turn: null,
                at: null,
                inferred: true,
            });
        }
    }
    return out;
}

export function normalizeRelationshipMilestones(value, relationship = DEFAULT_RELATIONSHIP, { inferFromRelationship = true, includeBoundary = false } = {}) {
    const source = Array.isArray(value) ? value : [];
    const map = new Map();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const axis = RELATIONSHIP_AXES.includes(String(raw.axis || '').trim().toLocaleLowerCase()) ? String(raw.axis).trim().toLocaleLowerCase() : '';
        const polarity = normalizeMilestonePolarity(raw.polarity);
        const threshold = Number(raw.threshold);
        if (!axis || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;
        const entry = {
            axis,
            polarity,
            threshold,
            reason: text(raw.reason, 300) || 'Relationship milestone established.',
            evidence: text(raw.evidence, 500),
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            turn: Number.isInteger(raw.turn) ? raw.turn : null,
            at: Number(raw.at) || null,
            inferred: raw.inferred === true,
        };
        map.set(milestoneIdentity(entry), entry);
    }
    if (inferFromRelationship) {
        for (const entry of inferredRelationshipMilestones(relationship, { includeBoundary })) {
            const key = milestoneIdentity(entry);
            if (!map.has(key)) map.set(key, entry);
        }
    }
    return [...map.values()]
        .sort((a, b) => RELATIONSHIP_AXES.indexOf(a.axis) - RELATIONSHIP_AXES.indexOf(b.axis)
            || a.polarity - b.polarity
            || a.threshold - b.threshold)
        .slice(0, RELATIONSHIP_MILESTONE_LIMIT);
}

export function relationshipMilestoneUnlocked(milestones, axis, polarity, threshold) {
    const key = String(axis || '').trim().toLocaleLowerCase();
    const sign = normalizeMilestonePolarity(polarity);
    const point = Number(threshold);
    if (!key || !sign || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(point)) return false;
    return normalizeRelationshipMilestones(milestones, DEFAULT_RELATIONSHIP, { inferFromRelationship: false })
        .some(entry => entry.axis === key && entry.polarity === sign && entry.threshold === point);
}

export function applyRelationshipMilestoneCrossings(milestones, crossings = [], { reason = '', evidence = '', sourceMessageId = null, turn = null, at = Date.now() } = {}) {
    const map = new Map(normalizeRelationshipMilestones(milestones, DEFAULT_RELATIONSHIP, { inferFromRelationship: false })
        .map(entry => [milestoneIdentity(entry), entry]));
    for (const raw of Array.isArray(crossings) ? crossings : []) {
        const axis = RELATIONSHIP_AXES.includes(String(raw?.axis || '').trim().toLocaleLowerCase()) ? String(raw.axis).trim().toLocaleLowerCase() : '';
        const polarity = normalizeMilestonePolarity(raw?.polarity);
        const threshold = Number(raw?.threshold);
        if (!axis || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;
        const entry = {
            axis,
            polarity,
            threshold,
            reason: text(reason || raw.reason, 300) || ('Relationship crossed the ' + (polarity > 0 ? '+' : '-') + threshold + ' ' + axis + ' milestone.'),
            evidence: text(evidence || raw.evidence, 500),
            sourceMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
            turn: Number.isInteger(turn) ? turn : null,
            at: Number(at) || Date.now(),
            inferred: false,
        };
        map.set(milestoneIdentity(entry), entry);
    }
    return normalizeRelationshipMilestones([...map.values()], DEFAULT_RELATIONSHIP, { inferFromRelationship: false });
}

export function normalizeProfileEvolutionEvidence(value = []) {
    const allowedFields = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);
    const allowedModes = new Set(['refine', 'gradual', 'explicit', 'batch']);
    const source = Array.isArray(value) ? value : [];
    const out = [];
    for (const raw of source.slice(-PROFILE_EVOLUTION_EVIDENCE_LIMIT * 2)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const field = String(raw.field || '').trim();
        const mode = allowedModes.has(String(raw.mode || '').trim()) ? String(raw.mode).trim() : 'gradual';
        const concept = text(raw.concept, 180);
        const evidence = text(raw.evidence, 600);
        if (!allowedFields.has(field) || !concept || !evidence) continue;
        out.push({
            field,
            mode,
            concept,
            evidence,
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            turn: Number.isInteger(raw.turn) ? raw.turn : null,
            at: Number(raw.at) || null,
        });
    }
    return out.slice(-PROFILE_EVOLUTION_EVIDENCE_LIMIT);
}

export function emptyRelationshipChange() {
    return {
        impact: 'none',
        delta: { ...DEFAULT_RELATIONSHIP },
        evidence: '',
        reason: '',
        sourceMessageId: null,
        turn: null,
        at: null,
    };
}

export function normalizeNpc(input = {}, options = {}) {
    const now = Number(options.now) || Date.now();
    const name = text(input.name || input.label || 'Unknown NPC', 120);
    const id = text(input.id, 160) || makeNpcId(name, options.nonce);
    const locked = new Set(list(input.manualProfileFields, STABLE_PROFILE_FIELDS.length, 80));
    const archiveReason = text(input.archiveReason, 80);
    const archived = input.archived === true;
    const relationshipHistory = Array.isArray(input.relationshipHistory) ? input.relationshipHistory.slice(-24).map(item => ({
        impact: ['none', 'ordinary', 'meaningful', 'major', 'extreme', 'manual'].includes(String(item?.impact)) ? String(item.impact) : 'ordinary',
        delta: normalizeRelationship(item?.delta),
        evidence: text(item?.evidence, 800),
        reason: text(item?.reason, 800),
        sourceMessageId: Number.isInteger(item?.sourceMessageId) ? item.sourceMessageId : null,
        turn: Number.isInteger(item?.turn) ? item.turn : null,
        at: Number(item?.at) || now,
    })) : [];
    const relationship = normalizeRelationship(input.relationship || DEFAULT_RELATIONSHIP);
    const relationshipProgress = normalizeRelationshipProgress(input.relationshipProgress || DEFAULT_RELATIONSHIP_PROGRESS);
    const relationshipEvidenceHistory = normalizeRelationshipEvidenceHistory(input.relationshipEvidenceHistory);
    const hasMilestoneState = Object.prototype.hasOwnProperty.call(input, 'relationshipMilestones');
    const relationshipMilestones = normalizeRelationshipMilestones(input.relationshipMilestones, relationship, { inferFromRelationship: !hasMilestoneState });
    const profileEvolutionEvidence = normalizeProfileEvolutionEvidence(input.profileEvolutionEvidence);
    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);
    const requestedCurrentForm = text(input.currentForm, 80);
    const matchedCurrentForm = appearanceFormByName(appearanceForms, requestedCurrentForm);
    const currentForm = matchedCurrentForm?.name || requestedCurrentForm;
    return {
        id,
        name,
        aliases: list(input.aliases, 10, 120).filter(alias => normalizeName(alias) !== normalizeName(name)),
        role: text(input.role, 240),
        species: text(input.species, 160),
        age: normalizeActualAge(input.age),
        apparentAge: normalizeApparentAge(input.apparentAge),
        birthday: normalizeBirthday(input.birthday),
        birthdayProvenance: normalizeBirthdayProvenance(input.birthdayProvenance, input.birthday),
        appearance: text(input.appearance, 1800),
        appearanceForms,
        currentForm,
        personality: text(input.personality, 1200),
        behaviorProfile: list(input.behaviorProfile, DOSSIER_LIMIT_MAXIMUMS.behaviorProfile, 360),
        speech: text(input.speech, 900),
        mannerisms: list(input.mannerisms, DOSSIER_LIMIT_MAXIMUMS.mannerisms, 280),
        profileEvolutionEvidence,
        background: text(input.background, 1600),
        keyRelationships: normalizeKeyRelationshipEntries(input.keyRelationships, DOSSIER_LIMIT_MAXIMUMS.keyRelationships, 500),
        memories: normalizeMemoryEntries(input.memories, DOSSIER_LIMIT_MAXIMUMS.memories, 700),
        relationship,
        relationshipProgress,
        relationshipEvidenceHistory,
        relationshipMilestones,
        relationshipSummary: text(input.relationshipSummary, 1000),
        relationshipHistory,
        lastRelationshipChange: input.lastRelationshipChange ? {
            ...emptyRelationshipChange(),
            impact: ['none', 'ordinary', 'meaningful', 'major', 'extreme', 'manual'].includes(String(input.lastRelationshipChange.impact)) ? String(input.lastRelationshipChange.impact) : 'none',
            delta: normalizeRelationship(input.lastRelationshipChange.delta),
            evidence: text(input.lastRelationshipChange.evidence, 800),
            reason: text(input.lastRelationshipChange.reason, 800),
            sourceMessageId: Number.isInteger(input.lastRelationshipChange.sourceMessageId) ? input.lastRelationshipChange.sourceMessageId : null,
            turn: Number.isInteger(input.lastRelationshipChange.turn) ? input.lastRelationshipChange.turn : null,
            at: Number(input.lastRelationshipChange.at) || null,
        } : emptyRelationshipChange(),
        mood: text(input.mood, 240),
        location: text(input.location, 360),
        goal: text(input.goal, 600),
        status: normalizeCurrentStatus(input.status),
        present: archived ? false : input.present === true,
        worldActive: archived ? false : input.worldActive === true,
        lifeState: ['alive', 'dead', 'unknown'].includes(String(input.lifeState)) ? String(input.lifeState) : 'unknown',
        lifeStateCertainty: text(input.lifeStateCertainty, 80),
        lifeStateReason: text(input.lifeStateReason, 500),
        archived,
        archiveReason,
        archivedAt: archived ? (Number(input.archivedAt) || now) : null,
        importance: Math.max(0, Math.min(100, Math.round(Number(input.importance) || 0))),
        manualProfileFields: STABLE_PROFILE_FIELDS.filter(field => locked.has(field)),
        retentionProtected: input.retentionProtected === true,
        minor: input.minor === true,
        portrait: input.portrait && typeof input.portrait === 'object' ? structuredClone(input.portrait) : null,
        createdAt: Number(input.createdAt) || now,
        updatedAt: Number(input.updatedAt) || now,
        firstSeenMessageId: Number.isInteger(input.firstSeenMessageId) ? input.firstSeenMessageId : null,
        lastSeenMessageId: Number.isInteger(input.lastSeenMessageId) ? input.lastSeenMessageId : null,
        lastInteractionMessageId: Number.isInteger(input.lastInteractionMessageId) ? input.lastInteractionMessageId : null,
        lastActivityTurn: Number.isInteger(input.lastActivityTurn) ? Math.max(0, input.lastActivityTurn) : null,
        lastActivityMessageId: Number.isInteger(input.lastActivityMessageId) ? input.lastActivityMessageId : null,
        lastActivityReason: text(input.lastActivityReason, 80),
        seenCount: Math.max(0, Math.round(Number(input.seenCount) || 0)),
        manual: input.manual === true,
    };
}

export function createEmptyState(chatKey = '') {
    return {
        schemaVersion: NPC_STATE_SCHEMA_VERSION,
        appVersion: NPC_STATE_VERSION,
        chatKey: String(chatKey || ''),
        revision: 0,
        turn: 0,
        lastScannedMessageId: null,
        npcs: [],
        socialGraph: [],
        familySlots: [],
        suppressedNames: [],
        deletedNpcIds: [],
        lastObservation: {
            messageId: null,
            exchangeActiveNpcIds: [],
            finalPresentNpcIds: [],
            worldActiveNpcIds: [],
            targetNpcIds: [],
        },
        checkpoints: [],
        branchBase: null,
        branchHeadLineage: [],
        branchSafety: { status: 'safe', kind: '', reason: '' },
        branchFingerprintVersion: 3,
        migration: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

export function normalizeState(input = {}, chatKey = '') {
    const base = createEmptyState(chatKey || input.chatKey || '');
    const dedup = new Map();
    for (const raw of Array.isArray(input.npcs) ? input.npcs : []) {
        const npc = normalizeNpc(raw);
        if (dedup.has(npc.id)) continue;
        dedup.set(npc.id, npc);
    }
    const validNpcIds = new Set([...dedup.values()].map(npc => npc.id));
    const familySlots = normalizeFamilySlots(input.familySlots, validNpcIds);
    const suppressedNames = list(input.suppressedNames || input.dismissed, 300, 160);
    const deletedNpcIds = list(input.deletedNpcIds, 500, 160);
    const observation = input.lastObservation && typeof input.lastObservation === 'object' ? input.lastObservation : {};
    const checkpoints = Array.isArray(input.checkpoints) ? input.checkpoints.slice(-CHECKPOINT_LIMIT).map(item => ({
        messageId: Number.isInteger(item?.messageId) ? item.messageId : null,
        lineage: Array.isArray(item?.lineage) ? item.lineage.map(value => String(value || '')).filter(Boolean) : [],
        reason: text(item?.reason, 80),
        createdAt: Number(item?.createdAt) || Date.now(),
        snapshot: item?.snapshot && typeof item.snapshot === 'object' ? structuredClone(item.snapshot) : null,
    })).filter(item => item.messageId !== null && item.snapshot) : [];
    const rawBranchBase = input.branchBase && typeof input.branchBase === 'object' ? input.branchBase : null;
    const branchBase = rawBranchBase?.snapshot && Array.isArray(rawBranchBase.lineage)
        ? {
            messageId: Number.isInteger(rawBranchBase.messageId) ? rawBranchBase.messageId : null,
            lineage: rawBranchBase.lineage.map(value => String(value || '')).filter(Boolean),
            createdAt: Number(rawBranchBase.createdAt) || Date.now(),
            snapshot: structuredClone(rawBranchBase.snapshot),
        }
        : null;
    const rawSafety = input.branchSafety && typeof input.branchSafety === 'object' ? input.branchSafety : {};
    const rawSafetyStatus = String(rawSafety.status || 'safe');
    const branchSafetyStatus = rawSafetyStatus === 'prebaseline-diverged'
        ? 'rebase-required'
        : (['safe', 'rebase-required'].includes(rawSafetyStatus) ? rawSafetyStatus : 'safe');
    const rawSafetyKind = String(rawSafety.kind || '');
    const branchSafetyKind = ['prebaseline-truncation', 'prebaseline-rewrite', 'legacy-prebaseline-divergence'].includes(rawSafetyKind)
        ? rawSafetyKind
        : (rawSafetyStatus === 'prebaseline-diverged' ? 'legacy-prebaseline-divergence' : '');
    return {
        ...base,
        schemaVersion: NPC_STATE_SCHEMA_VERSION,
        appVersion: NPC_STATE_VERSION,
        chatKey: String(chatKey || input.chatKey || ''),
        revision: Math.max(0, Math.trunc(Number(input.revision) || 0)),
        turn: Math.max(0, Math.trunc(Number(input.turn) || 0)),
        lastScannedMessageId: Number.isInteger(input.lastScannedMessageId) ? input.lastScannedMessageId : null,
        npcs: [...dedup.values()],
        socialGraph: normalizeSocialEdges(input.socialGraph),
        familySlots,
        suppressedNames,
        deletedNpcIds,
        lastObservation: {
            messageId: Number.isInteger(observation.messageId) ? observation.messageId : null,
            exchangeActiveNpcIds: list(observation.exchangeActiveNpcIds, 100, 160),
            finalPresentNpcIds: list(observation.finalPresentNpcIds, 100, 160),
            worldActiveNpcIds: list(observation.worldActiveNpcIds, 100, 160),
            targetNpcIds: list(observation.targetNpcIds, 100, 160),
        },
        checkpoints,
        branchBase,
        branchHeadLineage: Array.isArray(input.branchHeadLineage) ? input.branchHeadLineage.map(value => String(value || '')).filter(Boolean) : [],
        branchSafety: {
            status: branchSafetyStatus,
            kind: branchSafetyStatus === 'safe' ? '' : branchSafetyKind,
            reason: text(rawSafety.reason, 500),
        },
        branchFingerprintVersion: Math.max(0, Math.trunc(Number(input.branchFingerprintVersion) || 0)),
        migration: input.migration && typeof input.migration === 'object' ? structuredClone(input.migration) : null,
        createdAt: Number(input.createdAt) || Date.now(),
        updatedAt: Number(input.updatedAt) || Date.now(),
    };
}

export function npcMatchesReference(npc, reference) {
    const raw = String(reference ?? '').trim();
    if (!npc || !raw) return false;
    if (npc.id === raw) return true;
    const key = normalizeName(raw);
    if (!key) return false;
    if (normalizeName(npc.name) === key) return true;
    return (npc.aliases || []).some(alias => normalizeName(alias) === key);
}

export function findNpcByReference(state, reference) {
    return (state?.npcs || []).find(npc => npcMatchesReference(npc, reference)) || null;
}

export function snapshotForCheckpoint(state) {
    const copy = normalizeState(state, state?.chatKey || '');
    copy.checkpoints = [];
    copy.branchBase = null;
    // Portrait binary/data URLs are durable presentation assets, not timeline state.
    // Excluding them keeps up to 48 rollback checkpoints from multiplying megabytes
    // of identical image data. Restoration merges the current portrait back by id.
    copy.npcs = copy.npcs.map(npc => ({ ...npc, portrait: null }));
    return copy;
}

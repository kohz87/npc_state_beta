import {
    findNpcByReference,
    normalizeActualAge,
    normalizeAppearanceForms,
    normalizeApparentAge,
    normalizeBirthday,
    normalizeDossierLimits,
    normalizeKeyRelationshipEntries,
    normalizeMemoryEntries,
    normalizeName,
    normalizeNpc,
    normalizeProfileEvolutionEvidence,
} from '../schema.js';
import {
    DOSSIER_COLLECTION_FIELDS,
    DOSSIER_DURABLE_FIELDS,
    DOSSIER_EVALUATION_GROUPS,
    DOSSIER_FIELD_DEFINITIONS,
    DOSSIER_FORM_FIELDS,
    DOSSIER_SCALAR_FIELDS,
    DOSSIER_SEMANTIC_FIELDS,
    DOSSIER_SEMANTIC_OPERATIONS,
    dossierFieldDefinition,
    dossierFieldGroup,
    dossierFieldValueIssue,
    dossierFieldManualProtected,
    dossierSemanticFieldList,
    normalizeDossierTextCollection,
} from './dossier-fields.js';

export const NPC_STATE_MODEL_CONTRACT_VERSION = 6;

const FIELD_SET = new Set(DOSSIER_SEMANTIC_FIELDS);
const SCALAR_FIELDS = new Set(DOSSIER_SCALAR_FIELDS);
const COLLECTION_FIELDS = new Set(DOSSIER_COLLECTION_FIELDS);
const FORM_FIELDS = new Set(DOSSIER_FORM_FIELDS);
const DURABLE_FIELDS = new Set(DOSSIER_DURABLE_FIELDS);
const AGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);
const PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);

export const SEMANTIC_COLLECTION_CHANGE_EXAMPLE = Object.freeze({
    field: 'mannerisms',
    operation: 'refine',
    changes: Object.freeze([
        Object.freeze({ action: 'replace', expected: 'Taps twice.', value: 'Taps once.' }),
        Object.freeze({ action: 'remove', expected: 'Rings bell.' }),
        Object.freeze({ action: 'add', value: 'Squares pages.' }),
    ]),
    sources: Object.freeze([Object.freeze({ messageId: null, excerpt: 'Ivo now taps once, skips the bell, and squares pages.' })]),
});

export const SEMANTIC_FORM_UPDATE_EXAMPLE = Object.freeze({
    field: 'appearanceForms',
    operation: 'replace',
    scope: Object.freeze({ form: 'Human' }),
    value: 'Human form with auburn hair.',
    sources: Object.freeze([Object.freeze({ messageId: null, excerpt: 'Human form: auburn hair.' })]),
});

function compact(value, max = 2000) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function evidenceKey(value, max = 30000) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim()
        .slice(0, max);
}

function fnv(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function semanticEntryRef(field, value) {
    return `entry:${String(field || '').trim()}:${fnv(evidenceKey(value, 4000))}`;
}

function collectionContext(field, values = []) {
    return (Array.isArray(values) ? values : []).map(value => ({ ref: semanticEntryRef(field, value), value }));
}

function formContext(values = []) {
    return normalizeAppearanceForms(values).map(form => ({
        ref: semanticEntryRef('appearanceForms', form.name),
        name: form.name,
        appearance: form.appearance,
    }));
}

export function semanticDossierContext(npc = {}) {
    return {
        id: npc.id,
        name: npc.name,
        role: npc.role,
        species: npc.species,
        age: npc.age,
        apparentAge: npc.apparentAge,
        birthday: npc.birthday,
        appearance: npc.appearance,
        appearanceForms: formContext(npc.appearanceForms),
        currentForm: npc.currentForm,
        personality: npc.personality,
        behaviorProfile: collectionContext('behaviorProfile', npc.behaviorProfile),
        speech: npc.speech,
        mannerisms: collectionContext('mannerisms', npc.mannerisms),
        mood: npc.mood,
        location: npc.location,
        goal: npc.goal,
        status: npc.status,
        memories: collectionContext('memories', npc.memories),
        keyRelationships: collectionContext('keyRelationships', npc.keyRelationships),
        background: npc.background,
        manualProfileFields: Array.isArray(npc.manualProfileFields) ? npc.manualProfileFields : [],
        profileEvolutionEvidence: Array.isArray(npc.profileEvolutionEvidence)
            ? npc.profileEvolutionEvidence.slice(-6).map(row => ({
                field: row.field,
                kind: row.kind,
                ...(row.kind === 'observation' ? {} : { mode: row.mode }),
                concept: row.concept,
                sourceMessageId: row.sourceMessageId,
                evidence: row.evidence,
            }))
            : [],
    };
}

export function semanticEditIndex(npc = {}) {
    const refs = {};
    for (const field of DOSSIER_COLLECTION_FIELDS) refs[field] = collectionContext(field, npc?.[field]);
    refs.appearanceForms = formContext(npc.appearanceForms).map(form => ({ ref: form.ref, name: form.name }));
    return {
        id: npc.id,
        name: npc.name,
        refs,
        manualProfileFields: Array.isArray(npc.manualProfileFields) ? npc.manualProfileFields : [],
        recentProfileEvidence: Array.isArray(npc.profileEvolutionEvidence)
            ? npc.profileEvolutionEvidence.slice(-4).map(row => ({
                field: row.field,
                kind: row.kind,
                sourceMessageId: row.sourceMessageId,
                evidence: compact(row.evidence, 260),
            }))
            : [],
    };
}

function updateContext(npcs, compactContext) {
    const rows = (Array.isArray(npcs) ? npcs : []).slice(0, 100);
    return rows.map(npc => compactContext ? semanticEditIndex(npc) : semanticDossierContext(npc));
}

export function semanticUpdatePrompt({ npcs = [], mode = 'scan', allowedSourceIds = [], compactContext = false } = {}) {
    const contexts = updateContext(npcs, compactContext);
    const sources = [...new Set((Array.isArray(allowedSourceIds) ? allowedSourceIds : []).filter(Number.isInteger))].sort((a, b) => a - b);
    const groups = DOSSIER_EVALUATION_GROUPS.join('|');
    return [
        `NPC STATE DOSSIER UPDATE CONTRACT v${NPC_STATE_MODEL_CONTRACT_VERSION}:`,
        `Mode: ${mode}. EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates; do not also emit legacy/direct ordinary replacements. Semantic fields: ${dossierSemanticFieldList()}. Operations: ${DOSSIER_SEMANTIC_OPERATIONS.join('|')}.`,
        `Coverage: every exchange-active EXISTING NPC inspects groups [${groups}]; targeted Refresh inspects all supplied groups. Proposed fields use semanticUpdates; otherwise list fieldEvaluations unchanged|insufficient|unavailable. Group labels alone are not field coverage.`,
        'Update:{field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId,excerpt}],explanation?}. Shape notation is explanatory. Omission preserves; remove is explicit; clear:true authorizes an empty collection. Age replacement needs ageKind birthday|elapsed|correction.',
        'Sources: exact text from the permitted claimed message; saved dossier is context, not proof. Validator enforces source/target identity, locks, value shape, limits, persistence; model decides narrative meaning.',
        'Structured authority: visible narrative may support any field; World_State only live location/status; NPC_Inner_Chatter only private mood/goal. Structured blocks never independently rewrite durable canon/profile/memory/keyRelationships/currentForm.',
        'Durable canon/profile needs durable evidence. Temporary sleep, silence, mood, injury, one-off action/pose, or temporary form does not become durable characterization; later grounded characterization may replace an obsolete temporary placeholder.',
        'Actual age is chronological: established replacement needs ageKind birthday|elapsed|correction plus evidence for the resulting number; never derive it from apparent age or invented calendar arithmetic. Birthday is passive freeform calendar metadata: preserve fantasy calendars, do not infer it from age, and do not auto-advance age merely because the date passes.',
        'After grounded birthday/elapsed aging, update apparentAge/appearance/forms only when established species/setting maturation supports it; unknown biology remains unknown, correction alone does not imply growth, and minor maturation stays neutral/non-sexual.',
        'Physical form = distinct anatomy; outfit/pose/mood/injury/aura alone is not. appearanceForms establish/replace: scope:{form:"name"}+value:"appearance"|{name,appearance}; remove uses scope; ref may target it. currentForm is separate. Example: ' + JSON.stringify(SEMANTIC_FORM_UPDATE_EXAMPLE),
        'Live mood/location/goal/status/currentForm use the newest grounded truth; conclusively ended live values may be removed. Status is current activity/condition, never presence/lifecycle.',
        'Collections behaviorProfile/mannerisms/keyRelationships/memories: changes:[{action:add|replace|remove,ref?,expected?,value?}]. add=>value; replace=>value+(ref|expected); remove=>ref|expected. ref=supplied edit ref; expected=exact entry. replace/remove run before add; unrelated entries survive. Example: ' + JSON.stringify(SEMANTIC_COLLECTION_CHANGE_EXAMPLE),
        mode === 'historical' ? 'HISTORICAL SAFETY: cite only evidence at or before this reconstruction point; never future messages.' : '',
        sources.length ? `PERMITTED SOURCE MESSAGE IDS: ${JSON.stringify(sources)}` : 'PERMITTED SOURCE MESSAGE IDS: only IDs present in the supplied prompt/window.',
        compactContext ? 'SEMANTIC EDIT INDEX (refs/locks/recent evidence; stored values are in the main dossier context):' : 'CURRENT DOSSIER CONTEXT:',
        JSON.stringify(contexts),
    ].filter(Boolean).join('\n\n');
}

function sourceRows(update) {
    return (Array.isArray(update?.sources) ? update.sources : []).slice(0, 6).map(raw => ({
        messageId: Number.isInteger(raw?.messageId) ? raw.messageId : null,
        excerpt: compact(raw?.excerpt ?? raw?.evidence, 1000),
    })).filter(row => row.excerpt);
}

function semanticSourceContext(field, options = {}, messageId = null) {
    const byMessage = options?.semanticSourceContextsByMessageId;
    let source = options;
    if (Number.isInteger(messageId) && byMessage && typeof byMessage === 'object' && !Array.isArray(byMessage)) {
        const scoped = byMessage[messageId];
        if (!scoped || typeof scoped !== 'object' || Array.isArray(scoped)) return '';
        source = scoped;
    }
    const parts = [source.semanticEvidenceContext ?? source.profileContext];
    const structuredContext = dossierFieldDefinition(field)?.structuredContext;
    if (structuredContext) parts.push(source[structuredContext]);
    return evidenceKey(parts.filter(Boolean).join('\n'), 50000);
}

function sourceValidation(update, options = {}) {
    const rows = sourceRows(update);
    if (!rows.length) return { ok: false, reason: 'missing-source' };
    const currentMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const hasPerMessageContexts = Boolean(options?.semanticSourceContextsByMessageId
        && typeof options.semanticSourceContextsByMessageId === 'object'
        && !Array.isArray(options.semanticSourceContextsByMessageId));
    for (const row of rows) {
        if (row.messageId !== null && row.messageId < 0) return { ok: false, reason: 'invalid-source-reference' };
        if (currentMessageId !== null && row.messageId !== null && row.messageId > currentMessageId) return { ok: false, reason: 'future-source-reference' };
        const claimedMessageId = row.messageId !== null ? row.messageId : currentMessageId;
        if (hasPerMessageContexts && !Number.isInteger(claimedMessageId)) return { ok: false, reason: 'invalid-source-reference' };
        const context = semanticSourceContext(update.field, options, hasPerMessageContexts ? claimedMessageId : null);
        if (!context) return { ok: false, reason: hasPerMessageContexts ? 'invalid-source-reference' : 'no-permitted-context' };
        const excerpt = evidenceKey(row.excerpt, 1600);
        if (!excerpt || !context.includes(excerpt)) return { ok: false, reason: 'out-of-scope-source' };
    }
    return { ok: true, rows };
}

export function validateSemanticSourceReference(update, options = {}) {
    return sourceValidation(update, options);
}

export function semanticSourceEventKey(rows = [], options = {}) {
    const eventKeys = options?.sourceEventKeys && typeof options.sourceEventKeys === 'object' && !Array.isArray(options.sourceEventKeys)
        ? options.sourceEventKeys
        : {};
    const keys = [...new Set((Array.isArray(rows) ? rows : []).map(row => {
        if (Number.isInteger(row?.messageId)) return String(eventKeys[row.messageId] || '').trim();
        return String(options.sourceEventKey || '').trim();
    }).filter(Boolean))].sort();
    if (keys.length) return keys.join('+').slice(0, 240);
    return String(options.sourceEventKey || '').trim().slice(0, 240);
}

function profileEvidenceParts(value) {
    return String(value || '').split(/\s+\|\s+/).map(part => evidenceKey(part, 1600)).filter(Boolean);
}

function profileEvidenceSourceMatches(entry = {}, candidate = {}) {
    if (entry.field !== candidate.field) return false;
    if (candidate.sourceEventKey) return Boolean(entry.sourceEventKey) && entry.sourceEventKey === candidate.sourceEventKey;
    if (candidate.sourceMessageId !== null) return !entry.sourceEventKey && entry.sourceMessageId === candidate.sourceMessageId;
    return candidate.turn !== null && !entry.sourceEventKey && entry.sourceMessageId == null && entry.turn === candidate.turn;
}

function profileEvidenceOverlaps(left, right) {
    const a = new Set(profileEvidenceParts(left));
    return profileEvidenceParts(right).some(part => a.has(part));
}

export function profileEvolutionEvidenceDuplicate(existingInput = [], candidateInput = {}) {
    const existing = normalizeProfileEvolutionEvidence(existingInput);
    const candidate = {
        field: String(candidateInput.field || '').trim(),
        kind: String(candidateInput.kind || '').trim().toLocaleLowerCase() === 'observation' ? 'observation' : 'applied',
        concept: compact(candidateInput.concept, 180),
        evidence: compact(candidateInput.evidence, 600),
        sourceEventKey: compact(candidateInput.sourceEventKey, 240),
        sourceMessageId: Number.isInteger(candidateInput.sourceMessageId) ? candidateInput.sourceMessageId : null,
        turn: Number.isInteger(candidateInput.turn) ? candidateInput.turn : null,
    };
    if (!candidate.field || !candidate.concept || !candidate.evidence) return false;
    const conceptKey = evidenceKey(candidate.concept, 600);
    return existing.some(entry => {
        if (!profileEvidenceSourceMatches(entry, candidate)) return false;
        if (candidate.kind === 'applied' && entry.kind === 'observation') {
            // Applying a profile change does not create a second independent observation
            // when a source-owned observation already carries the same concrete excerpt.
            return profileEvidenceOverlaps(entry.evidence, candidate.evidence);
        }
        return entry.kind === candidate.kind && evidenceKey(entry.concept, 600) === conceptKey;
    });
}

function manualProtected(npc, field) {
    return dossierFieldManualProtected(npc, field);
}

function profileEvolutionTextValue(value) {
    if (typeof value === 'string' || typeof value === 'number') return compact(value, 180);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    for (const key of ['behavior', 'mannerism', 'trait', 'text', 'description', 'value']) {
        if (typeof value[key] === 'string' && value[key].trim()) return compact(value[key], 180);
    }
    return '';
}

function profileEvolutionConcept(update, result = {}) {
    if (SCALAR_FIELDS.has(update.field)) return profileEvolutionTextValue(update.value) || compact(update.explanation || update.field, 180);
    const changes = Array.isArray(update.changes) ? update.changes : [];
    const values = changes.filter(change => ['add', 'replace'].includes(String(change?.action || '')))
        .map(change => profileEvolutionTextValue(change?.value)).filter(Boolean);
    if (values.length) return compact(values.join('; '), 180);
    if (Array.isArray(update.value)) {
        const normalized = update.value.map(profileEvolutionTextValue).filter(Boolean);
        if (normalized.length) return compact(normalized.join('; '), 180);
    }
    return compact(update.explanation || result.reason || update.field, 180);
}

function profileEvolutionMode(update) {
    if (Array.isArray(update?.changes) && update.changes.length > 1) return 'batch';
    if (update?.operation === 'refine') return 'refine';
    if (update?.operation === 'replace' || update?.operation === 'remove') return 'explicit';
    return 'gradual';
}

function appendProfileEvolutionEvidence(npc, update, provenanceRows, options = {}, result = {}) {
    if (!PROFILE_EVOLUTION_FIELDS.has(update.field) || !result.changed) return;
    const rows = Array.isArray(provenanceRows) ? provenanceRows : [];
    const concept = profileEvolutionConcept(update, result);
    const evidence = compact(rows.map(row => row.excerpt).filter(Boolean).join(' | '), 600);
    if (!concept || !evidence) return;
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const sourceEventKey = semanticSourceEventKey(rows, options);
    const turn = Number.isInteger(options.turn) ? options.turn : null;
    const existing = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence);
    const candidate = {
        field: update.field,
        kind: 'applied',
        mode: profileEvolutionMode(update),
        concept,
        evidence,
        sourceEventKey,
        sourceMessageId,
        turn,
        at: Date.now(),
    };
    if (profileEvolutionEvidenceDuplicate(existing, candidate)) return;
    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...existing, candidate]);
}

function sameValue(left, right) {
    return evidenceKey(left, 8000) === evidenceKey(right, 8000);
}

const GENUINE_NO_CHANGE_REASONS = new Set(['no-change', 'already-established', 'already-empty']);
function semanticApplicationStatus(result = {}) {
    if (result.changed) return 'applied';
    return GENUINE_NO_CHANGE_REASONS.has(String(result.reason || ''))
        ? 'no-change-proposed'
        : 'rejected-proposal';
}

function normalizedScalar(field, value) {
    if (field === 'age') return normalizeActualAge(value);
    if (field === 'apparentAge') return normalizeApparentAge(value);
    if (field === 'birthday') return normalizeBirthday(value);
    const max = field === 'appearance' ? 1800 : (field === 'currentForm' ? 80 : 1200);
    return compact(value, max);
}

function ageGroundedInSources(value, rows = []) {
    const normalized = normalizeActualAge(value);
    const number = normalized.match(/\d{1,4}/)?.[0];
    if (!number) return false;
    return rows.some(row => new RegExp(`(^|\\D)${number}(?!\\d)`).test(row.excerpt));
}

function playerReference(value, playerName = '') {
    const key = normalizeName(value);
    if (!key) return false;
    if (['player', 'user', 'pc', 'the player', 'the user', 'player character'].includes(key)) return true;
    const player = normalizeName(playerName);
    return Boolean(player && (` ${key} `).includes(` ${player} `));
}

function collectionValues(npc, field, limits, playerName = '') {
    if (field === 'keyRelationships') {
        return normalizeKeyRelationshipEntries(npc?.[field], limits.keyRelationships, 500)
            .filter(value => !playerReference(value, playerName));
    }
    if (field === 'memories') return normalizeMemoryEntries(npc?.[field], limits.memories, 700);
    const cap = field === 'behaviorProfile' ? limits.behaviorProfile : limits.mannerisms;
    return normalizeDossierTextCollection(field, npc?.[field], cap, 700);
}

function normalizeCollection(field, values, limits, playerName = '') {
    if (field === 'keyRelationships') {
        return normalizeKeyRelationshipEntries(values, limits.keyRelationships, 500)
            .filter(value => !playerReference(value, playerName));
    }
    if (field === 'memories') return normalizeMemoryEntries(values, limits.memories, 700);
    const cap = field === 'behaviorProfile' ? limits.behaviorProfile : limits.mannerisms;
    return normalizeDossierTextCollection(field, values, cap, 700);
}

function targetIndex(field, current, change) {
    const ref = compact(change?.ref, 260);
    const expected = compact(change?.expected, 800);
    if (ref) {
        const index = current.findIndex(value => semanticEntryRef(field, value) === ref);
        if (index >= 0) return index;
    }
    return expected ? current.findIndex(value => sameValue(value, expected)) : -1;
}

function applyCollectionOperation(npc, update, limits, playerName = '') {
    const field = update.field;
    const current = collectionValues(npc, field, limits, playerName);
    if (update.operation === 'establish' && current.length) return { changed: false, reason: 'already-established' };
    if (update.operation === 'remove' && update.clear === true) {
        if (!current.length) return { changed: false, reason: 'already-empty' };
        npc[field] = [];
        return { changed: true };
    }

    let next = [...current];
    const changes = Array.isArray(update.changes) ? update.changes.slice(0, 32) : [];
    if (changes.length) {
        for (const change of changes.filter(row => ['replace', 'remove'].includes(String(row?.action)))) {
            const index = targetIndex(field, next, change);
            if (index < 0) continue;
            if (String(change.action) === 'remove') next.splice(index, 1);
            else {
                const value = normalizeCollection(field, [change.value], limits, playerName)[0] || '';
                if (value) next[index] = value;
            }
        }
        for (const change of changes.filter(row => String(row?.action) === 'add')) {
            const value = normalizeCollection(field, [change.value], limits, playerName)[0] || '';
            if (!value || next.some(item => sameValue(item, value))) continue;
            next.push(value);
        }
    } else if (Array.isArray(update.value)) {
        const incoming = normalizeCollection(field, update.value, limits, playerName);
        if (update.operation === 'replace') {
            if (!incoming.length && current.length && update.clear !== true) return { changed: false, reason: 'explicit-clear-required' };
            next = incoming;
        } else if (['refine', 'establish'].includes(update.operation)) {
            for (const value of incoming) if (!next.some(item => sameValue(item, value))) next.push(value);
        } else if (update.operation === 'remove') {
            for (const value of incoming) next = next.filter(item => !sameValue(item, value));
        }
    } else if (update.operation === 'remove') {
        return { changed: false, reason: 'ambiguous-removal' };
    }

    next = normalizeCollection(field, next, limits, playerName);
    if (JSON.stringify(next) === JSON.stringify(current)) return { changed: false, reason: 'no-change' };
    npc[field] = next;
    return { changed: true };
}

function applyFormOperation(npc, update) {
    const current = normalizeAppearanceForms(npc.appearanceForms);
    const targetName = compact(update?.scope?.form || update?.targetForm || update?.expected, 80);
    const targetRef = compact(update?.ref, 260);
    let index = targetRef ? current.findIndex(form => semanticEntryRef('appearanceForms', form.name) === targetRef) : -1;
    if (index < 0 && targetName) index = current.findIndex(form => normalizeName(form.name) === normalizeName(targetName));

    if (update.operation === 'remove') {
        if (index < 0) return { changed: false, reason: 'target-not-found' };
        const removed = current[index];
        npc.appearanceForms = current.filter((_, row) => row !== index);
        if (normalizeName(npc.currentForm) === normalizeName(removed.name)) npc.currentForm = '';
        return { changed: true };
    }

    const rawValue = update.value && typeof update.value === 'object' && !Array.isArray(update.value)
        ? update.value
        : { name: targetName, appearance: update.value };
    const normalized = normalizeAppearanceForms([rawValue])[0];
    if (!normalized) return { changed: false, reason: 'invalid-form-value' };
    if (update.operation === 'establish') {
        if (current.some(form => normalizeName(form.name) === normalizeName(normalized.name))) return { changed: false, reason: 'already-established' };
        npc.appearanceForms = normalizeAppearanceForms([...current, normalized]);
        return { changed: true };
    }
    if (index < 0) return { changed: false, reason: 'target-not-found' };
    if (sameValue(current[index].appearance, normalized.appearance) && normalizeName(current[index].name) === normalizeName(normalized.name)) return { changed: false, reason: 'no-change' };
    const next = [...current];
    next[index] = normalized;
    npc.appearanceForms = normalizeAppearanceForms(next);
    if (normalizeName(npc.currentForm) === normalizeName(current[index].name)) npc.currentForm = normalized.name;
    return { changed: true };
}

function applyScalarOperation(npc, update, rows) {
    const field = update.field;
    const current = normalizedScalar(field, npc?.[field]);
    if (update.operation === 'remove') {
        if (!current) return { changed: false, reason: 'already-empty' };
        npc[field] = '';
        if (field === 'birthday') npc.birthdayProvenance = '';
        return { changed: true };
    }
    const value = normalizedScalar(field, update.value);
    if (!value) return { changed: false, reason: 'invalid-value' };
    if (update.operation === 'establish' && current) return { changed: false, reason: 'already-established' };
    if (update.operation !== 'establish' && !current && update.operation !== 'replace') return { changed: false, reason: 'not-established' };
    if (sameValue(current, value)) return { changed: false, reason: 'no-change' };
    if (field === 'age' && current) {
        const ageKind = String(update.ageKind || '').trim().toLocaleLowerCase();
        if (!AGE_KINDS.has(ageKind)) return { changed: false, reason: 'missing-age-kind' };
        if (!ageGroundedInSources(value, rows)) return { changed: false, reason: 'ungrounded-age-value' };
    }
    npc[field] = value;
    if (field === 'birthday') npc.birthdayProvenance = 'explicit';
    return { changed: true };
}

function formSelectorShapeIssue(update) {
    if (update.scope !== undefined && (!update.scope || typeof update.scope !== 'object' || Array.isArray(update.scope))) return 'scope-expected-object';
    if (update.scope && Object.prototype.hasOwnProperty.call(update.scope, 'form') && typeof update.scope.form !== 'string') return 'scope.form-expected-string';
    for (const key of ['targetForm', 'expected', 'ref']) {
        if (update[key] !== undefined && typeof update[key] !== 'string') return `${key}-expected-string`;
    }
    return '';
}

function semanticValueShapeIssue(update) {
    const field = update?.field;
    if (!field) return 'unsupported-field';
    if (FORM_FIELDS.has(field)) {
        const selectorIssue = formSelectorShapeIssue(update);
        if (selectorIssue) return selectorIssue;
        if (update.operation === 'remove') return '';
        if (typeof update.value === 'string') return '';
        if (update.value && typeof update.value === 'object' && !Array.isArray(update.value)) {
            return dossierFieldValueIssue(field, [update.value]);
        }
        return 'expected-string-or-form-object';
    }
    if (update.operation === 'remove') {
        if (COLLECTION_FIELDS.has(field) && Array.isArray(update.changes) && update.changes.length) {
            // Removal changes may target by ref/expected and do not require a value.
        } else if (COLLECTION_FIELDS.has(field) && update.value !== undefined && update.clear !== true) {
            return dossierFieldValueIssue(field, update.value);
        }
        return '';
    }
    if (SCALAR_FIELDS.has(field)) return dossierFieldValueIssue(field, update.value);
    if (!COLLECTION_FIELDS.has(field)) return '';
    const changes = Array.isArray(update.changes) ? update.changes : [];
    if (!changes.length) return dossierFieldValueIssue(field, update.value);
    for (let index = 0; index < changes.length; index += 1) {
        const change = changes[index];
        if (!change || typeof change !== 'object' || Array.isArray(change)) return `change-${index}-expected-object`;
        const action = String(change.action || '').trim().toLocaleLowerCase();
        if (!['add', 'replace', 'remove'].includes(action)) return `change-${index}-invalid-action`;
        if (change.ref !== undefined && typeof change.ref !== 'string') return `change-${index}-ref-expected-string`;
        if (change.expected !== undefined && typeof change.expected !== 'string') return `change-${index}-expected-expected-string`;
        if (['add', 'replace'].includes(action)) {
            const issue = dossierFieldValueIssue(field, [change.value]);
            if (issue) return `change-${index}-${issue}`;
        }
    }
    return '';
}

function normalizedUpdate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const field = String(raw.field || '').trim();
    const operation = String(raw.operation || '').trim().toLocaleLowerCase();
    if (!FIELD_SET.has(field) || !DOSSIER_SEMANTIC_OPERATIONS.includes(operation)) return null;
    return {
        ...structuredClone(raw),
        field,
        operation,
        explanation: compact(raw.explanation || raw.reason, 600),
        durability: String(raw.durability || '').trim().toLocaleLowerCase(),
    };
}

export function prepareModelLedPayload(stateInput, resultInput, admissionMode = 'balanced') {
    if (!resultInput || typeof resultInput !== 'object' || Array.isArray(resultInput)) return resultInput;
    const result = structuredClone(resultInput);
    const state = stateInput || {};
    for (const patch of Array.isArray(result.npcs) ? result.npcs : []) {
        const semanticFields = new Set((Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [])
            .map(update => String(update?.field || '').trim()).filter(field => FIELD_SET.has(field)));
        const byId = String(patch.id || '').trim() ? (state.npcs || []).find(npc => npc.id === String(patch.id).trim()) : null;
        const existing = byId || findNpcByReference(state, patch.name || '');
        if (!existing) {
            // A field proposed through semanticUpdates has one mutation authority. Remove its
            // direct NEW-bootstrap duplicate from the deterministic core copy only; the
            // original result still reaches the semantic validator with evidence/provenance.
            for (const field of semanticFields) delete patch[field];
            if (semanticFields.has('role')) delete patch._modelLedRole;
            if (String(admissionMode) === 'named_preferred' && String(patch.identityKind || '').trim().toLocaleLowerCase() === 'named' && !semanticFields.has('role')) {
                patch._modelLedRole = patch.role;
                patch.role = '';
            }
            continue;
        }

        // One ordinary mutation path for existing dossiers. Compatibility channels are
        // normalized into semanticUpdates at the boundary before this function runs.
        for (const field of DOSSIER_SEMANTIC_FIELDS) delete patch[field];
        delete patch.profileChanges;
        delete patch.canonChanges;
        delete patch.ageChange;
        delete patch.ageProgression;
        delete patch.appearanceFormChanges;
        delete patch.keyRelationshipChanges;
    }
    return result;
}

function patchResolutionAt(options = {}, patchIndex = -1) {
    if (!Array.isArray(options.patchResolutions)) return null;
    return options.patchResolutions[patchIndex]
        || { patchIndex, status: 'unresolved', npcId: '', reason: 'identity-handoff-missing' };
}

function legacyPatchTarget(state, patch) {
    const id = String(patch?.id || '').trim();
    return id ? (state.npcs || []).find(item => item.id === id) || null : findNpcByReference(state, patch?.name || '');
}

function resolvedPatchTarget(state, patch, patchIndex, options = {}) {
    const resolution = patchResolutionAt(options, patchIndex);
    if (!resolution) return { npc: legacyPatchTarget(state, patch), resolution: null };
    if (resolution.status !== 'accepted' || !resolution.npcId) return { npc: null, resolution };
    const npc = (state.npcs || []).find(item => item.id === resolution.npcId) || null;
    return npc
        ? { npc, resolution }
        : { npc: null, resolution: { ...resolution, status: 'unresolved', reason: 'accepted-target-missing' } };
}

function directFieldProposed(patch, field) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
    const value = patch?.[field];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return String(value ?? '').trim().length > 0;
}

function proposedFieldsForPatch(patch = {}) {
    const fields = [];
    const add = value => {
        const field = String(value || '').trim();
        if (FIELD_SET.has(field) && !fields.includes(field) && fields.length < 32) fields.push(field);
    };
    for (const field of DOSSIER_SEMANTIC_FIELDS) if (directFieldProposed(patch, field)) add(field);
    for (const update of Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : []) add(update?.field);
    return fields;
}

const FIELD_EVALUATION_STATES = Object.freeze(['unchanged', 'insufficient', 'unavailable']);
function fieldEvaluationsForPatch(patch = {}) {
    const raw = patch?.fieldEvaluations;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { present: false, byField: new Map(), invalid: [] };
    const byField = new Map();
    const invalid = [];
    for (const status of FIELD_EVALUATION_STATES) {
        const rows = raw[status];
        if (rows == null) continue;
        if (!Array.isArray(rows)) {
            invalid.push({ field: '', status, reason: 'evaluation-list-not-array' });
            continue;
        }
        for (const value of rows.slice(0, 64)) {
            const field = String(value || '').trim();
            if (!FIELD_SET.has(field)) {
                invalid.push({ field, status, reason: 'unknown-field' });
                continue;
            }
            const previous = byField.get(field);
            if (previous && previous !== status) {
                invalid.push({ field, status, reason: `conflicts-with-${previous}` });
                continue;
            }
            byField.set(field, status);
        }
    }
    return { present: true, byField, invalid };
}

function fieldEvaluationDiagnostics(patch, npcId, proposedFields = []) {
    const detail = fieldEvaluationsForPatch(patch);
    if (!detail.present) return { present: false, diagnostics: [], accountedFields: [] };
    const proposals = new Set(proposedFields);
    const diagnostics = detail.invalid.map(row => ({
        npcId, field: row.field, group: dossierFieldGroup(row.field), status: 'invalid-field-evaluation', reason: row.reason,
    }));
    const accountedFields = [];
    for (const [field, status] of detail.byField.entries()) {
        if (proposals.has(field)) continue;
        accountedFields.push(field);
        diagnostics.push({
            npcId, field, group: dossierFieldGroup(field),
            status: status === 'unchanged' ? 'evaluated-unchanged' : (status === 'insufficient' ? 'insufficient-evidence' : 'context-unavailable'),
        });
    }
    return { present: true, diagnostics, accountedFields };
}

function identityDiagnostic(patch, patchIndex, resolution) {
    const rejected = String(resolution?.status || '') === 'rejected';
    return {
        npcId: String(resolution?.npcId || ''),
        patchIndex,
        status: rejected ? 'identity-rejected' : 'identity-unresolved',
        reason: String(resolution?.reason || (rejected ? 'identity-rejected' : 'identity-unresolved')).slice(0, 220),
        proposedFields: proposedFieldsForPatch(patch),
    };
}

function evaluatedGroupsForPatch(patch = {}) {
    return [...new Set((Array.isArray(patch?.evaluatedGroups) ? patch.evaluatedGroups : [])
        .map(value => String(value || '').trim())
        .filter(value => DOSSIER_EVALUATION_GROUPS.includes(value)))];
}

function restoreNewNpcModelLedRole(state, originalResult, options = {}, diagnostics = []) {
    const patches = Array.isArray(originalResult?.npcs) ? originalResult.npcs : [];
    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
        const patch = patches[patchIndex];
        if (!Object.prototype.hasOwnProperty.call(patch || {}, '_modelLedRole')) continue;
        const roleValue = patch._modelLedRole;
        const roleIssue = dossierFieldValueIssue('role', roleValue);
        if (roleIssue) {
            if (roleValue !== undefined) diagnostics.push({ npcId: '', patchIndex, field: 'role', group: dossierFieldGroup('role'), channel: 'bootstrap-role', status: 'rejected-proposal', reason: 'invalid-value-type:' + roleIssue });
            continue;
        }
        const role = compact(roleValue, 240);
        if (!role || String(patch?.identityKind || '').trim().toLocaleLowerCase() !== 'named') continue;
        const { npc } = resolvedPatchTarget(state, patch, patchIndex, options);
        if (!npc || manualProtected(npc, 'role') || npc.role) continue;
        if ((Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []).some(update => String(update?.field || '').trim() === 'role')) continue;
        npc.role = role;
        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        diagnostics.push({ npcId: npc.id, patchIndex, field: 'role', group: dossierFieldGroup('role'), channel: 'bootstrap-role', status: 'applied' });
    }
}

function identityValue(value) {
    if (Array.isArray(value)) return value.map(identityValue);
    if (!value || typeof value !== 'object') return value ?? null;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, identityValue(value[key])]));
}

function updateIdentity(raw) {
    return JSON.stringify({
        field: raw.field,
        operation: raw.operation,
        value: identityValue(raw.value),
        changes: identityValue(Array.isArray(raw.changes) ? raw.changes : []),
        clear: raw.clear === true,
        scope: identityValue(raw.scope || {}),
        targetForm: compact(raw.targetForm, 80),
        ref: compact(raw.ref, 260),
        expected: compact(raw.expected, 2000),
        ageKind: String(raw.ageKind || '').trim().toLocaleLowerCase(),
        durability: String(raw.durability || '').trim().toLocaleLowerCase(),
        sources: sourceRows(raw).map(row => ({ messageId: row.messageId ?? null, excerpt: evidenceKey(row.excerpt, 900) })),
    });
}

export function applyModelLedSemanticUpdates(stateInput, resultInput, options = {}) {
    const state = stateInput;
    const diagnostics = [];
    const seen = new Set();
    const limits = normalizeDossierLimits(options.dossierLimits);
    restoreNewNpcModelLedRole(state, resultInput, options, diagnostics);

    const patches = Array.isArray(resultInput?.npcs) ? resultInput.npcs : [];
    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
        const patch = patches[patchIndex];
        const target = resolvedPatchTarget(state, patch, patchIndex, options);
        const npc = target.npc;
        if (!npc) {
            diagnostics.push(identityDiagnostic(patch, patchIndex, target.resolution));
            continue;
        }
        const ordinaryProposalFields = proposedFieldsForPatch(patch);
        const semanticRows = Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [];
        const fieldEvaluation = fieldEvaluationDiagnostics(patch, npc.id, ordinaryProposalFields);
        diagnostics.push(...fieldEvaluation.diagnostics.map(row => ({ patchIndex, ...row })));
        if (!ordinaryProposalFields.length && !fieldEvaluation.present) {
            const evaluatedGroups = evaluatedGroupsForPatch(patch);
            diagnostics.push(evaluatedGroups.length
                ? { npcId: npc.id, patchIndex, status: 'evaluated-groups', evaluatedGroups }
                : { npcId: npc.id, patchIndex, status: 'no-field-proposal' });
        }
        for (const raw of semanticRows) {
            const update = normalizedUpdate(raw);
            if (!update) {
                diagnostics.push({ npcId: npc.id, field: String(raw?.field || ''), operation: String(raw?.operation || ''), status: 'invalid-structure' });
                continue;
            }
            if (manualProtected(npc, update.field)) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'manually-protected' });
                continue;
            }
            const valueShapeIssue = semanticValueShapeIssue(update);
            if (valueShapeIssue) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'rejected-proposal', reason: 'invalid-value-type:' + valueShapeIssue });
                continue;
            }
            const dedupeKey = `${npc.id}|${updateIdentity(update)}`;
            if (seen.has(dedupeKey)) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'duplicate-operation' });
                continue;
            }
            seen.add(dedupeKey);
            if (DURABLE_FIELDS.has(update.field) && update.durability === 'temporary') {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'invalid-structure', reason: 'temporary-evidence-cannot-rewrite-durable-canon' });
                continue;
            }
            const provenance = sourceValidation(update, options);
            if (!provenance.ok) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'invalid-source-reference', reason: provenance.reason });
                continue;
            }
            let result;
            if (SCALAR_FIELDS.has(update.field)) result = applyScalarOperation(npc, update, provenance.rows);
            else if (COLLECTION_FIELDS.has(update.field)) result = applyCollectionOperation(npc, update, limits, options.playerName);
            else if (FORM_FIELDS.has(update.field)) result = applyFormOperation(npc, update);
            else result = { changed: false, reason: 'unsupported-field' };
            diagnostics.push({
                npcId: npc.id,
                field: update.field,
                operation: update.operation,
                group: dossierFieldGroup(update.field),
                status: semanticApplicationStatus(result),
                reason: result.reason || '',
            });
            if (result.changed) {
                appendProfileEvolutionEvidence(npc, update, provenance.rows, options, result);
                npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
            }
        }
    }
    state.npcs = (state.npcs || []).map(npc => normalizeNpc(npc));
    return { state, diagnostics };
}

function patchReferencesNpc(patch, npc) {
    const id = String(patch?.id || '').trim();
    if (id && id === npc.id) return true;
    const labels = [npc?.name, ...(npc?.aliases || [])].map(normalizeName).filter(Boolean);
    return [patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])]
        .map(normalizeName).filter(Boolean).some(label => labels.includes(label));
}

function patchForNpc(resultInput, npc, patchResolutions = null) {
    const patches = Array.isArray(resultInput?.npcs) ? resultInput.npcs : [];
    if (Array.isArray(patchResolutions)) {
        for (let index = patchResolutions.length - 1; index >= 0; index -= 1) {
            const resolution = patchResolutions[index];
            if (resolution?.status === 'accepted' && resolution.npcId === npc.id) {
                return { patch: patches[Number(resolution.patchIndex)] || null, resolution };
            }
        }
        for (const resolution of patchResolutions) {
            if (!resolution || resolution.status === 'accepted') continue;
            const patch = patches[Number(resolution.patchIndex)];
            if (patch && patchReferencesNpc(patch, npc)) return { patch, resolution };
        }
        return { patch: null, resolution: null };
    }
    const patch = patches.find(candidate => {
        const id = String(candidate?.id || '').trim();
        if (id) return id === npc.id;
        const name = normalizeName(candidate?.name);
        return name && [npc.name, ...(npc.aliases || [])].some(label => normalizeName(label) === name);
    }) || null;
    return { patch, resolution: null };
}

export function auditDossierEvaluationCoverage(stateInput, resultInput, { npcIds = [], patchResolutions = null } = {}) {
    const state = stateInput || {};
    const diagnostics = [];
    const ids = [...new Set((Array.isArray(npcIds) ? npcIds : []).filter(Boolean))];
    for (const id of ids) {
        const npc = (state.npcs || []).find(item => item.id === id) || findNpcByReference(state, id);
        if (!npc) continue;
        const binding = patchForNpc(resultInput, npc, patchResolutions);
        const patch = binding.patch;
        if (binding.resolution && binding.resolution.status !== 'accepted') {
            diagnostics.push({ ...identityDiagnostic(patch || {}, Number(binding.resolution.patchIndex), binding.resolution), npcId: npc.id });
            continue;
        }
        if (!patch) {
            diagnostics.push({ npcId: npc.id, status: 'missing-npc-patch', missingGroups: [...DOSSIER_EVALUATION_GROUPS] });
            continue;
        }
        const groups = new Set(evaluatedGroupsForPatch(patch));
        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));
        const fieldEvaluation = fieldEvaluationsForPatch(patch);
        const accounted = new Set([
            ...proposedFieldsForPatch(patch),
            ...(fieldEvaluation.present ? fieldEvaluation.byField.keys() : []),
        ]);
        const missingFields = DOSSIER_SEMANTIC_FIELDS.filter(field => !accounted.has(field));
        if (missingFields.length || missingGroups.length) diagnostics.push({
            npcId: npc.id, status: 'incomplete-evaluation', missingGroups,
            missingFields: missingFields.slice(0, 32),
            coverageKind: fieldEvaluation.present ? 'field-level' : 'group-only',
        });
    }
    return diagnostics;
}

function upsertCounterpart(npc, counterpartName, relation, limit) {
    if (!npc || manualProtected(npc, 'keyRelationships')) return false;
    const name = compact(counterpartName, 160);
    const rel = compact(relation, 180);
    if (!name || !rel) return false;
    const current = normalizeKeyRelationshipEntries(npc.keyRelationships, limit, 500);
    const key = normalizeName(name);
    const index = current.findIndex(entry => normalizeName(String(entry).split(/\s+(?:-|–|—)\s+/)[0]) === key);
    const nextEntry = `${name} - ${rel}`;
    if (index >= 0 && sameValue(current[index], nextEntry)) return false;
    if (index >= 0) current[index] = nextEntry;
    else if (current.length < limit) current.push(nextEntry);
    else return false;
    npc.keyRelationships = normalizeKeyRelationshipEntries(current, limit, 500);
    return true;
}

export function applyModelLedFamilyFacts(stateInput, resultInput, options = {}) {
    const state = stateInput;
    const diagnostics = [];
    const limit = normalizeDossierLimits(options.dossierLimits).keyRelationships;
    const context = evidenceKey(options.semanticEvidenceContext ?? options.profileContext, 50000);
    for (const raw of Array.isArray(resultInput?.familyFacts) ? resultInput.familyFacts : []) {
        const owner = findNpcByReference(state, raw?.owner || '');
        const relation = typeof raw?.relation === 'string' ? compact(raw.relation, 180) : '';
        const reciprocal = typeof raw?.reciprocalRelation === 'string' ? compact(raw.reciprocalRelation, 180) : '';
        const evidence = typeof raw?.evidence === 'string' ? compact(raw.evidence, 1000) : '';
        if (!owner || !relation || !evidence || !context.includes(evidenceKey(evidence, 1600))) continue;
        const members = (Array.isArray(raw?.members) ? raw.members : []).filter(value => typeof value === 'string').map(value => compact(value, 160)).filter(Boolean).slice(0, 20);
        for (const memberName of members) {
            if (normalizeName(memberName) === normalizeName(owner.name)) continue;
            const memberNpc = findNpcByReference(state, memberName);
            if (upsertCounterpart(owner, memberNpc?.name || memberName, relation, limit)) diagnostics.push({ npcId: owner.id, field: 'keyRelationships', operation: 'refine', status: 'applied' });
            if (memberNpc && reciprocal && upsertCounterpart(memberNpc, owner.name, reciprocal, limit)) diagnostics.push({ npcId: memberNpc.id, field: 'keyRelationships', operation: 'refine', status: 'applied' });
        }
    }
    state.npcs = (state.npcs || []).map(npc => normalizeNpc(npc));
    return { state, diagnostics };
}

export { DOSSIER_SEMANTIC_OPERATIONS as SEMANTIC_UPDATE_OPERATIONS, DOSSIER_EVALUATION_GROUPS, DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS, dossierFieldDefinition };

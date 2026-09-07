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
} from '../schema.js';

export const NPC_STATE_MODEL_CONTRACT_VERSION = 2;
export const SEMANTIC_UPDATE_OPERATIONS = Object.freeze(['establish', 'refine', 'replace', 'remove']);

const SCALAR_FIELDS = new Set([
    'personality', 'speech', 'role', 'species', 'background', 'appearance',
    'age', 'apparentAge', 'birthday', 'mood', 'location', 'goal', 'status',
]);
const COLLECTION_FIELDS = new Set(['behaviorProfile', 'mannerisms', 'keyRelationships', 'memories']);
const FORM_FIELD = 'appearanceForms';
const DURABLE_FIELDS = new Set([
    'personality', 'speech', 'role', 'species', 'background', 'appearance', 'age',
    'apparentAge', 'birthday', 'behaviorProfile', 'mannerisms', 'keyRelationships',
    'memories', 'appearanceForms',
]);
const PROFILE_FIELDS = new Set(['personality', 'speech', 'behaviorProfile', 'mannerisms']);
const AGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);

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
        appearanceForms: normalizeAppearanceForms(npc.appearanceForms).map(form => ({
            ref: semanticEntryRef('appearanceForms', form.name),
            name: form.name,
            appearance: form.appearance,
        })),
        currentForm: npc.currentForm,
        personality: npc.personality,
        behaviorProfile: collectionContext('behaviorProfile', npc.behaviorProfile),
        speech: npc.speech,
        mannerisms: collectionContext('mannerisms', npc.mannerisms),
        keyRelationships: collectionContext('keyRelationships', npc.keyRelationships),
        memories: collectionContext('memories', npc.memories),
        mood: npc.mood,
        location: npc.location,
        goal: npc.goal,
        status: npc.status,
        background: npc.background,
        manualProfileFields: Array.isArray(npc.manualProfileFields) ? npc.manualProfileFields : [],
        profileEvolutionEvidence: Array.isArray(npc.profileEvolutionEvidence)
            ? npc.profileEvolutionEvidence.slice(-6).map(row => ({
                field: row.field,
                mode: row.mode,
                concept: row.concept,
                sourceMessageId: row.sourceMessageId,
                evidence: row.evidence,
            }))
            : [],
    };
}

export function semanticUpdatePrompt({ npcs = [], mode = 'scan', allowedSourceIds = [] } = {}) {
    const contexts = (Array.isArray(npcs) ? npcs : []).slice(0, 100).map(semanticDossierContext);
    const sources = [...new Set((Array.isArray(allowedSourceIds) ? allowedSourceIds : []).filter(Number.isInteger))].sort((a, b) => a - b);
    return [
        `NPC STATE MODEL-LED UPDATE CONTRACT v${NPC_STATE_MODEL_CONTRACT_VERSION}:`,
        `Operation mode: ${mode}.`,
        'For an EXISTING dossier, semantic interpretation belongs to you. Code validates targeting, source provenance, manual locks, deterministic numeric normalization, ordering, limits, and persistence. Do not depend on magic English cue words, fixed observation counts, or concept-label repetition.',
        'When supplied evidence establishes, refines, changes, corrects, or retires durable or current-state information, put an explicit semanticUpdates array on that NPC patch. Omission means no change. Legacy profileChanges/canonChanges are compatibility-only and should be omitted for existing-dossier revisions.',
        'Each semantic update has: field, operation establish|refine|replace|remove, value when applicable, sources [{messageId, excerpt}], and a brief explanation. For collection edits, prefer changes [{action:add|replace|remove, ref, expected, value}] so one entry can change without rewriting unrelated entries. ref values are supplied below. Use clear:true only when the evidence explicitly supports clearing the entire collection.',
        'Evidence references prove only that the cited source is inside the permitted supplied context. They do not prove your interpretation. Every automatic semantic update needs at least one concrete excerpt from the supplied source window. Never cite a saved model summary as independent proof of itself.',
        'establish is for a genuinely unestablished field. refine keeps the existing characterization true while making it more precise. replace is for an outdated, corrected, or genuinely developed value. remove retires unsupported, corrected, or explicitly abandoned information. Empty arrays alone never mean clear.',
        'PERSONALITY / BEHAVIOR / SPEECH / MANNERISMS: distinguish temporary state from durable characterization. Sleeping, unconsciousness, silence while asleep, one-off reactions, poses, and momentary moods are not permanent personality or speech traits. Later rich evidence may establish the first meaningful baseline without proving a transformation. Compatible detail may refine it. Genuine development or correction may replace it. A mannerism should be a durable recurring tendency, but no particular English habit phrase or repeated scan count is required when the supplied narrative already establishes that meaning.',
        'A sleeping NPC is not therefore mute. If an old post-emergence placeholder such as Quiet/dormant, Unvoiced/currently sleeping, or sleeps with wings folded is merely a temporary initial observation and later supplied evidence establishes actual characterization, replace or remove the obsolete profile entry. Do not copy obsolete sleep information into Status after the NPC is awake.',
        'Form-specific habits remain valid canon for that form unless later evidence explicitly changes or removes them. A current switch to Human/Base form is not evidence that an alternate-form habit ceased to exist. When useful, set scope:{form:"exact stored/current form name"}; the backend preserves unrelated form knowledge.',
        'DURABLE CANON: role, species, background, ordinary/shared appearance and birthday use the same semanticUpdates contract. Decide whether evidence is a refinement, revelation, correction, or lasting change. Temporary form changes never rewrite permanent species or ordinary appearance. Set durability:"durable" for durable canon; do not propose a durable rewrite for temporary evidence.',
        'AGE: chronological age and apparentAge are separate fields. For an established chronological age that changes, use field age, operation replace, ageKind birthday|elapsed|correction, and the resulting grounded numeric age. You decide which semantic kind the story establishes; no mandatory English cue phrase exists. Do not infer chronological age from appearance. Do not invent a calendar. Calendar arithmetic is only valid when the relevant calendar facts and elapsed-time facts are supplied.',
        'MATURATION / APPEARANCE: use semantic judgment grounded in established species biology and narrative evidence. Ordinary growth, unusual fantasy maturation, explicit rejuvenation and other grounded transformations are allowed without arbitrary minimum intervals or hardcoded growth ceilings. Update only the affected shared appearance or named form; preserve unrelated scars, colors, species markers and other forms.',
        'COLLECTIONS: replacement/removal must target an entry by supplied ref or exact expected value when possible. A meaningful replacement is allowed at capacity because it replaces a slot before additions are considered. Preserve unrelated entries. memories remain durable event continuity and should not be churned by wording drift.',
        'CURRENT STATE: mood, location, goal, and status are live-state scalars, not durable canon. Reconsider them whenever the supplied exchange establishes a newer current truth. Use establish when previously unknown, replace when the current value changes, refine only when the stored value remains true but becomes more precise, and remove when the stored value is conclusively obsolete and no replacement is supported. A completed/abandoned goal or departed location must not linger merely because there is no replacement. Status is current activity/condition only and is never lifecycle presence.',
        mode === 'completeness'
            ? 'SUPPLEMENTAL SAFETY: this exact response was already committed once. Do not replay relationship changes, lifecycle events, narrative-turn advancement, aging, memories, or development evidence merely because they are visible again. Propose only genuinely missing/corrective semantic updates; identical outcomes are no-change.'
            : '',
        mode === 'historical'
            ? 'HISTORICAL SAFETY: only evidence supplied for the current reconstruction point may be used. Never cite or infer from future messages.'
            : '',
        sources.length ? `PERMITTED SOURCE MESSAGE IDS: ${JSON.stringify(sources)}` : 'PERMITTED SOURCE MESSAGE IDS: use only IDs actually present in the supplied prompt/window.',
        'CURRENT DURABLE DOSSIER CONTEXT INCLUDING PERSONALITY AND SPEECH:',
        JSON.stringify(contexts),
        'SEMANTIC UPDATE SHAPE:',
        JSON.stringify({
            semanticUpdates: [{
                field: 'personality|behaviorProfile|speech|mannerisms|role|species|background|appearance|appearanceForms|age|apparentAge|birthday|mood|location|goal|status|keyRelationships|memories',
                operation: 'establish|refine|replace|remove',
                value: 'scalar, collection, or form value as appropriate',
                changes: [{ action: 'add|replace|remove', ref: 'supplied stable entry ref when available', expected: 'exact current value when ref is unavailable', value: 'new value for add/replace' }],
                clear: false,
                durability: 'durable|temporary',
                scope: { form: 'optional exact form name' },
                ageKind: 'birthday|elapsed|correction when changing established chronological age',
                sources: [{ messageId: 0, excerpt: 'short concrete excerpt from supplied permitted context' }],
                explanation: 'brief semantic reason',
            }],
        }),
    ].filter(Boolean).join('\n\n');
}

function sourceRows(update) {
    return (Array.isArray(update?.sources) ? update.sources : []).slice(0, 6).map(raw => ({
        messageId: Number.isInteger(raw?.messageId) ? raw.messageId : null,
        excerpt: compact(raw?.excerpt ?? raw?.evidence, 1000),
    })).filter(row => row.excerpt);
}

function sourceValidation(update, options = {}) {
    const rows = sourceRows(update);
    if (!rows.length) return { ok: false, reason: 'missing-source' };
    const context = evidenceKey(options.profileContext, 50000);
    if (!context) return { ok: false, reason: 'no-permitted-context' };
    const currentMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    for (const row of rows) {
        if (row.messageId !== null && row.messageId < 0) return { ok: false, reason: 'invalid-source-reference' };
        if (currentMessageId !== null && row.messageId !== null && row.messageId > currentMessageId) return { ok: false, reason: 'future-source-reference' };
        const excerpt = evidenceKey(row.excerpt, 1600);
        if (!excerpt || !context.includes(excerpt)) return { ok: false, reason: 'out-of-scope-source' };
    }
    return { ok: true, rows };
}

function manualProtected(npc, field) {
    return (Array.isArray(npc?.manualProfileFields) ? npc.manualProfileFields : []).includes(field);
}

function sameValue(left, right) {
    return evidenceKey(left, 8000) === evidenceKey(right, 8000);
}

function normalizedScalar(field, value) {
    if (field === 'age') return normalizeActualAge(value);
    if (field === 'apparentAge') return normalizeApparentAge(value);
    if (field === 'birthday') return normalizeBirthday(value);
    return compact(value, field === 'appearance' ? 1800 : 1200);
}

function scalarCurrent(npc, field) {
    return normalizedScalar(field, npc?.[field]);
}

function ageGroundedInSources(value, rows = []) {
    const normalized = normalizeActualAge(value);
    const number = normalized.match(/\d{1,4}/)?.[0];
    if (!number) return false;
    return rows.some(row => new RegExp(`(^|\\D)${number}(?!\\d)`).test(row.excerpt));
}

function collectionValues(npc, field, limits) {
    if (field === 'keyRelationships') return normalizeKeyRelationshipEntries(npc?.[field], limits.keyRelationships, 500);
    if (field === 'memories') return normalizeMemoryEntries(npc?.[field], limits.memories, 700);
    const cap = field === 'behaviorProfile' ? limits.behaviorProfile : limits.mannerisms;
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(npc?.[field]) ? npc[field] : []) {
        const value = compact(raw, 700);
        const key = evidenceKey(value, 1400);
        if (!value || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= cap) break;
    }
    return out;
}

function normalizeCollection(field, values, limits) {
    if (field === 'keyRelationships') return normalizeKeyRelationshipEntries(values, limits.keyRelationships, 500);
    if (field === 'memories') return normalizeMemoryEntries(values, limits.memories, 700);
    const cap = field === 'behaviorProfile' ? limits.behaviorProfile : limits.mannerisms;
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
        const value = compact(raw, 700);
        const key = evidenceKey(value, 1400);
        if (!value || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= cap) break;
    }
    return out;
}

function targetIndex(field, current, change) {
    const ref = compact(change?.ref, 260);
    const expected = compact(change?.expected, 800);
    if (ref) {
        const index = current.findIndex(value => semanticEntryRef(field, value) === ref);
        if (index >= 0) return index;
    }
    if (expected) return current.findIndex(value => sameValue(value, expected));
    return -1;
}

function applyCollectionOperation(npc, update, limits) {
    const field = update.field;
    const operation = update.operation;
    const current = collectionValues(npc, field, limits);
    if (operation === 'establish' && current.length) return { changed: false, reason: 'already-established' };
    if (operation === 'remove' && update.clear === true) {
        if (!current.length) return { changed: false, reason: 'already-empty' };
        npc[field] = [];
        return { changed: true };
    }

    let next = [...current];
    const changes = Array.isArray(update.changes) ? update.changes.slice(0, 32) : [];
    if (changes.length) {
        // Replacements/removals happen before additions, so a full collection can still evolve.
        for (const change of changes.filter(row => ['replace', 'remove'].includes(String(row?.action)))) {
            const action = String(change.action);
            const index = targetIndex(field, next, change);
            if (index < 0) continue;
            if (action === 'remove') next.splice(index, 1);
            else {
                const value = compact(change.value, 700);
                if (value) next[index] = value;
            }
        }
        for (const change of changes.filter(row => String(row?.action) === 'add')) {
            const value = compact(change.value, 700);
            if (!value || next.some(item => sameValue(item, value))) continue;
            next.push(value);
        }
    } else if (Array.isArray(update.value)) {
        const incoming = normalizeCollection(field, update.value, limits);
        if (operation === 'replace') {
            if (!incoming.length && current.length && update.clear !== true) {
                return { changed: false, reason: 'explicit-clear-required' };
            }
            next = incoming;
        } else if (operation === 'refine' || operation === 'establish') {
            for (const value of incoming) if (!next.some(item => sameValue(item, value))) next.push(value);
        } else if (operation === 'remove') {
            for (const value of incoming) next = next.filter(item => !sameValue(item, value));
        }
    } else if (operation === 'remove') {
        return { changed: false, reason: 'ambiguous-removal' };
    }

    next = normalizeCollection(field, next, limits);
    if (JSON.stringify(next) === JSON.stringify(current)) return { changed: false, reason: 'no-change' };
    npc[field] = next;
    return { changed: true };
}

function applyFormOperation(npc, update) {
    const current = normalizeAppearanceForms(npc.appearanceForms);
    const targetName = compact(update?.scope?.form || update?.targetForm || update?.expected, 80);
    const targetRef = compact(update?.ref, 260);
    let index = -1;
    if (targetRef) index = current.findIndex(form => semanticEntryRef('appearanceForms', form.name) === targetRef);
    if (index < 0 && targetName) index = current.findIndex(form => normalizeName(form.name) === normalizeName(targetName));
    const operation = update.operation;
    if (operation === 'remove') {
        if (index < 0) return { changed: false, reason: 'target-not-found' };
        const next = current.filter((_, row) => row !== index);
        npc.appearanceForms = next;
        if (normalizeName(npc.currentForm) === normalizeName(current[index].name)) npc.currentForm = '';
        return { changed: true };
    }
    const rawValue = update.value && typeof update.value === 'object' && !Array.isArray(update.value)
        ? update.value
        : { name: targetName, appearance: update.value };
    const normalized = normalizeAppearanceForms([rawValue])[0];
    if (!normalized) return { changed: false, reason: 'invalid-form-value' };
    if (operation === 'establish') {
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

function applyScalarOperation(npc, update, sourceRowsValue) {
    const field = update.field;
    const operation = update.operation;
    const current = scalarCurrent(npc, field);
    if (operation === 'remove') {
        if (!current) return { changed: false, reason: 'already-empty' };
        npc[field] = '';
        if (field === 'birthday') npc.birthdayProvenance = '';
        return { changed: true };
    }
    const value = normalizedScalar(field, update.value);
    if (!value) return { changed: false, reason: 'invalid-value' };
    if (operation === 'establish' && current) return { changed: false, reason: 'already-established' };
    if (operation !== 'establish' && !current && operation !== 'replace') return { changed: false, reason: 'not-established' };
    if (sameValue(current, value)) return { changed: false, reason: 'no-change' };
    if (field === 'age' && current) {
        const ageKind = String(update.ageKind || '').trim().toLocaleLowerCase();
        if (!AGE_KINDS.has(ageKind)) return { changed: false, reason: 'missing-age-kind' };
        if (!ageGroundedInSources(value, sourceRowsValue)) return { changed: false, reason: 'ungrounded-age-value' };
    }
    npc[field] = value;
    if (field === 'birthday') npc.birthdayProvenance = 'explicit';
    return { changed: true };
}

function normalizedUpdate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const field = String(raw.field || '').trim();
    const operation = String(raw.operation || '').trim().toLocaleLowerCase();
    if (![...SCALAR_FIELDS, ...COLLECTION_FIELDS, FORM_FIELD].includes(field) || !SEMANTIC_UPDATE_OPERATIONS.includes(operation)) return null;
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
        const updates = (Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []).map(normalizedUpdate).filter(Boolean);
        if (!updates.length) continue;
        const byId = String(patch.id || '').trim() ? (state.npcs || []).find(npc => npc.id === String(patch.id).trim()) : null;
        const existing = byId || findNpcByReference(state, patch.name || '');
        if (!existing) {
            // Named-preferred admission is model-led for identity kind. Avoid an English
            // role-modifier heuristic overruling a structured "named" judgment.
            if (String(admissionMode) === 'named_preferred' && String(patch.identityKind || '').trim().toLocaleLowerCase() === 'named') {
                patch._modelLedRole = patch.role;
                patch.role = '';
            }
            continue;
        }
        const fields = new Set(updates.map(update => update.field));
        for (const field of fields) {
            // For an existing dossier, semanticUpdates is authoritative whenever the
            // same scalar/collection is also present in the compatibility patch. This
            // includes live-state scalars so a stale top-level goal/mood/location/status
            // cannot race the explicit establish/refine/replace/remove operation.
            if (SCALAR_FIELDS.has(field) || COLLECTION_FIELDS.has(field)) delete patch[field];
            if (field === 'age') { delete patch.ageChange; delete patch.ageProgression; }
            if (field === 'appearanceForms') { delete patch.appearanceForms; delete patch.appearanceFormChanges; }
        }
        if (fields.has('personality') || fields.has('speech') || fields.has('behaviorProfile') || fields.has('mannerisms')) delete patch.profileChanges;
        if ([...fields].some(field => ['role', 'species', 'background', 'appearance', 'birthday'].includes(field))) delete patch.canonChanges;
    }
    return result;
}

function restoreNewNpcModelLedRole(state, originalResult) {
    for (const patch of Array.isArray(originalResult?.npcs) ? originalResult.npcs : []) {
        const role = compact(patch?._modelLedRole ?? patch?.role, 240);
        if (!role || String(patch?.identityKind || '').trim().toLocaleLowerCase() !== 'named') continue;
        const npc = String(patch.id || '').trim() ? (state.npcs || []).find(item => item.id === String(patch.id).trim()) : findNpcByReference(state, patch.name || '');
        if (!npc || manualProtected(npc, 'role') || npc.role) continue;
        npc.role = role;
        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
    }
}

function identityValue(value) {
    if (Array.isArray(value)) return value.map(identityValue);
    if (!value || typeof value !== 'object') return value ?? null;
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = identityValue(value[key]);
    return out;
}

function updateIdentity(raw) {
    const sources = sourceRows(raw).map(row => ({
        messageId: row.messageId ?? null,
        excerpt: evidenceKey(row.excerpt, 900),
    }));
    const operation = {
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
        sources,
    };
    return JSON.stringify(operation);
}

export function applyModelLedSemanticUpdates(stateInput, resultInput, options = {}) {
    const state = stateInput;
    const diagnostics = [];
    const seen = new Set();
    const limits = normalizeDossierLimits(options.dossierLimits);
    restoreNewNpcModelLedRole(state, resultInput);

    for (const patch of Array.isArray(resultInput?.npcs) ? resultInput.npcs : []) {
        const npc = String(patch?.id || '').trim()
            ? (state.npcs || []).find(item => item.id === String(patch.id).trim())
            : findNpcByReference(state, patch?.name || '');
        if (!npc) continue;
        for (const raw of Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []) {
            const update = normalizedUpdate(raw);
            if (!update) {
                diagnostics.push({ npcId: npc.id, field: String(raw?.field || ''), operation: String(raw?.operation || ''), status: 'invalid-structure' });
                continue;
            }
            const dedupeKey = `${npc.id}|${updateIdentity(update)}`;
            if (seen.has(dedupeKey)) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, status: 'duplicate-operation' });
                continue;
            }
            seen.add(dedupeKey);
            if (manualProtected(npc, update.field)) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, status: 'manually-protected' });
                continue;
            }
            if (DURABLE_FIELDS.has(update.field) && update.durability === 'temporary') {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, status: 'invalid-structure', reason: 'temporary-evidence-cannot-rewrite-durable-canon' });
                continue;
            }
            const provenance = sourceValidation(update, options);
            if (!provenance.ok) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, status: 'invalid-source-reference', reason: provenance.reason });
                continue;
            }
            let result;
            if (SCALAR_FIELDS.has(update.field)) result = applyScalarOperation(npc, update, provenance.rows);
            else if (COLLECTION_FIELDS.has(update.field)) result = applyCollectionOperation(npc, update, limits);
            else result = applyFormOperation(npc, update);
            diagnostics.push({
                npcId: npc.id,
                field: update.field,
                operation: update.operation,
                status: result.changed ? 'applied' : 'no-change-proposed',
                reason: result.reason || '',
            });
            if (result.changed) npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        }
    }
    state.npcs = (state.npcs || []).map(npc => normalizeNpc(npc));
    return { state, diagnostics };
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
    for (const raw of Array.isArray(resultInput?.familyFacts) ? resultInput.familyFacts : []) {
        const owner = findNpcByReference(state, raw?.owner || '');
        const relation = compact(raw?.relation, 180);
        const reciprocal = compact(raw?.reciprocalRelation, 180);
        const evidence = compact(raw?.evidence, 1000);
        if (!owner || !relation || !evidence || !evidenceKey(options.profileContext, 50000).includes(evidenceKey(evidence, 1600))) continue;
        const members = (Array.isArray(raw?.members) ? raw.members : []).map(value => compact(value, 160)).filter(Boolean).slice(0, 20);
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

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
    dossierFieldManualProtected,
    dossierSemanticFieldList,
} from './dossier-fields.js';

export const NPC_STATE_MODEL_CONTRACT_VERSION = 3;

const FIELD_SET = new Set(DOSSIER_SEMANTIC_FIELDS);
const SCALAR_FIELDS = new Set(DOSSIER_SCALAR_FIELDS);
const COLLECTION_FIELDS = new Set(DOSSIER_COLLECTION_FIELDS);
const FORM_FIELDS = new Set(DOSSIER_FORM_FIELDS);
const DURABLE_FIELDS = new Set(DOSSIER_DURABLE_FIELDS);
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
                mode: row.mode,
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
        `Mode: ${mode}. EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates. Do not also emit profileChanges, canonChanges, ageChange, appearanceFormChanges, keyRelationshipChanges, or direct ordinary dossier replacements for an existing NPC. Those are compatibility/new-NPC bootstrap only.`,
        `Semantic fields: ${dossierSemanticFieldList()}. Operations: ${DOSSIER_SEMANTIC_OPERATIONS.join('|')}.`,
        `For every exchange-active EXISTING NPC, inspect all evaluation groups and return evaluatedGroups:[${groups}]. A listed group means you actually checked its stored values against supplied evidence, even when it produced no update. For targeted Refresh, inspect all groups for the target.`,
        'Each semantic update is {field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId,excerpt}],explanation}. Omission means unchanged, not deletion. remove is explicit. Empty arrays never clear unless clear:true is explicitly supported.',
        'Evidence excerpts must be concrete text from the supplied permitted source window. Saved dossier summaries are context, not independent proof. Code validates source provenance, targeting, manual locks, normalization, collection limits and persistence; you decide semantic meaning.',
        'STRUCTURED EVIDENCE AUTHORITY: World_State may support only live location/status; NPC_Inner_Chatter may support only private mood/goal. Neither source may rewrite durable canon/profile/memory/keyRelationships/currentForm. Visible narrative remains valid for every semantic field.',
        'Durable canon/profile fields may establish, refine, replace, or remove only when the narrative supports durable truth. Temporary sleep, unconsciousness, silence while asleep, one-off reactions, poses, moods and forms do not rewrite durable personality/speech/canon. A real later characterization may replace an obsolete temporary placeholder.',
        'Profile fields are personality, behaviorProfile, speech and mannerisms. Mannerisms represent durable recurring tendencies, not isolated gestures. Form-specific traits stay scoped when relevant.',
        'Canon fields are role, species, background, appearance, appearanceForms, age, apparentAge and birthday. Temporary form changes do not rewrite species or ordinary/shared appearance. Established chronological age replacement needs ageKind birthday|elapsed|correction and evidence containing the resulting number. Do not infer chronological age from appearance or invent calendar arithmetic.',
        'Birthday is passive freeform calendar metadata: preserve fantasy calendars, do not infer a date from age, and never advance age just because that date passes. Revise established birthday only with grounded correction evidence; manual locks remain binding.',
        'After a grounded birthday/elapsed age update, evaluate apparent age and affected appearance/forms using established species and setting maturation. Unknown fantasy biology stays unknown, ageless beings need not change, and age correction alone never implies physical growth. Apply any supported visual development through targeted semantic updates, preserving unrelated traits and forms. Minor maturation descriptions remain neutral and non-sexual.',
        'Live fields are mood, location, goal, status and currentForm. Reconsider them whenever supplied evidence establishes a newer current truth. Remove an obsolete completed goal/location/status when it conclusively ended and no replacement is supported. Status is current activity/condition, never presence/lifecycle.',
        'Collections are behaviorProfile, mannerisms, keyRelationships and memories. Prefer targeted changes using supplied ref or exact expected value. Replacements/removals happen before additions, so a full collection can still evolve without evicting unrelated entries. Important memories are durable distinct events/facts, not paraphrase logs.',
        'Physical forms are coherent bodies with materially distinct anatomy, including partial, magical, spectral, or reversible transformations. Outfit, pose, mood, injury, or aura alone is not a form. Use grounded freeform labels; capture distinct demonstrated forms as {name,appearance}. The stored description is durable continuity even when entering that form is temporary. New NPCs may bootstrap direct appearanceForms; existing dossiers use targeted semanticUpdates. Do not rewrite shared appearance merely because currentForm changed, or infer new anatomy from a casual contradiction.',
        'appearanceForms edits target an existing form by scope.form, targetForm, ref or exact form name. Add a new form with establish; replace/remove only the targeted form. currentForm is live state and uses its own scalar semantic update.',
        'keyRelationships contains NON-PLAYER NPC ties only. Player relationship state is handled by relationshipSummary/relationshipChange outside this semantic channel.',
        mode === 'completeness'
            ? 'SUPPLEMENTAL SAFETY: this exchange was already committed. Do not replay relationship changes, lifecycle events, age progression, memories, or development merely because they are visible again. Propose only genuinely missing/corrective dossier semantic updates.'
            : '',
        mode === 'historical'
            ? 'HISTORICAL SAFETY: use only evidence at or before this reconstruction point. Never cite future messages.'
            : '',
        sources.length ? `PERMITTED SOURCE MESSAGE IDS: ${JSON.stringify(sources)}` : 'PERMITTED SOURCE MESSAGE IDS: use only IDs actually present in the supplied prompt/window.',
        compactContext ? 'SEMANTIC EDIT INDEX (stored values are already in the main dossier roster; this index supplies edit refs/locks only):' : 'CURRENT DOSSIER CONTEXT:',
        JSON.stringify(contexts),
        'SEMANTIC UPDATE SHAPE:',
        JSON.stringify({
            evaluatedGroups: DOSSIER_EVALUATION_GROUPS,
            semanticUpdates: [{
                field: dossierSemanticFieldList(),
                operation: DOSSIER_SEMANTIC_OPERATIONS.join('|'),
                value: 'scalar, collection, or form value as appropriate',
                changes: [{ action: 'add|replace|remove', ref: 'supplied stable entry ref', expected: 'exact current value fallback', value: 'new value for add/replace' }],
                clear: false,
                durability: 'durable|temporary',
                scope: { form: 'optional exact form name' },
                ageKind: 'birthday|elapsed|correction when replacing established chronological age',
                sources: [{ messageId: 0, excerpt: 'short concrete excerpt from supplied context' }],
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

function semanticSourceContext(field, options = {}) {
    const parts = [options.semanticEvidenceContext ?? options.profileContext];
    const structuredContext = dossierFieldDefinition(field)?.structuredContext;
    if (structuredContext) parts.push(options[structuredContext]);
    return evidenceKey(parts.filter(Boolean).join('\n'), 50000);
}

function sourceValidation(update, options = {}) {
    const rows = sourceRows(update);
    if (!rows.length) return { ok: false, reason: 'missing-source' };
    const context = semanticSourceContext(update.field, options);
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
    return dossierFieldManualProtected(npc, field);
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

function normalizeCollection(field, values, limits, playerName = '') {
    if (field === 'keyRelationships') {
        return normalizeKeyRelationshipEntries(values, limits.keyRelationships, 500)
            .filter(value => !playerReference(value, playerName));
    }
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
        const byId = String(patch.id || '').trim() ? (state.npcs || []).find(npc => npc.id === String(patch.id).trim()) : null;
        const existing = byId || findNpcByReference(state, patch.name || '');
        if (!existing) {
            if (String(admissionMode) === 'named_preferred' && String(patch.identityKind || '').trim().toLocaleLowerCase() === 'named') {
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
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'duplicate-operation' });
                continue;
            }
            seen.add(dedupeKey);
            if (manualProtected(npc, update.field)) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'manually-protected' });
                continue;
            }
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
            if (result.changed) npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        }
    }
    state.npcs = (state.npcs || []).map(npc => normalizeNpc(npc));
    return { state, diagnostics };
}

function patchForNpc(resultInput, npc) {
    return (Array.isArray(resultInput?.npcs) ? resultInput.npcs : []).find(patch => {
        const id = String(patch?.id || '').trim();
        if (id) return id === npc.id;
        const name = normalizeName(patch?.name);
        return name && [npc.name, ...(npc.aliases || [])].some(label => normalizeName(label) === name);
    }) || null;
}

export function auditDossierEvaluationCoverage(stateInput, resultInput, { npcIds = [] } = {}) {
    const state = stateInput || {};
    const diagnostics = [];
    const ids = [...new Set((Array.isArray(npcIds) ? npcIds : []).filter(Boolean))];
    for (const id of ids) {
        const npc = (state.npcs || []).find(item => item.id === id) || findNpcByReference(state, id);
        if (!npc) continue;
        const patch = patchForNpc(resultInput, npc);
        if (!patch) {
            diagnostics.push({ npcId: npc.id, status: 'missing-npc-patch', missingGroups: [...DOSSIER_EVALUATION_GROUPS] });
            continue;
        }
        const groups = new Set((Array.isArray(patch.evaluatedGroups) ? patch.evaluatedGroups : []).map(value => String(value || '').trim()).filter(value => DOSSIER_EVALUATION_GROUPS.includes(value)));
        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));
        if (missingGroups.length) diagnostics.push({ npcId: npc.id, status: 'incomplete-evaluation', missingGroups });
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
        const relation = compact(raw?.relation, 180);
        const reciprocal = compact(raw?.reciprocalRelation, 180);
        const evidence = compact(raw?.evidence, 1000);
        if (!owner || !relation || !evidence || !context.includes(evidenceKey(evidence, 1600))) continue;
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

export { DOSSIER_SEMANTIC_OPERATIONS as SEMANTIC_UPDATE_OPERATIONS, DOSSIER_EVALUATION_GROUPS, DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS, dossierFieldDefinition };

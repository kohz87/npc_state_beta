import { findNpcByReference, normalizeName } from '../schema.js';
import { DOSSIER_LIVE_FIELDS, dossierFieldDefinition, dossierFieldGroup } from './dossier-fields.js';

function compact(value, max = 1200) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function existingNpc(state, patch) {
    const id = compact(patch?.id, 180);
    return (id ? (state?.npcs || []).find(npc => npc.id === id) : null)
        || findNpcByReference(state, patch?.name || '');
}

function hasUpdate(updates, field) {
    return updates.some(update => String(update?.field || '').trim() === field);
}

function source(evidence, options = {}) {
    const excerpt = compact(evidence, 1000);
    return excerpt ? [{ messageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null, excerpt }] : [];
}

function evidenceKey(value, max = 50000) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim()
        .slice(0, max);
}

function compatibilityDiagnostic(options, row) {
    if (Array.isArray(options.compatibilityDiagnostics)) options.compatibilityDiagnostics.push(row);
}

function identityKeys(npc) {
    return [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
        .map(value => evidenceKey(value, 500))
        .filter(value => value.length >= 2);
}

function directEvidenceContexts(field, options = {}) {
    const visible = compact(options.currentAdmissionText || options.semanticEvidenceContext || options.profileContext, 50000);
    const structuredKey = dossierFieldDefinition(field)?.structuredContext;
    const structured = structuredKey ? compact(options[structuredKey], 50000) : '';
    return [visible, structured].filter(Boolean);
}

function directFieldSource(npc, field, value, options = {}) {
    const proposed = evidenceKey(value, 2000);
    const identities = identityKeys(npc);
    if (!proposed || !identities.length) return [];
    for (const context of directEvidenceContexts(field, options)) {
        const lines = context.split(/\r?\n/);
        const sentences = context.split(/(?<=[.!?])\s+/);
        const spans = [...new Set([...lines, ...sentences])].map(row => row.trim()).filter(Boolean);
        for (const span of spans) {
            const key = evidenceKey(span, 4000);
            if (!key.includes(proposed) || !identities.some(identity => (` ${key} `).includes(` ${identity} `))) continue;
            return source(span, options);
        }
    }
    return [];
}

function operation(mode) {
    return String(mode || '').trim().toLocaleLowerCase() === 'refine' ? 'refine' : 'replace';
}

function counterpartEntry(npc, other) {
    const key = normalizeName(other);
    if (!key) return '';
    return (Array.isArray(npc?.keyRelationships) ? npc.keyRelationships : []).find(entry => {
        const name = String(entry || '').split(/\s+(?:-|–|—)\s+/)[0];
        return normalizeName(name) === key;
    }) || '';
}

/**
 * Boundary-only compatibility adapter. Pre-v3 response shapes are translated once into
 * semanticUpdates, after which existing-dossier ordinary fields use the canonical semantic
 * pipeline exclusively. No legacy profile/canon gate runs after this boundary.
 */
export function adaptLegacySemanticPayload(stateInput, resultInput, options = {}) {
    if (!resultInput || typeof resultInput !== 'object' || Array.isArray(resultInput)) return resultInput;
    const state = stateInput || {};
    const result = structuredClone(resultInput);
    const admissionMode = String(options.admissionMode || '').trim();

    for (const patch of Array.isArray(result.npcs) ? result.npcs : []) {
        const existing = existingNpc(state, patch);
        const identityKind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
        if (!existing && admissionMode === 'named_preferred' && ['named', 'proper-name', 'proper'].includes(identityKind)) {
            patch._modelLedRole = compact(patch.role, 240);
            patch.role = '';
        }
        if (!existing) continue;

        const updates = Array.isArray(patch.semanticUpdates) ? structuredClone(patch.semanticUpdates) : [];

        for (const change of Array.isArray(patch.profileChanges) ? patch.profileChanges : []) {
            const field = String(change?.field || '').trim();
            if (!['personality', 'behaviorProfile', 'speech', 'mannerisms'].includes(field) || hasUpdate(updates, field)) continue;
            const value = patch[field];
            const evidence = compact(change?.evidence || change?.reason, 1000);
            if (value == null || value === '' || (Array.isArray(value) && !value.length) || !evidence) continue;
            updates.push({ field, operation: operation(change?.mode), value: structuredClone(value), durability: 'durable', sources: source(evidence, options), explanation: compact(change?.concept || change?.mode || 'Legacy profile judgment.', 500) });
        }

        for (const change of Array.isArray(patch.canonChanges) ? patch.canonChanges : []) {
            const field = String(change?.field || '').trim();
            if (!['appearance', 'species', 'background', 'role', 'birthday'].includes(field) || hasUpdate(updates, field)) continue;
            const value = change?.value ?? patch[field];
            const evidence = compact(change?.evidence || change?.reason, 1000);
            if (value == null || value === '' || !evidence) continue;
            updates.push({ field, operation: operation(change?.mode), value: structuredClone(value), durability: 'durable', sources: source(evidence, options), explanation: compact(change?.mode || 'Legacy canon judgment.', 500) });
        }

        if (!hasUpdate(updates, 'age') && patch?.ageChange && typeof patch.ageChange === 'object' && !Array.isArray(patch.ageChange)) {
            const evidence = compact(patch.ageChange.evidence || patch.ageChange.reason, 1000);
            const value = patch.ageChange.age ?? patch.ageChange.value;
            if (evidence && value != null && value !== '') updates.push({
                field: 'age', operation: 'replace', value,
                ageKind: String(patch.ageChange.kind || '').trim().toLocaleLowerCase(),
                durability: 'durable', sources: source(evidence, options), explanation: 'Legacy chronological-age judgment.',
            });
        }

        if (!hasUpdate(updates, 'appearanceForms')) {
            for (const change of Array.isArray(patch.appearanceFormChanges) ? patch.appearanceFormChanges : []) {
                const name = compact(change?.name || change?.form, 80);
                const appearance = compact(change?.appearance || change?.description, 1800);
                const evidence = compact(change?.evidence || change?.reason, 1000);
                if (!name || !appearance || !evidence) continue;
                updates.push({ field: 'appearanceForms', operation: 'replace', value: { name, appearance }, scope: { form: name }, durability: 'durable', sources: source(evidence, options), explanation: compact(change?.mode || 'Legacy form judgment.', 500) });
            }
        }

        if (!hasUpdate(updates, 'keyRelationships')) {
            const changes = [];
            let evidence = '';
            for (const change of Array.isArray(patch.keyRelationshipChanges) ? patch.keyRelationshipChanges : []) {
                if (String(change?.action || '').trim() !== 'remove') continue;
                const expected = counterpartEntry(existing, change?.other || change?.name || change?.target);
                const proof = compact(change?.evidence || change?.reason, 1000);
                if (!expected || !proof) continue;
                evidence ||= proof;
                changes.push({ action: 'remove', expected });
            }
            if (changes.length) updates.push({ field: 'keyRelationships', operation: 'refine', changes, durability: 'durable', sources: source(evidence, options), explanation: 'Legacy key-relationship removal.' });
        }

        for (const field of DOSSIER_LIVE_FIELDS) {
            if (hasUpdate(updates, field) || !Object.prototype.hasOwnProperty.call(patch, field)) continue;
            const value = compact(patch?.[field], field === 'currentForm' ? 80 : 1200);
            if (!value || normalizeName(value) === normalizeName(existing?.[field])) continue;
            const fieldSources = directFieldSource(existing, field, value, options);
            const operationName = compact(existing?.[field]) ? 'replace' : 'establish';
            if (!fieldSources.length) {
                compatibilityDiagnostic(options, {
                    npcId: existing.id, field, operation: operationName, group: dossierFieldGroup(field),
                    status: 'unsupported-direct-proposal', reason: 'missing-field-specific-evidence',
                });
                continue;
            }
            updates.push({
                field, operation: operationName, value, durability: 'temporary',
                sources: fieldSources, explanation: 'Boundary-normalized direct live-state compatibility value.',
            });
        }

        if (updates.length) patch.semanticUpdates = updates;
    }
    return result;
}

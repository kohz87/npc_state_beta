import { findNpcByReference, normalizeName } from '../schema.js';

function compact(value, max = 1200) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function modelSource(evidence, options = {}) {
    const excerpt = compact(evidence, 1000);
    if (!excerpt) return [];
    return [{
        messageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        excerpt,
    }];
}

function existingNpc(state, patch) {
    const id = compact(patch?.id, 180);
    return (id ? (state?.npcs || []).find(npc => npc.id === id) : null)
        || findNpcByReference(state, patch?.name || '');
}

function hasEquivalentUpdate(updates, field) {
    return updates.some(update => String(update?.field || '').trim() === field);
}

function profileOperation(mode) {
    return String(mode || '').trim().toLocaleLowerCase() === 'refine' ? 'refine' : 'replace';
}

function canonOperation(mode) {
    return String(mode || '').trim().toLocaleLowerCase() === 'refine' ? 'refine' : 'replace';
}

/**
 * Transitional adapter for model responses produced by the pre-v2 prompt contract.
 * The model's structured semantic judgment is preserved, but old English phrase gates
 * no longer decide whether it may be applied. Exact source-span validation remains in
 * semantic-updates.js.
 */
export function adaptLegacySemanticPayload(stateInput, resultInput, options = {}) {
    if (!resultInput || typeof resultInput !== 'object' || Array.isArray(resultInput)) return resultInput;
    const state = stateInput || {};
    const result = structuredClone(resultInput);
    const admissionMode = String(options.admissionMode || '').trim();

    for (const patch of Array.isArray(result.npcs) ? result.npcs : []) {
        const existing = existingNpc(state, patch);
        const identityKind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');

        // named_preferred is deterministic policy, but the semantic question of whether
        // this is a proper name comes from identityKind rather than an English modifier list.
        if (!existing && admissionMode === 'named_preferred' && ['named', 'proper-name', 'proper'].includes(identityKind)) {
            patch._modelLedRole = compact(patch.role, 240);
            patch.role = '';
        }
        if (!existing) continue;

        const updates = Array.isArray(patch.semanticUpdates) ? structuredClone(patch.semanticUpdates) : [];

        for (const change of Array.isArray(patch.profileChanges) ? patch.profileChanges : []) {
            const field = String(change?.field || '').trim();
            if (!['personality', 'behaviorProfile', 'speech', 'mannerisms'].includes(field) || hasEquivalentUpdate(updates, field)) continue;
            const value = patch[field];
            if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
            const evidence = compact(change?.evidence || change?.reason, 1000);
            if (!evidence) continue;
            updates.push({
                field,
                operation: profileOperation(change?.mode),
                value: structuredClone(value),
                durability: 'durable',
                sources: modelSource(evidence, options),
                explanation: compact(change?.concept || change?.mode || 'Model-classified profile update.', 500),
            });
        }

        for (const change of Array.isArray(patch.canonChanges) ? patch.canonChanges : []) {
            const field = String(change?.field || '').trim();
            if (!['appearance', 'species', 'background', 'role', 'birthday'].includes(field) || hasEquivalentUpdate(updates, field)) continue;
            const value = change?.value ?? patch[field];
            const evidence = compact(change?.evidence || change?.reason, 1000);
            if (value == null || value === '' || !evidence) continue;
            updates.push({
                field,
                operation: canonOperation(change?.mode),
                value: structuredClone(value),
                durability: 'durable',
                sources: modelSource(evidence, options),
                explanation: compact(change?.mode || 'Model-classified canon update.', 500),
            });
        }

        if (!hasEquivalentUpdate(updates, 'age') && patch?.ageChange && typeof patch.ageChange === 'object' && !Array.isArray(patch.ageChange)) {
            const evidence = compact(patch.ageChange.evidence || patch.ageChange.reason, 1000);
            const value = patch.ageChange.age ?? patch.ageChange.value;
            if (evidence && value != null && value !== '') updates.push({
                field: 'age',
                operation: 'replace',
                value,
                ageKind: String(patch.ageChange.kind || '').trim().toLocaleLowerCase(),
                durability: 'durable',
                sources: modelSource(evidence, options),
                explanation: 'Model-classified chronological-age update.',
            });
        }

        if (!hasEquivalentUpdate(updates, 'appearanceForms')) {
            for (const change of Array.isArray(patch.appearanceFormChanges) ? patch.appearanceFormChanges : []) {
                const name = compact(change?.name || change?.form, 80);
                const appearance = compact(change?.appearance || change?.description, 1800);
                const evidence = compact(change?.evidence || change?.reason, 1000);
                if (!name || !appearance || !evidence) continue;
                updates.push({
                    field: 'appearanceForms',
                    operation: 'replace',
                    value: { name, appearance },
                    scope: { form: name },
                    durability: 'durable',
                    sources: modelSource(evidence, options),
                    explanation: compact(change?.mode || 'Model-classified form update.', 500),
                });
            }
        }

        if (updates.length) patch.semanticUpdates = updates;
    }
    return result;
}

// Fixture authoring only: every migrated field has an explicitly selected source.
// Never infer citations from identity/activity, or use this helper in production.
export function citedFixture(patch, evidenceByField) {
    const next = structuredClone(patch);
    const updates = [...(next.semanticUpdates || [])];
    for (const [field, evidence] of Object.entries(evidenceByField)) {
        if (!Object.hasOwn(next, field)) continue;
        if (!updates.some(update => update.field === field)) {
            const { excerpt, messageId = null, ...metadata } = typeof evidence === 'string' ? { excerpt: evidence } : evidence;
            if (typeof excerpt !== 'string' || !excerpt) throw new Error('Fixture needs an explicit source for ' + field);
            updates.push({ field, operation: 'establish', value: next[field], sources: [{ messageId, excerpt }], ...metadata });
        }
        delete next[field];
    }
    if (updates.length) next.semanticUpdates = updates;
    return next;
}

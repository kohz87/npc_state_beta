from pathlib import Path

path = Path('src/model/semantic-updates.js')
text = path.read_text()
old = """function profileEvolutionConcept(update, result = {}) {
    if (SCALAR_FIELDS.has(update.field)) return compact(update.value || update.explanation || update.field, 180);
    const changes = Array.isArray(update.changes) ? update.changes : [];
    const values = changes.filter(change => ['add', 'replace'].includes(String(change?.action || ''))).map(change => compact(change?.value, 180)).filter(Boolean);
    if (values.length) return compact(values.join('; '), 180);
    if (Array.isArray(update.value)) return compact(update.value.join('; '), 180);
    return compact(update.explanation || result.reason || update.field, 180);
}

"""
new = """function profileEvolutionTextValue(value) {
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

"""
if old not in text:
    raise SystemExit('missing profileEvolutionConcept patch anchor')
path.write_text(text.replace(old, new, 1))
print('Hardened profile evolution concept serialization')

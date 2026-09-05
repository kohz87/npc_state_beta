import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.12 follow-up marker: ' + label);
    return source.replace(from, to);
}

// Keep strict member validation for direct object application while allowing legacy/internal
// callers to omit supplemental empty world/social arrays. Text JSON remains full-contract.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function normalizeScanPayload(parsed, { requireContract = true } = {}) {`,
        `function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false } = {}) {`,
        'payload options',
    );
    source = replaceRequired(
        source,
        `        if (!scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');\n        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-identity]');\n        if (!scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');`,
        `        if ((!allowOmittedSupplemental || has('worldActiveNpcIds')) && !scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');\n        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-identity]');\n        if ((!allowOmittedSupplemental || has('socialEdges')) && !scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');`,
        'supplemental arrays',
    );
    source = replaceRequired(
        source,
        `        : normalizeScanPayload(resultInput || {}, { requireContract: true });`,
        `        : normalizeScanPayload(resultInput || {}, { requireContract: true, allowOmittedSupplemental: true });`,
        'direct object validated legacy shape',
    );
    source = replaceRequired(
        source,
        `        const existing = patchId ? state.npcs.find(item => item.id === patchId) || null : (canonicalName ? findNpcByReference(state, canonicalName) : null);`,
        `        const byId = patchId ? state.npcs.find(item => item.id === patchId) || null : null;\n        const existing = byId || (canonicalName ? findNpcByReference(state, canonicalName) : null);`,
        'unknown id same-name preflight reconciliation',
    );
    fs.writeFileSync(path, source);
}

// An exact diagnostic rollback covers the corresponding source-message/axis even when the
// bounded history row has richer/different evidence wording. Never subtract it twice.
{
    const path = 'v03/branches.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source, `    const covered = new Set();`, `    const coveredSourceAxes = new Set();`, 'covered source axes');
    source = replaceRequired(
        source,
        `            covered.add(key + '|' + axis);`,
        `            coveredSourceAxes.add(String(event?.sourceMessageId ?? '') + '|' + axis);`,
        'diagnostic source-axis coverage',
    );
    source = source.replaceAll(
        `covered.has(key + '|' + axis)`,
        `coveredSourceAxes.has(String(event?.sourceMessageId ?? '') + '|' + axis)`,
    );
    if (source.includes('covered.has(')) throw new Error('Stale event-key rollback coverage remains');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.12 second-order follow-up compatibility and rollback fixes');

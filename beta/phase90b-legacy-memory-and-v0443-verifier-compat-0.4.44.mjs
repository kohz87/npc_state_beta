import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.44 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase3-memory-hygiene-0.4.3.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        '// Scanner replacement arrays receive the same semantic hygiene.',
        '// Scanner memory merge patches receive the same semantic hygiene while preserving omitted durable memories.',
        'legacy memory verifier comment');
    source = replaceRequired(source,
        `assert(sora.memories.length === 2, 'Scanner memory array was not semantically compacted');`,
        `assert(sora.memories.length === 3, 'Scanner memory merge was not semantically compacted while preserving prior memory');`,
        'legacy memory count');
    source = replaceRequired(source,
        `assert(!sora.memories.includes('An older unrelated memory.'), 'Authoritative memory replacement semantics were accidentally changed into append-only behavior');`,
        `assert(sora.memories.includes('An older unrelated memory.'), 'Existing durable memory was erased by an ordinary scanner patch');`,
        'legacy durable memory expectation');
    source = replaceRequired(source,
        `assert(scannerSource.includes('normalizeMemoryEntries(patch.memories'), 'Scanner does not use semantic memory normalizer');`,
        `assert(scannerSource.includes('normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Scanner does not use durable semantic memory merge');`,
        'legacy scanner-source assertion');
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase86c-completeness-engine-safety-0.4.42.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `assert(scannerSource.includes('supplementalPass === true\\n            ? normalizeMemoryEntries'), 'Completeness memories must merge instead of replacing');`,
        `assert(scannerSource.includes('PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE') && scannerSource.includes('normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Completeness and ordinary scans must share durable memory merge semantics');`,
        'v0.4.42 completeness memory source assertion');
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase89-release-source-parity-0.4.43.mjs';
    let source = fs.readFileSync(path, 'utf8');
    const replacements = [
        ["assert.equal(manifest.version, '0.4.43', 'Manifest must be v0.4.43');", "assert(/^0\\.4\\.(?:4[3-9]|[5-9]\\d|\\d{3,})$/.test(manifest.version), 'Manifest must be v0.4.43+');"],
        ["assert(workflow.includes('name: Build NPC State 0.4.43 Beta'), 'Workflow title must be v0.4.43');", "assert(/name: Build NPC State 0\\.4\\.(?:4[3-9]|[5-9]\\d|\\d{3,}) Beta/.test(workflow), 'Workflow title must be v0.4.43+');"],
        ["assert(workflow.includes('for patch in $(seq 2 43); do'), 'Cold replay must include patch 43');", "assert(/for patch in \\$\\(seq 2 (?:4[3-9]|[5-9]\\d|\\d{3,})\\); do/.test(workflow), 'Cold replay must include patch 43 or later');"],
    ];
    for (const [from, to] of replacements) source = replaceRequired(source, from, to, from.slice(0, 60));
    fs.writeFileSync(path, source);
}

console.log('Made historical memory, completeness, and v0.4.43 release verifiers compatible with v0.4.44+');

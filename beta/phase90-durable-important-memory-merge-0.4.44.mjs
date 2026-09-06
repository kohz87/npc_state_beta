import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.44 memory marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(source,
        `    if (Array.isArray(patch?.memories)) {\n        const limits = normalizeDossierLimits(options.dossierLimits);\n        next.memories = options.supplementalPass === true\n            ? normalizeMemoryEntries([...(next.memories || []), ...patch.memories], limits.memories, 700)\n            : normalizeMemoryEntries(patch.memories, limits.memories, 700);\n    }`,
        `    if (Array.isArray(patch?.memories)) {\n        const limits = normalizeDossierLimits(options.dossierLimits);\n        // PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE: scanner output is an observation patch, not authority to erase omitted durable memories.\n        next.memories = normalizeMemoryEntries([...(next.memories || []), ...patch.memories], limits.memories, 700);\n    }`,
        'backend durable memory merge');

    source = replaceRequired(source,
        `        '- behaviorProfile, mannerisms, and memories are EVOLVING CURATED COLLECTIONS. Use null when unchanged; when revised, return the COMPLETE authoritative replacement set.',`,
        `        '- behaviorProfile and mannerisms are EVOLVING CURATED COLLECTIONS. Use null when unchanged; when revised, return the COMPLETE authoritative replacement set. Important Memories are different: for an EXISTING NPC, memories is a durable MERGE PATCH, not a whole-list replacement.',`,
        'recovery collection authority');
    source = replaceRequired(source,
        `        '- Replacement-array behavior applies to behaviorProfile, mannerisms, and memories. Key relationships instead merge by named counterpart so omission cannot silently erase family/friend/guardian continuity.',`,
        `        '- Replacement-array behavior applies only to behaviorProfile and mannerisms. Important Memories merge semantically with stored memories, and key relationships merge by named counterpart, so omission cannot silently erase durable continuity.',`,
        'recovery replacement-array scope');
    source = replaceRequired(source,
        `        '- Never exceed the configured limit for that collection. When full, a more important or more current entry should displace a lower-value one.',`,
        `        '- Never exceed the configured limit for that collection. For Important Memories, preserve established entries and add distinct new memories only while capacity remains; a routine scan must never evict an older stored memory merely because the model omitted it.',`,
        'recovery memory cap behavior');
    source = replaceRequired(source,
        `        '- For behaviorProfile, mannerisms, and memories, use [] only when evidence supports deliberately clearing the whole collection. For keyRelationships, [] means no relationship additions/changes; it never clears existing ties.',`,
        `        '- For behaviorProfile and mannerisms, use [] only when evidence supports deliberately clearing the whole collection. For an EXISTING NPC, memories: [] means no memory additions and NEVER clears stored memories. For keyRelationships, [] likewise means no additions/changes; it never clears existing ties.',`,
        'recovery empty-memory semantics');
    source = replaceRequired(source,
        `        '- MEMORY SEMANTIC HYGIENE: Important Memories represent distinct durable events/facts, not paraphrase logs. If two candidate memories describe the same event with the same participants/outcome, return one concise richest version. Do not merge merely because the same people or topic recur: rescue and later training, two different promises, or separate injuries remain separate memories.',`,
        `        '- MEMORY SEMANTIC HYGIENE: Important Memories represent distinct durable events/facts, not paraphrase logs. If two candidate memories describe the same event with the same participants/outcome, return one concise richest version. Do not merge merely because the same people or topic recur: rescue and later training, two different promises, or separate injuries remain separate memories.',\n        '- DURABLE IMPORTANT MEMORY MERGE: for an EXISTING NPC, return only newly established durable memories or a materially richer wording of an already stored event. Do not repeat the stored list merely to preserve it. Omitted entries remain stored locally; null or [] means no additions.',`,
        'recovery durable-memory prompt marker');

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/injection.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',`,
        `        'For existing NPCs, do a full semantic scan while preserving continuity. behaviorProfile and mannerisms use null when unchanged or the COMPLETE replacement set when revised. Important Memories are a durable MERGE PATCH: return only newly established memories or a materially richer wording of an existing event; use null or [] when there are no additions. Omitted stored memories persist locally. Stable scalar fields contain only grounded new/corrected facts.',`,
        'foreground existing-NPC array semantics');
    source = replaceRequired(source,
        `        'MEMORY SEMANTIC HYGIENE: Important Memories are distinct durable events/facts, never a running paraphrase log. Collapse multiple phrasings of the same event/participants/outcome into one concise richest entry, but keep genuinely separate events even when they involve the same people or topic.',`,
        `        'MEMORY SEMANTIC HYGIENE: Important Memories are distinct durable events/facts, never a running paraphrase log. Collapse multiple phrasings of the same event/participants/outcome into one concise richest entry, but keep genuinely separate events even when they involve the same people or topic.',\n        'DURABLE IMPORTANT MEMORY MERGE: for an EXISTING NPC, memories is additions/refinements only, never an authoritative replacement list. Existing omitted memories remain stored. memories: [] means no additions and must not clear the dossier.',`,
        'foreground durable-memory prompt marker');
    fs.writeFileSync(path, source);
}

console.log('Applied v0.4.44 durable Important Memories merge semantics');

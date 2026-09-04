import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing new-NPC ID authority marker: ' + label);
    return source.replace(from, to);
}

let scanner = read('v03/scanner.js');

// New identities never inherit an LLM-invented stable id. Only ids already present in
// persisted NPC State are authoritative. A new dossier gets its id locally from its
// canonical returned name.
scanner = replaceRequired(
    scanner,
    "function createFromPatch(patch, sourceMessageId) {\n    const name = String(patch?.name || '').trim();\n    if (!name || GENERIC_REFERENCES.has(normalizeName(name))) return null;\n    return normalizeNpc({\n        id: String(patch?.id || '').trim() || makeNpcId(name, `${sourceMessageId}-${Math.random()}`),\n        name,\n        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,\n        createdAt: Date.now(),\n    });\n}",
    "function createFromPatch(patch, sourceMessageId) {\n    const name = String(patch?.name || '').trim();\n    if (!name || GENERIC_REFERENCES.has(normalizeName(name))) return null;\n    return normalizeNpc({\n        // Never trust a model-supplied id for a dossier that does not already exist.\n        // Stable ids are allocated by NPC State itself from the canonical returned name.\n        id: makeNpcId(name, `${sourceMessageId}-${Math.random()}`),\n        name,\n        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,\n        createdAt: Date.now(),\n    });\n}",
    'local new NPC id allocation',
);

// An unknown model id does not make an otherwise-new returned patch ineligible for
// bootstrap. Conversely, a real existing id remains authoritative.
scanner = replaceRequired(
    scanner,
    "            const patchId = String(patch?.id || '').trim();\n            const name = String(patch?.name || '').trim();\n            return !patchId && name && !GENERIC_REFERENCES.has(normalizeName(name)) && !findNpcByReference(state, name);",
    "            const patchId = String(patch?.id || '').trim();\n            const name = String(patch?.name || '').trim();\n            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));\n            return !knownId && name && !GENERIC_REFERENCES.has(normalizeName(name)) && !findNpcByReference(state, name);",
    'unknown id bootstrap eligibility',
);

// If the model supplies an unknown id but a name that already identifies a dossier,
// reconcile by canonical name instead of dropping the patch or creating a duplicate.
scanner = replaceRequired(
    scanner,
    "        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;\n        if (!patchId && patch?.name) npc = findNpcByReference(state, String(patch.name));\n        if (patchId && !npc && patch?.name && findNpcByReference(state, String(patch.name))) {\n            // Stable IDs are authoritative once known. A model-supplied unknown ID must not\n            // retarget a same-name live dossier or create a duplicate identity.\n            continue;\n        }",
    "        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;\n        if (!npc && patch?.name) {\n            // Unknown model ids are never authoritative. Exact canonical name/alias may\n            // still reconcile the returned patch to an existing dossier safely.\n            npc = findNpcByReference(state, String(patch.name));\n        }",
    'unknown id existing-name reconciliation',
);

// Activity arrays may repeat the model's invented id. Resolve that through the returned
// patch's canonical name after local creation, rather than creating the same NPC twice.
scanner = replaceRequired(
    scanner,
    "            if (!npc) {\n                const patch = result.npcs.find(item => patchReferenceMatches(item, ref));\n                if (patch) {\n                    const created = createFromPatch(patch, sourceMessageId);\n                    if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {\n                        state.npcs.push(created);\n                        patchByNpcId.set(created.id, patch);\n                        npc = created;\n                    }\n                }\n            }",
    "            if (!npc) {\n                const patch = result.npcs.find(item => patchReferenceMatches(item, ref));\n                if (patch) {\n                    // The first bootstrap pass may already have created this patch under a\n                    // locally allocated id. Resolve by its canonical returned name first.\n                    npc = patch?.name ? findNpcByReference(state, String(patch.name)) : null;\n                    if (!npc) {\n                        const created = createFromPatch(patch, sourceMessageId);\n                        if (created && !deletedIds.has(created.id) && !(state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {\n                            state.npcs.push(created);\n                            npc = created;\n                        }\n                    }\n                    if (npc) patchByNpcId.set(npc.id, patch);\n                }\n            }",
    'unknown id activity reference reconciliation',
);

// Social edges may also use the invented id from the same malformed payload. Map those
// references through their returned patch name to the locally allocated stable dossier.
scanner = replaceRequired(
    scanner,
    "    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));\n    for (const raw of result.socialEdges) {\n        if (keyRelationshipReferencesPlayer(raw?.from, playerName) || keyRelationshipReferencesPlayer(raw?.to, playerName)) continue;\n        const from = findNpcByReference(state, raw?.from);\n        const to = findNpcByReference(state, raw?.to);",
    "    const resolveReturnedReference = reference => {\n        const direct = findNpcByReference(state, reference);\n        if (direct) return direct;\n        const patch = result.npcs.find(item => patchReferenceMatches(item, reference));\n        return patch?.name ? findNpcByReference(state, String(patch.name)) : null;\n    };\n    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));\n    for (const raw of result.socialEdges) {\n        if (keyRelationshipReferencesPlayer(raw?.from, playerName) || keyRelationshipReferencesPlayer(raw?.to, playerName)) continue;\n        const from = resolveReturnedReference(raw?.from);\n        const to = resolveReturnedReference(raw?.to);",
    'social edge invented-id reconciliation',
);

write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',",
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',\n        'For NEW NPC identity: if a proper/personal name is known in this response, npcs.name MUST be that canonical name and nothing else. Put occupation or function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a unique role label as name only while the NPC is genuinely unnamed. Always use id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    'foreground proper-name priority',
);
injection = replaceRequired(
    injection,
    '"name":"canonical name or unique role label"',
    '"name":"canonical proper name when known; unique role label only if genuinely unnamed"',
    'foreground output name contract',
);
write('v03/injection.js', injection);

scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "            name: 'canonical NPC name or unique NPC role label',",
    "            name: 'canonical proper name when known; unique role label only if genuinely unnamed',",
    'recovery output name contract',
);
scanner = replaceRequired(
    scanner,
    "        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',",
    "        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',\n        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    'recovery proper-name priority',
);
write('v03/scanner.js', scanner);

let changelog = read('CHANGELOG.md');
const line = '- Hardened new-NPC identity authority: model-invented ids are ignored for new dossiers, existing dossiers reconcile by canonical name when an unknown id is returned, proper names take priority over role labels, and same-payload activity/social references map to the locally allocated stable id.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 new-NPC ID authority hardening');

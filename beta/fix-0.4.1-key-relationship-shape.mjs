import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing key-relationship-shape marker: ' + label);
    return source.replace(from, to);
}

let schema = read('v03/schema.js');
const helper = `
function keyRelationshipEntry(value, itemMax = 500) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const pick = (keys, max = 240) => {
            for (const key of keys) {
                const clean = text(value?.[key], max);
                if (clean && clean !== '[object Object]') return clean;
            }
            return '';
        };
        const name = pick(['name', 'npc', 'person', 'target', 'otherNpc', 'other', 'with', 'character'], 200);
        const relation = pick(['relationship', 'relation', 'type', 'kind', 'role', 'tie'], 200);
        const summary = pick(['summary', 'description', 'details', 'note'], 300);
        if (name && relation) return text(name + ' - ' + relation + (summary && normalizeName(summary) !== normalizeName(relation) ? ': ' + summary : ''), itemMax);
        if (name && summary) return text(name + ' - ' + summary, itemMax);
        if (name) return text(name, itemMax);
        if (relation && summary) return text(relation + ': ' + summary, itemMax);
        if (summary) return text(summary, itemMax);
        return '';
    }
    const clean = text(value, itemMax);
    return clean === '[object Object]' ? '' : clean;
}

export function normalizeKeyRelationshipEntries(value, max = KEY_RELATIONSHIP_LIMIT, itemMax = 500) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const clean = keyRelationshipEntry(item, itemMax);
        const key = normalizeName(clean);
        if (!clean || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}
`;
schema = replaceRequired(
    schema,
    '\nfunction clampRelationship(value) {',
    helper + '\nfunction clampRelationship(value) {',
    'schema helper insertion',
);
schema = replaceRequired(
    schema,
    '        keyRelationships: list(input.keyRelationships, DOSSIER_LIMIT_MAXIMUMS.keyRelationships, 500),',
    '        keyRelationships: normalizeKeyRelationshipEntries(input.keyRelationships, DOSSIER_LIMIT_MAXIMUMS.keyRelationships, 500),',
    'schema keyRelationships normalization',
);
write('v03/schema.js', schema);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    '    normalizeDossierLimits,\n    normalizeName,',
    '    normalizeDossierLimits,\n    normalizeKeyRelationshipEntries,\n    normalizeName,',
    'scanner helper import',
);
scanner = replaceRequired(
    scanner,
    "    if (!locked.has('keyRelationships') && Array.isArray(patch?.keyRelationships)) {\n        const incoming = patch.keyRelationships.filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));\n        next.keyRelationships = appendUnique([], incoming, limits.keyRelationships);\n    }",
    "    if (!locked.has('keyRelationships') && Array.isArray(patch?.keyRelationships)) {\n        const incoming = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)\n            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));\n        next.keyRelationships = appendUnique([], incoming, limits.keyRelationships);\n    }",
    'scanner structured relationship normalization',
);
const canonicalRule = "KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful.";
scanner = replaceRequired(
    scanner,
    "        '- For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',",
    "        '- For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',\n        '- " + canonicalRule + "',",
    'scanner canonical relationship format',
);
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',",
    "        'For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',\n        '" + canonicalRule + "',",
    'foreground canonical relationship format',
);
write('v03/injection.js', injection);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Normalized structured **Key relationships** values at the schema and scanner boundaries so object-shaped model output can no longer persist or render as `[object Object]`; prompts now require canonical string entries such as `Mira - sister`.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Fixed NPC State 0.4.1 key relationship value normalization');

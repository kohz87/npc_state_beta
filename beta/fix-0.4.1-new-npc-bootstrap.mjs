import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing new-NPC bootstrap marker: ' + label);
    return source.replace(from, to);
}

const familyRule = "For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.";

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',",
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',\n        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing all grounded entries established by this response; use [] only when none are supported. Do not use null for those four fields on a new NPC. The current response alone can establish behavior or mannerisms when it explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',\n        '" + familyRule + "',",
    'foreground new NPC collection rule',
);
injection = replaceRequired(
    injection,
    '\"behaviorProfile\":null,\"speech\":\"\",\"mannerisms\":null,\"background\":\"\",\"keyRelationships\":null,\"memories\":null',
    '\"behaviorProfile\":[],\"speech\":\"\",\"mannerisms\":[],\"background\":\"\",\"keyRelationships\":[],\"memories\":[]',
    'foreground output shape arrays',
);
write('v03/injection.js', injection);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "            behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null,",
    "            behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [],",
    'recovery scanner output contract arrays',
);
scanner = replaceRequired(
    scanner,
    "        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',",
    "        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',\n        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',",
    'recovery scanner new NPC collection rule',
);
scanner = replaceRequired(
    scanner,
    "        '- Keep individual collection entries concise, grounded, and independently useful later.',",
    "        '- Keep individual collection entries concise, grounded, and independently useful later.',\n        '- " + familyRule + "',",
    'recovery scanner family relationship rule',
);
write('v03/scanner.js', scanner);

let changelog = read('CHANGELOG.md');
const changelogLines = [
    '- Fixed new-NPC bootstrap capture so **Behavioral profile** and **Mannerisms** (plus other evolving collections) are populated from grounded first-scene evidence instead of defaulting to `null`; `null` remains the unchanged sentinel for existing dossiers.\n',
    '- Hardened **Key relationships** capture: explicit family/kinship/spouse/guardian/dependent ties must be recorded in each involved NPC dossier, while `socialEdges` remains complementary graph data rather than a substitute; newly revealed ties now count as material collection updates for existing NPCs.\n',
];
for (const changelogLine of changelogLines) {
    if (!changelog.includes(changelogLine.trim())) {
        changelog = replaceRequired(
            changelog,
            '## v0.4.1\n\n',
            '## v0.4.1\n\n' + changelogLine,
            'changelog v0.4.1 heading',
        );
    }
}
write('CHANGELOG.md', changelog);

console.log('Fixed NPC State 0.4.1 new-NPC bootstrap and family key relationships');

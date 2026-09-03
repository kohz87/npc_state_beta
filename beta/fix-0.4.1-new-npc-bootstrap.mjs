import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing new-NPC bootstrap marker: ' + label);
    return source.replace(from, to);
}

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',",
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',\n        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing all grounded entries established by this response; use [] only when none are supported. Do not use null for those four fields on a new NPC. The current response alone can establish behavior or mannerisms when it explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',",
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
write('v03/scanner.js', scanner);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Fixed new-NPC bootstrap capture so **Behavioral profile** and **Mannerisms** (plus other evolving collections) are populated from grounded first-scene evidence instead of defaulting to `null`; `null` remains the unchanged sentinel for existing dossiers.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Fixed NPC State 0.4.1 new-NPC bootstrap collections');

import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing multi-NPC bootstrap marker: ' + label);
    return source.replace(from, to);
}

const multiRule = "A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.";

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    "        '" + multiRule + "',\n        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    'foreground multi-NPC rule',
);
write('v03/injection.js', injection);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',",
    "        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',\n        '- " + multiRule + "',",
    'recovery scanner multi-NPC rule',
);

scanner = replaceRequired(
    scanner,
    "    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds);\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);\n    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs])];",
    "    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds);\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds);\n    // New idless patches are themselves explicit bootstrap observations. Trust them as\n    // bootstrap candidates so an imperfect reference array cannot silently discard the\n    // second or third new NPC from an otherwise valid embedded scan. The prompt forbids\n    // background/mentioned-only characters from being emitted as new npcs entries.\n    const bootstrapRefs = uniqueStrings(result.npcs\n        .filter(patch => {\n            const patchId = String(patch?.id || '').trim();\n            const name = String(patch?.name || '').trim();\n            return !patchId && name && !GENERIC_REFERENCES.has(normalizeName(name)) && !findNpcByReference(state, name);\n        })\n        .map(patch => String(patch.name).trim()));\n    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];",
    'bootstrap reference inference',
);

scanner = replaceRequired(
    scanner,
    "    const exchangeIds = resolveRefs(exchangeRefs);\n    const presentIds = resolveRefs(presentRefs);\n    const worldIds = resolveRefs(worldRefs);\n    const targetIds = [...new Set([...exchangeIds, ...presentIds])];",
    "    const exchangeIds = resolveRefs(exchangeRefs);\n    const presentIds = resolveRefs(presentRefs);\n    const worldIds = resolveRefs(worldRefs);\n    const bootstrapIds = resolveRefs(bootstrapRefs);\n    const targetIds = [...new Set([...exchangeIds, ...presentIds, ...bootstrapIds])];",
    'bootstrap target IDs',
);
write('v03/scanner.js', scanner);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Fixed multi-NPC embedded bootstrap so one foreground payload can create every individually relevant new NPC in the same response; idless new `npcs` entries are now retained as bootstrap candidates even if the model imperfectly omits a secondary name from the activity arrays.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Fixed NPC State 0.4.1 multi-NPC embedded bootstrap');

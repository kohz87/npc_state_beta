import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing multi-NPC update marker: ' + label);
    return source.replace(from, to);
}

const updateRule = "A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.";

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    "        '" + updateRule + "',\n        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    'foreground existing multi-NPC rule',
);
write('v03/injection.js', injection);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',",
    "        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',\n        '- " + updateRule + "',",
    'recovery existing multi-NPC rule',
);
scanner = replaceRequired(
    scanner,
    "    const targetSet = new Set(targetIds);\n    const exchangeSet = new Set(exchangeIds);\n    const worldSet = new Set(worldIds);",
    "    const targetSet = new Set(targetIds);\n    const exchangeSet = new Set(exchangeIds);\n    const worldSet = new Set(worldIds);\n    // A returned dossier patch is itself meaningful structured output. When enabled by the\n    // caller, apply it even if the model imperfectly omitted this existing NPC from the\n    // activity arrays. Keep world-only NPCs on their restricted live-state path unless they\n    // are also an exchange/in-chat target. Relationship deltas remain exchange-gated.\n    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => !worldSet.has(id) || targetSet.has(id)));",
    'returned patch set',
);
scanner = replaceRequired(
    scanner,
    "        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches));",
    "        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));",
    'returned patch apply gate',
);
write('v03/scanner.js', scanner);

let engine = read('v03/engine.js');
const applyBlock = "            const applied = applyScanResult(working, parsed, {\n                sourceMessageId: messageId,\n                turn: working.turn,\n                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                dossierLimits: settings.dossierLimits,\n            });";
const applyBlockHardened = "            const applied = applyScanResult(working, parsed, {\n                sourceMessageId: messageId,\n                turn: working.turn,\n                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n            });";
const occurrences = engine.split(applyBlock).length - 1;
if (occurrences !== 2) throw new Error('Expected two normal/recovery applyScanResult blocks, found ' + occurrences);
engine = engine.split(applyBlock).join(applyBlockHardened);
write('v03/engine.js', engine);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Fixed multi-NPC existing-dossier updates so every valid returned NPC patch in the same foreground/recovery output can be applied even when the model imperfectly omits a secondary existing NPC from an activity array; relationship deltas remain exchange-gated and world-only NPCs retain restricted update semantics.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Fixed NPC State 0.4.1 multi-NPC existing dossier updates');

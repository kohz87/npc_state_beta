import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing multi-NPC-update marker: ' + label);
    return source.replace(from, to);
}

let injection = read('v03/injection.js');
const injectionRule = 'A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.';
injection = replaceRequired(
    injection,
    "        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    "        '" + injectionRule.replaceAll("'", "\\'") + "',\n        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
    'foreground multi-existing rule',
);
write('v03/injection.js', injection);

let scanner = read('v03/scanner.js');
const scannerRule = '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.';
scanner = replaceRequired(
    scanner,
    "        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',",
    "        '" + scannerRule.replaceAll("'", "\\'") + "',\n        '- The PLAYER/current USER persona is not an NPC for this scanner, even when named in narration. Never create the PLAYER as an npcs entry.',",
    'recovery multi-existing rule',
);
scanner = replaceRequired(
    scanner,
    "    const worldSet = new Set(worldIds);\n\n    for (let i = 0; i < state.npcs.length; i += 1) {",
    "    const worldSet = new Set(worldIds);\n    // A returned dossier patch is itself meaningful structured output. When enabled by the\n    // caller, apply it even if the model imperfectly omitted this existing NPC from the\n    // activity arrays. Keep world-only NPCs on their restricted live-state path unless they\n    // are also an exchange/in-chat target. Relationship deltas remain exchange-gated.\n    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => !worldSet.has(id) || targetSet.has(id)));\n\n    for (let i = 0; i < state.npcs.length; i += 1) {",
    'returned-patch set',
);
scanner = replaceRequired(
    scanner,
    "        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches));",
    "        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));",
    'existing patch apply gate',
);
write('v03/scanner.js', scanner);

let engine = read('v03/engine.js');
engine = engine.replaceAll(
    "                dossierLimits: settings.dossierLimits,\n            });",
    "                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n            });",
);
if (!engine.includes('applyReturnedNpcPatches: true')) throw new Error('Did not wire applyReturnedNpcPatches into generated engine');
write('v03/engine.js', engine);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Applied every returned existing-NPC dossier patch in foreground/recovery scans instead of silently discarding secondary NPC updates when an activity-reference array is incomplete; relationship deltas remain exchange-gated and world-only updates remain restricted.\n';
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

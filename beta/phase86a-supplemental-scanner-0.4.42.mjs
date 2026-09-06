import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.42 scanner marker: ' + label);
    return source.replace(from, to);
}

fs.writeFileSync('v03/scan-connection.js', fs.readFileSync('beta/source-v0.4.42-scan-connection.js.txt', 'utf8'));
fs.writeFileSync('v03/completeness-coordinator.js', fs.readFileSync('beta/source-v0.4.42-completeness-coordinator.js.txt', 'utf8'));

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(
    source,
    `export function buildStructuredDossierImportPrompt({ npc, blocks = [], memoryCriteria = '', dossierLimits = {} }) {`,
    `// PHASE86_ALTERNATE_SCAN_PROFILE_COMPLETENESS: a second pass supplements the already-committed exchange without replaying it.\nexport function buildCompletenessPrompt(args = {}) {\n    const base = buildScanPrompt(args);\n    return [\n        base,\n        'POST-RESPONSE DOSSIER COMPLETENESS PASS: the normal embedded NPC update for this exact USER+ASSISTANT exchange has already been committed. Review the CURRENT EXCHANGE against the UPDATED EXISTING DOSSIERS and return only grounded omissions or corrections that are still missing.',\n        'This pass supplements, never replaces, the foreground result. Unknown information remains unknown. Do not fill fields merely for completeness and do not invent biography.',\n        'RELATIONSHIP REPLAY LOCK: do not propose a new relationship gain/loss for this already-processed exchange. For every returned NPC use relationshipChange evaluated=true, impact=none, all delta axes zero, empty priority/axisEvidence, and a concise reason that this is a supplemental same-exchange pass.',\n        'Do not repeat a stored memory, milestone, profile-development observation, key relationship, social edge, or known appearance form merely because it is visible again. Return collection arrays only when they add grounded missing information or an explicitly supported correction. Backend supplemental merge semantics preserve omitted valid entries.',\n        'Presence/activity arrays may identify grounded NPC targets, but this pass does not advance narrative turn, seen counters, stale aging, or current observation. Life-state corrections remain allowed through the normal lifeStateUpdates validation contract.',\n        'A newly discovered NPC must still satisfy the normal admission and current-evidence rules. A same-message observation never counts as a second independent observation for gradual progression.',\n    ].join('\\n\\n');\n}\n\nexport function buildStructuredDossierImportPrompt({ npc, blocks = [], memoryCriteria = '', dossierLimits = {} }) {`,
    'completeness prompt',
);
source = replaceRequired(source,
    `        if (decision.apply) next.behaviorProfile = incoming;`,
    `        if (decision.apply) next.behaviorProfile = options.supplementalPass === true\n            ? appendUnique(next.behaviorProfile, incoming, limits.behaviorProfile)\n            : incoming;`,
    'supplemental behavior merge');
source = replaceRequired(source,
    `        if (decision.apply) next.mannerisms = incoming;`,
    `        if (decision.apply) next.mannerisms = options.supplementalPass === true\n            ? appendUnique(next.mannerisms, incoming, limits.mannerisms)\n            : incoming;`,
    'supplemental mannerism merge');
source = replaceRequired(source,
    `        next.memories = normalizeMemoryEntries(patch.memories, limits.memories, 700);`,
    `        next.memories = options.supplementalPass === true\n            ? normalizeMemoryEntries([...(next.memories || []), ...patch.memories], limits.memories, 700)\n            : normalizeMemoryEntries(patch.memories, limits.memories, 700);`,
    'supplemental memory merge');
source = replaceRequired(source,
    `            npc = applyDynamicPatch(npc, patch, { dossierLimits });`,
    `            npc = applyDynamicPatch(npc, patch, { dossierLimits, supplementalPass: options.supplementalPass === true });`,
    'supplemental dynamic patch option');
source = replaceRequired(source,
    `        if (exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;\n        if (presentIds.includes(npc.id)) {\n            npc.lastSeenMessageId = sourceMessageId;\n            npc.seenCount = Math.max(0, Number(npc.seenCount) || 0) + 1;\n        }`,
    `        if (options.supplementalPass !== true && exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;\n        if (options.supplementalPass !== true && presentIds.includes(npc.id)) {\n            npc.lastSeenMessageId = sourceMessageId;\n            npc.seenCount = Math.max(0, Number(npc.seenCount) || 0) + 1;\n        }`,
    'same-exchange activity counter guard');
fs.writeFileSync(path, source);
console.log('Applied v0.4.42 supplemental scanner semantics');

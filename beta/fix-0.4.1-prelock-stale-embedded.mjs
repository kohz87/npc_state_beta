import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing final-hardening marker: ' + label);
    return source.replace(from, to);
}

let engine = read('v03/engine.js');

// A foreground payload is parsed before it waits for the engine lock. Carry the exact
// cleaned assistant text into the lock so an edit/delete/replace that happens while
// queued cannot cause the old payload to be applied to the new message.
engine = replaceRequired(
    engine,
    '    async function applyEmbeddedScan(messageId, parsed) {',
    '    async function applyEmbeddedScan(messageId, parsed, options = {}) {',
    'embedded apply options',
);
engine = replaceRequired(
    engine,
    "            const message = chat[messageId];\n            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };\n            const startEpoch = epoch(chatKey);",
    "            const message = chat[messageId];\n            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };\n            if (typeof options.expectedMessageText === 'string') {\n                const expectedFingerprint = fingerprintMessage({ ...message, mes: options.expectedMessageText });\n                if (fingerprintMessage(message) !== expectedFingerprint) {\n                    return { ok: false, discarded: true, reason: 'stale-operation', messageId };\n                }\n            }\n            const startEpoch = epoch(chatKey);",
    'pre-lock expected message guard',
);

// Forced recovery/manual scans may reconcile the same message again, but an already
// committed exchange must not charge its relationship delta twice.
engine = replaceRequired(
    engine,
    "            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };\n            if (!force && state.lastScannedMessageId === messageId) return { ok: true, skipped: true, reason: 'already-scanned', messageId };",
    "            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };\n            const alreadyScannedMessage = state.lastScannedMessageId === messageId;\n            if (!force && alreadyScannedMessage) return { ok: true, skipped: true, reason: 'already-scanned', messageId };",
    'forced rescan idempotence flag',
);
engine = replaceRequired(
    engine,
    "                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n            });",
    "                dossierLimits: settings.dossierLimits,\n                applyReturnedNpcPatches: true,\n                applyRelationship: !alreadyScannedMessage,\n            });",
    'forced rescan relationship gate',
);
write('v03/engine.js', engine);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "        if (!targetSet.has(from.id) && !targetSet.has(to.id) && !allowHistoricalProfilePatches) continue;",
    "        const returnedPair = options.applyReturnedNpcPatches === true && returnedPatchSet.has(from.id) && returnedPatchSet.has(to.id);\n        if (!targetSet.has(from.id) && !targetSet.has(to.id) && !allowHistoricalProfilePatches && !returnedPair) continue;",
    'secondary returned social-edge gate',
);
write('v03/scanner.js', scanner);

let index = read('v03/index.js');
index = replaceRequired(
    index,
    "function activeEmbeddedMeta(message) {\n    if (!message) return null;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipeMeta = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId]?.extra?.npc_state_beta_v1 : null;\n    return swipeMeta || message.extra?.npc_state_beta_v1 || null;\n}",
    "function activeEmbeddedMeta(message) {\n    if (!message) return null;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId] : null;\n    if (swipe) return swipe.extra?.npc_state_beta_v1 || null;\n    return message.extra?.npc_state_beta_v1 || null;\n}",
    'active swipe metadata isolation',
);
index = replaceRequired(
    index,
    "    const message = ctx?.chat?.[id];\n    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };\n    const consumed = consumeNpcStateControl(message.mes);",
    "    const message = ctx?.chat?.[id];\n    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };\n    const settings = getSettings();\n    if (settings.enabled === false || settings.autoScan === false) {\n        stripNpcTransportOnly(id);\n        return { ok: false, reason: 'auto-disabled' };\n    }\n    const consumed = consumeNpcStateControl(message.mes);",
    'disabled foreground quiet path',
);
index = replaceRequired(
    index,
    '        const result = await engine.applyEmbeddedScan(id, consumed.parsed);',
    '        const result = await engine.applyEmbeddedScan(id, consumed.parsed, { expectedMessageText: consumed.cleanedText });',
    'foreground expected message wiring',
);
write('v03/index.js', index);

let changelog = read('CHANGELOG.md');
const lines = [
    '- Closed the pre-lock embedded stale-payload race: foreground apply now carries the exact cleaned assistant text that produced the payload and rejects it if that message was edited, replaced, deleted, or shifted before the engine lock begins.',
    '- Made forced rescans of an already-scanned assistant message relationship-idempotent: dossier/profile reconciliation may run again, but the same current-exchange relationship delta is not applied twice.',
    '- Isolated stored foreground payload replay per active swipe: when a concrete swipe record exists, missing swipe metadata no longer falls back to potentially stale message-level metadata from another variant.',
    '- Silenced foreground missing-capture warnings when NPC State or embedded auto-scan is intentionally disabled; any stray NPC transport is cleanup-only and never applied.',
    '- Preserved social edges between secondary existing NPCs when both have valid returned dossier patches, even if an imperfect activity array omitted them.',
];
for (const line of lines.reverse()) {
    if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
}
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 final foreground/replay hardening');

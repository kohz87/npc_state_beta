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

// Forced recovery/manual scans are allowed to reconcile the same message again, but an
// already-committed current exchange must never charge its relationship delta twice.
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

let index = read('v03/index.js');
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
];
for (const line of lines.reverse()) {
    if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
}
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 final stale/replay hardening');

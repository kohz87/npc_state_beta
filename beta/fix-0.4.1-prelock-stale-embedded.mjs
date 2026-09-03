import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing prelock-stale-embedded marker: ' + label);
    return source.replace(from, to);
}

let engine = read('v03/engine.js');
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
const line = '- Closed the pre-lock embedded stale-payload race: foreground apply now carries the exact cleaned assistant text that produced the payload and rejects it if that message was edited, replaced, deleted, or shifted before the engine lock begins.\n';
if (!changelog.includes(line.trim())) {
    changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line, 'changelog heading');
    write('CHANGELOG.md', changelog);
}

console.log('Closed NPC State 0.4.1 pre-lock embedded stale-payload race');

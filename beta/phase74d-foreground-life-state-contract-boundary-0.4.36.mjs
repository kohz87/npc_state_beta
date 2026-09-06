import fs from 'node:fs';

function update(path, transform) {
    const source = fs.readFileSync(path, 'utf8');
    const next = transform(source);
    if (next === source) throw new Error('No v0.4.36 foreground lifecycle-boundary transform applied to ' + path);
    fs.writeFileSync(path, next);
}

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.36 foreground lifecycle-boundary anchor: ' + label);
    return source.replace(from, to);
}

update('v03/foreground.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        'export function consumeNpcStateControl(messageText) {',
        'export function consumeNpcStateControl(messageText, { requireLifeStateUpdates = false } = {}) {',
        'foreground parser options',
    );
    next = replaceRequired(
        next,
        '        try { parsed = parseScanJson(body, { requireLifeStateUpdates: true }); }',
        '        try { parsed = parseScanJson(body, { requireLifeStateUpdates }); }',
        'foreground parser option forwarding',
    );
    if (!next.includes('PHASE74D_FOREGROUND_LIFE_STATE_BOUNDARY')) {
        next = next.replace(
            'export function consumeNpcStateControl(messageText, { requireLifeStateUpdates = false } = {}) {',
            '// PHASE74D_FOREGROUND_LIFE_STATE_BOUNDARY: new captures are strict; stored/legacy transport remains replayable.\nexport function consumeNpcStateControl(messageText, { requireLifeStateUpdates = false } = {}) {',
        );
    }
    return next;
});

update('v03/index.js', source => {
    const anchor = 'async function processEmbeddedScan(messageId) {';
    const start = source.indexOf(anchor);
    if (start < 0) throw new Error('Missing processEmbeddedScan function');
    const end = source.indexOf('\nasync function reapplyStoredEmbeddedPayload', start);
    if (end < 0) throw new Error('Missing reapplyStoredEmbeddedPayload boundary');
    const section = source.slice(start, end);
    const from = '    const consumed = consumeNpcStateControl(message.mes);';
    const to = "    const consumed = consumeNpcStateControl(message.mes, { requireLifeStateUpdates: true });";
    if (!section.includes(to)) {
        if (!section.includes(from)) throw new Error('Missing live foreground consume call');
        const updated = section.replace(from, to);
        source = source.slice(0, start) + updated + source.slice(end);
    }
    if (!source.includes('PHASE74D_LIVE_FOREGROUND_LIFE_STATE_CONTRACT')) {
        source = source.replace(
            'async function processEmbeddedScan(messageId) {',
            '// PHASE74D_LIVE_FOREGROUND_LIFE_STATE_CONTRACT: only newly generated embedded payloads require the v0.4.36 lifecycle channel.\nasync function processEmbeddedScan(messageId) {',
        );
    }
    return source;
});

console.log('Bound NPC State v0.4.36 lifecycle strictness to new foreground captures only');

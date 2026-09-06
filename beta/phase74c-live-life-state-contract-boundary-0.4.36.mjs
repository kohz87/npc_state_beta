import fs from 'node:fs';

function update(path, transform) {
    const source = fs.readFileSync(path, 'utf8');
    const next = transform(source);
    if (next === source) throw new Error('No v0.4.36 live lifecycle-contract transform applied to ' + path);
    fs.writeFileSync(path, next);
}

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.36 live lifecycle-contract anchor: ' + label);
    return source.replace(from, to);
}

update('v03/scanner.js', source => {
    let next = source;
    next = replaceRequired(
        next,
        `function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false } = {}) {`,
        `function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false, requireLifeStateUpdates = false } = {}) {`,
        'normalizeScanPayload options',
    );
    next = replaceRequired(
        next,
        `        // PHASE74B_REQUIRED_LIFE_STATE_UPDATES: parsed model responses must prove lifecycle evaluation explicitly.\n        if ((!allowOmittedSupplemental || has('lifeStateUpdates')) && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');`,
        `        // PHASE74C_LIVE_LIFE_STATE_CONTRACT: live model consumers opt into mandatory lifecycle evaluation while the public parser stays fixture-compatible.\n        if ((requireLifeStateUpdates || has('lifeStateUpdates')) && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');`,
        'required lifecycle validation boundary',
    );
    next = replaceRequired(
        next,
        `export function parseScanJson(raw) {`,
        `export function parseScanJson(raw, { requireLifeStateUpdates = false } = {}) {`,
        'parseScanJson options',
    );
    next = replaceRequired(
        next,
        `    return normalizeScanPayload(parsed, { requireContract: true });`,
        `    return normalizeScanPayload(parsed, { requireContract: true, requireLifeStateUpdates });`,
        'parseScanJson lifecycle option forwarding',
    );
    return next;
});

update('v03/engine.js', source => {
    const from = 'parseScanJson(raw)';
    const to = 'parseScanJson(raw, { requireLifeStateUpdates: true })';
    if (source.includes(to) && !source.includes(from)) return source;
    const count = source.split(from).length - 1;
    if (count !== 2) throw new Error('Expected exactly two live engine parseScanJson(raw) calls, found ' + count);
    return source.replaceAll(from, to);
});

update('v03/foreground.js', source => replaceRequired(
    source,
    `        try { parsed = parseScanJson(body); }`,
    `        try { parsed = parseScanJson(body, { requireLifeStateUpdates: true }); }`,
    'foreground embedded lifecycle contract',
));

console.log('Bound NPC State v0.4.36 required lifecycle channel to live model consumers');

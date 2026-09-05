import fs from 'node:fs';

function replaceCompat(source, from, to, label) {
    if (source.includes(from)) return source.replace(from, to);
    if (source.includes(to)) return source;
    throw new Error('Missing 0.4.11 legacy-verifier marker: ' + label);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        `return calls.length === 1 ? 'malformed' : '{}';`,
        `return calls.length === 1 ? 'malformed' : JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [] });`,
        'scanner retry valid payload fixture',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase15-force-rebase-0.4.10.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        `assert.equal(manifest.version, '0.4.10', 'Manifest was not bumped to 0.4.10');`,
        `assert(/^0\\.4\\.(?:10|1[1-9]|[2-9]\\d)$/.test(manifest.version), 'Manifest is older than the 0.4.10 force-rebase baseline');`,
        'force-rebase descendant version assertion',
    );
    fs.writeFileSync(path, source);
}

console.log('Made legacy 0.4.7/0.4.10 verifiers compatible with strict 0.4.11 descendants');

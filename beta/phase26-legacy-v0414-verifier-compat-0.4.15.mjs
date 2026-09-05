import fs from 'node:fs';

function replaceCompat(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.15 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase22-settings-ui-cleanup-0.4.14.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        "assert.equal(manifest.version, '0.4.14');",
        "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 14, 'Manifest regressed below v0.4.14');",
        'v0.4.14 settings manifest assertion',
    );
    source = replaceCompat(
        source,
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">0.4.14</span>'), 'Settings header version was not bumped');",
        "assert(ui.includes(`NPC State <span class=\"npc-state-version\">${manifest.version}</span>`), 'Settings header version does not match manifest');",
        'v0.4.14 settings UI version assertion',
    );
    source = replaceCompat(
        source,
        "assert(readme.startsWith('# NPC State Beta 0.4.14'), 'README release title not bumped');",
        "assert(readme.startsWith(`# NPC State Beta ${manifest.version}`), 'README release title does not match manifest');",
        'v0.4.14 README title assertion',
    );
    source = replaceCompat(
        source,
        "console.log('NPC State 0.4.14 settings-only UI cleanup verified');",
        "console.log('NPC State 0.4.14+ settings-only UI cleanup verified');",
        'v0.4.14 settings verifier label',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase24-release-source-parity-0.4.14.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        "assert.equal(manifest.version, '0.4.14', 'Release source is not v0.4.14');",
        "const manifestMatch = String(manifest.version || '').match(/^0\\.4\\.(\\d+)$/);\nassert(manifestMatch && Number(manifestMatch[1]) >= 14, 'Manifest regressed below v0.4.14');",
        'v0.4.14 parity manifest assertion',
    );
    source = replaceCompat(
        source,
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">0.4.14</span>'), 'Committed runtime UI version is not v0.4.14');",
        "assert(ui.includes(`NPC State <span class=\"npc-state-version\">${manifest.version}</span>`), 'Committed runtime UI version does not match manifest');",
        'v0.4.14 parity UI version assertion',
    );
    source = replaceCompat(
        source,
        "console.log('NPC State 0.4.14 release source parity verified');",
        "console.log('NPC State 0.4.14+ release source parity verified');",
        'v0.4.14 parity verifier label',
    );
    fs.writeFileSync(path, source);
}

console.log('Made v0.4.14 verifiers forward-compatible with v0.4.15');

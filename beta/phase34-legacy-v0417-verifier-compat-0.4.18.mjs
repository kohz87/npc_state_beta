import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.18 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase30-relationship-progression-0.4.17.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert.equal(manifest.version, '0.4.17');",
        "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 17, 'Manifest regressed below v0.4.17');",
        'phase30 manifest descendant check',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase32-release-source-parity-0.4.17.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert.equal(manifest.version, '0.4.17', 'Release source is not v0.4.17');",
        "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 17, 'Release source regressed below v0.4.17');",
        'phase32 manifest descendant check',
    );
    source = replaceRequired(
        source,
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">0.4.17</span>'), 'Committed runtime UI version is not v0.4.17');",
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">' + manifest.version + '</span>'), 'Committed runtime UI version does not match manifest');",
        'phase32 runtime version check',
    );
    source = replaceRequired(
        source,
        "assert(workflow.includes('Build NPC State 0.4.17 Beta'), 'Workflow is not versioned for v0.4.17');",
        "assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');",
        'phase32 workflow version check',
    );
    source = replaceRequired(
        source,
        "assert(workflow.includes('Persistent NPC State 0.4.17 database'), 'Architecture gate does not guard the v0.4.17 runtime surface');",
        "assert(workflow.includes('Persistent NPC State 0.4.'), 'Architecture gate does not guard the current runtime surface');",
        'phase32 architecture version check',
    );
    fs.writeFileSync(path, source);
}

console.log('Made v0.4.17 relationship verifiers forward-compatible with v0.4.18+');

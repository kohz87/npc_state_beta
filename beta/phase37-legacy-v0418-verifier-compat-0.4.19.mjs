import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.19 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase33-relationship-evaluation-observability-0.4.18.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert.equal(manifest.version, '0.4.18');",
        "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 18, 'Manifest regressed below v0.4.18');",
        'phase33 manifest descendant check',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase35-release-source-parity-0.4.18.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert.equal(manifest.version, '0.4.18', 'Release source is not v0.4.18');",
        "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 18, 'Release source regressed below v0.4.18');",
        'phase35 manifest descendant check',
    );
    source = replaceRequired(
        source,
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">0.4.18</span>'), 'Committed runtime UI version is not v0.4.18');",
        "assert(ui.includes('NPC State <span class=\"npc-state-version\">' + manifest.version + '</span>'), 'Committed runtime UI version does not match manifest');",
        'phase35 runtime version check',
    );
    source = replaceRequired(
        source,
        "assert(workflow.includes('Build NPC State 0.4.18 Beta'), 'Workflow is not versioned for v0.4.18');",
        "assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');",
        'phase35 workflow version check',
    );
    source = replaceRequired(
        source,
        "assert(workflow.includes('Persistent NPC State 0.4.18 database'), 'Architecture gate does not guard the v0.4.18 runtime surface');",
        "assert(workflow.includes('Persistent NPC State 0.4.'), 'Architecture gate does not guard the current runtime surface');",
        'phase35 architecture version check',
    );
    fs.writeFileSync(path, source);
}

console.log('Made v0.4.18 relationship verifiers forward-compatible with v0.4.19+');

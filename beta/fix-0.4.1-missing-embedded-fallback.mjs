import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing embedded-fallback marker: ' + label);
    return source.replace(from, to);
}

let index = read('v03/index.js');
index = replaceRequired(
    index,
    "    if (!consumed.found) {\n        console.warn('[NPC State Beta] Foreground response omitted <npc_state_v1>.');\n        const fallback = await maybeForegroundFallback(id, 'missing-control');\n        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan was missing. State was left unchanged; use Scan current cast for recovery.');\n        return fallback;\n    }",
    "    if (!consumed.found) {\n        console.warn('[NPC State Beta] Foreground response omitted <npc_state_v1>; running one full recovery scan.');\n        return runSeparateRecoveryScan(id, 'foreground-missing-control');\n    }",
    'missing embedded capture automatic full scan',
);
write('v03/index.js', index);

let ui = read('v03/ui.js');
ui = replaceRequired(
    ui,
    '<label class="npc-state-setting-row"><span><b>Embedded current-cast scan</b><small>Uses the same foreground RP generation. Missing or malformed capture leaves state unchanged unless automatic recovery is enabled.</small></span><input id="npc_state_v3_auto" type="checkbox"></label>',
    '<label class="npc-state-setting-row"><span><b>Embedded current-cast scan</b><small>Uses the same foreground RP generation. If the embedded block is missing, NPC State automatically runs one full separate current-cast scan.</small></span><input id="npc_state_v3_auto" type="checkbox"></label>',
    'embedded scan help text',
);
ui = replaceRequired(
    ui,
    '<label class="npc-state-setting-row"><span><b>Automatic recovery scanner</b><small>If embedded capture is missing or malformed, run one separate scanner call. Off by default; manual Scan current cast is always available.</small></span><input id="npc_state_v04_fallback" type="checkbox"></label>',
    '<label class="npc-state-setting-row"><span><b>Malformed capture recovery</b><small>Missing embedded capture always triggers one full scan. Enable this to also run a separate recovery scan when an embedded block is present but malformed. Off by default.</small></span><input id="npc_state_v04_fallback" type="checkbox"></label>',
    'recovery scanner help text',
);
write('v03/ui.js', ui);

let changelog = read('CHANGELOG.md');
const line = '- Missing embedded foreground capture now automatically falls back to one full separate current-cast scan whenever embedded scanning is enabled; the recovery toggle now applies only to malformed embedded blocks.\n';
if (!changelog.includes(line.trim())) {
    changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line, 'changelog heading');
    write('CHANGELOG.md', changelog);
}

console.log('Enabled automatic full-scan recovery for missing embedded capture');

import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.14 settings marker: ' + label);
    return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.14 settings range: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

let layout = read('v03/settings-layout.js');
layout = replaceRequired(
    layout,
    '/* NPC State v0.4.14 categorized responsive settings layout coordinator.',
    '/* NPC State v0.4.14 settings hierarchy coordinator.',
    'layout comment',
);
layout = replaceRequired(
    layout,
`const PANEL_ID = 'npc_state_settings';
const TRACKING_GROUP_ID = 'npc_state_v04_tracking';
const INJECTION_GROUP_ID = 'npc_state_v04_continuity_injection';
const BIRTHDAY_GROUP_ID = 'npc_state_v04_birthday_continuity';
const RECOVERY_GROUP_ID = 'npc_state_v04_recovery_branch';
const SCANNER_GROUP_ID = 'npc_state_v3_scanner_rules';
const MAINTENANCE_GROUP_ID = 'npc_state_v3_maintenance';
const CAST_SECTION_ID = 'npc_state_v3_cast_settings';`,
`const PANEL_ID = 'npc_state_settings';
const TRACKING_GROUP_ID = 'npc_state_v04_tracking';
const INJECTION_GROUP_ID = 'npc_state_v04_continuity_injection';
const BIRTHDAY_GROUP_ID = 'npc_state_v04_birthday_continuity';
const RECOVERY_GROUP_ID = 'npc_state_v04_recovery_branch';
const SCANNER_GROUP_ID = 'npc_state_v3_scanner_rules';
const ADVANCED_GROUP_ID = 'npc_state_v0414_advanced';
const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';
const MAINTENANCE_GROUP_ID = 'npc_state_v3_maintenance';
const CAST_SECTION_ID = 'npc_state_v3_cast_settings';`,
    'category constants',
);
layout = replaceRequired(
    layout,
    "subtitle = makeElement('small', 'npc-state-v3-header-subtitle', 'Persistent NPC memory & relationship tracker');",
    "subtitle = makeElement('small', 'npc-state-v3-header-subtitle', 'Persistent character continuity');",
    'header subtitle',
);
layout = replaceBetween(
    layout,
    'function ensureTracking(drawer) {',
    'function ensureContinuityInjection(drawer) {',
`function ensureScanning(drawer) {
    const group = ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Scanning & Capture', 'npc-state-v3-tracking-group npc-state-v3-scanning-group', true, 'npc-state-v3-control-group-body');
    return moveControlRows(drawer, group, [
        '#npc_state_v3_auto',
        '#npc_state_v3_scan_depth',
        '#npc_state_v04_new_npc_history',
        '#npc_state_v04_admission',
        '#npc_state_v047_response_tokens',
        '#npc_state_v04_fallback',
    ]);
}

`,
    'scanning category',
);
layout = replaceRequired(
    layout,
    "const group = ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday Continuity', 'npc-state-v3-birthday-group', false, 'npc-state-v3-control-group-body');",
    "const group = ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday & Aging', 'npc-state-v3-birthday-group', false, 'npc-state-v3-control-group-body');",
    'birthday category title',
);
layout = replaceBetween(
    layout,
    'function ensureRecoveryBranch(drawer) {',
    'function ensureDossierEvolution(drawer) {',
`function ensureAdvancedRecovery(group) {
    const host = group?.querySelector?.('.npc-state-v3-settings-group-body');
    if (!host) return null;
    let section = globalThis.document?.getElementById?.(ADVANCED_RECOVERY_ID) || null;
    if (!section) {
        section = makeElement('details', 'npc-state-v3-settings-subgroup npc-state-v3-advanced-recovery');
        if (!section) return null;
        section.id = ADVANCED_RECOVERY_ID;
        const summary = makeElement('summary');
        const label = makeElement('b', '', 'Advanced Recovery');
        const body = makeElement('div', 'npc-state-v3-advanced-recovery-body');
        const intro = makeElement('div', 'npc-state-v3-advanced-recovery-intro', 'Force Timeline Rebase bypasses normal branch detection. Use it only when ordinary recovery cannot identify the timeline change correctly.');
        if (summary && label) summary.appendChild(label);
        if (summary) section.appendChild(summary);
        if (body && intro) body.appendChild(intro);
        if (body) section.appendChild(body);
    }
    if (section.parentElement !== host) host.appendChild(section);
    return section;
}

function ensureRecoveryBranch(drawer) {
    const group = ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety', 'npc-state-v3-recovery-group', false, 'npc-state-v3-control-group-body');
    moveControlRows(drawer, group, [
        '#npc_state_v3_branch_rescan',
    ]);
    const body = group?.querySelector?.('.npc-state-v3-settings-group-body');
    if (body && !body.querySelector('.npc-state-v3-recovery-note')) {
        const note = makeElement('div', 'npc-state-v3-recovery-note', 'NPC State shows Rebase to Current Chat here automatically when branch safety requires it.');
        if (note) body.prepend(note);
    }
    ensureAdvancedRecovery(group);
    return group;
}

`,
    'recovery category',
);
layout = replaceBetween(
    layout,
    'function ensureScannerRules(drawer) {',
    'function ensureMaintenance(drawer) {',
`function ensureRelationships(drawer) {
    const relationship = drawer?.querySelector?.('#npc_state_v3_relationship_criteria')?.closest?.('details') || null;
    if (!relationship) return globalThis.document?.getElementById?.(SCANNER_GROUP_ID) || null;
    const group = ensureParentDetails(drawer, SCANNER_GROUP_ID, 'Relationships', 'npc-state-v3-scanner-rules npc-state-v3-relationships-group');
    const body = group?.querySelector?.('.npc-state-v3-settings-group-body');
    if (!body) return group;
    const label = relationship.querySelector?.('summary b');
    if (label) label.textContent = 'Relationship Rubric';
    if (relationship.parentElement !== body) body.appendChild(relationship);
    return group;
}

function ensureAdvanced(drawer) {
    const memory = drawer?.querySelector?.('#npc_state_v3_memory_criteria')?.closest?.('details') || null;
    const maintenance = ensureMaintenance(drawer);
    if (!memory && !maintenance) return globalThis.document?.getElementById?.(ADVANCED_GROUP_ID) || null;
    const group = ensureParentDetails(drawer, ADVANCED_GROUP_ID, 'Advanced', 'npc-state-v3-advanced-group');
    const body = group?.querySelector?.('.npc-state-v3-settings-group-body');
    if (!body) return group;
    if (memory) {
        const label = memory.querySelector?.('summary b');
        if (label) label.textContent = 'Memory Rubric';
        if (memory.parentElement !== body) body.appendChild(memory);
    }
    if (maintenance && maintenance.parentElement !== body) body.appendChild(maintenance);
    return group;
}

`,
    'relationship and advanced categories',
);
layout = replaceRequired(
    layout,
`    const actions = decorateActions(drawer);
    const tracking = ensureTracking(drawer);
    const injection = ensureContinuityInjection(drawer);
    const birthday = ensureBirthdayContinuity(drawer);
    const evolution = ensureDossierEvolution(drawer);
    const recovery = ensureRecoveryBranch(drawer);
    const scanner = ensureScannerRules(drawer);
    const maintenance = ensureMaintenance(drawer);
    const portrait = ensurePortrait(drawer);
    const cast = ensureCast(drawer);

    const legacyGrid = directChild(drawer, '.npc-state-settings-grid');
    if (legacyGrid && legacyGrid.children.length === 0) legacyGrid.remove();

    let anchor = intro;
    for (const node of [tracking, injection, birthday, evolution, recovery, scanner, maintenance, portrait, actions, cast]) {
        anchor = placeAfter(anchor, node, drawer) || anchor;
    }`,
`    const actions = decorateActions(drawer);
    const scanning = ensureScanning(drawer);
    const injection = ensureContinuityInjection(drawer);
    const birthday = ensureBirthdayContinuity(drawer);
    const evolution = ensureDossierEvolution(drawer);
    const relationships = ensureRelationships(drawer);
    const recovery = ensureRecoveryBranch(drawer);
    const advanced = ensureAdvanced(drawer);
    const portrait = ensurePortrait(drawer);
    const cast = ensureCast(drawer);

    const legacyGrid = directChild(drawer, '.npc-state-settings-grid');
    if (legacyGrid && legacyGrid.children.length === 0) legacyGrid.remove();

    let anchor = intro;
    for (const node of [scanning, injection, birthday, evolution, relationships, recovery, advanced, portrait, actions, cast]) {
        anchor = placeAfter(anchor, node, drawer) || anchor;
    }`,
    'settings order',
);
write('v03/settings-layout.js', layout);

let ui = read('v03/ui.js');
ui = replaceRequired(ui, '<b>Embedded current-cast scan</b>', '<b>Auto Scan</b>', 'auto scan label');
ui = replaceRequired(ui, '<b>Maximum scanner response tokens</b>', '<b>Scanner Response Limit</b>', 'scanner response label');
ui = replaceRequired(
    ui,
    '<small>Output ceiling for separate scans, dossier Refresh, structured imports, and retries. Increase for large casts. Does not change RP output or history depth.</small>',
    '<small>Output ceiling for separate scans, dossier Refresh, structured imports, and retries. Range: 512-15,000 tokens. Increase for large casts. Does not change RP output or history depth.</small>',
    'scanner response help',
);
write('v03/ui.js', ui);

let recoveryUi = read('v03/branch-recovery-ui.js');
recoveryUi = replaceRequired(
    recoveryUi,
`const PANEL_ID = 'npc_state_settings';
const BANNER_ID = 'npc_state_v3_branch_recovery';
const FORCE_ID = 'npc_state_v3_force_rebase';`,
`const PANEL_ID = 'npc_state_settings';
const BANNER_ID = 'npc_state_v3_branch_recovery';
const FORCE_ID = 'npc_state_v3_force_rebase';
const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';`,
    'advanced recovery id',
);
recoveryUi = replaceRequired(
    recoveryUi,
`function hostForBanner() {
    const panel = globalThis.document?.getElementById?.(PANEL_ID);
    const recovery = recoveryGroup();
    return recovery?.querySelector?.('.npc-state-v3-settings-group-body')
        || recovery
        || panel?.querySelector?.('.npc-state-drawer')
        || null;
}
`,
`function hostForBanner() {
    const panel = globalThis.document?.getElementById?.(PANEL_ID);
    const recovery = recoveryGroup();
    return recovery?.querySelector?.('.npc-state-v3-settings-group-body')
        || recovery
        || panel?.querySelector?.('.npc-state-drawer')
        || null;
}

function hostForForceControl() {
    const advanced = globalThis.document?.getElementById?.(ADVANCED_RECOVERY_ID) || null;
    return advanced?.querySelector?.('.npc-state-v3-advanced-recovery-body') || hostForBanner();
}
`,
    'force recovery host',
);
recoveryUi = replaceRequired(
    recoveryUi,
`        control.innerHTML = \`<span><b>Force timeline rebase</b><small>Rebuild the branch baseline around the currently visible chat even when NPC State considers it safe. Durable dossier canon is preserved.</small></span><button type="button" class="menu_button npc-state-v3-force-rebase-current" \${running ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i> \${running ? 'Rebasing...' : 'Force rebase to current chat'}</button>\`;`,
`        control.innerHTML = \`<span><b>Force Timeline Rebase</b><small>Bypasses normal branch detection and rebuilds against the currently visible chat. Durable dossier canon and manual edits are preserved.</small></span><button type="button" class="menu_button npc-state-v3-force-rebase-current" \${running ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i> \${running ? 'Rebasing...' : 'Force Timeline Rebase...'} </button>\`;`,
    'force recovery copy',
);
recoveryUi = replaceRequired(
    recoveryUi,
`    const host = hostForBanner();
    const current = state();
    const existing = globalThis.document?.getElementById?.(BANNER_ID);
    const forceControl = globalThis.document?.getElementById?.(FORCE_ID) || null;`,
`    const host = hostForBanner();
    const forceHost = hostForForceControl();
    const current = state();
    const existing = globalThis.document?.getElementById?.(BANNER_ID);
    const forceControl = globalThis.document?.getElementById?.(FORCE_ID) || null;`,
    'force host render setup',
);
recoveryUi = replaceRequired(
    recoveryUi,
`    if (!branchRecoveryRequired(current)) {
        existing?.remove?.();
        ensureForceControl(host);
        return true;
    }`,
`    if (!branchRecoveryRequired(current)) {
        existing?.remove?.();
        ensureForceControl(forceHost || host);
        return true;
    }`,
    'safe force placement',
);
write('v03/branch-recovery-ui.js', recoveryUi);

let css = read('v03/settings-responsive.css');
css = replaceRequired(
    css,
    '/* NPC State v0.4.4 responsive categorized settings hierarchy.',
    '/* NPC State v0.4.14 responsive settings hierarchy.',
    'responsive css comment',
);
if (!css.includes('/* v0.4.14 settings hierarchy cleanup */')) {
    css += `\n/* v0.4.14 settings hierarchy cleanup */\n.npc-state-v3-settings .npc-state-v3-recovery-note{padding:.5em .58em;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:rgba(255,255,255,.018);font-size:.86em;line-height:1.35;opacity:.72}\n.npc-state-v3-settings .npc-state-v3-settings-subgroup{margin:.18em 0 0;border-top:1px solid rgba(255,255,255,.08)}\n.npc-state-v3-settings .npc-state-v3-settings-subgroup>summary{display:flex;align-items:center;gap:.42em;padding:.55em .18em;cursor:pointer;list-style:none;user-select:none}\n.npc-state-v3-settings .npc-state-v3-settings-subgroup>summary::-webkit-details-marker{display:none}\n.npc-state-v3-settings .npc-state-v3-settings-subgroup>summary::before{content:'▸';opacity:.62;font-size:.82em}\n.npc-state-v3-settings .npc-state-v3-settings-subgroup[open]>summary::before{content:'▾'}\n.npc-state-v3-settings .npc-state-v3-advanced-recovery-body{display:grid;gap:.42em;padding:0 0 .18em}\n.npc-state-v3-settings .npc-state-v3-advanced-recovery-intro{padding:.48em .55em;border-radius:7px;background:color-mix(in srgb,var(--SmartThemeQuoteColor,#d59a32) 8%,transparent);line-height:1.35;font-size:.86em;opacity:.82}\n.npc-state-v3-settings .npc-state-v3-force-rebase-row{border-color:color-mix(in srgb,var(--SmartThemeQuoteColor,#d59a32) 36%,transparent)!important;background:color-mix(in srgb,var(--SmartThemeQuoteColor,#d59a32) 6%,transparent)!important}\n.npc-state-v3-settings .npc-state-v3-advanced-group>.npc-state-v3-settings-group-body>.npc-state-v3-maintenance-group{margin:.1em 0 0!important;border:0;border-top:1px solid rgba(255,255,255,.07);border-radius:0;background:transparent}\n@container (min-width:700px){.npc-state-v3-settings .npc-state-v3-recovery-group>.npc-state-v3-control-group-body{grid-template-columns:1fr}}\n@container (max-width:899px){.npc-state-v3-settings .npc-state-v3-recovery-note,.npc-state-v3-settings .npc-state-v3-advanced-recovery-intro{font-size:.82em}}\n`;
}
write('v03/settings-responsive.css', css);

console.log('Applied NPC State 0.4.14 settings-only UI cleanup');

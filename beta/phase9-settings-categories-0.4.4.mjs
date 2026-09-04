import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.4 settings marker: ' + label);
    return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.4 settings range: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

let layout = read('v03/settings-layout.js');
layout = replaceRequired(
    layout,
    '/* NPC State v0.3.2 responsive settings layout coordinator.',
    '/* NPC State v0.4.4 categorized responsive settings layout coordinator.',
    'layout version comment',
);
layout = replaceRequired(
    layout,
`const PANEL_ID = 'npc_state_settings';
const SCANNER_GROUP_ID = 'npc_state_v3_scanner_rules';
const MAINTENANCE_GROUP_ID = 'npc_state_v3_maintenance';
const CAST_SECTION_ID = 'npc_state_v3_cast_settings';`,
`const PANEL_ID = 'npc_state_settings';
const TRACKING_GROUP_ID = 'npc_state_v04_tracking';
const INJECTION_GROUP_ID = 'npc_state_v04_continuity_injection';
const BIRTHDAY_GROUP_ID = 'npc_state_v04_birthday_continuity';
const RECOVERY_GROUP_ID = 'npc_state_v04_recovery_branch';
const SCANNER_GROUP_ID = 'npc_state_v3_scanner_rules';
const MAINTENANCE_GROUP_ID = 'npc_state_v3_maintenance';
const CAST_SECTION_ID = 'npc_state_v3_cast_settings';`,
    'category constants',
);

layout = replaceBetween(
    layout,
    'function ensureTracking(drawer) {',
    'function ensureDossierEvolution(drawer) {',
`function rowForControl(drawer, selector) {
    return drawer?.querySelector?.(selector)?.closest?.('.npc-state-setting-row') || null;
}

function moveControlRows(drawer, group, selectors = []) {
    const body = group?.querySelector?.('.npc-state-v3-settings-group-body');
    if (!body) return group;
    for (const selector of selectors) {
        const row = rowForControl(drawer, selector);
        if (!row) continue;
        row.classList.add('npc-state-v3-category-row');
        if (row.parentElement !== body) body.appendChild(row);
    }
    return group;
}

function ensureTracking(drawer) {
    const group = ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Tracking', 'npc-state-v3-tracking-group', true, 'npc-state-v3-control-group-body');
    return moveControlRows(drawer, group, [
        '#npc_state_v3_auto',
        '#npc_state_v3_scan_depth',
        '#npc_state_v04_new_npc_history',
        '#npc_state_v04_admission',
    ]);
}

function ensureContinuityInjection(drawer) {
    const group = ensureParentDetails(drawer, INJECTION_GROUP_ID, 'Continuity Injection', 'npc-state-v3-injection-group', false, 'npc-state-v3-control-group-body');
    return moveControlRows(drawer, group, [
        '#npc_state_v3_inject',
        '#npc_state_v3_inject_budget',
    ]);
}

function syncBirthdayOptions(drawer) {
    const select = drawer?.querySelector?.('#npc_state_v04_birthday_fill');
    if (!select) return false;
    const mode = String(select.value || 'off').toLocaleLowerCase();
    const randomOnly = ['#npc_state_v04_birthday_calendar', '#npc_state_v04_birthday_days'];
    for (const selector of randomOnly) {
        const row = rowForControl(drawer, selector);
        if (!row) continue;
        row.hidden = mode !== 'random';
        row.setAttribute('aria-hidden', row.hidden ? 'true' : 'false');
    }
    const fillRow = rowForControl(drawer, '#npc_state_v04_birthday_fill_now');
    if (fillRow) {
        fillRow.hidden = mode === 'off';
        fillRow.setAttribute('aria-hidden', fillRow.hidden ? 'true' : 'false');
    }
    if (!select.dataset.npcStateBirthdayVisibilityBound) {
        select.dataset.npcStateBirthdayVisibilityBound = '1';
        select.addEventListener('change', () => syncBirthdayOptions(drawer));
    }
    return true;
}

function ensureBirthdayContinuity(drawer) {
    const group = ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday Continuity', 'npc-state-v3-birthday-group', false, 'npc-state-v3-control-group-body');
    moveControlRows(drawer, group, [
        '#npc_state_v04_birthday_fill',
        '#npc_state_v04_birthday_calendar',
        '#npc_state_v04_birthday_days',
        '#npc_state_v04_birthday_fill_now',
    ]);
    rowForControl(drawer, '#npc_state_v04_birthday_calendar')?.classList.add('npc-state-v3-birthday-calendar-row');
    syncBirthdayOptions(drawer);
    return group;
}

function ensureRecoveryBranch(drawer) {
    const group = ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety', 'npc-state-v3-recovery-group', false, 'npc-state-v3-control-group-body');
    return moveControlRows(drawer, group, [
        '#npc_state_v04_fallback',
        '#npc_state_v3_branch_rescan',
    ]);
}

`,
    'tracking category replacement',
);

layout = replaceRequired(
    layout,
`    if (!section.dataset.npcStateResponsiveDefault) {
        section.open = true;
        section.dataset.npcStateResponsiveDefault = '1';`,
`    if (!section.dataset.npcStateResponsiveDefault) {
        section.open = false;
        section.dataset.npcStateResponsiveDefault = '1';`,
    'dossier evolution default collapsed',
);

layout = replaceRequired(
    layout,
`function ensureParentDetails(drawer, id, title, className) {
    let group = globalThis.document?.getElementById?.(id);
    if (group) return group;
    group = makeElement('details', \`npc-state-v3-settings-group npc-state-v3-settings-card \${className}\`);
    if (!group) return null;
    group.id = id;
    const summary = makeElement('summary');
    const label = makeElement('b', '', title);
    const body = makeElement('div', 'npc-state-v3-settings-group-body');
    if (summary && label) summary.appendChild(label);
    if (summary) group.appendChild(summary);
    if (body) group.appendChild(body);
    drawer?.appendChild?.(group);
    return group;
}`,
`function ensureParentDetails(drawer, id, title, className, openByDefault = false, bodyClassName = '') {
    let group = globalThis.document?.getElementById?.(id);
    if (group) return group;
    group = makeElement('details', \`npc-state-v3-settings-group npc-state-v3-settings-card \${className}\`);
    if (!group) return null;
    group.id = id;
    group.open = Boolean(openByDefault);
    group.dataset.npcStateCategoryDefault = openByDefault ? 'open' : 'closed';
    const summary = makeElement('summary');
    const label = makeElement('b', '', title);
    const body = makeElement('div', ['npc-state-v3-settings-group-body', bodyClassName].filter(Boolean).join(' '));
    if (summary && label) summary.appendChild(label);
    if (summary) group.appendChild(summary);
    if (body) group.appendChild(body);
    drawer?.appendChild?.(group);
    return group;
}`,
    'generic collapsible constructor',
);

layout = replaceRequired(
    layout,
    "const group = ensureParentDetails(drawer, SCANNER_GROUP_ID, 'Scanner rules', 'npc-state-v3-scanner-rules');",
    "const group = ensureParentDetails(drawer, SCANNER_GROUP_ID, 'Advanced Rubrics', 'npc-state-v3-scanner-rules npc-state-v3-advanced-rubrics');",
    'rubric category title',
);

layout = replaceRequired(
    layout,
`    const actions = decorateActions(drawer);
    const tracking = ensureTracking(drawer);
    const evolution = ensureDossierEvolution(drawer);
    const scanner = ensureScannerRules(drawer);
    const maintenance = ensureMaintenance(drawer);
    const portrait = ensurePortrait(drawer);
    const cast = ensureCast(drawer);

    let anchor = intro;
    for (const node of [actions, tracking, evolution, scanner, maintenance, portrait, cast]) {
        anchor = placeAfter(anchor, node, drawer) || anchor;
    }`,
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
    'category order',
);
write('v03/settings-layout.js', layout);

let css = read('v03/settings-responsive.css');
css = replaceRequired(
    css,
    '/* NPC State v0.3.1 responsive settings hierarchy.',
    '/* NPC State v0.4.4 responsive categorized settings hierarchy.',
    'responsive css version comment',
);
css += `\n/* v0.4.4 categorized settings density */\n.npc-state-v3-settings .npc-state-v3-control-group-body{gap:.34em}\n.npc-state-v3-settings .npc-state-v3-category-row[hidden]{display:none!important}\n.npc-state-v3-settings .npc-state-v3-birthday-calendar-row{grid-template-columns:1fr!important}\n.npc-state-v3-settings .npc-state-v3-birthday-calendar-row textarea{width:100%;min-height:7em}\n@container (min-width:700px){\n  .npc-state-v3-settings .npc-state-v3-tracking-group>.npc-state-v3-control-group-body,\n  .npc-state-v3-settings .npc-state-v3-injection-group>.npc-state-v3-control-group-body,\n  .npc-state-v3-settings .npc-state-v3-recovery-group>.npc-state-v3-control-group-body{grid-template-columns:repeat(2,minmax(0,1fr))}\n}\n`;
write('v03/settings-responsive.css', css);

let readme = read('README.md');
const marker = '## Testing beside stable NPC State';
if (!readme.includes(marker)) throw new Error('Missing README settings insertion marker');
const section = `## Settings organization\n\n- v0.4.4 groups the growing settings surface into semantic collapsible sections while preserving the existing setting IDs, values, defaults, and listeners. **Tracking** opens by default; Continuity Injection, Birthday Continuity, Dossier Evolution, Recovery & Branch Safety, Advanced Rubrics, Maintenance, and Portraits remain collapsed until needed.\n- Birthday controls are progressive: Off shows only the fill policy, Unknown also exposes the local fill action, and Random additionally exposes the calendar and fallback-days controls. This changes presentation only; birthday provenance, age behavior, and scanner authority are unchanged.\n\n`;
if (!readme.includes('## Settings organization')) readme = readme.replace(marker, section + marker);
write('README.md', readme);

console.log('Applied NPC State 0.4.4 categorized collapsible settings layout');

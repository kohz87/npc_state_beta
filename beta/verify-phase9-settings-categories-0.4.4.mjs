import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

const layout = read('v03/settings-layout.js');
const ui = read('v03/ui.js');
const css = read('v03/settings-responsive.css');
const manifest = JSON.parse(read('manifest.json'));
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

assert(manifest.version === '0.4.4', 'Manifest was not bumped to 0.4.4');
assert(ui.includes('NPC State <span class="npc-state-version">0.4.4</span>'), 'Settings header does not show v0.4.4');
assert(layout.includes('categorized responsive settings layout coordinator'), 'Categorized settings coordinator missing');

const categories = [
    ['npc_state_v04_tracking', 'Tracking'],
    ['npc_state_v04_continuity_injection', 'Continuity Injection'],
    ['npc_state_v04_birthday_continuity', 'Birthday Continuity'],
    ['npc_state_v04_recovery_branch', 'Recovery & Branch Safety'],
    ['npc_state_v3_scanner_rules', 'Advanced Rubrics'],
];
for (const [id, label] of categories) {
    assert(layout.includes(id), `Missing settings category id ${id}`);
    assert(layout.includes(`'${label}'`), `Missing settings category title ${label}`);
}

// Tracking is the only newly created control category open by default.
assert(layout.includes("ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Tracking', 'npc-state-v3-tracking-group', true"), 'Tracking is not open by default');
assert(layout.includes("ensureParentDetails(drawer, INJECTION_GROUP_ID, 'Continuity Injection', 'npc-state-v3-injection-group', false"), 'Continuity Injection should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday Continuity', 'npc-state-v3-birthday-group', false"), 'Birthday Continuity should default collapsed');
assert(layout.includes("ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety', 'npc-state-v3-recovery-group', false"), 'Recovery & Branch Safety should default collapsed');
assert(layout.includes('section.open = false;'), 'Dossier Evolution should default collapsed');

// Existing settings remain the same live controls and are only moved by the coordinator.
const expectedControls = [
    '#npc_state_v3_auto', '#npc_state_v3_scan_depth', '#npc_state_v04_new_npc_history', '#npc_state_v04_admission',
    '#npc_state_v3_inject', '#npc_state_v3_inject_budget',
    '#npc_state_v04_birthday_fill', '#npc_state_v04_birthday_calendar', '#npc_state_v04_birthday_days', '#npc_state_v04_birthday_fill_now',
    '#npc_state_v04_fallback', '#npc_state_v3_branch_rescan',
];
for (const selector of expectedControls) {
    assert(layout.includes(selector), `Settings coordinator omitted ${selector}`);
    assert(ui.includes(selector.slice(1)), `Authoritative UI control disappeared: ${selector}`);
}
assert(!layout.includes('persistSettings(') && !layout.includes('getSettings('), 'Presentation coordinator acquired settings mutation authority');

// Birthday controls progressively reveal only what the selected fill policy needs.
assert(layout.includes("row.hidden = mode !== 'random';"), 'Random-only birthday options are not conditionally hidden');
assert(layout.includes("fillRow.hidden = mode === 'off';"), 'Fill-existing birthday action is not hidden while fill is Off');
assert(layout.includes('npcStateBirthdayVisibilityBound'), 'Birthday visibility change listener is not idempotently bound');
assert(css.includes('.npc-state-v3-category-row[hidden]{display:none!important}'), 'Hidden category rows lack explicit responsive CSS');

// Category order keeps actions visible after settings groups and Cast last.
assert(layout.includes('[tracking, injection, birthday, evolution, recovery, scanner, maintenance, portrait, actions, cast]'), 'Settings category/action order drifted');
assert(layout.includes("legacyGrid && legacyGrid.children.length === 0"), 'Empty legacy tracking grid is not removed');

assert(readme.startsWith('# NPC State Beta 0.4.4'), 'README version header was not bumped');
assert(readme.includes('## Settings organization') && readme.includes('Tracking') && readme.includes('Birthday controls are progressive'), 'README settings organization documentation missing');
assert(changelog.includes('## v0.4.4') && changelog.includes('semantic collapsible categories'), 'v0.4.4 changelog entry missing');
const birthdayBullet = '- Adds optional passive Birthday continuity metadata with durable evidence-backed correction';
assert(changelog.split(birthdayBullet).length - 1 === 1, 'Replayed build duplicated the historical v0.4.3 Birthday changelog entry');

console.log('NPC State 0.4.4 categorized settings verification passed');

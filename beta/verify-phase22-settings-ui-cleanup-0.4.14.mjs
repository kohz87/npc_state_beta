import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const layout = read('v03/settings-layout.js');
const ui = read('v03/ui.js');
const recovery = read('v03/branch-recovery-ui.js');
const css = read('v03/settings-responsive.css');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const phase = read('beta/phase22-settings-ui-cleanup-0.4.14.mjs');

const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 14, 'Manifest regressed below v0.4.14');
assert(ui.includes(`NPC State <span class="npc-state-version">${manifest.version}</span>`), 'Settings header version does not match manifest');
assert(layout.includes("'Persistent character continuity'"), 'Settings header subtitle was not simplified');

// The visible hierarchy must match the v0.4.14 settings-only design.
assert(layout.includes("ensureParentDetails(drawer, TRACKING_GROUP_ID, 'Scanning & Capture'"), 'Scanning & Capture category missing');
assert(layout.includes("ensureParentDetails(drawer, INJECTION_GROUP_ID, 'Continuity Injection'"), 'Continuity Injection category missing');
assert(layout.includes("ensureParentDetails(drawer, BIRTHDAY_GROUP_ID, 'Birthday & Aging'"), 'Birthday & Aging category missing');
assert(layout.includes("ensureParentDetails(drawer, SCANNER_GROUP_ID, 'Relationships'"), 'Relationships category missing');
assert(layout.includes("ensureParentDetails(drawer, RECOVERY_GROUP_ID, 'Recovery & Branch Safety'"), 'Recovery category missing');
assert(layout.includes("ensureParentDetails(drawer, ADVANCED_GROUP_ID, 'Advanced'"), 'Advanced category missing');
assert(layout.includes("'Advanced Recovery'"), 'Advanced Recovery subgroup missing');
assert(!layout.includes("'Advanced Rubrics'"), 'Legacy Advanced Rubrics label survived the cleanup');

// Scanning owns operational scan controls, including the token ceiling and malformed-capture recovery.
const scanStart = layout.indexOf('function ensureScanning(drawer)');
const scanEnd = layout.indexOf('function ensureContinuityInjection(drawer)', scanStart);
assert(scanStart >= 0 && scanEnd > scanStart, 'Scanning category source window missing');
const scanWindow = layout.slice(scanStart, scanEnd);
for (const selector of [
    '#npc_state_v3_auto', '#npc_state_v3_scan_depth', '#npc_state_v04_new_npc_history', '#npc_state_v04_admission',
    '#npc_state_v047_response_tokens', '#npc_state_v04_fallback',
]) assert(scanWindow.includes(selector), `Scanning & Capture omitted ${selector}`);
assert(ui.includes('<b>Auto Scan</b>'), 'Auto Scan label not simplified');
assert(ui.includes('<b>Scanner Response Limit</b>'), 'Scanner Response Limit label missing');

// Recovery must no longer own generic scanner controls and force-rebase must be buried one level deeper.
const recoveryStart = layout.indexOf('function ensureRecoveryBranch(drawer)');
const recoveryEnd = layout.indexOf('function ensureDossierEvolution(drawer)', recoveryStart);
assert(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'Recovery category source window missing');
const recoveryWindow = layout.slice(recoveryStart, recoveryEnd);
assert(recoveryWindow.includes('#npc_state_v3_branch_rescan'), 'Branch rescan disappeared from Recovery');
assert(!recoveryWindow.includes('#npc_state_v047_response_tokens'), 'Scanner token limit still lives under Recovery');
assert(!recoveryWindow.includes('#npc_state_v04_fallback'), 'Malformed capture recovery still lives under Recovery');
assert(recovery.includes("ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery'"), 'Branch recovery UI does not target Advanced Recovery');
assert(recovery.includes('hostForForceControl'), 'Force rebase lacks an advanced host resolver');
assert(recovery.includes('ensureForceControl(forceHost || host)'), 'Force rebase is not placed under Advanced Recovery when available');
assert(recovery.includes('<b>Force Timeline Rebase</b>'), 'Force rebase warning label was not clarified');
assert(recovery.includes('rebaseCurrentChat(true)'), 'Force rebase behavior was accidentally removed');
assert(recovery.includes('recovery.open = true'), 'Required recovery no longer opens the main Recovery section');

// Relationship and memory rubrics are separated without changing their authoritative controls.
assert(layout.includes("label.textContent = 'Relationship Rubric'"), 'Relationship rubric label missing');
assert(layout.includes("label.textContent = 'Memory Rubric'"), 'Memory rubric label missing');
assert(layout.includes("const maintenance = ensureMaintenance(drawer);"), 'Maintenance was not grouped beneath Advanced');
assert(layout.includes('[scanning, injection, birthday, evolution, relationships, recovery, advanced, portrait, actions, cast]'), 'Settings order drifted');

// Existing setting controls and mutation authority remain in ui.js, not the presentation coordinator.
const controls = [
    'npc_state_v3_enabled', 'npc_state_v3_auto', 'npc_state_v04_fallback', 'npc_state_v3_scan_depth',
    'npc_state_v04_new_npc_history', 'npc_state_v04_admission', 'npc_state_v047_response_tokens',
    'npc_state_v04_birthday_fill', 'npc_state_v04_birthday_calendar', 'npc_state_v04_birthday_days', 'npc_state_v04_birthday_fill_now',
    'npc_state_v3_inject', 'npc_state_v3_inject_budget', 'npc_state_v3_branch_rescan',
    'npc_state_v3_limit_memories', 'npc_state_v3_limit_key_relationships', 'npc_state_v3_limit_mannerisms', 'npc_state_v3_limit_behavior',
    'npc_state_v3_relationship_criteria', 'npc_state_v3_memory_criteria',
];
for (const id of controls) assert(ui.includes(id), `Existing settings control disappeared: ${id}`);
assert(!layout.includes('persistSettings(') && !layout.includes('getSettings('), 'Settings layout coordinator acquired mutation authority');

// Responsive styling must preserve the safety hierarchy on narrow panels.
assert(css.includes('/* v0.4.14 settings hierarchy cleanup */'), 'v0.4.14 responsive settings CSS missing');
assert(css.includes('.npc-state-v3-advanced-recovery-body'), 'Advanced Recovery responsive styling missing');
assert(css.includes('.npc-state-v3-force-rebase-row'), 'Force-rebase warning styling missing');
assert(css.includes('.npc-state-v3-recovery-group>.npc-state-v3-control-group-body{grid-template-columns:1fr}'), 'Recovery layout can still split its safety hierarchy into columns');

// This phase is presentation-only: it must not touch state/scanner/storage/dossier implementation files.
for (const forbidden of [
    'v03/scanner.js', 'v03/engine.js', 'v03/schema.js', 'v03/storage.js', 'v03/branches.js',
    'v03/relationship-evidence.js', 'v03/dossier-view.js', 'v03/injection.js', 'v03/index.js',
]) assert(!phase.includes(forbidden), `Settings-only phase unexpectedly references ${forbidden}`);

assert(readme.startsWith(`# NPC State Beta ${manifest.version}`), 'README release title does not match manifest');
assert(readme.includes('presentation-only settings cleanup') && readme.includes('Scanning & Capture') && readme.includes('Advanced Recovery'), 'README settings-only release notes missing');
assert(changelog.includes('## v0.4.14') && changelog.includes('Reorganizes the settings panel without changing stored setting keys'), 'v0.4.14 changelog entry missing');

console.log('NPC State 0.4.14+ settings-only UI cleanup verified');

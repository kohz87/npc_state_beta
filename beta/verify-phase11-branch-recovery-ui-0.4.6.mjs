import fs from 'node:fs';
import { branchRecoveryRequired } from '../v03/branch-recovery-ui.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function read(path) { return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'); }

assert(branchRecoveryRequired({ branchSafety: { status: 'safe' } }) === false, 'Safe branch incorrectly requires rebase');
assert(branchRecoveryRequired({ branchSafety: { status: 'rebase-required', kind: 'prebaseline-rewrite' } }) === true, 'Unsafe branch failed to require rebase');

const source = read('v03/branch-recovery-ui.js');
assert(source.includes("getElementById?.('npc_state_v04_recovery_branch')"), 'Recovery UI does not target the categorized Recovery & Branch Safety group');
assert(source.includes("recovery?.querySelector?.('.npc-state-v3-settings-group-body')"), 'Recovery UI does not mount inside the recovery group body');
assert(source.includes("if (recovery && 'open' in recovery) recovery.open = true;"), 'Recovery category does not automatically open when rebase is required');
assert(source.includes("host.prepend?.(banner);"), 'Recovery banner does not use direct-child-safe placement');
assert(!source.includes('host.insertBefore(banner, heading.nextSibling)'), 'Legacy nested-heading insertion bug remains');
assert(source.includes('Rebase to current chat'), 'Rebase action label disappeared');
assert(source.includes("globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true })"), 'Rebase action lost engine wiring');

const bootstrap = read('bootstrap.js');
assert(bootstrap.includes("await import('./v03/branch-recovery-ui.js')"), 'Branch recovery UI is not loaded by bootstrap');
assert(bootstrap.includes('startBranchRecoveryUi();'), 'Branch recovery UI is not started by bootstrap');

const layout = read('v03/settings-layout.js');
assert(layout.includes("const RECOVERY_GROUP_ID = 'npc_state_v04_recovery_branch';"), 'Categorized recovery group id drifted');
assert(layout.includes("'Recovery & Branch Safety'"), 'Recovery group label drifted');

const index = read('v03/index.js');
assert(index.includes('timeline rebase required'), 'Unsafe-branch warning disappeared');
assert(index.includes('Rebase to current chat'), 'Unsafe-branch warning no longer points to the rebase control');

const manifest = JSON.parse(read('manifest.json'));
assert(/^0\.4\.(?:[6-9]|[1-9]\d+)$/.test(manifest.version), 'Manifest predates the 0.4.6 branch recovery fix');

console.log('NPC State 0.4.6 branch recovery UI verification passed');
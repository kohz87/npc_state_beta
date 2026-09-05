import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const layout = read('v03/settings-layout.js');
const ui = read('v03/ui.js');
const recovery = read('v03/branch-recovery-ui.js');
const css = read('v03/settings-responsive.css');
const phase9 = read('beta/verify-phase9-settings-categories-0.4.4.mjs');
const phase15 = read('beta/verify-phase15-force-rebase-0.4.10.mjs');
const phase20 = read('beta/verify-phase20-semantic-isolation-0.4.13.mjs');
const phase21 = read('beta/verify-phase21-release-source-parity-0.4.13.mjs');

const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 14, 'Manifest regressed below v0.4.14');
assert(ui.includes(`NPC State <span class="npc-state-version">${manifest.version}</span>`), 'Committed runtime UI version does not match manifest');

assert(layout.includes("'Scanning & Capture'"), 'Committed runtime lacks Scanning & Capture');
assert(layout.includes("'Birthday & Aging'"), 'Committed runtime lacks Birthday & Aging');
assert(layout.includes("'Relationships'"), 'Committed runtime lacks Relationships');
assert(layout.includes("'Recovery & Branch Safety'"), 'Committed runtime lacks Recovery & Branch Safety');
assert(layout.includes("'Advanced Recovery'"), 'Committed runtime lacks Advanced Recovery');
assert(layout.includes("'Advanced'"), 'Committed runtime lacks Advanced');
assert(!layout.includes("'Advanced Rubrics'"), 'Legacy Advanced Rubrics label remains in committed runtime');
assert(layout.includes("'#npc_state_v047_response_tokens'"), 'Scanner Response Limit is not represented by the committed layout');
assert(layout.includes("'#npc_state_v04_fallback'"), 'Malformed capture recovery is not represented by the committed layout');
assert(layout.includes('[scanning, injection, birthday, evolution, relationships, recovery, advanced, portrait, actions, cast]'), 'Committed settings order differs from v0.4.14 design');

assert(recovery.includes("ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery'"), 'Committed recovery UI does not target Advanced Recovery');
assert(recovery.includes('ensureForceControl(forceHost || host)'), 'Committed recovery UI does not place Force Rebase in Advanced Recovery');
assert(recovery.includes('rebaseCurrentChat(true)'), 'Committed Force Rebase behavior is missing');
assert(recovery.includes('Force Timeline Rebase...'), 'Committed Force Rebase label is stale');
assert(css.includes('/* v0.4.14 settings hierarchy cleanup */'), 'Committed responsive CSS lacks v0.4.14 hierarchy rules');

// Compatibility changes must be physically present in release source, not created only during CI.
assert(phase9.includes("['npc_state_v04_tracking', 'Scanning & Capture']"), 'v0.4.4 settings verifier compatibility is not persisted');
assert(phase9.includes('[scanning, injection, birthday, evolution, relationships, recovery, advanced, portrait, actions, cast]'), 'v0.4.4 settings order compatibility is not persisted');
assert(phase15.includes('Force Timeline Rebase...') && phase15.includes('ensureForceControl(forceHost || host)'), 'v0.4.10 force-rebase verifier compatibility is not persisted');
assert(phase20.includes('Manifest regressed below v0.4.13'), 'v0.4.13 semantic verifier descendant assertion is not persisted');
assert(phase21.includes('Manifest regressed below v0.4.13'), 'v0.4.13 source-parity descendant assertion is not persisted');

console.log('NPC State 0.4.14+ release source parity verified');

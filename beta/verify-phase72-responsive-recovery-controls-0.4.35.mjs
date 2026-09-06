import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.35') {
    console.log('NPC State v0.4.35 responsive recovery verification skipped on pre-0.4.35 source checkout');
    process.exit(0);
}

const recoveryUi = read('v03/branch-recovery-ui.js');

assert(recoveryUi.includes('PHASE72_RESPONSIVE_RECOVERY_CONTROLS'), 'Responsive recovery marker is missing');
assert(
    recoveryUi.includes('#${FORCE_ID}{display:grid!important;grid-template-columns:minmax(0,1fr);gap:8px;align-items:start;width:100%;min-width:0;max-width:100%;box-sizing:border-box}'),
    'Force rebase row is not a bounded full-width grid',
);
assert(
    recoveryUi.includes('#${FORCE_ID}>span{min-width:0;max-width:100%;overflow-wrap:anywhere}'),
    'Force rebase description can still force horizontal overflow',
);
assert(
    recoveryUi.includes('#${FORCE_ID} .npc-state-v3-branch-recovery-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;min-width:0;max-width:100%;box-sizing:border-box}'),
    'Force rebase actions are not constrained to the available row width',
);
assert(
    recoveryUi.includes('white-space:normal!important;overflow-wrap:anywhere;line-height:1.25'),
    'Recovery action labels are not allowed to wrap',
);
assert(
    recoveryUi.includes('@media(max-width:720px){#${FORCE_ID} .npc-state-v3-branch-recovery-actions{grid-template-columns:1fr}}'),
    'Narrow recovery actions do not stack to one column',
);
assert(
    !recoveryUi.includes('#${FORCE_ID} button{margin:0}#${FORCE_ID}[data-running="1"] button{opacity:.65;pointer-events:none}'),
    'Legacy unbounded Force Timeline Rebase button rule remains',
);

// Behavior contract: this release is layout-only. Both decisions and their existing handlers remain intact.
assert(recoveryUi.includes('Keep NPC state and accept timeline'), 'Preserve rebase action label was lost');
assert(recoveryUi.includes('Roll back discarded story changes'), 'Rollback rebase action label was lost');
assert(recoveryUi.includes("rebaseCurrentChat('preserve', true)"), 'Preserve rebase handler was changed or lost');
assert(recoveryUi.includes("rebaseCurrentChat('rollback', true)"), 'Rollback rebase handler was changed or lost');
assert(recoveryUi.includes("const mode = relationshipMode === 'rollback' ? 'rollback' : 'preserve';"), 'Recovery relationship-mode semantics changed unexpectedly');

console.log('NPC State v0.4.35 responsive recovery controls verified');

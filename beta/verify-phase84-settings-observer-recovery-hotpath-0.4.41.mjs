import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTextIfChanged } from '../v03/settings-layout.js';
import { branchRecoveryRequired, readBranchSafetyStatus, readRecoveryStatus } from '../v03/branch-recovery-ui.js';

const settingsSource = fs.readFileSync('v03/settings-layout.js', 'utf8');
const recoverySource = fs.readFileSync('v03/branch-recovery-ui.js', 'utf8');
const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');

// Reproduce the user's isolated 10-pass case. With the old unconditional textContent writes,
// these two labels would produce 20 child-list mutations and keep the layout observer alive.
function countedLabel(initial) {
    let value = initial;
    let assignments = 0;
    return {
        get textContent() { return value; },
        set textContent(next) { assignments += 1; value = next; },
        get assignments() { return assignments; },
    };
}

const relationship = countedLabel('Relationship Rubric');
const memory = countedLabel('Memory Rubric');
for (let pass = 0; pass < 10; pass += 1) {
    setTextIfChanged(relationship, 'Relationship Rubric');
    setTextIfChanged(memory, 'Memory Rubric');
}
assert.equal(relationship.assignments + memory.assignments, 0, 'Ten stable layout passes must perform zero redundant rubric label assignments');

const changed = countedLabel('Old label');
setTextIfChanged(changed, 'Relationship Rubric');
for (let pass = 0; pass < 10; pass += 1) setTextIfChanged(changed, 'Relationship Rubric');
assert.equal(changed.assignments, 1, 'A changed label must be written once and then remain idempotent');

// A normal no-recovery overlay pass must never fall through to getState(). null from
// recoveryStatus() is authoritative and branch safety has its own narrow read.
const previousNpcState = globalThis.NPCState;
let fullStateReads = 0;
let branchReads = 0;
let recoveryReads = 0;
globalThis.NPCState = {
    branchSafetyStatus() { branchReads += 1; return { status: 'safe', kind: '', reason: '' }; },
    recoveryStatus() { recoveryReads += 1; return null; },
    getState() { fullStateReads += 1; return { branchSafety: { status: 'safe' }, recovery: { status: 'paused' } }; },
};
try {
    for (let pass = 0; pass < 10; pass += 1) {
        assert.equal(branchRecoveryRequired(), false);
        assert.equal(readRecoveryStatus(), null);
    }
    assert.equal(branchReads, 10, 'Ten passes must use the narrow branch-safety API exactly once each');
    assert.equal(recoveryReads, 10, 'Ten passes must accept ten null recovery-status results without fallback');
    assert.equal(fullStateReads, 0, 'Ten passes must perform zero full-state reads');
    assert.deepEqual(readBranchSafetyStatus(), { status: 'safe', kind: '', reason: '' });
} finally {
    if (previousNpcState === undefined) delete globalThis.NPCState;
    else globalThis.NPCState = previousNpcState;
}

// Preserve the historical exported helper contract that accepts a full state object in tests.
assert.equal(branchRecoveryRequired({ branchSafety: { status: 'safe' } }), false);
assert.equal(branchRecoveryRequired({ branchSafety: { status: 'rebase-required', kind: 'prebaseline-rewrite' } }), true);
assert.equal(branchRecoveryRequired({ status: 'rebase-required', kind: 'prebaseline-rewrite' }), true);

assert(settingsSource.includes('PHASE84_SETTINGS_OBSERVER_RECOVERY_HOTPATH'), 'v0.4.41 observer hot-path marker missing');
assert(settingsSource.includes("setTextIfChanged(label, 'Relationship Rubric');"), 'Relationship Rubric label must use equality-guarded write');
assert(settingsSource.includes("setTextIfChanged(label, 'Memory Rubric');"), 'Memory Rubric label must use equality-guarded write');
assert(!settingsSource.includes("if (label) label.textContent = 'Relationship Rubric';"), 'Unconditional Relationship Rubric write remains');
assert(!settingsSource.includes("if (label) label.textContent = 'Memory Rubric';"), 'Unconditional Memory Rubric write remains');
assert(settingsSource.includes("observer.observe(globalThis.document.body, { childList: true, subtree: true });"), 'Settings observer contract unexpectedly changed');

assert(engineSource.includes('function branchSafetyStatus(chatKey = getChatKey())'), 'Engine narrow branch-safety read missing');
assert(engineSource.includes('branchSafetyStatus,'), 'Engine public surface must expose narrow branch-safety read');
assert(indexSource.includes('branchSafetyStatus: () => engine.branchSafetyStatus(getChatKey()),'), 'Global NPCState surface must expose narrow branch-safety read');
assert(recoverySource.includes("if (typeof api?.recoveryStatus === 'function') return api.recoveryStatus();"), 'Recovery UI must treat recoveryStatus as authoritative');
assert(!recoverySource.includes('NPCState?.getState?.()'), 'Recovery UI must not clone full state during overlay refresh');
assert(!recoverySource.includes('state()?.recovery'), 'Null recovery status must not fall through to full-state recovery lookup');

console.log('PASS v0.4.41 settings observer and recovery UI hot-path hardening');

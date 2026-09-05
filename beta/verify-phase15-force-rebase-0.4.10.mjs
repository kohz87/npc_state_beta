import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chatLineage, rebaseToCurrentChat } from '../v03/branches.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

const chat = [
    { is_user: true, mes: 'I greet Mira.' },
    { is_user: false, mes: 'Mira smiles and answers.' },
];

{
    const state = createEmptyState('force-rebase-safe');
    state.npcs = [normalizeNpc({
        id: 'npc-mira-force-rebase',
        name: 'Mira',
        relationship: { trust: 18, affection: 12, desire: 0, tension: 0 },
    })];
    state.branchHeadLineage = chatLineage(chat);
    state.branchSafety = { status: 'safe', kind: '', reason: '' };
    state.lastScannedMessageId = 1;

    const rebased = rebaseToCurrentChat(state, chat);
    assert.equal(rebased.lastScannedMessageId, 1, 'Safe same-lineage force rebase forgot that the latest exchange was already scanned');
    assert.deepEqual(rebased.npcs[0].relationship, state.npcs[0].relationship, 'Safe same-lineage force rebase changed relationship state');
    assert.equal(rebased.branchSafety.status, 'safe', 'Safe force rebase did not establish a safe new baseline');
}

{
    const oldChat = [
        { is_user: true, mes: 'I greet Mira.' },
        { is_user: false, mes: 'Mira smiles and answers.' },
    ];
    const rewrittenChat = [
        { is_user: true, mes: 'I greet Mira.' },
        { is_user: false, mes: 'Mira ignores the greeting and leaves.' },
    ];
    const state = createEmptyState('force-rebase-divergent');
    state.npcs = [normalizeNpc({ id: 'npc-mira-force-divergent', name: 'Mira' })];
    state.branchHeadLineage = chatLineage(oldChat);
    state.branchSafety = { status: 'safe', kind: '', reason: '' };
    state.lastScannedMessageId = 1;

    const rebased = rebaseToCurrentChat(state, rewrittenChat);
    assert.equal(rebased.lastScannedMessageId, null, 'Divergent force rebase incorrectly preserved an already-scanned marker from the old lineage');
}

const recoveryUi = fs.readFileSync(new URL('../v03/branch-recovery-ui.js', import.meta.url), 'utf8');
assert(recoveryUi.includes("const FORCE_ID = 'npc_state_v3_force_rebase'"), 'Force rebase control id is missing');
assert(recoveryUi.includes('Force timeline rebase'), 'Recovery settings do not expose the force rebase action');
assert(recoveryUi.includes('Force rebase to current chat'), 'Force rebase button label is missing');
assert(recoveryUi.includes('rebaseCurrentChat(true)'), 'Force rebase button is not wired to the explicit force path');
assert(recoveryUi.includes('ensureForceControl(host)'), 'Safe branch state does not render the force rebase action');
assert(recoveryUi.includes('forceControl?.remove?.()'), 'Required-rebase state does not suppress the duplicate force control');
assert(recoveryUi.includes('preserves that scan marker so the refresh cannot apply its relationship delta twice'), 'Force rebase confirmation does not explain duplicate relationship protection');

const branches = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
assert(branches.includes('preserveLatestScannedMessage'), 'Branch rebase lacks safe-lineage scan-marker preservation');
assert(branches.includes('divergenceMessageId === null'), 'Scan-marker preservation is not gated to a non-divergent lineage');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.10', 'Manifest was not bumped to 0.4.10');

console.log('NPC State 0.4.10 manual force rebase verification passed');

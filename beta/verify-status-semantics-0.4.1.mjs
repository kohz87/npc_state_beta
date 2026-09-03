import fs from 'node:fs';
import { createEmptyState, normalizeCurrentStatus, normalizeNpc } from '../v03/schema.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildInjection } from '../v03/injection.js';
import { dossierHtml } from '../v03/dossier-view.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// Lifecycle-only labels must never survive as the free-text current status field.
for (const bad of ['Active', 'inactive', 'Not active', 'In chat', 'Off-screen', 'Present', 'Archived', 'Active off-screen']) {
    assert(normalizeCurrentStatus(bad) === '', `Lifecycle-only status was accepted: ${bad}`);
}
assert(normalizeCurrentStatus('Standing watch at the eastern gate') === 'Standing watch at the eastern gate', 'Concrete activity status was rejected');
assert(normalizeCurrentStatus('Recovering from a deep abdominal wound') === 'Recovering from a deep abdominal wound', 'Concrete condition status was rejected');

// Existing polluted values should heal on ordinary normalization/load.
assert(normalizeNpc({ name: 'Legacy', status: 'Active' }).status === '', 'Legacy lifecycle-only status did not normalize away');

// A lifecycle-only patch must preserve an existing useful status, while a concrete patch
// must still be able to replace it.
{
    const seeded = applyScanResult(createEmptyState('status-semantics'), {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Astra', status: 'Keeping watch beside the hearth' }],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true });
    const astra = seeded.state.npcs.find(npc => npc.name === 'Astra');
    assert(astra?.status === 'Keeping watch beside the hearth', 'Concrete bootstrap status was not stored');

    const generic = applyScanResult(seeded.state, {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [{ id: astra.id, name: 'Astra', status: 'Active' }],
        socialEdges: [],
    }, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true });
    const afterGeneric = generic.state.npcs.find(npc => npc.id === astra.id);
    assert(afterGeneric?.status === 'Keeping watch beside the hearth', 'Lifecycle-only patch overwrote concrete status');

    const concrete = applyScanResult(generic.state, {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [{ id: astra.id, name: 'Astra', status: 'Bandaging Kiri\'s scraped palm' }],
        socialEdges: [],
    }, { sourceMessageId: 3, turn: 3, applyReturnedNpcPatches: true });
    const afterConcrete = concrete.state.npcs.find(npc => npc.id === astra.id);
    assert(afterConcrete?.status === "Bandaging Kiri's scraped palm", 'Concrete status patch was not applied');
}

// A brand-new NPC must not bootstrap a lifecycle label into Current status.
{
    const created = applyScanResult(createEmptyState('new-status-semantics'), {
        exchangeActiveNpcIds: ['Brina'],
        inChatNpcIds: ['Brina'],
        worldActiveNpcIds: [],
        npcs: [{ id: '', name: 'Brina', status: 'In chat' }],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1, applyReturnedNpcPatches: true });
    assert(created.state.npcs.find(npc => npc.name === 'Brina')?.status === '', 'New NPC stored lifecycle-only status');
}

// Both model-facing paths must define the field unambiguously.
{
    const chat = [
        { is_user: true, mes: 'I enter the room.' },
        { is_user: false, is_system: false, mes: 'Astra looks up from wrapping a bandage.' },
    ];
    const recoveryPrompt = buildScanPrompt({ state: createEmptyState('prompt-test'), chat, assistantMessageId: 1 });
    assert(recoveryPrompt.includes('status is the NPC current concrete activity'), 'Recovery scanner status semantics missing');
    assert(recoveryPrompt.includes('Never use active, inactive, in chat, off-screen, present, archived'), 'Recovery scanner lifecycle exclusion missing');

    const foregroundPrompt = buildInjection(createEmptyState('prompt-test'), { enabled: true, autoScan: true, inject: true });
    assert(foregroundPrompt.includes('status is the NPC current concrete activity'), 'Foreground status semantics missing');
    assert(foregroundPrompt.includes('never lifecycle presence'), 'Foreground status contract is still ambiguous');
}

// Human-facing labels should no longer invite lifecycle interpretation.
{
    const npc = normalizeNpc({ name: 'Astra', status: 'Sleeping by the hearth' });
    assert(dossierHtml(npc).includes('Activity / condition'), 'Dossier still labels the free-text field as generic Status');
    assert(file('v03/ui.js').includes("field('Activity / condition', 'npc_state_v3_edit_status'"), 'Editor still labels the free-text field as generic Status');
}

console.log('NPC State 0.4.1 current status semantics verification passed');

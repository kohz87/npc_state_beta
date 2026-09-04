import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { fingerprintMessage, recordCheckpoint, reconcileToCurrentBranch } from '../v03/branches.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const baseUser = { is_user: true, is_system: false, mes: 'Choose.' };
const variantChat = text => [baseUser, { is_user: false, is_system: false, swipe_id: 99, mes: text }];

// Canonical fingerprint remains independent of swipe index.
{
    const a = fingerprintMessage({ is_user: false, swipe_id: 0, mes: 'Same visible story.' });
    const b = fingerprintMessage({ is_user: false, swipe_id: 12, mes: 'Same visible story.' });
    assert(a === b, 'Phase 2 reintroduced swipe-index branch identity');
}

// Four exact sibling states survive for one assistant message; the oldest fifth sibling is evicted.
{
    let state = createEmptyState('phase2-siblings');
    state.npcs = [normalizeNpc({ id: 'npc-mira-phase2', name: 'Mira', status: 'root' })];
    const chats = [];
    for (let i = 1; i <= 5; i += 1) {
        const chat = variantChat('Visible sibling ' + i);
        chats.push(chat);
        state.npcs[0].status = 'state-' + i;
        state = recordCheckpoint(state, chat, 1, 'sibling-' + i);
        // Ensure createdAt ordering cannot collapse in a same-millisecond loop.
        const cp = state.checkpoints.find(item => item.messageId === 1 && item.lineage.at(-1) === fingerprintMessage(chat[1]));
        if (cp) cp.createdAt += i;
    }
    const siblings = state.checkpoints.filter(item => item.messageId === 1);
    assert(siblings.length === 4, 'Per-message sibling checkpoint bound is not four');
    const fingerprints = new Set(siblings.map(item => item.lineage.at(-1)));
    assert(!fingerprints.has(fingerprintMessage(chats[0][1])), 'Oldest fifth sibling was not evicted');
    for (let i = 1; i < 5; i += 1) {
        assert(fingerprints.has(fingerprintMessage(chats[i][1])), 'Recent sibling checkpoint was unexpectedly evicted');
    }

    // Revisiting a retained sibling restores the exact dossier snapshot without needing a scan.
    const restored = reconcileToCurrentBranch(state, chats[2]);
    assert(restored.changed === true && restored.unsafeDivergence === false, 'Retained sibling did not reconcile safely');
    assert(restored.checkpoint?.messageId === 1, 'Retained sibling exact checkpoint was not selected');
    assert(restored.state.npcs[0].status === 'state-3', 'Retained sibling did not restore its exact dossier state');
}

// Re-recording the exact same lineage replaces it instead of consuming another sibling slot.
{
    let state = createEmptyState('phase2-exact-replace');
    state.npcs = [normalizeNpc({ id: 'npc-a', name: 'A', status: 'first' })];
    const chat = variantChat('Stable sibling');
    state = recordCheckpoint(state, chat, 1, 'first');
    state.npcs[0].status = 'second';
    state = recordCheckpoint(state, chat, 1, 'second');
    const siblings = state.checkpoints.filter(item => item.messageId === 1);
    assert(siblings.length === 1, 'Exact same lineage consumed multiple sibling slots');
    const restored = reconcileToCurrentBranch(state, chat);
    assert(restored.state.npcs[0].status === 'second', 'Exact-lineage checkpoint replacement did not keep newest state');
}

// Global checkpoint count is still bounded even across many messages and sibling variants.
{
    let state = createEmptyState('phase2-global-bound');
    state.npcs = [normalizeNpc({ id: 'npc-a', name: 'A' })];
    const chat = [];
    for (let messageId = 0; messageId < 60; messageId += 1) {
        chat.push({ is_user: messageId % 2 === 0, is_system: false, mes: 'message-' + messageId });
        if (messageId % 2 === 1) state = recordCheckpoint(state, chat, messageId, 'global-bound');
    }
    assert(state.checkpoints.length <= 48, 'Global checkpoint bound exceeded after phase 2');
}

// Payload replay fallback remains wired for evicted/untracked siblings.
{
    const index = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
    const branches = fs.readFileSync(new URL('../v03/branches.js', import.meta.url), 'utf8');
    assert(index.includes('reapplyStoredEmbeddedPayload'), 'Stored embedded payload replay fallback was removed');
    assert(index.includes('preferStoredPayload'), 'Swipe reconcile no longer prefers stored payload when needed');
    assert(branches.includes('const siblingLimit = 4'), 'Bounded sibling checkpoint implementation missing');
    assert(branches.includes('arraysEqual(item.lineage || [], lineage)'), 'Exact sibling lineage replacement missing');
}

console.log('NPC State 0.4.2 phase 2 bounded sibling checkpoint verification passed');

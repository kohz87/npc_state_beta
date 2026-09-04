import { CHECKPOINT_LIMIT, normalizeState, snapshotForCheckpoint } from './schema.js';

export const CHECKPOINT_BYTE_LIMIT = 4 * 1024 * 1024;

function utf8Bytes(value) {
    const text = String(value ?? '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    try { return unescape(encodeURIComponent(text)).length; } catch { return text.length * 2; }
}

export function checkpointStorageBytes(state = {}) {
    try { return utf8Bytes(JSON.stringify({ branchBase: state?.branchBase || null, checkpoints: state?.checkpoints || [] })); }
    catch { return Number.POSITIVE_INFINITY; }
}

export function pruneCheckpointPressure(state, byteLimit = CHECKPOINT_BYTE_LIMIT) {
    const next = state;
    const limit = Math.max(64 * 1024, Number(byteLimit) || CHECKPOINT_BYTE_LIMIT);
    if (!Array.isArray(next?.checkpoints)) return next;
    // Preserve at least the newest exact checkpoint plus the branch base. Oldest sibling/
    // ancestor snapshots yield first when serialized history grows too large.
    while (next.checkpoints.length > 1 && checkpointStorageBytes(next) > limit) {
        let oldest = 0;
        for (let i = 1; i < next.checkpoints.length; i += 1) {
            if (Number(next.checkpoints[i]?.createdAt || 0) < Number(next.checkpoints[oldest]?.createdAt || 0)) oldest = i;
        }
        next.checkpoints.splice(oldest, 1);
    }
    return next;
}

function fnv1a(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function canonicalAssistantMessageText(value = '') {
    const source = String(value ?? '');
    const withoutNpc = source
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*?<\/npc_state_v1\s*>/gi, '')
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*$/gi, '');
    const withoutInventory = withoutNpc
        .replace(/<!--\s*INVENTORY_BLOCK_UPDATE\b[\s\S]*?-->\.?/gi, '')
        .replace(/<!--\s*INVENTORY_BLOCK_V05\b[\s\S]*?-->/gi, '')
        .replace(/<Inventory\b[^>]*>[\s\S]*?<\/Inventory\s*>/gi, '');
    return withoutInventory.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function fingerprintMessage(message = {}) {
    const role = message.is_system ? 's' : (message.is_user ? 'u' : 'a');
    const text = role === 'a' ? canonicalAssistantMessageText(message.mes) : String(message.mes ?? '');
    return `${role}:${fnv1a(text)}`;
}

export function chatLineage(chat = [], throughMessageId = null) {
    const last = Number.isInteger(throughMessageId) ? Math.min(throughMessageId, chat.length - 1) : chat.length - 1;
    const out = [];
    for (let i = 0; i <= last; i += 1) out.push(fingerprintMessage(chat[i] || {}));
    return out;
}

export function lineageIsPrefix(prefix = [], current = []) {
    if (prefix.length > current.length) return false;
    for (let i = 0; i < prefix.length; i += 1) if (prefix[i] !== current[i]) return false;
    return true;
}

export function branchDivergenceKind(state = {}, chat = []) {
    const currentLineage = chatLineage(chat);
    const previousLineage = Array.isArray(state?.branchHeadLineage) ? state.branchHeadLineage : [];
    return lineageIsPrefix(currentLineage, previousLineage) ? 'prebaseline-truncation' : 'prebaseline-rewrite';
}

function narrativeTurnFromLineage(lineage = []) {
    return (Array.isArray(lineage) ? lineage : []).reduce((count, value) => count + (String(value || '').startsWith('a:') ? 1 : 0), 0);
}

function latestKnownNarrativeTurn(state = {}) {
    const turns = [narrativeTurnFromLineage(state?.branchHeadLineage || []), narrativeTurnFromLineage(state?.branchBase?.lineage || [])];
    for (const checkpoint of state?.checkpoints || []) turns.push(narrativeTurnFromLineage(checkpoint?.lineage || []));
    return Math.max(0, ...turns);
}

export function rebaseToCurrentChat(state, chat = []) {
    const source = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    const currentTurn = narrativeTurnFromLineage(currentLineage);
    const sourceTurn = latestKnownNarrativeTurn(source);
    const next = normalizeState(source, source.chatKey);

    next.npcs = next.npcs.map(npc => {
        const rebased = structuredClone(npc);
        rebased.present = false;
        rebased.worldActive = false;
        rebased.firstSeenMessageId = null;
        rebased.lastSeenMessageId = null;
        rebased.lastInteractionMessageId = null;
        rebased.lastActivityMessageId = null;
        if (Number.isInteger(rebased.lastActivityTurn)) {
            const inactiveAge = Math.max(0, sourceTurn - rebased.lastActivityTurn);
            rebased.lastActivityTurn = Math.max(0, currentTurn - inactiveAge);
        } else {
            rebased.lastActivityTurn = currentTurn;
        }
        if (rebased.lastRelationshipChange) rebased.lastRelationshipChange = { ...rebased.lastRelationshipChange, sourceMessageId: null, turn: null };
        rebased.relationshipHistory = (rebased.relationshipHistory || []).map(event => ({ ...event, sourceMessageId: null, turn: null }));
        return rebased;
    });
    next.socialGraph = (next.socialGraph || []).map(edge => ({ ...edge, sourceMessageId: null }));
    next.lastObservation = {
        messageId: null,
        exchangeActiveNpcIds: [],
        finalPresentNpcIds: [],
        worldActiveNpcIds: [],
        targetNpcIds: [],
    };
    next.lastScannedMessageId = null;
    next.checkpoints = [];
    next.branchBase = null;
    next.branchHeadLineage = [];
    next.branchSafety = { status: 'safe', kind: '', reason: '' };
    next.updatedAt = Date.now();
    return ensureBranchBase(normalizeState(next, source.chatKey), chat);
}

function arraysEqual(a = [], b = []) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

function latestAssistantMessageId(chat = []) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) return i;
    }
    return -1;
}

export function ensureBranchBase(state, chat = []) {
    const next = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    if (!next.branchBase?.snapshot) {
        const messageId = latestAssistantMessageId(chat);
        next.branchBase = {
            messageId: messageId >= 0 ? messageId : null,
            lineage: messageId >= 0 ? chatLineage(chat, messageId) : currentLineage,
            createdAt: Date.now(),
            snapshot: snapshotForCheckpoint(next),
        };
    }
    if (!next.branchHeadLineage.length) next.branchHeadLineage = currentLineage;
    return next;
}

export function markBranchHead(state, chat = []) {
    const next = normalizeState(state, state?.chatKey || '');
    next.branchHeadLineage = chatLineage(chat);
    return next;
}

export function recordCheckpoint(state, chat, messageId, reason = 'scan') {
    if (!Number.isInteger(messageId) || messageId < 0) return markBranchHead(state, chat);
    const next = ensureBranchBase(state, chat);
    const lineage = chatLineage(chat, messageId);
    const newestCheckpointTime = Math.max(0, ...(next.checkpoints || []).map(item => Number(item?.createdAt) || 0), Number(next.branchBase?.createdAt) || 0);
    const checkpoint = {
        messageId,
        lineage,
        reason: String(reason || 'scan').slice(0, 80),
        // Date.now() can repeat inside rapid swipe/regeneration churn. Keep checkpoint
        // recency strictly monotonic so bounded sibling eviction is deterministic.
        createdAt: Math.max(Date.now(), newestCheckpointTime + 1),
        snapshot: snapshotForCheckpoint(next),
    };
    // Keep several exact content-lineage siblings for one assistant message instead of
    // collapsing every swipe/regeneration onto a single rollback slot. The cap prevents a
    // swipe-heavy message from consuming the whole global checkpoint window. The embedded
    // per-swipe payload remains the fallback after an older sibling snapshot is evicted.
    const siblingLimit = 4;
    const exact = next.checkpoints.findIndex(item => item.messageId === messageId && arraysEqual(item.lineage || [], lineage));
    if (exact >= 0) next.checkpoints[exact] = checkpoint;
    else next.checkpoints.push(checkpoint);
    const siblings = next.checkpoints
        .filter(item => item.messageId === messageId)
        .sort((a, b) => b.createdAt - a.createdAt);
    const evictedSiblingKeys = new Set(siblings.slice(siblingLimit).map(item => JSON.stringify(item.lineage || [])));
    if (evictedSiblingKeys.size) {
        next.checkpoints = next.checkpoints.filter(item => item.messageId !== messageId || !evictedSiblingKeys.has(JSON.stringify(item.lineage || [])));
    }
    next.checkpoints.sort((a, b) => a.lineage.length - b.lineage.length || a.createdAt - b.createdAt);
    if (next.checkpoints.length > CHECKPOINT_LIMIT) next.checkpoints.splice(0, next.checkpoints.length - CHECKPOINT_LIMIT);
    pruneCheckpointPressure(next);
    next.branchHeadLineage = chatLineage(chat);
    return next;
}

export function bestCheckpoint(state, chat) {
    const lineage = chatLineage(chat);
    let best = null;
    for (const checkpoint of state?.checkpoints || []) {
        if (!checkpoint?.snapshot || !lineageIsPrefix(checkpoint.lineage || [], lineage)) continue;
        if (!best || checkpoint.lineage.length > best.lineage.length || (checkpoint.lineage.length === best.lineage.length && checkpoint.createdAt > best.createdAt)) best = checkpoint;
    }
    const base = state?.branchBase;
    if (base?.snapshot && lineageIsPrefix(base.lineage || [], lineage)) {
        const candidate = { ...base, reason: 'v3-baseline', isBranchBase: true };
        if (!best || candidate.lineage.length > best.lineage.length || (candidate.lineage.length === best.lineage.length && candidate.createdAt > best.createdAt)) best = candidate;
    }
    return best;
}

function preserveCurrentPresentation(restored, current) {
    const currentById = new Map((current?.npcs || []).map(npc => [npc.id, npc]));
    restored.npcs = (restored.npcs || []).map(npc => {
        const live = currentById.get(npc.id);
        return live?.portrait ? { ...npc, portrait: structuredClone(live.portrait) } : npc;
    });
    return restored;
}

function preserveTombstones(restored, current) {
    const tombstones = new Set(current.deletedNpcIds || []);
    for (const id of restored.deletedNpcIds || []) tombstones.add(id);
    restored.deletedNpcIds = [...tombstones];
    restored.npcs = restored.npcs.filter(npc => !tombstones.has(npc.id));
    return restored;
}

function failClosedPrebaselineDivergence(state, chat) {
    const next = normalizeState(state, state?.chatKey || '');
    const kind = next.branchSafety?.kind || branchDivergenceKind(next, chat);
    for (const npc of next.npcs) {
        npc.present = false;
        npc.worldActive = false;
    }
    next.lastObservation = {
        messageId: null,
        exchangeActiveNpcIds: [],
        finalPresentNpcIds: [],
        worldActiveNpcIds: [],
        targetNpcIds: [],
    };
    next.lastScannedMessageId = null;
    next.branchSafety = {
        status: 'rebase-required',
        kind,
        reason: kind === 'prebaseline-truncation'
            ? 'The chat was truncated before NPC State\'s oldest recoverable checkpoint. Durable dossiers remain intact, but the current timeline must be explicitly rebased before live scanning resumes.'
            : 'The chat was rewritten before NPC State\'s oldest recoverable checkpoint. Durable dossiers remain intact, but the current timeline must be explicitly rebased before live scanning resumes.',
    };
    next.updatedAt = Date.now();
    return next;
}

export function reconcileToCurrentBranch(state, chat) {
    const normalized = ensureBranchBase(state, chat);
    const currentLineage = chatLineage(chat);
    if (lineageIsPrefix(normalized.branchHeadLineage || [], currentLineage)) {
        if (normalized.branchSafety?.status === 'safe') return { changed: false, unsafeDivergence: false, state: normalized, checkpoint: bestCheckpoint(normalized, chat) };
    }

    const checkpoint = bestCheckpoint(normalized, chat);
    if (!checkpoint) {
        const failed = failClosedPrebaselineDivergence(normalized, chat);
        return { changed: true, unsafeDivergence: true, state: failed, checkpoint: null };
    }

    const restored = preserveCurrentPresentation(preserveTombstones(normalizeState(checkpoint.snapshot, normalized.chatKey), normalized), normalized);
    restored.checkpoints = structuredClone(normalized.checkpoints || []);
    restored.branchBase = structuredClone(normalized.branchBase || null);
    restored.branchHeadLineage = currentLineage;
    restored.branchSafety = { status: 'safe', kind: '', reason: '' };
    restored.updatedAt = Date.now();
    return { changed: true, unsafeDivergence: false, state: restored, checkpoint };
}

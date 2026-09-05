import { CHECKPOINT_LIMIT, RELATIONSHIP_AXES, RELATIONSHIP_MILESTONE_THRESHOLDS, STABLE_PROFILE_FIELDS, emptyRelationshipChange, normalizeRelationship, normalizeRelationshipProgress, normalizeState, snapshotForCheckpoint } from './schema.js';

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

export function branchDivergenceMessageId(state = {}, chat = []) {
    const previous = Array.isArray(state?.branchHeadLineage) && state.branchHeadLineage.length
        ? state.branchHeadLineage
        : (Array.isArray(state?.branchBase?.lineage) ? state.branchBase.lineage : []);
    if (!previous.length) return null;
    const current = chatLineage(chat);
    const shared = Math.min(previous.length, current.length);
    for (let i = 0; i < shared; i += 1) if (previous[i] !== current[i]) return i;
    return previous.length === current.length ? null : shared;
}

function discardedRelationshipEvent(event, divergenceMessageId) {
    return Number.isInteger(divergenceMessageId)
        && Number.isInteger(event?.sourceMessageId)
        && event.sourceMessageId >= divergenceMessageId
        && String(event?.impact || '').toLocaleLowerCase() !== 'manual';
}

function relationshipEventKey(event = {}) {
    return [
        Number.isInteger(event?.sourceMessageId) ? event.sourceMessageId : '',
        String(event?.impact || '').trim().toLocaleLowerCase(),
        String(event?.evidence || '').trim().toLocaleLowerCase().replace(/\s+/g, ' '),
    ].join('|');
}

function relationshipNumbersEqual(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.000001;
}

function relationshipEventAfter(event, anchor) {
    if (!anchor) return true;
    const eventMessage = Number.isInteger(event?.sourceMessageId) ? event.sourceMessageId : null;
    const anchorMessage = Number.isInteger(anchor?.sourceMessageId) ? anchor.sourceMessageId : null;
    if (eventMessage !== null && anchorMessage !== null && eventMessage !== anchorMessage) return eventMessage > anchorMessage;
    const eventAt = Number(event?.at) || 0;
    const anchorAt = Number(anchor?.at) || 0;
    if (eventAt && anchorAt) return eventAt > anchorAt;
    return false;
}
function latestManualRelationshipAnchors(history = [], divergenceMessageId = null) {
    const anchors = new Map();
    for (const event of history) {
        if (String(event?.impact || '').toLocaleLowerCase() !== 'manual') continue;
        if (!Number.isInteger(event?.sourceMessageId) || event.sourceMessageId < divergenceMessageId) continue;
        for (const axis of RELATIONSHIP_AXES) {
            if (Number(event?.delta?.[axis]) === 0) continue;
            const prior = anchors.get(axis);
            if (!prior || relationshipEventAfter(event, prior)) anchors.set(axis, event);
        }
    }
    return anchors;
}

export function rollbackRebasedRelationship(npcInput = {}, divergenceMessageId = null) {
    const npc = structuredClone(npcInput || {});
    if (!Number.isInteger(divergenceMessageId)) return npc;

    let relationship = normalizeRelationship(npc.relationship);
    let progress = normalizeRelationshipProgress(npc.relationshipProgress);
    const history = Array.isArray(npc.relationshipHistory) ? npc.relationshipHistory : [];
    const diagnostics = Array.isArray(npc.relationshipDiagnostics) ? npc.relationshipDiagnostics : [];
    const evidenceHistory = Array.isArray(npc.relationshipEvidenceHistory) ? npc.relationshipEvidenceHistory : [];
    const milestones = Array.isArray(npc.relationshipMilestones) ? npc.relationshipMilestones : [];
    const manualAnchorByAxis = latestManualRelationshipAnchors(history, divergenceMessageId);
    const affectedAxes = new Set();

    // Recent diagnostics contain exact before/after integer and fractional state. Walk
    // them backwards first so a recent abandoned gate crossing can be restored exactly.
    const coveredSourceAxes = new Set();
    const staleDiagnostics = diagnostics
        .filter(event => discardedRelationshipEvent(event, divergenceMessageId))
        .sort((a, b) => Number(b?.sourceMessageId || -1) - Number(a?.sourceMessageId || -1) || Number(b?.at || 0) - Number(a?.at || 0));
    for (const event of staleDiagnostics) {
        const key = relationshipEventKey(event);
        for (const axis of RELATIONSHIP_AXES) {
            const manualAnchor = manualAnchorByAxis.get(axis);
            if (manualAnchor && !relationshipEventAfter(event, manualAnchor)) continue;
            const beforeScore = Number(event?.before?.[axis]) || 0;
            const afterScore = Number(event?.after?.[axis]) || 0;
            const beforeProgress = Number(event?.progressBefore?.[axis]) || 0;
            const afterProgress = Number(event?.progressAfter?.[axis]) || 0;
            if (beforeScore === afterScore && relationshipNumbersEqual(beforeProgress, afterProgress)) continue;
            if (relationship[axis] !== afterScore || !relationshipNumbersEqual(progress[axis], afterProgress)) continue;
            relationship[axis] = beforeScore;
            progress[axis] = beforeProgress;
            coveredSourceAxes.add(String(event?.sourceMessageId ?? '') + '|' + axis);
            affectedAxes.add(axis);
        }
    }

    // Older diagnostics are bounded. Visible history retains the actual displayed delta,
    // so use it as the next rollback tier when no exact diagnostic covered that event.
    for (const event of history.filter(item => discardedRelationshipEvent(item, divergenceMessageId))) {
        const key = relationshipEventKey(event);
        for (const axis of RELATIONSHIP_AXES) {
            const manualAnchor = manualAnchorByAxis.get(axis);
            if ((manualAnchor && !relationshipEventAfter(event, manualAnchor)) || coveredSourceAxes.has(String(event?.sourceMessageId ?? '') + '|' + axis)) continue;
            const delta = Number(event?.delta?.[axis]) || 0;
            if (!delta) continue;
            relationship[axis] = Math.max(-100, Math.min(100, relationship[axis] - delta));
            progress[axis] = 0;
            affectedAxes.add(axis);
        }
    }

    // Raw evidence history can contain accepted sub-point movement that never produced a
    // visible history row. If exact diagnostics did not cover it, drop only that axis's
    // ambiguous fractional residue rather than carrying discarded-branch progress forward.
    for (const event of evidenceHistory.filter(item => discardedRelationshipEvent(item, divergenceMessageId))) {
        const key = relationshipEventKey(event);
        for (const axis of RELATIONSHIP_AXES) {
            const manualAnchor = manualAnchorByAxis.get(axis);
            if ((manualAnchor && !relationshipEventAfter(event, manualAnchor)) || coveredSourceAxes.has(String(event?.sourceMessageId ?? '') + '|' + axis)) continue;
            if (Number(event?.delta?.[axis]) === 0) continue;
            progress[axis] = 0;
            affectedAxes.add(axis);
        }
    }

    const removedMilestones = milestones.filter(entry => Number.isInteger(entry?.sourceMessageId) && entry.sourceMessageId >= divergenceMessageId);
    const keptMilestones = milestones.filter(entry => !Number.isInteger(entry?.sourceMessageId) || entry.sourceMessageId < divergenceMessageId);

    // If the exact score-changing event has fallen out of bounded history, removing the
    // abandoned unlock alone could leave a score illegally beyond a locked gate. Clamp to
    // the first removed boundary that no surviving/manual milestone still authorizes.
    const orderedRemoved = [...removedMilestones].sort((a, b) => Number(a?.threshold || 0) - Number(b?.threshold || 0));
    for (const entry of orderedRemoved) {
        const axis = String(entry?.axis || '').trim().toLocaleLowerCase();
        const polarity = Math.sign(Number(entry?.polarity));
        const threshold = Number(entry?.threshold);
        if (!RELATIONSHIP_AXES.includes(axis) || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;
        const stillUnlocked = keptMilestones.some(item => String(item?.axis || '').trim().toLocaleLowerCase() === axis
            && Math.sign(Number(item?.polarity)) === polarity && Number(item?.threshold) === threshold);
        if (stillUnlocked || Math.sign(relationship[axis]) !== polarity || Math.abs(relationship[axis]) < threshold) continue;
        relationship[axis] = polarity * threshold;
        progress[axis] = 0;
        affectedAxes.add(axis);
    }

    npc.relationship = normalizeRelationship(relationship);
    npc.relationshipProgress = normalizeRelationshipProgress(progress);
    npc.relationshipMilestones = keptMilestones;
    npc.relationshipHistory = history.filter(event => !discardedRelationshipEvent(event, divergenceMessageId));
    npc.relationshipEvidenceHistory = evidenceHistory.filter(event => !discardedRelationshipEvent(event, divergenceMessageId));
    npc.relationshipDiagnostics = diagnostics.filter(event => !discardedRelationshipEvent(event, divergenceMessageId));
    if (discardedRelationshipEvent(npc.lastRelationshipChange, divergenceMessageId)) {
        npc.lastRelationshipChange = npc.relationshipHistory.length
            ? structuredClone(npc.relationshipHistory[npc.relationshipHistory.length - 1])
            : emptyRelationshipChange();
    }
    const discardedNarrativeRelationship = history.some(event => discardedRelationshipEvent(event, divergenceMessageId))
        || evidenceHistory.some(event => discardedRelationshipEvent(event, divergenceMessageId))
        || diagnostics.some(event => discardedRelationshipEvent(event, divergenceMessageId));
    if (affectedAxes.size || removedMilestones.length || discardedNarrativeRelationship) npc.relationshipSummary = '';
    return npc;
}

export function rebaseToCurrentChat(state, chat = []) {
    const source = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    const currentTurn = narrativeTurnFromLineage(currentLineage);
    const sourceTurn = latestKnownNarrativeTurn(source);
    const divergenceMessageId = branchDivergenceMessageId(source, chat);
    const latestAssistantId = latestAssistantMessageId(chat);
    const preserveLatestScannedMessage = divergenceMessageId === null
        && Number.isInteger(source.lastScannedMessageId)
        && source.lastScannedMessageId === latestAssistantId;
    const next = normalizeState(source, source.chatKey);

    next.npcs = next.npcs.map(npc => {
        const rebased = rollbackRebasedRelationship(npc, divergenceMessageId);
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
        // Surviving relationship milestones become part of the newly accepted branch base.
        // Clear old message provenance so a later rebase cannot discard an already accepted unlock.
        rebased.relationshipMilestones = (rebased.relationshipMilestones || []).map(entry => ({ ...entry, sourceMessageId: null, turn: null }));
        // Recent evidence/diagnostics are timeline-local and must not survive the rebase.
        rebased.relationshipEvidenceHistory = [];
        rebased.relationshipDiagnostics = [];
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
    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;
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
    const stableFields = new Set(STABLE_PROFILE_FIELDS);
    restored.npcs = (restored.npcs || []).map(npc => {
        const live = currentById.get(npc.id);
        if (!live) return npc;
        const next = { ...npc };
        if (live.portrait) next.portrait = structuredClone(live.portrait);
        const locked = [...new Set(Array.isArray(live.manualProfileFields) ? live.manualProfileFields : [])];
        next.manualProfileFields = structuredClone(locked);
        for (const field of locked) {
            if (stableFields.has(field)) next[field] = structuredClone(live[field]);
        }
        // Importance became editor-owned in 0.4.13, so branch history must not undo it.
        next.importance = Number(live.importance) || 0;
        return next;
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

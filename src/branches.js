import { CHECKPOINT_LIMIT, MANUAL_OVERRIDE_FIELDS, RELATIONSHIP_AXES, RELATIONSHIP_MILESTONE_THRESHOLDS, STABLE_PROFILE_FIELDS, emptyRelationshipChange, normalizeManualRelationshipCorrections, normalizeManualRelationshipCorrectionUnresolvedAxes, normalizeNpc, normalizeRelationship, normalizeRelationshipMilestones, normalizeRelationshipProgress, normalizeState, snapshotForCheckpoint } from './schema.js';

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
    const discardedLastChange = discardedRelationshipEvent(npc.lastRelationshipChange, divergenceMessageId);
    if (discardedLastChange) {
        npc.lastRelationshipChange = npc.relationshipHistory.length
            ? structuredClone(npc.relationshipHistory[npc.relationshipHistory.length - 1])
            : emptyRelationshipChange();
    }
    const discardedNarrativeRelationship = history.some(event => discardedRelationshipEvent(event, divergenceMessageId))
        || evidenceHistory.some(event => discardedRelationshipEvent(event, divergenceMessageId))
        || diagnostics.some(event => discardedRelationshipEvent(event, divergenceMessageId));
    if (affectedAxes.size || removedMilestones.length || discardedNarrativeRelationship || discardedLastChange) npc.relationshipSummary = '';
    return npc;
}

export function normalizeRebaseRelationshipMode(value = 'preserve') {
    const mode = String(value ?? 'preserve').trim().toLocaleLowerCase() || 'preserve';
    if (mode !== 'preserve' && mode !== 'rollback') {
        const error = new Error('Relationship rebase mode must be preserve or rollback.');
        error.code = 'NPC_STATE_V04_BETA_REBASE_RELATIONSHIP_MODE';
        throw error;
    }
    return mode;
}

// old message ids/event keys are retained only in original* audit fields.
function quarantineRebasedRelationshipAudit(entry, rebasedAt) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const originalSourceMessageId = Number.isInteger(entry.originalSourceMessageId)
        ? entry.originalSourceMessageId
        : (Number.isInteger(entry.sourceMessageId) ? entry.sourceMessageId : null);
    const originalSourceEventKey = String(entry.originalSourceEventKey || entry.sourceEventKey || '').slice(0, 240);
    const next = {
        ...entry,
        sourceMessageId: null,
        turn: null,
        timelineStatus: 'accepted-pre-rebase',
        originalSourceMessageId,
        rebasedAt,
    };
    if (Object.prototype.hasOwnProperty.call(entry, 'sourceEventKey') || originalSourceEventKey) {
        next.originalSourceEventKey = originalSourceEventKey;
        next.sourceEventKey = '';
    }
    return next;
}

export function previewRelationshipRebase(state, chat = [], { relationshipMode = 'rollback' } = {}) {
    const mode = normalizeRebaseRelationshipMode(relationshipMode);
    const source = normalizeState(state, state?.chatKey || '');
    const divergenceMessageId = branchDivergenceMessageId(source, chat);
    if (mode === 'preserve') return { relationshipMode: mode, divergenceMessageId, affectedNpcs: [] };
    const affectedNpcs = [];
    for (const npc of source.npcs || []) {
        const rolled = rollbackRebasedRelationship(npc, divergenceMessageId);
        const axes = RELATIONSHIP_AXES.filter(axis => Number(npc.relationship?.[axis] || 0) !== Number(rolled.relationship?.[axis] || 0));
        const historyRemoved = Math.max(0, (npc.relationshipHistory || []).length - (rolled.relationshipHistory || []).length);
        const milestonesRemoved = Math.max(0, (npc.relationshipMilestones || []).length - (rolled.relationshipMilestones || []).length);
        const evidenceRemoved = Math.max(0, (npc.relationshipEvidenceHistory || []).length - (rolled.relationshipEvidenceHistory || []).length);
        const diagnosticsRemoved = Math.max(0, (npc.relationshipDiagnostics || []).length - (rolled.relationshipDiagnostics || []).length);
        const summaryCleared = Boolean(npc.relationshipSummary) && !rolled.relationshipSummary;
        if (!axes.length && !historyRemoved && !milestonesRemoved && !evidenceRemoved && !diagnosticsRemoved && !summaryCleared) continue;
        affectedNpcs.push({
            npcId: npc.id,
            name: npc.name,
            before: structuredClone(npc.relationship),
            after: structuredClone(rolled.relationship),
            progressBefore: structuredClone(npc.relationshipProgress),
            progressAfter: structuredClone(rolled.relationshipProgress),
            axes,
            historyRemoved,
            milestonesRemoved,
            evidenceRemoved,
            diagnosticsRemoved,
            summaryCleared,
        });
    }
    return { relationshipMode: mode, divergenceMessageId, affectedNpcs };
}

function retainValidRelationshipReplayBoundary(boundary, chat = []) {
    if (!Number.isInteger(boundary?.throughMessageId) || boundary.throughMessageId < 0 || !Array.isArray(boundary?.lineage)) return null;
    const acceptedLineage = boundary.lineage.map(value => String(value || ''));
    const currentLineage = chatLineage(chat);
    const limit = Math.min(boundary.throughMessageId, acceptedLineage.length - 1, currentLineage.length - 1);
    let throughMessageId = -1;
    for (let i = 0; i <= limit; i += 1) {
        if (acceptedLineage[i] !== currentLineage[i]) break;
        if (String(acceptedLineage[i] || '').startsWith('a:')) throughMessageId = i;
    }
    if (throughMessageId < 0) return null;
    return {
        throughMessageId,
        lineage: acceptedLineage.slice(0, throughMessageId + 1),
        acceptedAt: Number(boundary.acceptedAt) || null,
    };
}

export function rebaseToCurrentChat(state, chat = [], { relationshipMode = 'preserve' } = {}) {
    const mode = normalizeRebaseRelationshipMode(relationshipMode);
    const source = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    const currentTurn = narrativeTurnFromLineage(currentLineage);
    const sourceTurn = latestKnownNarrativeTurn(source);
    const divergenceMessageId = branchDivergenceMessageId(source, chat);
    const latestAssistantId = latestAssistantMessageId(chat);
    const preserveLatestScannedMessage = divergenceMessageId === null
        && Number.isInteger(source.lastScannedMessageId)
        && source.lastScannedMessageId === latestAssistantId;
    const rebasedAt = Date.now();
    const preRebaseSnapshot = snapshotForCheckpoint(source);
    const next = normalizeState(source, source.chatKey);

    next.npcs = next.npcs.map(npc => {
        const rebased = mode === 'rollback' ? rollbackRebasedRelationship(npc, divergenceMessageId) : structuredClone(npc);
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
        if (rebased.lastRelationshipChange) rebased.lastRelationshipChange = quarantineRebasedRelationshipAudit(rebased.lastRelationshipChange, rebasedAt);
        rebased.relationshipHistory = (rebased.relationshipHistory || []).map(event => quarantineRebasedRelationshipAudit(event, rebasedAt));
        rebased.relationshipMilestones = (rebased.relationshipMilestones || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        rebased.relationshipEvidenceHistory = (rebased.relationshipEvidenceHistory || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        rebased.relationshipDiagnostics = (rebased.relationshipDiagnostics || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        return rebased;
    });
    next.socialGraph = (next.socialGraph || []).map(edge => ({ ...edge, sourceMessageId: null }));
    next.lastObservation = { messageId: null, exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], targetNpcIds: [] };
    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;
    // preserved relationship state already represents the accepted timeline through this boundary.
    next.relationshipReplayBoundary = mode === 'preserve' && latestAssistantId >= 0
        ? { throughMessageId: latestAssistantId, lineage: chatLineage(chat, latestAssistantId), acceptedAt: rebasedAt }
        : retainValidRelationshipReplayBoundary(source.relationshipReplayBoundary, chat);
    next.checkpoints = [];
    next.branchBase = null;
    next.branchHeadLineage = [];
    next.branchSafety = { status: 'safe', kind: '', reason: '' };
    next.rebaseBackup = {
        createdAt: rebasedAt,
        relationshipMode: mode,
        divergenceMessageId,
        sourceLastScannedMessageId: Number.isInteger(source.lastScannedMessageId) ? source.lastScannedMessageId : null,
        sourceLineage: Array.isArray(source.branchHeadLineage) ? [...source.branchHeadLineage] : [],
        snapshot: preRebaseSnapshot,
    };
    next.updatedAt = rebasedAt;
    return ensureBranchBase(normalizeState(next, source.chatKey), chat);
}

function arraysEqual(a = [], b = []) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function latestAssistantMessageId(chat = []) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) return i;
    }
    return -1;
}

export function ensureBranchBase(state, chat = []) {
    const next = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    const trusted = ['pre-update', 'accepted-current', 'pre-story'].includes(String(next.branchBase?.boundaryKind || ''));
    if (!next.branchBase?.snapshot || !trusted) {
        const messageId = latestAssistantMessageId(chat);
        next.branchBase = {
            messageId: messageId >= 0 ? messageId : null,
            lineage: currentLineage,
            boundaryKind: 'accepted-current',
            sourceMessageId: messageId >= 0 ? messageId : null,
            sourceFingerprint: messageId >= 0 ? fingerprintMessage(chat[messageId] || {}) : '',
            precedingLineage: messageId > 0 ? chatLineage(chat, messageId - 1) : [],
            chatKey: String(next.chatKey || ''),
            createdAt: Date.now(),
            snapshot: snapshotForCheckpoint(next),
        };
    }
    if (!next.branchHeadLineage.length) next.branchHeadLineage = currentLineage;
    return next;
}

function exchangeStartMessageId(chat = [], sourceMessageId = null) {
    if (!Number.isInteger(sourceMessageId) || sourceMessageId < 0 || sourceMessageId >= chat.length) return null;
    let start = sourceMessageId;
    for (let i = sourceMessageId - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        if (message.is_user) start = i;
        break;
    }
    return start;
}

export function ensurePreUpdateBaseline(state, chat = [], sourceMessageId = null) {
    const next = normalizeState(state, state?.chatKey || '');
    const trusted = ['pre-update', 'accepted-current', 'pre-story'].includes(String(next.branchBase?.boundaryKind || ''));
    if (next.branchBase?.snapshot && trusted) return next;
    const exchangeStart = exchangeStartMessageId(chat, sourceMessageId);
    if (exchangeStart === null) return next;
    const boundaryMessageId = exchangeStart - 1;
    const precedingLineage = boundaryMessageId >= 0 ? chatLineage(chat, boundaryMessageId) : [];
    next.branchBase = {
        messageId: boundaryMessageId >= 0 ? boundaryMessageId : null,
        lineage: precedingLineage,
        boundaryKind: 'pre-update',
        sourceMessageId,
        sourceFingerprint: fingerprintMessage(chat[sourceMessageId] || {}),
        precedingLineage,
        chatKey: String(next.chatKey || ''),
        createdAt: Date.now(),
        snapshot: snapshotForCheckpoint(next),
    };
    if (!next.branchHeadLineage.length) next.branchHeadLineage = precedingLineage;
    return next;
}

export function markBranchHead(state, chat = []) {
    const next = normalizeState(state, state?.chatKey || '');
    next.branchHeadLineage = chatLineage(chat);
    return next;
}

export function recordCheckpoint(state, chat, messageId, reason = 'scan') {
    if (!Number.isInteger(messageId) || messageId < 0) return markBranchHead(state, chat);
    const next = normalizeState(state, state?.chatKey || '');
    const lineage = chatLineage(chat, messageId);
    const precedingLineage = messageId > 0 ? chatLineage(chat, messageId - 1) : [];
    const newestCheckpointTime = Math.max(0, ...(next.checkpoints || []).map(item => Number(item?.createdAt) || 0), Number(next.branchBase?.createdAt) || 0);
    const checkpoint = {
        messageId,
        lineage,
        boundaryKind: 'post-update',
        sourceMessageId: messageId,
        sourceFingerprint: fingerprintMessage(chat[messageId] || {}),
        precedingLineage,
        chatKey: String(next.chatKey || ''),
        reason: String(reason || 'scan').slice(0, 80),
        // Time is diagnostic/eviction metadata only. Narrative ownership is lineage based.
        createdAt: Math.max(Date.now(), newestCheckpointTime + 1),
        snapshot: snapshotForCheckpoint(next),
    };
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

function retargetSnapshotChatKey(snapshot, chatKey) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
    return { ...structuredClone(snapshot), chatKey: String(chatKey || '') };
}

export function retargetCheckpointOwnership(stateInput, chatKey) {
    const key = String(chatKey || '').trim();
    const next = normalizeState(stateInput, key || stateInput?.chatKey || '');
    if (!key) return next;
    next.chatKey = key;
    if (next.branchBase) {
        next.branchBase = {
            ...next.branchBase,
            chatKey: key,
            snapshot: retargetSnapshotChatKey(next.branchBase.snapshot, key),
        };
    }
    next.checkpoints = (next.checkpoints || []).map(checkpoint => ({
        ...checkpoint,
        chatKey: key,
        snapshot: retargetSnapshotChatKey(checkpoint.snapshot, key),
    }));
    if (next.rebaseBackup?.snapshot) {
        next.rebaseBackup = {
            ...next.rebaseBackup,
            snapshot: retargetSnapshotChatKey(next.rebaseBackup.snapshot, key),
        };
    }
    return normalizeState(next, key);
}

function checkpointChatOwned(state, boundary) {
    const owner = String(boundary?.chatKey || '').trim();
    return !owner || owner === String(state?.chatKey || '').trim();
}

function trustedBranchBase(state, base) {
    return Boolean(
        base?.snapshot
        && checkpointChatOwned(state, base)
        && ['pre-update', 'accepted-current', 'pre-story'].includes(String(base.boundaryKind || ''))
    );
}

export function bestCheckpoint(state, chat) {
    const lineage = chatLineage(chat);
    let best = null;
    for (const checkpoint of state?.checkpoints || []) {
        if (!checkpoint?.snapshot || !checkpointChatOwned(state, checkpoint) || !lineageIsPrefix(checkpoint.lineage || [], lineage)) continue;
        if (!best || checkpoint.lineage.length > best.lineage.length || (checkpoint.lineage.length === best.lineage.length && checkpoint.createdAt > best.createdAt)) best = checkpoint;
    }
    const base = state?.branchBase;
    if (trustedBranchBase(state, base) && lineageIsPrefix(base.lineage || [], lineage)) {
        const candidate = { ...base, reason: 'trusted-baseline', isBranchBase: true };
        if (!best || candidate.lineage.length > best.lineage.length || (candidate.lineage.length === best.lineage.length && candidate.createdAt > best.createdAt)) best = candidate;
    }
    return best;
}

function manualRelationshipEventKey(item = {}) {
    return [Number(item?.at) || 0, String(item?.reason || ''), JSON.stringify(normalizeRelationship(item?.delta || {}))].join('|');
}

function relationshipCorrectionState(npc = {}) {
    return normalizeManualRelationshipCorrections(
        npc?.manualRelationshipCorrections,
        npc?.manualRelationshipCorrectionRevision,
    );
}

function relationshipCorrectionUnresolvedAxes(npc = {}) {
    return normalizeManualRelationshipCorrectionUnresolvedAxes(npc?.manualRelationshipCorrectionUnresolvedAxes);
}

function applyAbsoluteRelationshipAxes(npcInput, corrections = []) {
    const next = structuredClone(npcInput || {});
    let relationship = normalizeRelationship(next.relationship || {});
    const progress = normalizeRelationshipProgress(next.relationshipProgress || {});
    const changedAxes = new Set();
    for (const correction of corrections) {
        const axis = String(correction?.axis || '').trim().toLocaleLowerCase();
        if (!RELATIONSHIP_AXES.includes(axis)) continue;
        const value = normalizeRelationship({ [axis]: correction.value })[axis];
        if (relationship[axis] !== value) changedAxes.add(axis);
        relationship[axis] = value;
        progress[axis] = 0;
    }
    next.relationship = relationship;
    next.relationshipProgress = progress;
    if (changedAxes.size) {
        const inferred = normalizeRelationshipMilestones([], relationship, { inferFromRelationship: true, includeBoundary: true })
            .filter(entry => changedAxes.has(entry.axis));
        next.relationshipMilestones = normalizeRelationshipMilestones(
            [...(next.relationshipMilestones || []), ...inferred], relationship, { inferFromRelationship: false });
    }
    return next;
}

function preserveDurableManualRelationshipCorrections(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    const liveState = relationshipCorrectionState(liveNpc);
    if (liveState.revision <= 0 && !liveState.corrections.length) return null;
    const restoredState = relationshipCorrectionState(restoredNpc);
    const restoredByAxis = new Map(restoredState.corrections.map(item => [item.axis, item]));
    const liveCorrections = liveState.corrections.map(item => structuredClone(item));
    const pending = [];
    for (const correction of liveCorrections) {
        if (restoredByAxis.get(correction.axis)?.revision === correction.revision) continue;
        const equivalent = legacyCorrectionEquivalentToRestored(restoredOwnershipNpc, correction);
        if (equivalent.matches) {
            if (!correction.legacyOriginKey && equivalent.originKey) correction.legacyOriginKey = equivalent.originKey;
            continue;
        }
        pending.push(correction);
    }
    let next = applyAbsoluteRelationshipAxes(restoredNpc, pending);
    next.manualRelationshipCorrectionVersion = liveState.version;
    next.manualRelationshipCorrectionRevision = liveState.revision;
    next.manualRelationshipCorrections = liveCorrections;
    return { npc: normalizeNpc(next), limitations: [] };
}

function legacyRelationshipOverrideIdentity(npc = {}) {
    const overrides = npc?.manualOverrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
        || !Object.prototype.hasOwnProperty.call(overrides, 'relationship')) return null;
    const meta = npc?.manualOverrideMeta?.relationship;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
    const sourceMessageId = Number.isInteger(meta.sourceMessageId) ? meta.sourceMessageId : null;
    const at = Number(meta.at) || null;
    if (sourceMessageId === null) return null;
    return { relationship: normalizeRelationship(overrides.relationship || {}), sourceMessageId, at };
}

function sameLegacyRelationshipOverride(leftNpc, rightNpc) {
    const left = legacyRelationshipOverrideIdentity(leftNpc);
    const right = legacyRelationshipOverrideIdentity(rightNpc);
    if (!left || !right) return false;
    return left.sourceMessageId === right.sourceMessageId
        && left.at === right.at
        && RELATIONSHIP_AXES.every(axis => left.relationship[axis] === right.relationship[axis]);
}

function legacyRelationshipOriginKey(npc, axis) {
    const key = String(axis || '').trim().toLocaleLowerCase();
    const identity = legacyRelationshipOverrideIdentity(npc);
    if (!identity || !RELATIONSHIP_AXES.includes(key)) return '';
    return ['legacy-v1', key, identity.sourceMessageId, identity.at ?? '',
        ...RELATIONSHIP_AXES.map(item => identity.relationship[item])].join('|');
}

function legacyCorrectionEquivalentToRestored(restoredNpc, correction = {}) {
    const axis = String(correction?.axis || '').trim().toLocaleLowerCase();
    if (!RELATIONSHIP_AXES.includes(axis)) return { matches: false, originKey: '' };
    const identity = legacyRelationshipOverrideIdentity(restoredNpc);
    if (!identity) return { matches: false, originKey: '' };
    const originKey = legacyRelationshipOriginKey(restoredNpc, axis);
    if (correction.legacyOriginKey) return { matches: correction.legacyOriginKey === originKey, originKey };

    // v0.7.3 migration records predate legacyOriginKey. Bridge them conservatively from
    // the exact legacy override provenance they were derived from, then persist the key.
    const matched = matchingLegacyManualEvent(restoredNpc, identity);
    const expectedAt = identity.at || Number(matched?.at) || null;
    const correctionAt = Number(correction?.at) || null;
    const correctionSource = Number.isInteger(correction?.sourceMessageId) ? correction.sourceMessageId : null;
    const correctionValue = normalizeRelationship({ [axis]: correction?.value })[axis];
    const eventProvesAxis = Boolean(matched && manualRelationshipEventAxes(matched).includes(axis));
    const matches = correctionSource === identity.sourceMessageId
        && correctionAt === expectedAt
        && correctionValue === identity.relationship[axis]
        && (identity.at !== null || eventProvesAxis);
    return { matches, originKey: matches ? originKey : '' };
}

function retireLegacyRelationshipOverride(npcInput) {
    const next = structuredClone(npcInput || {});
    const overrides = { ...(next.manualOverrides || {}) };
    const meta = { ...(next.manualOverrideMeta || {}) };
    delete overrides.relationship;
    delete meta.relationship;
    next.manualOverrides = overrides;
    next.manualOverrideMeta = meta;
    next.manualRelationshipCorrectionUnresolvedAxes = [];
    return next;
}

function matchingLegacyManualEvent(liveNpc, identity) {
    if (!identity) return null;
    const events = legacyManualRelationshipEvents(liveNpc)
        .filter(item => identity.sourceMessageId === null || item?.sourceMessageId === identity.sourceMessageId)
        .filter(item => !identity.at || !Number(item?.at) || Number(item.at) <= identity.at)
        .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
    return events[0] || null;
}


function hasLegacyRelationshipOverride(npc = {}) {
    const overrides = npc?.manualOverrides;
    return Boolean(overrides && typeof overrides === 'object' && !Array.isArray(overrides)
        && Object.prototype.hasOwnProperty.call(overrides, 'relationship'));
}

function manualRelationshipEventAxes(item = {}) {
    return RELATIONSHIP_AXES.filter(axis => Number(item?.delta?.[axis]) !== 0);
}

function modernManualRelationshipEvent(event = {}, modernState = { corrections: [] }) {
    const axes = manualRelationshipEventAxes(event);
    const eventAt = Number(event?.at) || 0;
    if (!axes.length || !eventAt) return false;
    const byAxis = new Map((modernState?.corrections || []).map(item => [item.axis, item]));
    const eventSource = Number.isInteger(event?.sourceMessageId) ? event.sourceMessageId : null;
    return axes.every(axis => {
        const correction = byAxis.get(axis);
        const correctionSource = Number.isInteger(correction?.sourceMessageId) ? correction.sourceMessageId : null;
        return correction && Number(correction.at) === eventAt && correctionSource === eventSource;
    });
}

function legacyManualRelationshipEvents(npc = {}) {
    const modern = relationshipCorrectionState(npc);
    return (npc?.relationshipHistory || [])
        .filter(item => String(item?.impact || '').toLocaleLowerCase() === 'manual')
        .filter(item => !modernManualRelationshipEvent(item, modern));
}

function legacyRelationshipCandidateAxes(npc = {}, ownedAxes = new Set()) {
    const stored = relationshipCorrectionUnresolvedAxes(npc);
    if (stored.length) return stored.filter(axis => !ownedAxes.has(axis));
    const events = legacyManualRelationshipEvents(npc);
    const axes = new Set();
    for (const event of events) {
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    // Missing provenance is conservative: a current-format confirmation event cannot prove
    // that an unrepresented legacy axis was never part of the old whole-object override.
    if (!axes.size) for (const axis of RELATIONSHIP_AXES) if (!ownedAxes.has(axis)) axes.add(axis);
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyRelationshipResidualAxes(npc = {}, matchedEvent = null, ownedAxes = new Set()) {
    const stored = relationshipCorrectionUnresolvedAxes(npc);
    if (stored.length) return stored.filter(axis => !ownedAxes.has(axis));
    const matchedKey = matchedEvent ? manualRelationshipEventKey(matchedEvent) : '';
    const axes = new Set();
    for (const event of legacyManualRelationshipEvents(npc)) {
        if (matchedKey && manualRelationshipEventKey(event) === matchedKey) continue;
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyCorrectionLimitation(code, axes = []) {
    return { code, axes: RELATIONSHIP_AXES.filter(axis => (axes || []).includes(axis)) };
}

export function migrateSupportedLegacyManualRelationshipCorrections(npcInput) {
    let npc = normalizeNpc(npcInput || {});
    const modern = relationshipCorrectionState(npc);
    const ownedAxes = new Set(modern.corrections.map(item => item.axis));
    if (!hasLegacyRelationshipOverride(npc)) {
        if (relationshipCorrectionUnresolvedAxes(npc).length) {
            const next = structuredClone(npc);
            next.manualRelationshipCorrectionUnresolvedAxes = [];
            npc = normalizeNpc(next);
        }
        return { npc, migratedAxes: [], limitations: [] };
    }

    const unresolvedResult = code => {
        const axes = legacyRelationshipCandidateAxes(npc, ownedAxes);
        let next = structuredClone(npc);
        next.manualRelationshipCorrectionUnresolvedAxes = axes;
        if (!axes.length) next = retireLegacyRelationshipOverride(next);
        return {
            npc: normalizeNpc(next),
            migratedAxes: [],
            limitations: axes.length ? [legacyCorrectionLimitation(code, axes)] : [],
        };
    };

    const identity = legacyRelationshipOverrideIdentity(npc);
    if (!identity) return unresolvedResult('legacy-relationship-correction-missing-axis-provenance');
    const matched = matchingLegacyManualEvent(npc, identity);
    const matchedAxes = manualRelationshipEventAxes(matched);
    if (!matched || !matchedAxes.length) return unresolvedResult('legacy-relationship-correction-missing-axis-provenance');

    const migratableAxes = matchedAxes.filter(axis => !ownedAxes.has(axis));
    let next = structuredClone(npc);
    const byAxis = new Map(modern.corrections.map(item => [item.axis, structuredClone(item)]));
    let revision = modern.revision;
    let enriched = false;
    for (const axis of matchedAxes) {
        const existing = byAxis.get(axis);
        if (!existing || existing.legacyOriginKey) continue;
        const equivalent = legacyCorrectionEquivalentToRestored(npc, existing);
        if (!equivalent.matches || !equivalent.originKey) continue;
        existing.legacyOriginKey = equivalent.originKey;
        byAxis.set(axis, existing);
        enriched = true;
    }
    if (migratableAxes.length) {
        revision += 1;
        for (const axis of migratableAxes) {
            byAxis.set(axis, {
                id: axis + ':' + revision,
                axis,
                value: identity.relationship[axis],
                revision,
                sourceMessageId: identity.sourceMessageId,
                at: identity.at || Number(matched?.at) || null,
                legacyOriginKey: legacyRelationshipOriginKey(npc, axis),
            });
            ownedAxes.add(axis);
        }
    }
    if (migratableAxes.length || enriched) {
        next.manualRelationshipCorrectionRevision = revision;
        next.manualRelationshipCorrections = [...byAxis.values()];
    }

    const residualAxes = legacyRelationshipResidualAxes(npc, matched, ownedAxes);
    next.manualRelationshipCorrectionUnresolvedAxes = residualAxes;
    const limitations = residualAxes.length
        ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
        : [];
    if (!limitations.length) next = retireLegacyRelationshipOverride(next);
    return { npc: normalizeNpc(next), migratedAxes: migratableAxes, limitations };
}

function preserveLegacyUncertainty(restoredNpc, liveNpc, code, modernAxes) {
    const axes = legacyRelationshipCandidateAxes(liveNpc, modernAxes);
    if (!axes.length) return { npc: normalizeNpc(retireLegacyRelationshipOverride(restoredNpc)), limitations: [] };
    const next = structuredClone(restoredNpc);
    next.manualRelationshipCorrectionUnresolvedAxes = axes;
    return { npc: normalizeNpc(next), limitations: [legacyCorrectionLimitation(code, axes)] };
}

function preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    if (!hasLegacyRelationshipOverride(liveNpc)) return { npc: restoredNpc, limitations: [] };
    const modernAxes = new Set(relationshipCorrectionState(liveNpc).corrections.map(item => item.axis));
    const identity = legacyRelationshipOverrideIdentity(liveNpc);
    if (!identity) return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);
    // A snapshot with the same legacy identity already contains that correction and any
    // surviving story movement after it. Modern axes are preserved independently below.
    if (sameLegacyRelationshipOverride(restoredOwnershipNpc, liveNpc)) return { npc: restoredNpc, limitations: [] };

    const known = new Set((restoredNpc.relationshipHistory || [])
        .filter(item => item?.impact === 'manual')
        .map(manualRelationshipEventKey));
    const matched = matchingLegacyManualEvent(liveNpc, identity);
    if (!matched || known.has(manualRelationshipEventKey(matched))) {
        return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);
    }
    const eventAxes = manualRelationshipEventAxes(matched);
    if (!eventAxes.length) return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);

    const changedAxes = eventAxes.filter(axis => !modernAxes.has(axis));
    const ownedAxes = new Set([...modernAxes, ...changedAxes]);
    let next = changedAxes.length
        ? applyAbsoluteRelationshipAxes(restoredNpc, changedAxes.map(axis => ({ axis, value: identity.relationship[axis] })))
        : structuredClone(restoredNpc);
    if (changedAxes.length) {
        next.relationshipHistory = [...(next.relationshipHistory || []), structuredClone(matched)].slice(-24);
        next.lastRelationshipChange = structuredClone(matched);
    }
    const residualAxes = legacyRelationshipResidualAxes(liveNpc, matched, ownedAxes);
    next.manualRelationshipCorrectionUnresolvedAxes = residualAxes;
    return {
        npc: normalizeNpc(next),
        limitations: residualAxes.length
            ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
            : [],
    };
}

function preserveUserOwnedState(restored, current) {
    const currentById = new Map((current?.npcs || []).map(npc => [npc.id, npc]));
    const manualRelationshipLimitations = [];
    const stableFields = new Set(STABLE_PROFILE_FIELDS);
    const overrideFields = new Set(MANUAL_OVERRIDE_FIELDS);
    restored.npcs = (restored.npcs || []).map(npc => {
        const live = currentById.get(npc.id);
        if (!live) return npc;
        let next = { ...npc };
        if (live.portrait) next.portrait = structuredClone(live.portrait);
        const locked = [...new Set(Array.isArray(live.manualProfileFields) ? live.manualProfileFields : [])];
        next.manualProfileFields = structuredClone(locked);
        for (const field of locked) {
            if (stableFields.has(field)) next[field] = structuredClone(live[field]);
        }
        const restoredOverrides = npc.manualOverrides && typeof npc.manualOverrides === 'object' ? npc.manualOverrides : {};
        const restoredOverrideMeta = npc.manualOverrideMeta && typeof npc.manualOverrideMeta === 'object' ? npc.manualOverrideMeta : {};
        const liveOverrides = live.manualOverrides && typeof live.manualOverrides === 'object' ? live.manualOverrides : {};
        const liveOverrideMeta = live.manualOverrideMeta && typeof live.manualOverrideMeta === 'object' ? live.manualOverrideMeta : {};
        // The live metadata map is authoritative for explicit unlock/clear operations, but
        // an older correction must not overwrite later story state already in the snapshot.
        next.manualOverrides = structuredClone(liveOverrides);
        next.manualOverrideMeta = structuredClone(liveOverrideMeta);
        for (const [field, value] of Object.entries(liveOverrides)) {
            if (!overrideFields.has(field) || field === 'relationship') continue;
            const liveAt = Number(liveOverrideMeta?.[field]?.at) || 0;
            const restoredAt = Number(restoredOverrideMeta?.[field]?.at) || 0;
            const restoredHas = Object.prototype.hasOwnProperty.call(restoredOverrides, field);
            let fallbackChanged = false;
            if (!liveAt) {
                try { fallbackChanged = !restoredHas || JSON.stringify(restoredOverrides[field]) !== JSON.stringify(value); }
                catch { fallbackChanged = !restoredHas; }
            }
            if ((liveAt && liveAt > restoredAt) || fallbackChanged) next[field] = structuredClone(value);
        }
        next.importance = Number(live.importance) || 0;
        next.manualRelationshipCorrectionUnresolvedAxes = structuredClone(live.manualRelationshipCorrectionUnresolvedAxes || []);
        // Durable per-axis correction identity is authoritative. It is independent of
        // bounded display history. A legacy-origin key lets a pre-migration checkpoint
        // prove it already contains the same correction without resetting later story gain.
        const restoredOwnershipNpc = {
            manualOverrides: structuredClone(restoredOverrides),
            manualOverrideMeta: structuredClone(restoredOverrideMeta),
            relationshipHistory: structuredClone(npc.relationshipHistory || []),
        };
        const durable = preserveDurableManualRelationshipCorrections(next, live, restoredOwnershipNpc);
        if (durable) {
            next = durable.npc;
            for (const limitation of durable.limitations || []) {
                manualRelationshipLimitations.push({ npcId: live.id, npcName: live.name, ...limitation });
            }
        }
        const legacy = preserveLegacyManualRelationshipEvents(next, live, restoredOwnershipNpc);
        next = legacy.npc;
        for (const limitation of legacy.limitations || []) {
            manualRelationshipLimitations.push({ npcId: live.id, npcName: live.name, ...limitation });
        }
        return normalizeNpc(next);
    });

    // Explicit user deletions/suppressions are monotonic user-owned intent, not story facts.
    const tombstones = new Set([...(current.deletedNpcIds || []), ...(restored.deletedNpcIds || [])]);
    restored.deletedNpcIds = [...tombstones];
    restored.suppressedNames = [...new Set([...(restored.suppressedNames || []), ...(current.suppressedNames || [])])];
    restored.npcs = restored.npcs.filter(npc => !tombstones.has(npc.id));
    restored.socialGraph = (restored.socialGraph || []).filter(edge => !tombstones.has(edge.fromId) && !tombstones.has(edge.toId));
    restored.familySlots = (restored.familySlots || [])
        .filter(slot => !tombstones.has(slot.ownerId))
        .map(slot => ({ ...slot, resolvedNpcIds: (slot.resolvedNpcIds || []).filter(id => !tombstones.has(id)) }));
    return { state: restored, manualRelationshipLimitations };
}

function failClosedPrebaselineDivergence(state, chat) {
    const next = normalizeState(state, state?.chatKey || '');
    const detectedKind = next.branchSafety?.kind || branchDivergenceKind(next, chat);
    const kind = detectedKind || 'missing-trusted-baseline';
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
    next.branchSafety = {
        status: 'rebase-required',
        kind,
        reason: 'The surviving chat no longer has a trustworthy full-state checkpoint at or before its divergence. NPC State retained recoverable data without applying partial relationship-only rollback. Use historical recovery when a valid baseline is available, or explicitly accept/rebuild the timeline.',
    };
    next.updatedAt = Date.now();
    return next;
}

function assistantMessageIdsAfterLineage(chat = [], lineageLength = 0) {
    const out = [];
    for (let i = Math.max(0, Number(lineageLength) || 0); i < chat.length; i += 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) out.push(i);
    }
    return out;
}

export function reconcileToCurrentBranch(state, chat) {
    const normalized = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    if (lineageIsPrefix(normalized.branchHeadLineage || [], currentLineage)) {
        if (normalized.branchSafety?.status === 'safe') {
            return { changed: false, unsafeDivergence: false, needsRecovery: false, fullyRestored: true, state: normalized, checkpoint: bestCheckpoint(normalized, chat), recoveryMessageIds: [] };
        }
    }

    const checkpoint = bestCheckpoint(normalized, chat);
    if (!checkpoint) {
        const failed = failClosedPrebaselineDivergence(normalized, chat);
        return { changed: true, unsafeDivergence: true, needsRecovery: true, fullyRestored: false, state: failed, checkpoint: null, recoveryMessageIds: [] };
    }

    const preservation = preserveUserOwnedState(normalizeState(checkpoint.snapshot, normalized.chatKey), normalized);
    const restored = preservation.state;
    const manualRelationshipLimitations = preservation.manualRelationshipLimitations || [];
    restored.revision = normalized.revision;
    restored.checkpoints = structuredClone(normalized.checkpoints || []);
    restored.branchBase = structuredClone(normalized.branchBase || null);
    restored.rebaseBackup = structuredClone(normalized.rebaseBackup || null);
    const recoveryMessageIds = assistantMessageIdsAfterLineage(chat, checkpoint.lineage?.length || 0);
    if (manualRelationshipLimitations.length) {
        restored.branchHeadLineage = structuredClone(checkpoint.lineage || []);
        const affected = manualRelationshipLimitations.slice(0, 6).map(item => {
            const axes = Array.isArray(item.axes) && item.axes.length ? ' (' + item.axes.join(', ') + ')' : '';
            return String(item.npcName || item.npcId || 'NPC') + axes;
        }).join('; ');
        restored.branchSafety = {
            status: 'rebase-required',
            kind: 'manual-relationship-correction-uncertain',
            reason: 'Legacy manual relationship correction ownership is unresolved' + (affected ? ': ' + affected : '') + '. Open each affected dossier to confirm one relationship axis at a time or clear that NPC relationship correction ownership. Normal story updates stay blocked until the remaining correction uncertainty and any surviving-history reconstruction are resolved.',
        };
        restored.recovery = null;
        restored.updatedAt = Date.now();
        return {
            changed: true,
            unsafeDivergence: false,
            needsRecovery: false,
            fullyRestored: false,
            reason: 'manual-relationship-correction-uncertain',
            manualRelationshipLimitations,
            state: restored,
            checkpoint,
            recoveryMessageIds,
        };
    }
    if (recoveryMessageIds.length) {
        restored.branchHeadLineage = structuredClone(checkpoint.lineage || []);
        restored.branchSafety = {
            status: 'rebase-required',
            kind: 'suffix-recovery-required',
            reason: 'NPC State restored the latest verified full-state boundary. Later surviving assistant exchanges have different preceding history and must be reconstructed in order before this timeline is current.',
        };
        restored.updatedAt = Date.now();
        return { changed: true, unsafeDivergence: false, needsRecovery: true, fullyRestored: false, state: restored, checkpoint, recoveryMessageIds };
    }

    restored.branchHeadLineage = currentLineage;
    restored.branchSafety = { status: 'safe', kind: '', reason: '' };
    restored.recovery = null;
    restored.updatedAt = Date.now();
    return { changed: true, unsafeDivergence: false, needsRecovery: false, fullyRestored: true, state: restored, checkpoint, recoveryMessageIds: [] };
}

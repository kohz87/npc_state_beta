import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, before, after, label) {
    if (!source.includes(before)) throw new Error('Missing 0.4.9 rebase rollback anchor: ' + label);
    return source.replace(before, after);
}

let branches = read('v03/branches.js');
branches = replaceRequired(
    branches,
    "import { CHECKPOINT_LIMIT, STABLE_PROFILE_FIELDS, normalizeState, snapshotForCheckpoint } from './schema.js';",
    "import { CHECKPOINT_LIMIT, RELATIONSHIP_AXES, RELATIONSHIP_MILESTONE_THRESHOLDS, STABLE_PROFILE_FIELDS, emptyRelationshipChange, normalizeRelationship, normalizeRelationshipProgress, normalizeState, snapshotForCheckpoint } from './schema.js';",
    'branches imports',
);

const helperAnchor = `function latestKnownNarrativeTurn(state = {}) {
    const turns = [narrativeTurnFromLineage(state?.branchHeadLineage || []), narrativeTurnFromLineage(state?.branchBase?.lineage || [])];
    for (const checkpoint of state?.checkpoints || []) turns.push(narrativeTurnFromLineage(checkpoint?.lineage || []));
    return Math.max(0, ...turns);
}

`;
const helpers = `function latestKnownNarrativeTurn(state = {}) {
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
        String(event?.evidence || '').trim().toLocaleLowerCase().replace(/\\s+/g, ' '),
    ].join('|');
}

function relationshipNumbersEqual(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.000001;
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
    const manualProtectedAxes = new Set();
    const affectedAxes = new Set();

    // Manual score edits remain authoritative even if their save happened after the
    // divergence point. The manual event records which axes the player intentionally set.
    for (const event of history) {
        if (String(event?.impact || '').toLocaleLowerCase() !== 'manual') continue;
        if (!Number.isInteger(event?.sourceMessageId) || event.sourceMessageId < divergenceMessageId) continue;
        for (const axis of RELATIONSHIP_AXES) if (Number(event?.delta?.[axis]) !== 0) manualProtectedAxes.add(axis);
    }

    // Recent diagnostics contain exact before/after integer and fractional state. Walk
    // them backwards first so a recent abandoned gate crossing can be restored exactly.
    const covered = new Set();
    const staleDiagnostics = diagnostics
        .filter(event => discardedRelationshipEvent(event, divergenceMessageId))
        .sort((a, b) => Number(b?.sourceMessageId || -1) - Number(a?.sourceMessageId || -1) || Number(b?.at || 0) - Number(a?.at || 0));
    for (const event of staleDiagnostics) {
        const key = relationshipEventKey(event);
        for (const axis of RELATIONSHIP_AXES) {
            if (manualProtectedAxes.has(axis)) continue;
            const beforeScore = Number(event?.before?.[axis]) || 0;
            const afterScore = Number(event?.after?.[axis]) || 0;
            const beforeProgress = Number(event?.progressBefore?.[axis]) || 0;
            const afterProgress = Number(event?.progressAfter?.[axis]) || 0;
            if (beforeScore === afterScore && relationshipNumbersEqual(beforeProgress, afterProgress)) continue;
            if (relationship[axis] !== afterScore || !relationshipNumbersEqual(progress[axis], afterProgress)) continue;
            relationship[axis] = beforeScore;
            progress[axis] = beforeProgress;
            covered.add(key + '|' + axis);
            affectedAxes.add(axis);
        }
    }

    // Older diagnostics are bounded. Visible history retains the actual displayed delta,
    // so use it as the next rollback tier when no exact diagnostic covered that event.
    for (const event of history.filter(item => discardedRelationshipEvent(item, divergenceMessageId))) {
        const key = relationshipEventKey(event);
        for (const axis of RELATIONSHIP_AXES) {
            if (manualProtectedAxes.has(axis) || covered.has(key + '|' + axis)) continue;
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
            if (manualProtectedAxes.has(axis) || covered.has(key + '|' + axis)) continue;
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
        if (!RELATIONSHIP_AXES.includes(axis) || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold) || manualProtectedAxes.has(axis)) continue;
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
    if (affectedAxes.size || removedMilestones.length) npc.relationshipSummary = '';
    return npc;
}

`;
branches = replaceRequired(branches, helperAnchor, helpers, 'relationship rollback helpers');
branches = replaceRequired(
    branches,
    `    const sourceTurn = latestKnownNarrativeTurn(source);\n    const next = normalizeState(source, source.chatKey);\n\n    next.npcs = next.npcs.map(npc => {\n        const rebased = structuredClone(npc);`,
    `    const sourceTurn = latestKnownNarrativeTurn(source);\n    const divergenceMessageId = branchDivergenceMessageId(source, chat);\n    const next = normalizeState(source, source.chatKey);\n\n    next.npcs = next.npcs.map(npc => {\n        const rebased = rollbackRebasedRelationship(npc, divergenceMessageId);`,
    'rebase relationship rollback entry',
);
branches = replaceRequired(
    branches,
    `        if (rebased.lastRelationshipChange) rebased.lastRelationshipChange = { ...rebased.lastRelationshipChange, sourceMessageId: null, turn: null };\n        rebased.relationshipHistory = (rebased.relationshipHistory || []).map(event => ({ ...event, sourceMessageId: null, turn: null }));\n        // Recent evidence is timeline-local; retain durable scores/milestones and visible history.\n        rebased.relationshipEvidenceHistory = [];\n        rebased.relationshipDiagnostics = [];`,
    `        if (rebased.lastRelationshipChange) rebased.lastRelationshipChange = { ...rebased.lastRelationshipChange, sourceMessageId: null, turn: null };\n        rebased.relationshipHistory = (rebased.relationshipHistory || []).map(event => ({ ...event, sourceMessageId: null, turn: null }));\n        // Surviving relationship milestones become part of the newly accepted branch base.\n        // Clear old message provenance so a later rebase cannot discard an already accepted unlock.\n        rebased.relationshipMilestones = (rebased.relationshipMilestones || []).map(entry => ({ ...entry, sourceMessageId: null, turn: null }));\n        // Recent evidence/diagnostics are timeline-local and must not survive the rebase.\n        rebased.relationshipEvidenceHistory = [];\n        rebased.relationshipDiagnostics = [];`,
    'accepted milestone provenance',
);
write('v03/branches.js', branches);

let recoveryUi = read('v03/branch-recovery-ui.js');
recoveryUi = replaceRequired(
    recoveryUi,
    `'This preserves durable dossiers, portraits, relationships, memories, manual locks, archives, social ties, and deletion tombstones. It clears live in-chat state, chat-local message references, and incompatible branch checkpoints, then scans the latest surviving assistant exchange.\\n\\n' +\n        'Facts learned only from deleted messages may remain until later scans revise them or you edit the dossier manually.'`,
    `'This preserves durable profile canon, memories, portraits, manual locks, archives, social ties, deletion tombstones, and manual relationship edits. Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back before the new branch base is accepted. It then clears live in-chat state, chat-local message references, and incompatible branch checkpoints before scanning the latest surviving assistant exchange.\\n\\n' +\n        'Older facts without recoverable timeline provenance may still remain until later scans revise them or you edit the dossier manually.'`,
    'rebase confirmation text',
);
write('v03/branch-recovery-ui.js', recoveryUi);

console.log('Applied NPC State 0.4.9 relationship rollback during explicit timeline rebase');

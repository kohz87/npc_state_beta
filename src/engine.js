import { dossierIndexProjection, injectionStateProjection, npcPortraitSource } from './state-projections.js';
export { dossierIndexProjection, injectionStateProjection } from './state-projections.js';
import { chatLineage, bestCheckpoint, ensurePreUpdateBaseline, fingerprintMessage, latestAssistantMessageId, migrateSupportedLegacyManualRelationshipCorrections, normalizeRebaseRelationshipMode, previewRelationshipRebase, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint, retargetCheckpointOwnership } from './branches.js';
// preserve-mode rebase cannot mutate relationship state during its immediate refresh.
import { analyzeStructuredEvidence, buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText, structuredDossierBlocksForNpc } from './evidence-adapter.js';
import {
    applyNpcStateBundleImport,
    bundleSuggestedFilename,
    createNpcStateBundle,
    previewNpcStateBundleImport,
} from './bundle.js';
import {
    DEFAULT_RELATIONSHIP_CAPS,
    MANUAL_OVERRIDE_FIELDS,
    RELATIONSHIP_AXES,
    applyBirthdayFill,
    applyConfirmedDeathTransition,
    applyManualLifeStateTransition,
    findNpcByReference,
    createEmptyState,
    makeNpcId,
    normalizeName,
    normalizeActualAge,
    normalizeApparentAge,
    normalizeBirthday,
    normalizeScannerResponseTokens,
    normalizeRecoveryRelationshipMode,
    normalizeNpc,
    normalizeBirthdayFillMode,
    normalizeRelationship,
    normalizeManualRelationshipCorrectionUnresolvedAxes,
    manualOwnedFieldValueIssue,
    finiteManualNumericInput,
    normalizeRelationshipMilestones,
    normalizeState,
} from './schema.js';
import {
    normalizeRelationshipHistoryLimit,
    trimStateRelationshipHistory,
} from './relationship-policy.js';
import {
    applyScanResult,
    buildScanPrompt,
    buildFirstContactCompletionPrompt,
    buildStructuredDossierImportPrompt,
    buildTargetedRefreshPrompt,
    currentExchange,
    parseScanJson,
    reconcileFamilyGraphState,
    relevantNpcsForExchange,
    sanitizeStructuredDossierPatch,
    SCAN_SYSTEM_PROMPT,
} from './scanner.js';
import {
    applyStaleLifecycle,
    buildStaleReport,
    narrativeTurnForMessage,
    referencedNpcIdsFromExchange,
} from './stale.js';
import { clearV3PointerHint, createRecoveryV3Sidecar, deleteV3SidecarFile, readV3PointerHint, readV3Sidecar, retireV3Sidecar, writeV3Sidecar } from './storage.js';
import { estimateForegroundTokens, FOREGROUND_TOKEN_ESTIMATE_METHOD } from './foreground-budget.js';
import { createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from './operation-diagnostics.js';
import { resolvePlayerName } from './scan-helpers.js';
import { DOSSIER_SEMANTIC_FIELDS, dossierFieldDefinition } from './model/dossier-fields.js';


function profileContextForWindow(chat = [], messageId = null, depth = 8) {
    const end = Number.isInteger(messageId) ? Math.min(chat.length - 1, messageId) : chat.length - 1;
    const rows = [];
    for (let i = Math.max(0, end - Math.max(2, Number(depth) || 8) * 2); i <= end; i += 1) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        rows.push(profileEvidenceText(message.mes || '').slice(0, 8000));
    }
    return rows.join('\n');
}

function profileContextForExchange(exchange) {
    if (!exchange) return '';
    return [exchange.user?.mes, exchange.assistant?.mes]
        .map(value => profileEvidenceText(value || '').trim())
        .filter(Boolean)
        .join('\n');
}

function profileSourceIdsForWindow(chat = [], messageId = null, depth = 8) {
    const end = Number.isInteger(messageId) ? Math.min(chat.length - 1, messageId) : chat.length - 1;
    const ids = [];
    for (let i = Math.max(0, end - Math.max(2, Number(depth) || 8) * 2); i <= end; i += 1) {
        if (chat[i] && !chat[i].is_system) ids.push(i);
    }
    return ids;
}

function structuredSemanticContextsForWindow(chat = [], messageId = null, depth = 12) {
    const end = Number.isInteger(messageId) ? Math.min(chat.length - 1, messageId) : chat.length - 1;
    const rows = [];
    for (let i = 0; i <= end; i += 1) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        rows.push(message);
    }
    const selected = rows.slice(-Math.max(2, Math.min(30, Math.round(Number(depth) || 12))));
    const world = [];
    const inner = [];
    for (const message of selected) {
        const view = analyzeStructuredEvidence(message.mes || '');
        if (view.worldStateText) world.push(view.worldStateText);
        if (view.innerChatterText) inner.push(view.innerChatterText);
    }
    return { world: world.join('\n'), private: inner.join('\n') };
}

function relationshipContextForExchange(exchange) {
    if (!exchange) return '';
    return [exchange.user?.mes, exchange.assistant?.mes].map(value => relationshipEvidenceText(value).trim()).filter(Boolean).join('\n');
}

function firstContactFieldMissing(npc = {}, field = '') {
    const definition = dossierFieldDefinition(field);
    if (!definition) return false;
    const value = npc?.[field];
    if (definition.kind === 'collection' || definition.kind === 'forms') return !Array.isArray(value) || value.length === 0;
    const clean = String(value ?? '').trim();
    return !clean || normalizeName(clean) === 'unknown';
}

function missingEvaluationFields(coverageDiagnostics = [], npcId = '') {
    const out = new Set();
    for (const row of Array.isArray(coverageDiagnostics) ? coverageDiagnostics : []) {
        if (row?.npcId !== npcId) continue;
        if (row.status === 'missing-npc-patch') {
            for (const field of DOSSIER_SEMANTIC_FIELDS) out.add(field);
            continue;
        }
        if (row.status !== 'incomplete-evaluation') continue;
        for (const field of Array.isArray(row.missingFields) ? row.missingFields : []) out.add(field);
    }
    return out;
}

function firstContactCompletionTargets(beforeState = {}, afterState = {}, coverageDiagnostics = [], mode = 'off', semanticDiagnostics = []) {
    const existingIds = new Set((beforeState?.npcs || []).map(npc => npc?.id).filter(Boolean));
    return (afterState?.npcs || []).filter(npc => npc?.id && !existingIds.has(npc.id)).map(npc => {
        const missingEvaluations = missingEvaluationFields(coverageDiagnostics, npc.id);
        const contractFields = new Set(semanticDiagnostics.filter(row => row?.npcId === npc.id
            && ['source-cited-update-required', 'profile-establishment-basis-required'].includes(row?.reason)).map(row => row.field));
        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => firstContactFieldMissing(npc, field)
            && (contractFields.has(field) || mode === 'recheck_unknown_fields' || (mode === 'missing_evaluations' && missingEvaluations.has(field))));
        return { npc, fields, contractRepair: contractFields.size > 0 };
    }).filter(target => target.fields.length);
}

function manualRecheckTargets(npc = {}) {
    const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => firstContactFieldMissing(npc, field));
    return fields.length ? [{ npc, fields }] : [];
}

function filterFirstContactFieldEvaluations(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out = {};
    for (const key of ['unchanged', 'insufficient', 'unavailable']) {
        const rows = [...new Set((Array.isArray(value[key]) ? value[key] : []).map(item => String(item || '').trim()).filter(field => allowed.has(field)))];
        if (rows.length) out[key] = rows;
    }
    return Object.keys(out).length ? out : undefined;
}

function sanitizeFirstContactCompletionPayload(result = {}, targets = []) {
    const byId = new Map();
    const byName = new Map();
    for (const target of Array.isArray(targets) ? targets : []) {
        if (!target?.npc?.id) continue;
        const row = { npc: target.npc, allowed: new Set(target.fields || []) };
        byId.set(target.npc.id, row);
        const name = normalizeName(target.npc.name);
        if (name && !byName.has(name)) byName.set(name, row);
    }
    const npcs = [];
    const seen = new Set();
    const diagnostics = [];
    for (const patch of Array.isArray(result?.npcs) ? result.npcs : []) {
        const patchId = String(patch?.id || '').trim();
        const target = byId.get(patchId);
        if (!target) {
            const named = byName.get(normalizeName(patch?.name));
            diagnostics.push({ npcId: named?.npc?.id || '', status: 'identity-rejected', coverageKind: 'first-contact-completion', reason: patchId ? 'wrong-stable-id' : 'missing-stable-id' });
            continue;
        }
        if (seen.has(target.npc.id)) {
            diagnostics.push({ npcId: target.npc.id, status: 'identity-rejected', coverageKind: 'first-contact-completion', reason: 'duplicate-target-patch' });
            continue;
        }
        seen.add(target.npc.id);
        const semanticUpdates = (Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : [])
            .filter(update => target.allowed.has(String(update?.field || '').trim()))
            .map(update => structuredClone(update));
        const profileObservations = (Array.isArray(patch?.profileObservations) ? patch.profileObservations : [])
            .filter(observation => target.allowed.has(String(observation?.field || '').trim()))
            .map(observation => structuredClone(observation));
        const fieldEvaluations = filterFirstContactFieldEvaluations(patch?.fieldEvaluations, target.allowed);
        npcs.push({
            id: target.npc.id,
            name: target.npc.name,
            ...(semanticUpdates.length ? { semanticUpdates } : {}),
            ...(profileObservations.length ? { profileObservations } : {}),
            ...(fieldEvaluations ? { fieldEvaluations } : {}),
        });
    }
    return {
        payload: { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs, socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} },
        diagnostics,
    };
}

function auditFirstContactCompletion(payload = {}, targets = [], semanticDiagnostics = [], sanitizeDiagnostics = []) {
    const diagnostics = [...(Array.isArray(sanitizeDiagnostics) ? sanitizeDiagnostics : [])];
    const resolvedByNpc = new Map();
    let requestedFields = 0;
    let acceptedChanges = 0;
    for (const target of Array.isArray(targets) ? targets : []) {
        const npcId = target?.npc?.id;
        const allowed = new Set(target?.fields || []);
        requestedFields += allowed.size;
        const resolved = new Set();
        const patch = (payload?.npcs || []).find(row => row?.id === npcId);
        if (!patch) {
            diagnostics.push({ npcId, status: 'missing-npc-patch', missingFields: [...allowed], missingGroups: [], coverageKind: 'first-contact-completion' });
            resolvedByNpc.set(npcId, resolved);
            continue;
        }
        const proposed = new Set((patch.semanticUpdates || []).map(row => String(row?.field || '').trim()).filter(field => allowed.has(field)));
        const invalidEvaluations = new Set((semanticDiagnostics || []).filter(row => row?.npcId === npcId && row?.status === 'invalid-field-evaluation').map(row => row?.field).filter(Boolean));
        for (const status of ['unchanged', 'insufficient', 'unavailable']) {
            for (const field of Array.isArray(patch?.fieldEvaluations?.[status]) ? patch.fieldEvaluations[status] : []) {
                if (allowed.has(field) && !proposed.has(field) && !invalidEvaluations.has(field)) resolved.add(field);
            }
        }
        for (const field of proposed) {
            const accepted = (semanticDiagnostics || []).some(row => row?.npcId === npcId && row?.field === field && ['applied', 'no-change-proposed'].includes(row?.status));
            if (accepted) resolved.add(field);
            if ((semanticDiagnostics || []).some(row => row?.npcId === npcId && row?.field === field && row?.status === 'applied')) acceptedChanges += 1;
        }
        const missingFields = [...allowed].filter(field => !resolved.has(field));
        if (missingFields.length) diagnostics.push({ npcId, status: 'incomplete-evaluation', missingFields, missingGroups: [], coverageKind: 'first-contact-completion' });
        resolvedByNpc.set(npcId, resolved);
    }
    const resolvedFields = [...resolvedByNpc.values()].reduce((sum, fields) => sum + fields.size, 0);
    return { diagnostics, resolvedByNpc, requestedFields, resolvedFields, acceptedChanges, remainingOutcomes: Math.max(0, requestedFields - resolvedFields) };
}

function reconcileCompletionCoverage(firstPass = [], completionAudit = null) {
    if (!completionAudit) return Array.isArray(firstPass) ? structuredClone(firstPass) : [];
    const out = [];
    for (const original of Array.isArray(firstPass) ? firstPass : []) {
        const resolved = completionAudit.resolvedByNpc.get(original?.npcId);
        if (!resolved || original?.status !== 'incomplete-evaluation' || !Array.isArray(original.missingFields)) {
            out.push(structuredClone(original));
            continue;
        }
        const originalFields = original.missingFields.filter(Boolean);
        const missingFields = originalFields.filter(field => !resolved.has(field));
        const unresolvedGroups = new Set(missingFields.map(field => dossierFieldDefinition(field)?.group).filter(Boolean));
        const originalFieldGroups = new Set(originalFields.map(field => dossierFieldDefinition(field)?.group).filter(Boolean));
        const missingGroups = (Array.isArray(original.missingGroups) ? original.missingGroups : []).filter(group => !originalFieldGroups.has(group) || unresolvedGroups.has(group));
        if (!missingFields.length && !missingGroups.length) continue;
        out.push({ ...structuredClone(original), missingFields, missingGroups });
    }
    return [...out, ...structuredClone(completionAudit.diagnostics)];
}

function createProviderRequestBudget(limit = 2) {
    return { limit: Math.max(1, Math.trunc(Number(limit) || 2)), count: 0, requests: [] };
}

function requestBudgetSnapshot(budget = null) {
    if (!budget) return {};
    const aggregate = budget.requests.reduce((sum, row) => ({ chars: sum.chars + (row.input?.chars || 0), tokenEstimate: sum.tokenEstimate + (row.input?.tokenEstimate || 0) }), { chars: 0, tokenEstimate: 0 });
    return {
        count: budget.count, limit: budget.limit, items: structuredClone(budget.requests),
        aggregate: { ...aggregate, tokenEstimateKind: 'estimated', tokenEstimateMethod: FOREGROUND_TOKEN_ESTIMATE_METHOD, billedTokens: 'unavailable' },
    };
}

function lifecycleNotice(result) {
    const parts = [];
    if (result?.archivedIds?.length) parts.push(`archived ${result.archivedIds.length} stale dossier${result.archivedIds.length === 1 ? '' : 's'}`);
    if (result?.restoredIds?.length) parts.push(`restored ${result.restoredIds.length} narratively active dossier${result.restoredIds.length === 1 ? '' : 's'}`);
    if (result?.deletedIds?.length) parts.push(`removed ${result.deletedIds.length} stale archive${result.deletedIds.length === 1 ? '' : 's'}`);
    return parts.join(', ');
}

const RECOVERY_ACTIVE_STATUSES = new Set(['running', 'paused', 'failed', 'stale']);
function recoveryBlocksLiveScan(state) {
    return RECOVERY_ACTIVE_STATUSES.has(String(state?.recovery?.status || '').toLocaleLowerCase());
}
function recoveryLineageEqual(left = [], right = []) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
// accepted preserve-rebase history cannot be scored again after refresh failure/reload.
function relationshipReplayProtected(state, chat = [], messageId = null) {
    const boundary = state?.relationshipReplayBoundary;
    if (!Number.isInteger(messageId) || messageId < 0 || !Number.isInteger(boundary?.throughMessageId) || messageId > boundary.throughMessageId) return false;
    const accepted = Array.isArray(boundary.lineage) ? boundary.lineage.slice(0, messageId + 1) : [];
    const current = chatLineage(chat, messageId);
    return accepted.length === current.length && accepted.every((value, index) => value === current[index]);
}
function assistantMessageIdsInRange(chat = [], startMessageId = 0, endMessageId = null) {
    const last = Number.isInteger(endMessageId) ? Math.min(endMessageId, chat.length - 1) : chat.length - 1;
    const first = Math.max(0, Number.isInteger(startMessageId) ? startMessageId : 0);
    const out = [];
    for (let i = first; i <= last; i += 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) out.push(i);
    }
    return out;
}
function computeRecoveryRangeForChat(chat = [], startMessageId = null, endMessageId = null) {
    const maxMessageId = chat.length - 1;
    const explicitStart = startMessageId !== null && startMessageId !== undefined;
    const explicitEnd = endMessageId !== null && endMessageId !== undefined;
    const rangeError = message => {
        const error = new Error(message);
        error.code = 'NPC_STATE_V04_BETA_RECOVERY_RANGE';
        return error;
    };
    if (explicitStart && (!Number.isInteger(startMessageId) || startMessageId < 0 || startMessageId > maxMessageId)) {
        throw rangeError('Recovery start message is outside the current chat.');
    }
    if (explicitEnd && (!Number.isInteger(endMessageId) || endMessageId < 0 || endMessageId > maxMessageId)) {
        throw rangeError('Recovery end message is outside the current chat.');
    }
    const allAssistantIds = assistantMessageIdsInRange(chat, 0, maxMessageId);
    const firstAssistant = allAssistantIds[0] ?? null;
    const latestAssistant = allAssistantIds.at(-1) ?? null;
    if (latestAssistant === null || firstAssistant === null) {
        if ((explicitStart || explicitEnd) && maxMessageId < 0) throw rangeError('Recovery range cannot target an empty chat.');
        const start = explicitStart ? startMessageId : 0;
        const end = explicitEnd ? endMessageId : -1;
        if (explicitStart && explicitEnd && end < start) throw rangeError('Recovery end message must not be before the start message.');
        return { firstAssistantMessageId: null, latestAssistantMessageId: null, startMessageId: start, endMessageId: end, messageIds: [], plannedLineage: end >= 0 ? chatLineage(chat, end) : [] };
    }
    const start = explicitStart ? startMessageId : firstAssistant;
    const end = explicitEnd ? endMessageId : latestAssistant;
    if (end < start) throw rangeError('Recovery end message must not be before the start message.');
    return {
        firstAssistantMessageId: firstAssistant,
        latestAssistantMessageId: latestAssistant,
        startMessageId: start,
        endMessageId: end,
        messageIds: assistantMessageIdsInRange(chat, start, end),
        plannedLineage: chatLineage(chat, end),
    };
}

function recoveryCompletedPrefixMatches(recovery, chat = []) {
    const anchor = Array.isArray(recovery?.anchorLineage) ? recovery.anchorLineage : [];
    if (anchor.length && (chat.length < anchor.length || !recoveryLineageEqual(anchor, chatLineage(chat, anchor.length - 1)))) return false;
    const completedThrough = Number.isInteger(recovery?.lastCompletedMessageId) ? recovery.lastCompletedMessageId : null;
    if (completedThrough === null) return true;
    if (chat.length <= completedThrough) return false;
    const expected = (recovery?.plannedLineage || []).slice(0, completedThrough + 1);
    return recoveryLineageEqual(expected, chatLineage(chat, completedThrough));
}
function replanRecoverySuffix(recoveryInput, chat = []) {
    const recovery = structuredClone(recoveryInput || {});
    if (!recoveryCompletedPrefixMatches(recovery, chat)) {
        return { ok: false, reason: 'completed-history-changed', recovery };
    }
    const lastCompleted = Number.isInteger(recovery.lastCompletedMessageId) ? recovery.lastCompletedMessageId : -1;
    const requestedEnd = Number.isInteger(recovery.endMessageId) ? recovery.endMessageId : (chat.length - 1);
    const end = Math.min(requestedEnd, chat.length - 1);
    const completedIds = Array.isArray(recovery.messageIds) ? recovery.messageIds.slice(0, Math.max(0, Number(recovery.completed) || 0)) : [];
    const remainingStart = Math.max(Number.isInteger(recovery.startMessageId) ? recovery.startMessageId : 0, lastCompleted + 1);
    const remainingIds = end >= remainingStart ? assistantMessageIdsInRange(chat, remainingStart, end) : [];
    const currentLineage = end >= 0 ? chatLineage(chat, end) : [];
    const changed = !recoveryLineageEqual(currentLineage, recovery.plannedLineage || [])
        || !recoveryLineageEqual([...completedIds, ...remainingIds].map(String), (recovery.messageIds || []).map(String));
    recovery.endMessageId = end;
    recovery.messageIds = [...completedIds, ...remainingIds];
    recovery.total = recovery.messageIds.length;
    recovery.completed = Math.min(completedIds.length, recovery.total);
    recovery.nextMessageId = recovery.messageIds[recovery.completed] ?? null;
    recovery.plannedLineage = currentLineage;
    recovery.updatedAt = Date.now();
    if (changed) recovery.reason = 'Unprocessed recovery suffix was replanned against the current surviving chat.';
    return { ok: true, changed, recovery };
}

function defaultRecoverySessionId() {
    try {
        const generated = globalThis.crypto?.randomUUID?.();
        if (generated) return String(generated);
    } catch {}
    return 'recovery-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

// UI reads must not clone the whole sidecar.
export function createNpcStateEngine(adapters = {}) {
    const cache = new Map();
    const hydration = new Map();
    const operationEpoch = new Map();
    const locks = new Map();
    const recoverySignals = new Map();
    const recoveryRuns = new Map();
    const operationLog = createOperationDiagnostics();

    const getContext = adapters.getContext;
    const getChatKey = adapters.getChatKey;
    const getSettings = adapters.getSettings;
    const getPointer = adapters.getPointer || (() => null);
    const setPointer = adapters.setPointer || (() => {});
    const deletePointer = adapters.deletePointer || (() => {});
    const getStablePointer = adapters.getStablePointer || (() => null);
    const persistSettings = adapters.persistSettings || (() => {});
    const getHeaders = adapters.getHeaders || (() => ({}));
    const fetchFn = adapters.fetchFn || globalThis.fetch;
    const generate = adapters.generate;
    const resolveGenerationRoute = adapters.resolveGenerationRoute || (() => ({ kind: 'current' }));
    const onStateChanged = adapters.onStateChanged || (() => {});
    const onManualScanCommitted = adapters.onManualScanCommitted || (() => {});
    // Compatibility default remains immutable snapshots. The installed runtime opts out because its callback ignores the payload.
    const stateChangeSnapshot = adapters.stateChangeSnapshot !== false;
    const notify = adapters.notify || (() => {});
    const recoverySessionId = String(adapters.recoverySessionId || defaultRecoverySessionId()).slice(0, 160);
    const recoveryLeaseMs = Math.max(30000, Math.min(3600000, Number(adapters.recoveryLeaseMs) || 900000));
    const recoveryNow = typeof adapters.recoveryNow === 'function' ? adapters.recoveryNow : () => Date.now();

    function emitStateChanged(chatKey, state) {
        onStateChanged(chatKey, stateChangeSnapshot ? structuredClone(state) : null);
    }

    function recoveryOwnedByThisSession(recovery) {
        return Boolean(recovery?.ownerSessionId && recovery.ownerSessionId === recoverySessionId);
    }
    function recoveryLeaseActive(recovery) {
        return String(recovery?.status || '') === 'running'
            && Boolean(recovery?.ownerSessionId)
            && Number(recovery?.leaseUntil || 0) > recoveryNow();
    }
    function recoveryOwnedElsewhere(recovery) {
        return recoveryLeaseActive(recovery) && !recoveryOwnedByThisSession(recovery);
    }
    function claimRecoveryOwnership(recoveryInput) {
        return { ...structuredClone(recoveryInput || {}), ownerSessionId: recoverySessionId, leaseUntil: recoveryNow() + recoveryLeaseMs };
    }
    function releaseRecoveryOwnership(recoveryInput) {
        return { ...structuredClone(recoveryInput || {}), ownerSessionId: '', leaseUntil: null };
    }
    function decoratedRecoveryStatus(recoveryInput, chatKey) {
        if (!recoveryInput) return null;
        const recovery = structuredClone(recoveryInput);
        const localRunning = recoveryRuns.has(chatKey);
        const activeElsewhere = recoveryOwnedElsewhere(recovery);
        const expiredAbandoned = recovery.status === 'running' && !localRunning && !activeElsewhere && Number(recovery.leaseUntil || 0) <= recoveryNow();
        if (expiredAbandoned) {
            recovery.status = 'paused';
            recovery.reason = 'Recovery ownership lease expired and can be resumed from the last committed exchange.';
            recovery.abandoned = true;
        }
        recovery.ownedByThisSession = recoveryOwnedByThisSession(recovery);
        recovery.activeElsewhere = activeElsewhere;
        return recovery;
    }


    function prepareBranchRecoveryState(stateInput, chat = [], messageIds = [], anchorLineage = [], autoStart = true) {
        const state = normalizeState(stateInput, stateInput?.chatKey || '');
        const ids = [...new Set((messageIds || []).filter(Number.isInteger).filter(id => id >= 0 && id < chat.length))]
            .filter(id => chat[id] && !chat[id].is_system && !chat[id].is_user)
            .sort((a, b) => a - b);
        const now = recoveryNow();
        state.recovery = {
            version: 3,
            kind: 'branch-reconcile',
            status: autoStart ? 'running' : 'paused',
            ownerSessionId: autoStart ? recoverySessionId : '',
            leaseUntil: autoStart ? now + recoveryLeaseMs : null,
            relationshipMode: 're-evaluate',
            startMessageId: ids[0] ?? null,
            endMessageId: ids.at(-1) ?? null,
            messageIds: ids,
            plannedLineage: chatLineage(chat),
            anchorLineage: structuredClone(anchorLineage || []),
            completed: 0,
            total: ids.length,
            lastCompletedMessageId: null,
            nextMessageId: ids[0] ?? null,
            reason: autoStart
                ? 'Automatic branch reconstruction is replaying surviving exchanges in order from the restored full-state boundary.'
                : 'A verified full-state boundary was restored. Resume historical recovery to rebuild the surviving suffix in order.',
            error: '',
            startedAt: now,
            updatedAt: now,
            completedAt: null,
        };
        state.updatedAt = Date.now();
        return state;
    }

    if (typeof getContext !== 'function' || typeof getChatKey !== 'function' || typeof getSettings !== 'function' || typeof generate !== 'function') {
        throw new Error('NPC State engine requires getContext, getChatKey, getSettings, and generate adapters.');
    }

    function epoch(chatKey) { return operationEpoch.get(chatKey) || 0; }
    function invalidate(chatKey = getChatKey()) {
        if (!chatKey || chatKey === 'no-chat') return 0;
        const next = epoch(chatKey) + 1;
        operationEpoch.set(chatKey, next);
        return next;
    }

    function captureOperationOwnership(type, chatKey, chat = [], messageId = null) {
        const sourceId = Number.isInteger(messageId) ? messageId : null;
        const source = sourceId !== null ? chat[sourceId] : null;
        return {
            type: String(type || 'operation'),
            chatKey: String(chatKey || ''),
            messageId: sourceId,
            epoch: epoch(chatKey),
            sourceFingerprint: source ? fingerprintMessage(source) : '',
            swipeId: source && Number.isInteger(source.swipe_id) ? source.swipe_id : 0,
            lineage: sourceId !== null ? chatLineage(chat, sourceId) : chatLineage(chat),
        };
    }

    function profileEvidenceSourceEventKey(token) {
        if (!token?.chatKey || token.messageId === null) return '';
        const identity = operationHistoryIdentity([
            token.chatKey,
            String(token.messageId),
            token.sourceFingerprint || '',
            String(token.swipeId ?? 0),
            ...(Array.isArray(token.lineage) ? token.lineage : []),
        ]);
        return identity.hash ? `source:${identity.length}:${identity.hash}` : '';
    }

    function profileEvidenceSourceOptions(chatKey, chat = [], sourceMessageId = null, sourceIds = []) {
        const current = Number.isInteger(sourceMessageId)
            ? profileEvidenceSourceEventKey(captureOperationOwnership('profile-evidence-source', chatKey, chat, sourceMessageId))
            : '';
        const sourceEventKeys = {};
        const semanticSourceContextsByMessageId = {};
        const ids = [...new Set([sourceMessageId, ...(Array.isArray(sourceIds) ? sourceIds : [])].filter(Number.isInteger))];
        for (const id of ids) {
            const message = chat[id];
            if (!message || message.is_system) continue;
            const key = profileEvidenceSourceEventKey(captureOperationOwnership('profile-evidence-source', chatKey, chat, id));
            if (key) sourceEventKeys[id] = key;
            const view = analyzeStructuredEvidence(message.mes || '');
            semanticSourceContextsByMessageId[id] = {
                profileContext: profileEvidenceText(message.mes || ''),
                semanticWorldContext: view.worldStateText,
                semanticPrivateContext: view.innerChatterText,
            };
        }
        return { sourceEventKey: current, sourceEventKeys, semanticSourceContextsByMessageId };
    }


    function sourceDescriptorMatches(source, chatKey, chat = [], messageId = source?.messageId) {
        if (!source || source.chatKey !== chatKey || !Number.isInteger(messageId)) return false;
        const message = chat[messageId];
        if (!message || message.is_system || message.is_user) return false;
        if (source.fingerprint && fingerprintMessage(message) !== source.fingerprint) return false;
        if (Number.isInteger(source.swipeId) && (Number.isInteger(message.swipe_id) ? message.swipe_id : 0) !== source.swipeId) return false;
        const lineage = chatLineage(chat, messageId);
        return recoveryLineageEqual(lineage, Array.isArray(source.lineage) ? source.lineage : []);
    }

    function operationOwnershipMatches(token) {
        if (!token || getChatKey() !== token.chatKey || epoch(token.chatKey) !== token.epoch) return false;
        const liveChat = getContext().chat || [];
        const liveLineage = token.messageId !== null ? chatLineage(liveChat, token.messageId) : chatLineage(liveChat);
        if (!recoveryLineageEqual(liveLineage, token.lineage || [])) return false;
        if (token.messageId === null) return true;
        const live = liveChat[token.messageId];
        if (!live || fingerprintMessage(live) !== token.sourceFingerprint) return false;
        const swipeId = Number.isInteger(live.swipe_id) ? live.swipe_id : 0;
        return swipeId === token.swipeId;
    }

    function operationPromptMetadata(prompt = '') {
        const text = String(prompt || '');
        return {
            chars: text.length,
            tokenEstimate: text ? estimateForegroundTokens(text) : 0,
            tokenEstimateKind: 'estimated',
            tokenEstimateMethod: FOREGROUND_TOKEN_ESTIMATE_METHOD,
            responseTokenLimit: normalizeScannerResponseTokens(getSettings().scannerResponseTokens),
        };
    }

    function beginOperationDiagnostics(token, prompt = '', extra = {}) {
        const lineage = Array.isArray(token?.lineage) ? token.lineage : [];
        const preceding = token?.messageId !== null && lineage.length ? lineage.slice(0, -1) : lineage;
        return operationLog.start({
            type: token?.type || 'operation',
            chatKey: token?.chatKey || '',
            source: {
                messageId: token?.messageId ?? null,
                fingerprint: token?.sourceFingerprint || '',
                swipeId: token?.messageId !== null ? token?.swipeId ?? 0 : null,
                history: operationHistoryIdentity(lineage),
                precedingHistory: operationHistoryIdentity(preceding),
            },
            prompt: operationPromptMetadata(prompt),
            selectedNpcIds: extra.selectedNpcIds || [],
            recovery: extra.recovery || {},
        });
    }

    function updateOperationFromApplication(operationId, applied) {
        operationLog.patch(operationId, {
            application: { status: 'applied' },
            selectedNpcIds: applied?.targetNpcIds || applied?.exchangeActiveNpcIds || [],
            proposals: summarizeProposalDiagnostics(applied?.semanticDiagnostics, applied?.coverageDiagnostics),
        });
    }

    function finishDiscardedOperation(operationId, reason, stage = 'ownership') {
        operationLog.finish(operationId, {
            status: 'discarded',
            failure: { stage, reason: String(reason || 'stale-operation').slice(0, 300) },
        });
    }

    async function exclusive(chatKey, task) {
        const key = String(chatKey || '');
        const previous = locks.get(key) || Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const queued = previous.catch(() => {}).then(() => gate);
        locks.set(key, queued);
        await previous.catch(() => {});
        try { return await task(); }
        finally {
            release();
            if (locks.get(key) === queued) locks.delete(key);
        }
    }

    function publishPersistedState(chatKey, state, error = null) {
        cache.set(chatKey, state);
        hydration.set(chatKey, { status: 'ready', error });
        emitStateChanged(chatKey, state);
        return state;
    }

    async function persist(chatKey, state, { publish = true } = {}) {
        const result = await writeV3Sidecar({
            chatKey,
            state,
            pointer: getPointer(chatKey),
            fetchFn,
            headers: getHeaders(),
        });
        setPointer(chatKey, result.pointer);
        persistSettings();
        if (publish) publishPersistedState(chatKey, result.state);
        return result.state;
    }



    function blockAfterUnownedSave(stateInput) {
        const blocked = normalizeState(stateInput, stateInput?.chatKey || '');
        blocked.npcs = blocked.npcs.map(npc => ({ ...npc, present: false, worldActive: false }));
        blocked.lastObservation = { messageId: null, exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], targetNpcIds: [] };
        if (blocked.recovery && ['running', 'complete'].includes(String(blocked.recovery.status || ''))) {
            blocked.recovery = releaseRecoveryOwnership(blocked.recovery);
            blocked.recovery.status = 'stale';
            blocked.recovery.reason = 'Recovery source history changed while a recovery commit was saving. The saved recovery boundary is not accepted as complete; restart/reconcile from a verified history boundary.';
            blocked.recovery.error = 'history-changed-during-persist';
            blocked.recovery.completedAt = null;
            blocked.recovery.updatedAt = recoveryNow();
        }
        blocked.branchSafety = {
            status: 'rebase-required',
            kind: 'commit-history-changed',
            reason: 'Chat history changed while NPC State was saving. The completed write is not accepted as current; reconcile the surviving timeline before normal scanning resumes.',
        };
        blocked.updatedAt = Date.now();
        return blocked;
    }

    async function commitState({
        token = null,
        operationId = '',
        state,
        chat = [],
        messageId = null,
        checkpointReason = '',
        checkpoint = true,
        lastScannedMessageId = undefined,
        ownershipPolicy = 'story',
    }) {
        const userOwned = ownershipPolicy === 'user';
        const ownedBeforePersist = !token || operationOwnershipMatches(token);
        if (!ownedBeforePersist && !userOwned) {
            finishDiscardedOperation(operationId, 'history-changed-before-persist', 'pre-persist');
            return { ok: false, discarded: true, reason: 'stale-operation' };
        }

        let candidate = normalizeState(state, state?.chatKey || token?.chatKey || '');
        const checkpointed = checkpoint && ownedBeforePersist && Number.isInteger(messageId) && messageId >= 0;
        if (checkpointed) candidate = recordCheckpoint(candidate, chat, messageId, checkpointReason);
        if (lastScannedMessageId !== undefined) candidate.lastScannedMessageId = lastScannedMessageId;
        candidate.updatedAt = Date.now();
        operationLog.patch(operationId, {
            checkpoint: checkpointed ? { messageId, reason: checkpointReason || '' } : {},
            persistence: { status: 'saving', revision: null },
        });

        let persisted;
        try {
            persisted = await persist(candidate.chatKey, candidate, { publish: false });
        } catch (error) {
            operationLog.finish(operationId, {
                status: 'failed',
                persistence: { status: 'failed', revision: null },
                failure: { stage: 'persistence', reason: String(error?.message || error).slice(0, 300) },
            });
            throw error;
        }

        const ownedAfterPersist = !token || operationOwnershipMatches(token);
        if (!ownedBeforePersist || !ownedAfterPersist) {
            let blocked = blockAfterUnownedSave(persisted);
            let blockError = null;
            try { blocked = await persist(candidate.chatKey, blocked); }
            catch (error) {
                blockError = error;
                cache.set(candidate.chatKey, blocked);
                hydration.set(candidate.chatKey, { status: 'ready', error });
                emitStateChanged(candidate.chatKey, blocked);
            }
            const reason = userOwned ? 'history-changed-during-user-owned-save' : 'history-changed-during-persist';
            operationLog.finish(operationId, {
                status: userOwned ? 'committed-needs-reconcile' : 'discarded',
                persistence: {
                    status: userOwned
                        ? (blockError ? 'committed-history-shift-block-local' : 'committed-history-shift-blocked')
                        : (blockError ? 'saved-unowned-block-local' : 'saved-unowned-blocked'),
                    revision: Number(persisted.revision) || null,
                    blockingRevision: Number(blocked.revision) || null,
                },
                source: { historyChangedDuringSave: true },
                failure: { stage: 'post-persist', reason },
            });
            if (userOwned) {
                return { ok: true, committed: true, needsReconcile: true, reason, persistenceFailed: Boolean(blockError), state: blocked };
            }
            return { ok: false, discarded: true, reason, persistenceFailed: Boolean(blockError), state: structuredClone(blocked) };
        }

        publishPersistedState(candidate.chatKey, persisted);
        operationLog.finish(operationId, {
            status: 'committed',
            persistence: { status: 'committed', revision: Number(persisted.revision) || null },
        });
        return { ok: true, committed: true, needsReconcile: false, state: persisted };
    }

    async function installFreshSidecar(chatKey, state, { allowExisting = false } = {}) {
        const previousPointer = getPointer(chatKey);
        const result = await createRecoveryV3Sidecar({
            chatKey,
            state,
            previousPointer,
            allowExisting,
            fetchFn,
            headers: getHeaders(),
        });
        setPointer(chatKey, result.pointer);
        persistSettings();
        cache.set(chatKey, result.state);
        hydration.set(chatKey, { status: 'ready', error: null });
        emitStateChanged(chatKey, result.state);
        return { state: result.state, pointer: result.pointer, previousPointer: result.previousPointer };
    }

    async function loadChat(chatKey = getChatKey()) {
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return null;
        if (cache.has(chatKey)) return cache.get(chatKey);
        hydration.set(chatKey, { status: 'loading', error: null });
        try {
            const configuredPointer = getPointer(chatKey);
            const hintedPointer = readV3PointerHint(chatKey);
            const pointer = !configuredPointer?.path && hintedPointer?.path
                ? hintedPointer
                : (configuredPointer?.path && hintedPointer?.path && configuredPointer.path === hintedPointer.path && Number(hintedPointer.revision || 0) > Number(configuredPointer.revision || 0) ? hintedPointer : configuredPointer);
            let state;
            let importedStable = false;
            if (pointer?.path) {
                const loaded = await readV3Sidecar({ chatKey, pointer, fetchFn });
                if (!loaded) {
                    const error = new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement without explicit recovery.');
                    error.code = 'NPC_STATE_V04_BETA_MISSING_SIDECAR';
                    error.pointer = structuredClone(pointer);
                    throw error;
                }
                if (loaded.retired) {
                    const error = new Error('NPC State beta sidecar was retired by a chat rename/delete lifecycle transaction. Refusing to hydrate it as empty live state.');
                    error.code = 'NPC_STATE_V04_BETA_RETIRED_SIDECAR';
                    error.redirectChatKey = loaded.redirectChatKey || '';
                    throw error;
                }
                state = loaded.state;
                if (!configuredPointer?.path || Number(pointer.revision || 0) > Number(configuredPointer.revision || 0)) {
                    setPointer(chatKey, pointer);
                    persistSettings();
                }
            } else {
                const stablePointer = getStablePointer(chatKey);
                if (stablePointer?.path) {
                    const stable = await readV3Sidecar({ chatKey, pointer: stablePointer, fetchFn });
                    if (stable) {
                        state = stable.state;
                        importedStable = true;
                    } else {
                        // Stable v0.3 is only an optional import source for the beta. A stale
                        // legacy pointer must never prevent a first-time beta user from starting.
                        // Do not mutate stable settings or recreate the missing stable sidecar.
                        console.warn('[NPC State Beta] Optional stable v0.3 import pointer is stale; starting a fresh beta database.', {
                            chatKey,
                            path: stablePointer.path,
                        });
                        state = createEmptyState(chatKey);
                    }
                } else {
                    state = createEmptyState(chatKey);
                }
            }
            const normalized = normalizeState(state, chatKey);
            const recoveryWasRunning = normalized.recovery?.status === 'running';
            const recoveryObservedElsewhere = recoveryWasRunning && recoveryOwnedElsewhere(normalized.recovery);
            const recoveryInterrupted = recoveryWasRunning && !recoveryObservedElsewhere;
            if (recoveryInterrupted) {
                normalized.recovery = releaseRecoveryOwnership(normalized.recovery);
                normalized.recovery.status = 'paused';
                normalized.recovery.reason = 'Recovery ownership was abandoned or its lease expired. Resume from the last committed exchange.';
                normalized.recovery.error = '';
                normalized.recovery.updatedAt = Date.now();
            }
            const fingerprintUpgraded = Number(normalized.branchFingerprintVersion || 0) < 3;
            if (fingerprintUpgraded) {
                // Stored lineages used an older fingerprint policy. They cannot be safely
                // translated after transport canonicalization and swipe-index removal.
                // Preserve durable NPC data, reset only rollback metadata, and accept the
                // currently visible chat as the new canonical baseline once.
                normalized.checkpoints = [];
                normalized.branchBase = null;
                normalized.branchHeadLineage = [];
                normalized.branchSafety = { status: 'safe', kind: '', reason: '' };
                normalized.branchFingerprintVersion = 3;
            }
            state = normalized;
            if (importedStable || fingerprintUpgraded || recoveryInterrupted) {
                state = await persist(chatKey, state);
                if (importedStable) {
                    notify('success', 'Cloned stable NPC State v0.3 dossiers into an independent beta sidecar. Stable data was not modified.');
                } else if (fingerprintUpgraded) {
                    notify('info', 'Upgraded branch checkpoint fingerprints for transport-safe, swipe-index-independent rollback. Existing dossiers were preserved; old rollback hashes were reset once.');
                } else if (recoveryInterrupted) {
                    notify('info', 'Historical recovery was interrupted by reload and is paused at the last committed exchange. Resume it from Recovery & Branch Safety.');
                }
            }
            cache.set(chatKey, state);
            hydration.set(chatKey, { status: 'ready', error: null });
            emitStateChanged(chatKey, state);
            return state;
        } catch (error) {
            hydration.set(chatKey, { status: 'error', error });
            throw error;
        }
    }

    async function invokeJson(prompt, label = 'scan', signal = null, { budget = null, operationId = '', purpose = label } = {}) {
        const responseLength = normalizeScannerResponseTokens(getSettings().scannerResponseTokens);
        const route = await resolveGenerationRoute({ label });
        const request = async (requestPrompt, requestLabel, requestPurpose) => {
            if (budget && budget.count >= budget.limit) {
                const error = new Error(`Provider request budget exhausted (${budget.count}/${budget.limit}).`);
                error.code = 'NPC_STATE_PROVIDER_REQUEST_BUDGET';
                throw error;
            }
            if (budget) {
                budget.count += 1;
                budget.requests.push({ number: budget.count, purpose: requestPurpose, label: requestLabel, input: operationPromptMetadata(SCAN_SYSTEM_PROMPT + '\n\n' + requestPrompt) });
                if (operationId) operationLog.patch(operationId, { requests: requestBudgetSnapshot(budget) });
            }
            return generate({ systemPrompt: SCAN_SYSTEM_PROMPT, prompt: requestPrompt, responseLength, label: requestLabel, route, signal });
        };
        let raw = await request(prompt, label, purpose);
        try { return parseScanJson(raw, { requireLifeStateUpdates: true }); }
        catch (firstError) {
            const retryPrompt = prompt + '\n\nYour previous response was malformed. Return exactly one valid JSON object, no markdown and no commentary.';
            try { raw = await request(retryPrompt, label + '-json-retry', purpose + '-json-retry'); }
            catch (budgetError) { budgetError.cause = firstError; throw budgetError; }
            try { return parseScanJson(raw, { requireLifeStateUpdates: true }); }
            catch (secondError) { secondError.cause = firstError; throw secondError; }
        }
    }

    async function invokeOperationJson(prompt, label, operationId, signal = null, requestOptions = {}) {
        try { return await invokeJson(prompt, label, signal, { ...requestOptions, operationId }); }
        catch (error) {
            operationLog.finish(operationId, { status: 'failed', failure: { stage: 'model', reason: String(error?.message || error).slice(0, 300) } });
            throw error;
        }
    }

    async function scan(messageId, { manual = false, force = false, applyRelationship = null, onPhase = null, expectedSource = null, signal = null } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        const settings = getSettings();
        if (!manual && settings.enabled === false) return { ok: false, reason: 'disabled' };
        if (!manual && settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };
        if (manual) invalidate(chatKey); // explicit user scan supersedes queued automatic work

        const queuedChat = getContext().chat || [];
        const queuedMessage = queuedChat[messageId];
        if (!queuedMessage || queuedMessage.is_system || queuedMessage.is_user) return { ok: false, reason: 'not-assistant-message' };
        if (signal?.aborted) return { ok: false, discarded: true, reason: 'scan-cancelled', messageId };
        if (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, queuedChat, messageId)) {
            return { ok: false, discarded: true, reason: 'stale-source-before-queue', messageId };
        }
        // Automatic post-response ownership is captured BEFORE hydration/exclusive waiting.
        // Appending later chat after this source does not alter lineage through messageId.
        const queuedOwnership = !manual ? captureOperationOwnership('automatic-scan', chatKey, queuedChat, messageId) : null;
        onPhase?.('queued');

        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (!state) return { ok: false, reason: 'no-state' };
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', messageId, recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };
            const alreadyScannedMessage = state.lastScannedMessageId === messageId;
            if (!force && alreadyScannedMessage) return { ok: true, skipped: true, reason: 'already-scanned', messageId };
            const ctx = getContext();
            const chat = ctx.chat || [];
            const exchange = currentExchange(chat, messageId);
            if (!exchange) return { ok: false, reason: 'not-assistant-message' };
            const relationshipApplyRequested = applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true;
            const replayProtectedRelationship = relationshipReplayProtected(state, chat, messageId);
            const ownership = queuedOwnership || captureOperationOwnership(manual ? 'scan-current-cast' : 'automatic-scan', chatKey, chat, messageId);
            if (signal?.aborted) return { ok: false, discarded: true, reason: 'scan-cancelled', messageId };
            if (!operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, chat, messageId))) return { ok: false, discarded: true, reason: 'stale-operation-before-dispatch', messageId };

            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);
            const candidateNpcIds = relevantNpcsForExchange(state, exchange, 12, resolvePlayerName('', chat, messageId)).map(npc => npc.id);
            const prompt = buildScanPrompt({
                state,
                chat,
                assistantMessageId: messageId,
                candidateNpcIds,
                scanDepth: manual ? settings.scanDepth : 2,
                relationshipCriteria: settings.relationshipCriteria,
                relationshipCaps: settings.relationshipCaps,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
                relationshipSummaryRepair: manual,
                routine: true,
            });
            const operationId = beginOperationDiagnostics(ownership, prompt);
            const requestBudget = !manual ? createProviderRequestBudget(2) : null;
            onPhase?.('scanning');
            let parsed;
            try {
                parsed = await invokeOperationJson(prompt, manual ? 'manual-current-cast' : 'automatic-current-cast', operationId, signal, requestBudget ? { budget: requestBudget, purpose: 'automatic-first-pass' } : {});
            } catch (error) {
                onPhase?.('failed', { reason: String(error?.message || error) });
                throw error;
            }
            const liveCtx = getContext();
            const liveChat = liveCtx.chat || [];
            if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, liveChat, messageId))) {
                finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'post-model');
                return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };
            }
            const working = ensurePreUpdateBaseline(normalizeState(state, chatKey), chat, messageId);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const exchangeSourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);
            const evidencePolicy = buildExchangeEvidencePolicy(exchange);
            const semanticSourceOptions = profileEvidenceSourceOptions(chatKey, chat, messageId, exchangeSourceIds);
            let applied = applyScanResult(working, parsed, {
                sourceMessageId: messageId,
                ...semanticSourceOptions,
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                playerName: resolvePlayerName('', chat, messageId),
                relationshipContext: relationshipContextForExchange(exchange),
                // Routine scan validates new evidence against the owned exchange. Saved
                // profile-evolution observations remain available through dossier state.
                profileContext: profileContextForExchange(exchange),
                evidencePolicy,
                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
                admissionMode: settings.newNpcAdmissionMode,
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
                coverageNpcIds: candidateNpcIds,
                requireDossierCoverage: true,
                requireCandidateAccounting: true,
                applyRelationship: relationshipApplyRequested && !replayProtectedRelationship,
                repairRelationshipSummary: manual,
            });

            if (!manual) {
                const followUpMode = String(settings.firstContactFollowUpMode || 'off');
                const completionTargets = firstContactCompletionTargets(working, applied.state, applied.coverageDiagnostics, followUpMode, applied.semanticDiagnostics);
                const followUp = {
                    mode: followUpMode,
                    contractRepair: completionTargets.some(target => target.contractRepair),
                    status: completionTargets.length ? 'pending' : (followUpMode === 'off' ? 'off' : 'unnecessary'),
                    targetCount: completionTargets.length,
                    requestedFields: completionTargets.reduce((sum, target) => sum + target.fields.length, 0),
                    acceptedChanges: 0,
                    remainingOutcomes: 0,
                };
                if (completionTargets.length && requestBudget.count >= requestBudget.limit) {
                    followUp.status = 'skipped-budget';
                } else if (completionTargets.length) {
                    const completionPrompt = buildFirstContactCompletionPrompt({
                        targets: completionTargets, chat, assistantMessageId: messageId,
                        playerName: resolvePlayerName('', chat, messageId),
                        memoryCriteria: settings.memoryCriteria, dossierLimits: settings.dossierLimits,
                        scope: completionTargets.some(target => target.contractRepair) ? 'contract-repair' : 'automatic',
                    });
                    try {
                        const completionRaw = await invokeJson(completionPrompt, 'automatic-first-contact-completion', signal, { budget: requestBudget, operationId, purpose: 'first-contact-follow-up' });
                        const postCompletionChat = getContext().chat || [];
                        if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, postCompletionChat, messageId))) {
                            finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'post-first-contact-completion');
                            return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };
                        }
                        const sanitized = sanitizeFirstContactCompletionPayload(completionRaw, completionTargets);
                        const completionApplied = applyScanResult(applied.state, sanitized.payload, {
                            sourceMessageId: messageId, ...semanticSourceOptions, turn: working.turn,
                            preservePresence: true, preserveObservation: true, applyRelationship: false, reconcileFamilyGraph: false,
                            playerName: resolvePlayerName('', chat, messageId), dossierLimits: settings.dossierLimits,
                            profileContext: profileContextForExchange(exchange), evidencePolicy,
                            currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
                            birthdayFill: { mode: settings.birthdayFillMode, calendar: settings.birthdayRandomCalendar, fallbackDays: settings.birthdayRandomDaysPerMonth },
                            applyReturnedNpcPatches: true,
                        });
                        const audit = auditFirstContactCompletion(sanitized.payload, completionTargets, completionApplied.semanticDiagnostics, sanitized.diagnostics);
                        applied = {
                            ...applied,
                            state: completionApplied.state,
                            semanticDiagnostics: [...(applied.semanticDiagnostics || []).map(row =>
                                audit.resolvedByNpc.get(row?.npcId)?.has(row?.field) && row.status === 'rejected-proposal'
                                    ? { ...row, status: 'repaired-proposal' } : row), ...(completionApplied.semanticDiagnostics || [])],
                            coverageDiagnostics: reconcileCompletionCoverage(applied.coverageDiagnostics, audit),
                        };
                        followUp.status = 'ran';
                        followUp.acceptedChanges = audit.acceptedChanges;
                        followUp.remainingOutcomes = audit.remainingOutcomes;
                    } catch (error) {
                        const failedCompletionChat = getContext().chat || [];
                        if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, failedCompletionChat, messageId))) {
                            finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'first-contact-completion-failed');
                            return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };
                        }
                        const reason = String(error?.message || error).slice(0, 300);
                        followUp.status = 'failed';
                        followUp.failure = reason;
                        applied.coverageDiagnostics = [
                            ...(applied.coverageDiagnostics || []),
                            ...completionTargets.map(target => ({ npcId: target.npc.id, status: 'first-contact-completion-failed', coverageKind: 'first-contact-completion', reason })),
                        ];
                    }
                }
                operationLog.patch(operationId, { followUp, requests: requestBudgetSnapshot(requestBudget) });
            }

            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);
            const retentionExchange = { ...exchange, user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null, assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null };
            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);
            const stale = applyStaleLifecycle(applied.state, {
                settings,
                currentTurn: narrativeTurnForMessage(liveChat, messageId),
                sourceMessageId: messageId,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds,
            });
            updateOperationFromApplication(operationId, applied);
            if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, liveChat, messageId))) {
                finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'pre-commit');
                return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };
            }
            onPhase?.('saving');
            const commit = await commitState({ token: ownership, operationId, state: stale.state, chat: liveChat, messageId, checkpointReason: manual ? 'manual-scan' : 'auto-scan', lastScannedMessageId: messageId });
            if (!commit.ok) return { ...commit, messageId, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: applied.coverageDiagnostics || [] };
            const persisted = commit.state;
            const notice = lifecycleNotice(stale);
            if (notice) notify('info', `Stale management ${notice}.`);
            const scanResult = {
                ok: true,
                messageId,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds,
                targetNpcIds: applied.targetNpcIds,
                semanticDiagnostics: applied.semanticDiagnostics || [],
                coverageDiagnostics: applied.coverageDiagnostics || [],
                stale: {
                    archivedIds: stale.archivedIds,
                    restoredIds: stale.restoredIds,
                    deletedIds: stale.deletedIds,
                    currentTurn: stale.currentTurn,
                },
                state: structuredClone(persisted),
            };
            if (manual) {
                try { onManualScanCommitted(messageId, scanResult); } catch (error) {
                    console.warn('[NPC State Beta] manual scan status reconciliation failed safely', error);
                }
            }
            return scanResult;
        });
    }

    async function importStructuredDossier(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };
            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const npc = findNpcByReference(state, reference);
            if (!npc) return { ok: false, reason: 'not-found' };
            const ctx = getContext();
            const chat = ctx.chat || [];
            const settings = getSettings();
            const blocks = structuredDossierBlocksForNpc(chat, npc, Math.max(12, Number(settings.scanDepth) || 8) * 3);
            // Non-Megumin users and chats without a matching structured dossier source stop
            // here. No scanner generation, sidecar mutation, presence change, or prompt cost.
            if (!blocks.length) return { ok: false, reason: 'no-structured-source', npcId: npc.id };
            const messageId = latestAssistantMessageId(chat);
            if (messageId < 0) return { ok: false, reason: 'no-assistant-message' };
            const ownership = captureOperationOwnership('structured-import', chatKey, chat, messageId);
            const sourceContext = blocks.map(block => block.body).join('\n');
            const prompt = buildStructuredDossierImportPrompt({
                npc,
                blocks,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
            });
            const operationId = beginOperationDiagnostics(ownership, prompt, { selectedNpcIds: [npc.id] });
            const parsedRaw = await invokeOperationJson(prompt, 'structured-import-' + npc.id, operationId);
            const candidate = (parsedRaw.npcs || []).find(patch => {
                const patchId = String(patch?.id || '').trim();
                return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);
            });
            if (!candidate) {
                operationLog.finish(operationId, { status: 'rejected', failure: { stage: 'validation', reason: 'structured-source-no-target' } });
                return { ok: false, reason: 'structured-source-no-target', npcId: npc.id };
            }
            const parsed = {
                exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [],
                npcs: [sanitizeStructuredDossierPatch(candidate, npc)], socialEdges: [], familyFacts: [],
            };
            const liveChat = getContext().chat || [];
            if (!operationOwnershipMatches(ownership)) {
                finishDiscardedOperation(operationId, 'stale-operation', 'post-model');
                return { ok: false, discarded: true, reason: 'stale-operation' };
            }
            const baselineState = ensurePreUpdateBaseline(state, liveChat, messageId);
            const applied = applyScanResult(baselineState, parsed, {
                sourceMessageId: messageId,
                ...profileEvidenceSourceOptions(chatKey, liveChat, messageId, blocks.map(block => block.messageId).filter(Number.isInteger)),
                turn: baselineState.turn,
                preservePresence: true,
                preserveObservation: true,
                applyRelationship: false,
                reconcileFamilyGraph: false,
                allowHistoricalProfilePatches: true,
                profileContext: sourceContext,
                relationshipContext: '',
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
            });
            updateOperationFromApplication(operationId, applied);
            const commit = await commitState({ token: ownership, operationId, state: applied.state, chat: liveChat, messageId, checkpointReason: 'structured-dossier-import' });
            if (!commit.ok) return { ...commit, npcId: npc.id, sourceCount: blocks.length };
            return { ok: true, npcId: npc.id, sourceCount: blocks.length, state: structuredClone(commit.state) };
        });
    }

    async function recheckMissingDetails(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };
            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const npc = findNpcByReference(state, reference);
            if (!npc) return { ok: false, reason: 'not-found' };
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            if (messageId < 0) return { ok: false, reason: 'no-assistant-message' };
            const exchange = currentExchange(chat, messageId);
            if (!exchange) return { ok: false, reason: 'not-assistant-message' };
            const targets = manualRecheckTargets(npc);
            if (!targets.length) return { ok: true, skipped: true, reason: 'no-eligible-blank-fields', npcId: npc.id, state: structuredClone(state) };
            const ownership = captureOperationOwnership('recheck-missing-details', chatKey, chat, messageId);
            const settings = getSettings();
            const prompt = buildFirstContactCompletionPrompt({ targets, chat, assistantMessageId: messageId, playerName: resolvePlayerName('', chat, messageId), memoryCriteria: settings.memoryCriteria, dossierLimits: settings.dossierLimits, scope: 'manual' });
            const operationId = beginOperationDiagnostics(ownership, prompt, { selectedNpcIds: [npc.id] });
            const parsedRaw = await invokeOperationJson(prompt, 'manual-missing-detail-recheck-' + npc.id, operationId);
            const liveChat = getContext().chat || [];
            if (!operationOwnershipMatches(ownership)) {
                finishDiscardedOperation(operationId, 'stale-operation', 'post-model');
                return { ok: false, discarded: true, reason: 'stale-operation', npcId: npc.id };
            }
            const sanitized = sanitizeFirstContactCompletionPayload(parsedRaw, targets);
            const evidencePolicy = buildExchangeEvidencePolicy(exchange);
            const sourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);
            const applied = applyScanResult(state, sanitized.payload, {
                sourceMessageId: messageId, ...profileEvidenceSourceOptions(chatKey, liveChat, messageId, sourceIds), turn: state.turn,
                preservePresence: true, preserveObservation: true, applyRelationship: false, reconcileFamilyGraph: false,
                playerName: resolvePlayerName('', liveChat, messageId), dossierLimits: settings.dossierLimits,
                profileContext: profileContextForExchange(exchange), evidencePolicy,
                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
                birthdayFill: { mode: settings.birthdayFillMode, calendar: settings.birthdayRandomCalendar, fallbackDays: settings.birthdayRandomDaysPerMonth },
                applyReturnedNpcPatches: true,
            });
            const audit = auditFirstContactCompletion(sanitized.payload, targets, applied.semanticDiagnostics, sanitized.diagnostics);
            applied.coverageDiagnostics = audit.diagnostics;
            updateOperationFromApplication(operationId, applied);
            operationLog.patch(operationId, { followUp: { mode: 'manual', status: 'ran', targetCount: 1, requestedFields: audit.requestedFields, acceptedChanges: audit.acceptedChanges, remainingOutcomes: audit.remainingOutcomes } });
            const commit = await commitState({ token: ownership, operationId, state: applied.state, chat: liveChat, messageId, checkpointReason: 'manual-missing-detail-recheck' });
            if (!commit.ok) return { ...commit, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: audit.diagnostics };
            return { ok: true, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: audit.diagnostics, state: structuredClone(commit.state) };
        });
    }

    async function refreshDossier(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };
            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const npc = findNpcByReference(state, reference);
            if (!npc) return { ok: false, reason: 'not-found' };
            const ctx = getContext();
            const chat = ctx.chat || [];
            const messageId = latestAssistantMessageId(chat);
            if (messageId < 0) return { ok: false, reason: 'no-assistant-message' };
            const ownership = captureOperationOwnership('refresh-npc', chatKey, chat, messageId);
            const settings = getSettings();
            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);
            const prompt = buildTargetedRefreshPrompt({
                npc,
                chat,
                assistantMessageId: messageId,
                scanDepth: settings.scanDepth,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
            });
            const operationId = beginOperationDiagnostics(ownership, prompt, { selectedNpcIds: [npc.id] });
            const parsedRaw = await invokeOperationJson(prompt, `targeted-${npc.id}`, operationId);
            const parsed = {
                exchangeActiveNpcIds: [],
                finalPresentNpcIds: [],
                worldActiveNpcIds: [],
                npcs: (parsedRaw.npcs || []).filter(patch => {
                    const patchId = String(patch?.id || '').trim();
                    return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);
                }).slice(0, 1),
                socialEdges: [],
                familyFacts: [],
                lifeStateUpdates: (parsedRaw.lifeStateUpdates || []).filter(update => {
                    const ref = String(update?.id || update?.name || update?.target || '').trim();
                    return ref === npc.id || normalizeName(ref) === normalizeName(npc.name) || (npc.aliases || []).some(alias => normalizeName(alias) === normalizeName(ref));
                }).slice(0, 1),
            };
            const liveChat = getContext().chat || [];
            if (!operationOwnershipMatches(ownership)) {
                finishDiscardedOperation(operationId, 'stale-operation', 'post-model');
                return { ok: false, discarded: true, reason: 'stale-operation' };
            }
            const refreshStructured = structuredSemanticContextsForWindow(liveChat, messageId, settings.scanDepth);
            const baselineState = ensurePreUpdateBaseline(state, liveChat, messageId);
            const applied = applyScanResult(baselineState, parsed, {
                sourceMessageId: messageId,
                ...profileEvidenceSourceOptions(chatKey, liveChat, messageId, profileSourceIdsForWindow(liveChat, messageId, settings.scanDepth)),
                turn: baselineState.turn,
                preservePresence: true,
                preserveObservation: true,
                applyRelationship: false,
                allowHistoricalProfilePatches: true,
                profileContext: profileContextForWindow(liveChat, messageId, settings.scanDepth),
                semanticWorldContext: refreshStructured.world,
                semanticPrivateContext: refreshStructured.private,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                playerName: resolvePlayerName('', liveChat, messageId),
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
                coverageNpcIds: [npc.id],
                reconcileRelationshipSummary: true,
                reconcileFamilyGraph: false,
            });
            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);
            updateOperationFromApplication(operationId, applied);
            const commit = await commitState({ token: ownership, operationId, state: applied.state, chat: liveChat, messageId, checkpointReason: 'targeted-refresh' });
            if (!commit.ok) return { ...commit, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: applied.coverageDiagnostics || [] };
            return { ok: true, npcId: npc.id, semanticDiagnostics: applied.semanticDiagnostics || [], coverageDiagnostics: applied.coverageDiagnostics || [], state: structuredClone(commit.state) };
        });
    }

    async function mutate(label, mutator, { checkpointReason = 'manual', allowUnsafeKind = '', checkpoint = true } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        // A user/editor mutation requested while automatic scanning is running wins.
        invalidate(chatKey);
        const chatChanged = stage => ({ ok: false, discarded: true, reason: 'chat-changed', stage });
        return exclusive(chatKey, async () => {
            if (getChatKey() !== chatKey) return chatChanged('mutation-after-queue');
            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (getChatKey() !== chatKey) return chatChanged('mutation-after-load');
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };
            const unsafeKind = state.branchSafety?.status !== 'safe' ? String(state.branchSafety?.kind || '') : '';
            const unsafeRemediation = Boolean(unsafeKind && allowUnsafeKind && unsafeKind === allowUnsafeKind);
            if (unsafeKind && !unsafeRemediation) return { ok: false, reason: 'branch-unsafe' };
            const context = getContext();
            if (getChatKey() !== chatKey) return chatChanged('mutation-before-read');
            const chat = context.chat || [];
            const messageId = latestAssistantMessageId(chat);
            const ownership = captureOperationOwnership('manual-' + label, chatKey, chat, messageId >= 0 ? messageId : null);
            const operationId = beginOperationDiagnostics(ownership, '');
            if (getChatKey() !== chatKey) { finishDiscardedOperation(operationId, 'chat-changed', 'mutation-before-apply'); return chatChanged('mutation-before-apply'); }
            const result = await mutator(state, chat, { unsafeKind: unsafeRemediation ? unsafeKind : '' });
            if (result === false) { operationLog.finish(operationId, { status: 'rejected', failure: { stage: 'validation', reason: 'rejected' } }); return { ok: false, reason: 'rejected' }; }
            if (result?.rejected) { operationLog.finish(operationId, { status: 'rejected', failure: { stage: 'validation', reason: String(result.rejected).slice(0, 300) } }); return { ok: false, reason: String(result.rejected) }; }
            if (result?.npcId) operationLog.patch(operationId, { selectedNpcIds: [result.npcId] });
            if (getChatKey() !== chatKey) { finishDiscardedOperation(operationId, 'chat-changed', 'mutation-before-commit'); return chatChanged('mutation-before-commit'); }
            let commit;
            try {
                commit = await commitState({ operationId, token: ownership, state, chat, messageId, checkpointReason, checkpoint: unsafeRemediation ? false : checkpoint, ownershipPolicy: 'user' });
            } catch (error) {
                if (!unsafeRemediation) throw error;
                const persistedBlocked = cache.get(chatKey) || state;
                return {
                    ok: false, label, reason: 'correction-remediation-persistence-failed', persistenceFailed: true,
                    error: String(error?.message || error).slice(0, 500),
                    state: structuredClone(persistedBlocked), result,
                };
            }
            return { ok: true, label, state: structuredClone(commit.state), result, needsReconcile: commit.needsReconcile === true, reason: commit.reason || '' };
        });
    }

    async function addNpc(name) {
        if (typeof name !== 'string') return { ok: false, reason: 'invalid-name-type' };
        const clean = name.trim().slice(0, 120);
        if (!clean) return { ok: false, reason: 'empty-name' };
        return mutate('add', (state, chat) => {
            const existing = findNpcByReference(state, clean);
            if (existing) return { npcId: existing.id, existing: true };
            if ((state.suppressedNames || []).some(value => normalizeName(value) === normalizeName(clean))) {
                state.suppressedNames = state.suppressedNames.filter(value => normalizeName(value) !== normalizeName(clean));
            }
            const messageId = latestAssistantMessageId(chat);
            const npc = normalizeNpc({
                id: makeNpcId(clean),
                name: clean,
                manual: true,
                createdAt: Date.now(),
                lastActivityTurn: narrativeTurnForMessage(chat, messageId),
                lastActivityMessageId: messageId >= 0 ? messageId : null,
                lastActivityReason: 'manual-add',
            });
            state.npcs.push(npc);
            return { npcId: npc.id, existing: false };
        }, { checkpointReason: 'manual-add' });
    }

    function manualOwnedValueEqual(left, right) {
        try { return JSON.stringify(left) === JSON.stringify(right); }
        catch { return false; }
    }


    function manualNpcPatchValueIssue(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'expected-object-patch';
        const issue = manualOwnedFieldValueIssue(patch);
        if (issue) return issue;
        const has = field => Object.prototype.hasOwnProperty.call(patch, field);
        if (has('birthdayProvenance') && typeof patch.birthdayProvenance !== 'string') return 'birthdayProvenance:expected-string-value';
        if (has('importance') && !finiteManualNumericInput(patch.importance)) return 'importance:expected-finite-number-or-numeric-string';
        if (has('manualProfileFields') && (!Array.isArray(patch.manualProfileFields) || patch.manualProfileFields.some(value => typeof value !== 'string'))) return 'manualProfileFields:expected-string-array';
        return '';
    }

    async function updateNpc(reference, patch = {}, options = {}) {
        return mutate('update', (state, chat, mutationContext = {}) => {
            const valueIssue = manualNpcPatchValueIssue(patch);
            if (valueIssue) return { rejected: 'invalid-value-type:' + valueIssue };
            const matched = findNpcByReference(state, reference);
            const index = matched ? state.npcs.findIndex(npc => npc.id === matched.id) : -1;
            if (index < 0) return false;
            let current = state.npcs[index];
            if (Number.isFinite(Number(options.expectedUpdatedAt)) && Number(current.updatedAt) !== Number(options.expectedUpdatedAt)) return { rejected: 'stale-editor' };
            const remediation = mutationContext.unsafeKind === 'manual-relationship-correction-uncertain';
            const clearRelationshipOnly = options.clearRelationshipCorrectionsOnly === true;
            if (remediation) {
                const allowed = new Set(['relationship', 'manualOverrides']);
                if (!clearRelationshipOnly && Object.keys(patch || {}).some(key => !allowed.has(key))) return { rejected: 'correction-remediation-only' };
                const hasRelationship = patch?.relationship && typeof patch.relationship === 'object' && !Array.isArray(patch.relationship);
                const explicitClear = Object.prototype.hasOwnProperty.call(patch || {}, 'manualOverrides')
                    && patch.manualOverrides && typeof patch.manualOverrides === 'object' && !Array.isArray(patch.manualOverrides)
                    && !Object.prototype.hasOwnProperty.call(patch.manualOverrides, 'relationship');
                if (!clearRelationshipOnly && !hasRelationship && !explicitClear) return { rejected: 'correction-remediation-required' };
            }
            const explicitOverridePatch = Object.prototype.hasOwnProperty.call(patch || {}, 'manualOverrides');
            if (explicitOverridePatch && (!patch.manualOverrides || typeof patch.manualOverrides !== 'object' || Array.isArray(patch.manualOverrides))) {
                return { rejected: 'invalid-manual-overrides' };
            }
            if (explicitOverridePatch) {
                const overrideValueIssue = manualOwnedFieldValueIssue(patch.manualOverrides);
                if (overrideValueIssue) return { rejected: 'invalid-value-type:manualOverrides.' + overrideValueIssue };
            }
            const clearRelationshipCorrections = clearRelationshipOnly
                || (explicitOverridePatch && !Object.prototype.hasOwnProperty.call(patch.manualOverrides, 'relationship'));
            const hasRelationshipPatch = patch?.relationship && typeof patch.relationship === 'object' && !Array.isArray(patch.relationship);
            if (hasRelationshipPatch && !clearRelationshipCorrections) {
                const migrated = migrateSupportedLegacyManualRelationshipCorrections(current);
                current = migrated.npc;
                state.npcs[index] = current;
            }
            const manualBirthdayChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'birthday')
                && normalizeBirthday(patch.birthday) !== normalizeBirthday(current.birthday);
            const manualAt = Date.now();
            const nextRaw = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Math.max(manualAt, Number(current.updatedAt || 0) + 1), manual: true };
            let correctionRevision = Math.max(0, Math.trunc(Number(current.manualRelationshipCorrectionRevision) || 0));
            const correctionByAxis = new Map((current.manualRelationshipCorrections || []).map(item => [item.axis, structuredClone(item)]));
            const unresolvedCorrectionAxes = new Set(normalizeManualRelationshipCorrectionUnresolvedAxes(current.manualRelationshipCorrectionUnresolvedAxes));
            const hadLegacyUnresolvedAxes = unresolvedCorrectionAxes.size > 0;
            let resolvedCorrectionAxes = [];
            if (clearRelationshipCorrections) {
                correctionByAxis.clear();
                unresolvedCorrectionAxes.clear();
            }
            // The editor historically submits birthdayProvenance:'manual' with every save.
            // Do not turn an unchanged birthday into hidden manual ownership.
            if (!manualBirthdayChanged && patch?.birthdayProvenance === 'manual') nextRaw.birthdayProvenance = current.birthdayProvenance;
            const manualAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'age')
                && normalizeActualAge(patch.age) !== normalizeActualAge(current.age);
            const manualApparentAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'apparentAge')
                && normalizeApparentAge(patch.apparentAge) !== normalizeApparentAge(current.apparentAge);
            if (manualAgeChanged || manualApparentAgeChanged) {
                nextRaw.ageProgressionBaselineAge = normalizeActualAge(manualAgeChanged ? patch.age : current.age);
            }
            if (hasRelationshipPatch) {
                const before = normalizeRelationship(current.relationship);
                const after = normalizeRelationship({ ...before, ...patch.relationship });
                nextRaw.relationship = after;
                const requestedAxes = RELATIONSHIP_AXES.filter(axis => Object.prototype.hasOwnProperty.call(patch.relationship, axis));
                const changedAxes = requestedAxes.filter(axis => before[axis] !== after[axis]);
                const correctionAxes = remediation ? requestedAxes : changedAxes;
                resolvedCorrectionAxes = correctionAxes;
                const inferred = normalizeRelationshipMilestones([], after, { inferFromRelationship: true, includeBoundary: true })
                    .filter(entry => changedAxes.includes(entry.axis));
                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(
                    [...(current.relationshipMilestones || []), ...inferred], after, { inferFromRelationship: false });
                const delta = Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, after[axis] - before[axis]]));
                nextRaw.relationshipProgress = { ...(current.relationshipProgress || {}) };
                for (const axis of changedAxes) nextRaw.relationshipProgress[axis] = 0;
                if (correctionAxes.length) {
                    correctionRevision += 1;
                    const sourceMessageId = latestAssistantMessageId(chat);
                    for (const axis of correctionAxes) {
                        correctionByAxis.set(axis, {
                            id: axis + ':' + correctionRevision,
                            axis,
                            value: after[axis],
                            revision: correctionRevision,
                            sourceMessageId: sourceMessageId >= 0 ? sourceMessageId : null,
                            at: manualAt,
                        });
                        unresolvedCorrectionAxes.delete(axis);
                    }
                    if (changedAxes.length) {
                        const event = {
                            impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.',
                            sourceMessageId, turn: Number.isInteger(state.turn) ? state.turn : null, at: manualAt,
                        };
                        const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(getSettings().relationshipHistoryLimit);
                        nextRaw.lastRelationshipChange = event;
                        nextRaw.relationshipHistory = [...(current.relationshipHistory || []), event].slice(-relationshipHistoryLimit);
                    }
                } else if (clearRelationshipCorrections) {
                    correctionRevision += 1;
                }
            } else if (clearRelationshipCorrections) {
                correctionRevision += 1;
            }
            nextRaw.manualRelationshipCorrectionRevision = correctionRevision;
            nextRaw.manualRelationshipCorrections = [...correctionByAxis.values()];
            nextRaw.manualRelationshipCorrectionUnresolvedAxes = [...unresolvedCorrectionAxes];
            const retireResolvedLegacyRelationship = hadLegacyUnresolvedAxes
                && resolvedCorrectionAxes.length > 0
                && unresolvedCorrectionAxes.size === 0;
            const hasManualLifeState = Object.prototype.hasOwnProperty.call(patch || {}, 'lifeState');
            const requestedLifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();
            if (hasManualLifeState && !['alive', 'dead', 'unknown'].includes(requestedLifeState)) return { rejected: 'invalid-life-state' };
            const manualLifeStateChanged = hasManualLifeState && requestedLifeState !== String(current.lifeState || '').trim().toLocaleLowerCase();
            const transitionedRaw = manualLifeStateChanged
                ? applyManualLifeStateTransition(nextRaw, requestedLifeState, {
                    certainty: String(patch.lifeStateCertainty || '').trim(),
                    reason: String(patch.lifeStateReason || '').trim(),
                    at: Date.now(),
                })
                : nextRaw;
            let next = normalizeNpc(transitionedRaw);
            if (next.name !== current.name && current.name) next.aliases = [...new Set([...(next.aliases || []), current.name])].slice(0, 10);
            next = normalizeNpc(next);
            const manualOverrides = explicitOverridePatch
                ? structuredClone(next.manualOverrides || {})
                : { ...(current.manualOverrides || {}) };
            const manualOverrideMeta = explicitOverridePatch
                ? {}
                : structuredClone(current.manualOverrideMeta || {});
            if (clearRelationshipOnly || retireResolvedLegacyRelationship) {
                delete manualOverrides.relationship;
                delete manualOverrideMeta.relationship;
            }
            const manualSourceMessageId = latestAssistantMessageId(chat);
            for (const field of MANUAL_OVERRIDE_FIELDS) {
                // Modern relationship corrections are per-axis records. Whole-object relationship
                // overrides remain read-only legacy compatibility and are never created by new edits.
                if (field === 'relationship') continue;
                if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) continue;
                if (manualOwnedValueEqual(current[field], next[field])) continue;
                manualOverrides[field] = structuredClone(next[field]);
                manualOverrideMeta[field] = {
                    at: manualAt,
                    sourceMessageId: manualSourceMessageId >= 0 ? manualSourceMessageId : null,
                };
            }
            next.manualOverrides = manualOverrides;
            next.manualOverrideMeta = manualOverrideMeta;
            next = normalizeNpc(next);
            const nextIdentityKeys = new Set([next.name, ...(next.aliases || [])].map(value => normalizeName(value)).filter(Boolean));
            const collision = state.npcs.some((npc, i) => i !== index && [npc.name, ...(npc.aliases || [])]
                .map(value => normalizeName(value)).filter(Boolean).some(key => nextIdentityKeys.has(key)));
            if (collision) return { rejected: 'identity-collision' };
            state.npcs[index] = next;
            if (Object.prototype.hasOwnProperty.call(patch || {}, 'keyRelationships')) {
                const reconciledGraph = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(chat), dossierLimits: getSettings().dossierLimits });
                state.npcs = reconciledGraph.npcs;
                state.socialGraph = reconciledGraph.socialGraph;
                state.familySlots = reconciledGraph.familySlots;
            }
            if (remediation) {
                const reconciled = reconcileToCurrentBranch(state, chat);
                if (reconciled.unsafeDivergence) return { rejected: 'correction-remediation-boundary-lost' };
                const limitations = reconciled.manualRelationshipLimitations || [];
                let candidate = normalizeState(reconciled.state, state.chatKey);
                if (reconciled.needsRecovery && !limitations.length) {
                    candidate = prepareBranchRecoveryState(candidate, chat, reconciled.recoveryMessageIds, reconciled.checkpoint?.lineage || [], false);
                }
                for (const key of Object.keys(state)) delete state[key];
                Object.assign(state, candidate);
                return {
                    npcId: current.id,
                    remediation: true,
                    resolved: state.branchSafety?.status === 'safe',
                    needsRecovery: state.branchSafety?.kind === 'suffix-recovery-required' || Boolean(state.recovery),
                    manualRelationshipLimitations: structuredClone(limitations),
                    branchSafety: structuredClone(state.branchSafety),
                };
            }
            return { npcId: current.id };
        }, { checkpointReason: 'manual-edit', allowUnsafeKind: 'manual-relationship-correction-uncertain' });
    }

    async function clearManualRelationshipCorrection(reference, options = {}) {
        return updateNpc(reference, {}, { ...options, clearRelationshipCorrectionsOnly: true });
    }

    async function fillMissingBirthdays() {
        const settings = getSettings();
        const mode = normalizeBirthdayFillMode(settings.birthdayFillMode);
        if (mode === 'off') return { ok: false, reason: 'fill-disabled' };
        return mutate('birthday-fill', state => {
            let filled = 0;
            state.npcs = state.npcs.map(raw => {
                if (String(raw?.birthday || '').trim()
                    || (raw?.manualProfileFields || []).includes('birthday')
                    || String(raw?.birthdayProvenance || '').toLocaleLowerCase() === 'manual') return raw;
                const next = normalizeNpc(applyBirthdayFill(raw, {
                    mode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                }));
                if (!String(raw?.birthday || '').trim() && String(next?.birthday || '').trim()) filled += 1;
                return next;
            });
            return { filled };
        }, { checkpointReason: 'birthday-fill' });
    }

    async function archiveNpc(reference, archived = true, reason = 'manual') {
        return mutate(archived ? 'archive' : 'restore', (state, chat) => {
            const npc = findNpcByReference(state, reference);
            if (!npc) return false;
            const index = state.npcs.findIndex(item => item.id === npc.id);
            const next = structuredClone(npc);
            next.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
            next.archived = Boolean(archived);
            next.archiveReason = archived ? String(reason || 'manual') : '';
            next.archivedAt = archived ? Date.now() : null;
            if (archived) {
                next.present = false;
                next.worldActive = false;
            } else {
                if (String(next.lifeState || '').toLocaleLowerCase() === 'dead' || String(next.archiveReason || '').toLocaleLowerCase() === 'deceased') {
                    next.lifeState = 'alive';
                    next.lifeStateCertainty = 'explicit';
                    next.lifeStateReason = 'Manual dossier restore by player.';
                }
                const messageId = latestAssistantMessageId(chat);
                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);
                next.lastActivityMessageId = messageId >= 0 ? messageId : null;
                next.lastActivityReason = 'manual-restore';
            }
            next.manualOverrides = {
                ...(npc.manualOverrides || {}),
                archived: next.archived,
                archiveReason: next.archiveReason,
                lifeState: next.lifeState,
                lifeStateCertainty: next.lifeStateCertainty,
                lifeStateReason: next.lifeStateReason,
            };
            state.npcs[index] = normalizeNpc(next);
            return { npcId: npc.id };
        }, { checkpointReason: archived ? 'manual-archive' : 'manual-restore' });
    }

    async function resetNpcStaleness(reference) {
        return mutate('reset-staleness', (state, chat) => {
            const npc = findNpcByReference(state, reference);
            if (!npc) return false;
            const index = state.npcs.findIndex(item => item.id === npc.id);
            const messageId = latestAssistantMessageId(chat);
            const next = structuredClone(npc);
            next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);
            next.lastActivityMessageId = messageId >= 0 ? messageId : null;
            next.lastActivityReason = 'manual-review';
            if (next.archived && next.archiveReason === 'stale') {
                next.archived = false;
                next.archiveReason = '';
                next.archivedAt = null;
            }
            next.updatedAt = Math.max(Date.now(), Number(next.updatedAt || 0) + 1);
            state.npcs[index] = normalizeNpc(next);
            return { npcId: npc.id };
        }, { checkpointReason: 'stale-reset' });
    }

    async function deleteNpc(reference) {
        return mutate('delete', state => {
            const npc = findNpcByReference(state, reference);
            if (!npc) return false;
            state.deletedNpcIds = [...new Set([...(state.deletedNpcIds || []), npc.id])];
            state.npcs = state.npcs.filter(item => item.id !== npc.id);
            state.socialGraph = (state.socialGraph || []).filter(edge => edge.fromId !== npc.id && edge.toId !== npc.id);
            state.familySlots = (state.familySlots || []).filter(slot => slot.ownerId !== npc.id).map(slot => ({ ...slot, resolvedNpcIds: (slot.resolvedNpcIds || []).filter(id => id !== npc.id) }));
            return { npcId: npc.id, name: npc.name };
        }, { checkpointReason: 'manual-delete' });
    }

    function getStaleReport() {
        const chatKey = getChatKey();
        const state = cache.get(chatKey);
        if (!state) return [];
        const chat = getContext().chat || [];
        const messageId = latestAssistantMessageId(chat);
        return buildStaleReport(state, getSettings(), narrativeTurnForMessage(chat, messageId));
    }

    async function exportBundle(reference = '') {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (!state) return { ok: false, reason: 'no-state' };
            let npcId = '';
            if (reference) {
                const npc = findNpcByReference(state, reference);
                if (!npc) return { ok: false, reason: 'not-found' };
                npcId = npc.id;
            }
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            const bundle = createNpcStateBundle(state, {
                npcId,
                sourceNarrativeTurn: narrativeTurnForMessage(chat, messageId),
            });
            return {
                ok: true,
                bundle,
                filename: bundleSuggestedFilename(bundle),
                bundleType: bundle.bundleType,
                npcCount: bundle.data.npcs.length,
            };
        });
    }

    async function previewBundleImport(bundleInput, options = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        const state = normalizeState(await loadChat(chatKey), chatKey);
        const chat = getContext().chat || [];
        const messageId = latestAssistantMessageId(chat);
        return previewNpcStateBundleImport(state, bundleInput, {
            ...options,
            currentNarrativeTurn: narrativeTurnForMessage(chat, messageId),
        });
    }

    async function importBundle(bundleInput, options = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        return exclusive(chatKey, async () => {
            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            const ownership = captureOperationOwnership('manual-bundle-import', chatKey, chat, messageId >= 0 ? messageId : null);
            const operationId = beginOperationDiagnostics(ownership, '');
            const imported = applyNpcStateBundleImport(state, bundleInput, {
                ...options,
                currentNarrativeTurn: narrativeTurnForMessage(chat, messageId),
            });
            if (!imported.ok) { operationLog.finish(operationId, { status: 'rejected', failure: { stage: 'validation', reason: String(imported.reason || 'bundle-import-rejected').slice(0, 300) } }); return imported; }
            const next = normalizeState(imported.state, chatKey);
            operationLog.patch(operationId, { selectedNpcIds: (imported.result?.npcIds || imported.result?.importedNpcIds || []).slice?.(0, 40) || [] });
            const commit = await commitState({ operationId, token: ownership, state: next, chat, messageId, checkpointReason: imported.mode === 'replace' ? 'bundle-restore' : 'bundle-merge', ownershipPolicy: 'user' });
            return {
                ok: true,
                mode: imported.mode,
                preview: imported.preview,
                result: imported.result,
                needsReconcile: commit.needsReconcile === true,
                reason: commit.reason || '',
                state: structuredClone(commit.state),
            };
        });
    }

    async function withLifecycleKeys(keys, task) {
        const ordered = [...new Set((keys || []).filter(Boolean))].sort();
        const enter = async index => index >= ordered.length ? task() : exclusive(ordered[index], () => enter(index + 1));
        return enter(0);
    }

    async function renameChatKey(oldKey, newKey) {
        const sourceKey = String(oldKey || '');
        const targetKey = String(newKey || '');
        if (!sourceKey || !targetKey || sourceKey === targetKey || /-pending:/.test(sourceKey + targetKey)) return { ok: false, reason: 'invalid-lifecycle-key' };
        invalidate(sourceKey);
        invalidate(targetKey);
        return withLifecycleKeys([sourceKey, targetKey], async () => {
            let sourcePointer = getPointer(sourceKey);
            if (!sourcePointer?.path) return { ok: false, reason: 'source-untracked' };
            if (getPointer(targetKey)?.path) return { ok: false, reason: 'destination-exists' };
            let destinationPointer = null;
            let copiedState = null;
            let retiredPointer = null;
            try {
                for (let attempt = 0; attempt < 3; attempt += 1) {
                    const source = await readV3Sidecar({ chatKey: sourceKey, pointer: sourcePointer, fetchFn });
                    if (!source || source.retired) return { ok: false, reason: source?.retired ? 'source-retired' : 'source-missing' };
                    const sourceToken = { ...sourcePointer, revision: source.revision };
                    const nextState = retargetCheckpointOwnership(source.state, targetKey);
                    const written = await writeV3Sidecar({ chatKey: targetKey, state: nextState, pointer: destinationPointer, fetchFn, headers: getHeaders() });
                    destinationPointer = written.pointer;
                    copiedState = written.state;
                    const verified = await readV3Sidecar({ chatKey: targetKey, pointer: destinationPointer, fetchFn });
                    if (!verified || verified.retired || verified.revision !== destinationPointer.revision || verified.state.chatKey !== targetKey) {
                        throw new Error('NPC State beta rename destination verification failed.');
                    }
                    try {
                        const retired = await retireV3Sidecar({ chatKey: sourceKey, pointer: sourceToken, reason: 'chat-renamed', redirectChatKey: targetKey, fetchFn, headers: getHeaders() });
                        retiredPointer = retired?.pointer || sourceToken;
                        break;
                    } catch (error) {
                        if (error?.code !== 'NPC_STATE_V04_BETA_WRITE_CONFLICT' || attempt >= 2) throw error;
                        sourcePointer = { ...sourcePointer, revision: Number(error.actualRevision) || sourceToken.revision };
                    }
                }
                if (!retiredPointer || !destinationPointer || !copiedState) throw new Error('NPC State beta rename did not reach a durable retirement boundary.');
                setPointer(targetKey, destinationPointer);
                deletePointer(sourceKey);
                persistSettings();
                cache.delete(sourceKey);
                hydration.delete(sourceKey);
                operationEpoch.delete(sourceKey);
                cache.set(targetKey, copiedState);
                hydration.set(targetKey, { status: 'ready', error: null });
                clearV3PointerHint(sourceKey);
                operationLog.clear(sourceKey);
                operationLog.clear(targetKey);
                onStateChanged(targetKey, structuredClone(copiedState));
                try { await deleteV3SidecarFile(retiredPointer, { fetchFn, headers: getHeaders() }); }
                catch (error) { console.warn('[NPC State Beta] Retired rename source could not be physically deleted; it remains logically retired.', error); }
                return { ok: true, oldKey: sourceKey, newKey: targetKey, state: structuredClone(copiedState) };
            } catch (error) {
                if (destinationPointer?.path && !getPointer(targetKey)?.path) {
                    clearV3PointerHint(targetKey);
                    try { await deleteV3SidecarFile(destinationPointer, { fetchFn, headers: getHeaders() }); } catch {}
                }
                throw error;
            }
        });
    }

    async function deleteChatKey(chatKey) {
        const key = String(chatKey || '');
        if (!key || key === 'no-chat' || /-pending:/.test(key)) return { ok: false, reason: 'invalid-lifecycle-key' };
        invalidate(key);
        return exclusive(key, async () => {
            let pointer = getPointer(key);
            if (!pointer?.path) {
                deletePointer(key);
                clearV3PointerHint(key);
                cache.delete(key);
                hydration.delete(key);
                operationEpoch.delete(key);
                operationLog.clear(key);
                persistSettings();
                return { ok: true, missing: true, chatKey: key };
            }
            let retiredPointer = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const source = await readV3Sidecar({ chatKey: key, pointer, fetchFn });
                if (!source) break;
                if (source.retired) { retiredPointer = { ...pointer, revision: source.revision, retired: true }; break; }
                const token = { ...pointer, revision: source.revision };
                try {
                    const retired = await retireV3Sidecar({ chatKey: key, pointer: token, reason: 'chat-deleted', fetchFn, headers: getHeaders() });
                    retiredPointer = retired?.pointer || token;
                    break;
                } catch (error) {
                    if (error?.code !== 'NPC_STATE_V04_BETA_WRITE_CONFLICT' || attempt >= 2) throw error;
                    pointer = { ...pointer, revision: Number(error.actualRevision) || token.revision };
                }
            }
            deletePointer(key);
            clearV3PointerHint(key);
            cache.delete(key);
            hydration.delete(key);
            operationEpoch.delete(key);
            operationLog.clear(key);
            persistSettings();
            if (retiredPointer?.path) {
                try { await deleteV3SidecarFile(retiredPointer, { fetchFn, headers: getHeaders() }); }
                catch (error) { console.warn('[NPC State Beta] Retired deleted-chat sidecar could not be physically removed; it remains logically retired.', error); }
            }
            return { ok: true, chatKey: key };
        });
    }

    async function stopExistingRecoveryRun(chatKey) {
        const current = recoveryRuns.get(chatKey);
        if (!current) return;
        const signal = recoverySignals.get(chatKey) || {};
        signal.cancel = true;
        recoverySignals.set(chatKey, signal);
        invalidate(chatKey);
        try { await current; } catch { /* the replacement operation owns the next state */ }
        recoverySignals.delete(chatKey);
    }

    async function initializeFresh({ allowExisting = false } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        await stopExistingRecoveryRun(chatKey);
        invalidate(chatKey);
        recoverySignals.delete(chatKey);
        return exclusive(chatKey, async () => {
            const fresh = createEmptyState(chatKey);
            fresh.updatedAt = Date.now();
            const installed = await installFreshSidecar(chatKey, fresh, { allowExisting });
            notify('success', 'Created a fresh NPC State beta sidecar and replaced this chat pointer only after the new file was written successfully.');
            return { ok: true, state: structuredClone(installed.state), pointer: structuredClone(installed.pointer) };
        });
    }

    async function markRecoveryStatus(chatKey, status, reason = '', errorText = '') {
        return exclusive(chatKey, async () => {
            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (!state.recovery) return { ok: false, reason: 'no-recovery' };
            if (recoveryOwnedElsewhere(state.recovery)) {
                return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
            }
            state.recovery = status === 'running' ? claimRecoveryOwnership(state.recovery) : releaseRecoveryOwnership(state.recovery);
            state.recovery.status = status;
            state.recovery.reason = String(reason || '').slice(0, 500);
            state.recovery.error = String(errorText || '').slice(0, 1200);
            state.recovery.updatedAt = Date.now();
            if (status === 'complete') state.recovery.completedAt = Date.now();
            state.updatedAt = Date.now();
            const persisted = await persist(chatKey, state);
            return { ok: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
        });
    }

    async function pauseRecoveryForChatSwitchUnlocked(chatKey, stateInput) {
        const state = normalizeState(stateInput, chatKey);
        if (!state.recovery) return { ok: false, reason: 'no-recovery' };
        state.recovery = releaseRecoveryOwnership(state.recovery);
        state.recovery.status = 'paused';
        state.recovery.reason = 'Historical reconstruction paused because another chat became active. Its original plan and committed progress were preserved.';
        state.recovery.error = '';
        state.recovery.updatedAt = Date.now();
        state.updatedAt = Date.now();
        const persisted = await persist(chatKey, state);
        return { ok: false, paused: true, discarded: true, reason: 'chat-switched', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
    }

    async function finalizeHistoricalRecoveryUnlocked(chatKey, state, chat, settings) {
        if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
        let next = normalizeState(state, chatKey);
        const recovery = structuredClone(next.recovery || {});
        const endMessageId = Number.isInteger(recovery.endMessageId) ? recovery.endMessageId : latestAssistantMessageId(chat);
        const prefixEnd = Math.max(-1, Math.min(endMessageId, chat.length - 1));
        const prefix = prefixEnd >= 0 ? chat.slice(0, prefixEnd + 1) : [];
        const lastMessageId = Number.isInteger(recovery.lastCompletedMessageId) ? recovery.lastCompletedMessageId : null;
        if (lastMessageId !== null && lastMessageId >= 0) {
            const exchange = currentExchange(prefix, lastMessageId);
            const retentionExchange = exchange ? {
                ...exchange,
                user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null,
                assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null,
            } : null;
            const referencedNpcIds = retentionExchange ? referencedNpcIdsFromExchange(next, retentionExchange) : [];
            const observation = next.lastObservation || {};
            const stale = applyStaleLifecycle(next, {
                settings,
                currentTurn: narrativeTurnForMessage(prefix, lastMessageId),
                sourceMessageId: lastMessageId,
                exchangeActiveNpcIds: observation.exchangeActiveNpcIds || [],
                finalPresentNpcIds: observation.finalPresentNpcIds || [],
                worldActiveNpcIds: observation.worldActiveNpcIds || [],
                referencedNpcIds,
            });
            next = recordCheckpoint(stale.state, prefix, lastMessageId, 'history-recovery-complete');
        } else {
            next.branchHeadLineage = prefixEnd >= 0 ? chatLineage(prefix) : [];
        }
        next.recovery = releaseRecoveryOwnership({
            ...recovery,
            status: 'complete',
            completed: recovery.total || 0,
            nextMessageId: null,
            reason: 'Historical reconstruction completed.',
            error: '',
            updatedAt: Date.now(),
            completedAt: Date.now(),
        });
        next.branchSafety = { status: 'safe', kind: '', reason: '' };
        next.updatedAt = Date.now();
        if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, next);
        const ownership = captureOperationOwnership('historical-recovery-finalize', chatKey, chat, null);
        const operationId = beginOperationDiagnostics(ownership, '', {
            recovery: { completed: recovery.total || 0, total: recovery.total || 0, status: 'complete' },
        });
        const commit = await commitState({
            token: ownership,
            operationId,
            state: next,
            chat,
            checkpoint: false,
        });
        if (!commit.ok) {
            return {
                ...commit,
                complete: false,
                restartRequired: true,
                recovery: decoratedRecoveryStatus(commit.state?.recovery || next.recovery, chatKey),
            };
        }
        const persisted = commit.state;
        notify('success', 'Historical reconstruction completed. Normal scanning and continuity injection are active again.');
        return { ok: true, complete: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
    }

    async function historicalRecoveryStep(chatKey) {
        return exclusive(chatKey, async () => {
            let state = normalizeState(await loadChat(chatKey), chatKey);
            if (!state.recovery) return { ok: false, reason: 'no-recovery' };
            if (state.recovery.status !== 'running') return { ok: false, reason: 'recovery-not-running', recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
            if (recoveryOwnedElsewhere(state.recovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
            if (state.recovery.ownerSessionId && !recoveryOwnedByThisSession(state.recovery)) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'paused';
                state.recovery.reason = 'Recovery ownership changed before this step. Resume explicitly to claim the abandoned run.';
                state.recovery.error = 'recovery-lease-lost';
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, paused: true, reason: 'recovery-lease-lost', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
            }
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);

            state.recovery = claimRecoveryOwnership(state.recovery);
            state.recovery.updatedAt = Date.now();
            state.updatedAt = Date.now();
            state = normalizeState(await persist(chatKey, state), chatKey);
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
            const context = getContext();
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
            const settings = getSettings();
            const liveChat = context.chat || [];
            const replanned = replanRecoverySuffix(state.recovery, liveChat);
            if (!replanned.ok) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'stale';
                state.recovery.reason = 'A message at or before the last completed recovery exchange changed. Restart recovery to avoid replaying already-committed history against a different past.';
                state.recovery.error = replanned.reason;
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, restartRequired: true, reason: 'completed-history-changed', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
            }
            state.recovery = claimRecoveryOwnership(replanned.recovery);
            const nextMessageId = state.recovery.messageIds[state.recovery.completed] ?? null;
            state.recovery.nextMessageId = nextMessageId;
            if (!Number.isInteger(nextMessageId)) {
                if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
                return finalizeHistoricalRecoveryUnlocked(chatKey, state, liveChat, settings);
            }

            const historicalChat = liveChat.slice(0, nextMessageId + 1);
            const exchange = currentExchange(historicalChat, nextMessageId);
            if (!exchange) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'failed';
                state.recovery.reason = 'The next planned recovery item is no longer an assistant exchange.';
                state.recovery.error = 'not-assistant-message';
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, failed: true, reason: 'not-assistant-message', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
            }
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);

            const ownership = captureOperationOwnership('historical-recovery', chatKey, historicalChat, nextMessageId);
            const candidateNpcIds = relevantNpcsForExchange(state, exchange, 12, resolvePlayerName('', historicalChat, nextMessageId)).map(npc => npc.id);
            const prompt = buildScanPrompt({
                state,
                chat: historicalChat,
                assistantMessageId: nextMessageId,
                candidateNpcIds,
                scanDepth: settings.scanDepth,
                relationshipCriteria: settings.relationshipCriteria,
                relationshipCaps: settings.relationshipCaps,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            });
            const operationId = beginOperationDiagnostics(ownership, prompt, { recovery: { completed: state.recovery.completed, total: state.recovery.total } });
            let parsed;
            try {
                parsed = await invokeOperationJson(prompt, 'historical-recovery-' + nextMessageId, operationId);
            } catch (error) {
                const signal = recoverySignals.get(chatKey) || {};
                if (signal.cancel) {
                    state.recovery = releaseRecoveryOwnership(state.recovery);
                    state.recovery.status = 'cancelled';
                    state.recovery.reason = 'Historical reconstruction was cancelled. The sidecar keeps only exchanges committed before cancellation.';
                    state.recovery.error = '';
                    state.recovery.updatedAt = Date.now();
                    const persisted = await persist(chatKey, state);
                    return { ok: true, cancelled: true, reason: 'cancelled', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
                }
                if (signal.pause) {
                    state.recovery = releaseRecoveryOwnership(state.recovery);
                    state.recovery.status = 'paused';
                    state.recovery.reason = signal.reason || 'Historical reconstruction was paused after the last committed exchange.';
                    state.recovery.error = '';
                    state.recovery.updatedAt = Date.now();
                    const persisted = await persist(chatKey, state);
                    return { ok: true, paused: true, reason: 'paused', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
                }
                if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'failed';
                state.recovery.reason = 'Historical scanner request failed. Resume retries this same exchange without replaying completed work.';
                state.recovery.error = String(error?.message || error).slice(0, 1200);
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, failed: true, reason: 'generation-failed', error, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
            }

            const signal = recoverySignals.get(chatKey) || {};
            if (signal.cancel) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'cancelled';
                state.recovery.reason = 'Historical reconstruction was cancelled. The sidecar keeps only exchanges committed before cancellation.';
                state.recovery.error = '';
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: true, cancelled: true, reason: 'cancelled', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
            }
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
            const currentContext = getContext();
            if (getChatKey() !== chatKey) return pauseRecoveryForChatSwitchUnlocked(chatKey, state);
            const currentChat = currentContext.chat || [];
            if (!operationOwnershipMatches(ownership)) {
                finishDiscardedOperation(operationId, 'stale-operation', 'post-model');
                return { ok: false, discarded: true, reason: 'stale-operation', messageId: nextMessageId };
            }

            const working = normalizeState(state, chatKey);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const applied = applyScanResult(working, parsed, {
                sourceMessageId: nextMessageId,
                ...profileEvidenceSourceOptions(chatKey, historicalChat, nextMessageId, [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger)),
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                playerName: resolvePlayerName('', historicalChat, nextMessageId),
                relationshipContext: relationshipContextForExchange(exchange),
                profileContext: profileContextForWindow(historicalChat, nextMessageId, settings.scanDepth),
                evidencePolicy: buildExchangeEvidencePolicy(exchange),
                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
                admissionMode: settings.newNpcAdmissionMode,
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
                coverageNpcIds: candidateNpcIds,
                requireDossierCoverage: true,
                requireCandidateAccounting: true,
                applyRelationship: working.recovery?.relationshipMode === 're-evaluate',
            });
            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);
            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);
            const retentionExchange = {
                ...exchange,
                user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null,
                assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null,
            };
            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);
            const noDeleteSettings = { ...settings, staleDeleteAfter: 1000000000 };
            const stale = applyStaleLifecycle(applied.state, {
                settings: noDeleteSettings,
                currentTurn: narrativeTurnForMessage(historicalChat, nextMessageId),
                sourceMessageId: nextMessageId,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds,
            });
            let recoveryCandidate = normalizeState(stale.state, chatKey);
            recoveryCandidate.recovery = claimRecoveryOwnership({
                ...state.recovery,
                status: 'running',
                completed: Math.min(state.recovery.total, state.recovery.completed + 1),
                lastCompletedMessageId: nextMessageId,
                nextMessageId: state.recovery.messageIds[state.recovery.completed + 1] ?? null,
                reason: replanned.changed ? 'Unprocessed suffix changed and was safely replanned; completed history was not replayed.' : '',
                error: '',
                updatedAt: Date.now(),
            });
            updateOperationFromApplication(operationId, applied);
            operationLog.patch(operationId, { recovery: { completed: recoveryCandidate.recovery.completed, total: recoveryCandidate.recovery.total, status: recoveryCandidate.recovery.status } });
            const commit = await commitState({ token: ownership, operationId, state: recoveryCandidate, chat: historicalChat, messageId: nextMessageId, checkpointReason: 'history-recovery', lastScannedMessageId: nextMessageId });
            if (!commit.ok) return { ...commit, messageId: nextMessageId, recovery: decoratedRecoveryStatus(commit.state?.recovery, chatKey) };
            const persisted = commit.state;
            return {
                ok: true,
                messageId: nextMessageId,
                recovery: decoratedRecoveryStatus(persisted.recovery, chatKey),
                semanticDiagnostics: applied.semanticDiagnostics || [],
                coverageDiagnostics: applied.coverageDiagnostics || [],
                state: structuredClone(persisted),
            };
        });
    }

    async function runHistoricalRecoveryLoop(chatKey) {
        if (recoveryRuns.has(chatKey)) return recoveryRuns.get(chatKey);
        const task = (async () => {
            while (true) {
                const signal = recoverySignals.get(chatKey) || {};
                if (signal.cancel) {
                    const result = await markRecoveryStatus(chatKey, 'cancelled', 'Historical reconstruction was cancelled. The sidecar keeps only exchanges committed before cancellation.', '');
                    return { ...result, cancelled: true };
                }
                if (signal.pause) {
                    const result = await markRecoveryStatus(chatKey, 'paused', signal.reason || 'Historical reconstruction was paused after the last committed exchange.', '');
                    return { ...result, paused: true };
                }
                let step;
                try { step = await historicalRecoveryStep(chatKey); }
                catch (error) {
                    const afterError = recoverySignals.get(chatKey) || {};
                    if (afterError.cancel) {
                        try {
                            const result = await markRecoveryStatus(chatKey, 'cancelled', 'Historical reconstruction was cancelled. The sidecar keeps only exchanges committed before cancellation.', '');
                            return { ...result, cancelled: true };
                        } catch { return { ok: false, cancelled: true, reason: 'cancelled', error }; }
                    }
                    if (afterError.pause) {
                        try {
                            const result = await markRecoveryStatus(chatKey, 'paused', afterError.reason || 'Historical reconstruction was paused after the last committed exchange.', '');
                            return { ...result, paused: true };
                        } catch { return { ok: false, paused: true, reason: 'paused', error }; }
                    }
                    try { await markRecoveryStatus(chatKey, 'failed', 'Historical recovery persistence/orchestration failed. Resume retries from the last committed exchange.', error?.message || error); }
                    catch { /* preserve the original failure */ }
                    return { ok: false, failed: true, reason: 'recovery-step-failed', error };
                }
                if (step?.complete || step?.failed || step?.restartRequired || step?.cancelled || step?.paused || step?.activeElsewhere) return step;
                if (step?.discarded) {
                    const afterDiscard = recoverySignals.get(chatKey) || {};
                    if (afterDiscard.cancel || afterDiscard.pause) continue;
                    continue;
                }
                if (!step?.ok) return step;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        })();
        recoveryRuns.set(chatKey, task);
        try { return await task; }
        finally {
            if (recoveryRuns.get(chatKey) === task) recoveryRuns.delete(chatKey);
            const signal = recoverySignals.get(chatKey);
            if (signal?.cancel || signal?.pause) recoverySignals.delete(chatKey);
        }
    }

    async function startHistoricalRecovery({
        startMessageId = null,
        endMessageId = null,
        relationshipMode = 'fresh',
        allowExisting = false,
    } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        const cachedRecovery = cache.get(chatKey)?.recovery;
        if (recoveryOwnedElsewhere(cachedRecovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(cachedRecovery, chatKey) };
        await stopExistingRecoveryRun(chatKey);
        invalidate(chatKey);
        recoverySignals.delete(chatKey);
        if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-plan' };
        const context = getContext();
        if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-plan' };
        const chat = context.chat || [];
        const plan = computeRecoveryRangeForChat(chat, startMessageId, endMessageId);
        const mode = normalizeRecoveryRelationshipMode(relationshipMode);
        if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-install' };
        recoverySignals.set(chatKey, { pause: false, cancel: false, reason: '' });
        const prepared = await exclusive(chatKey, async () => {
            if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-install' };
            const currentPointer = getPointer(chatKey);
            if (currentPointer?.path) {
                const current = await readV3Sidecar({ chatKey, pointer: currentPointer, fetchFn });
                const currentRecovery = current?.state ? normalizeState(current.state, chatKey).recovery : null;
                if (recoveryOwnedElsewhere(currentRecovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(currentRecovery, chatKey) };
            }
            const fresh = createEmptyState(chatKey);
            const baseline = createEmptyState(chatKey);
            fresh.branchBase = { messageId: null, lineage: [], boundaryKind: 'pre-story', sourceMessageId: null, sourceFingerprint: '', precedingLineage: [], chatKey, createdAt: Date.now(), snapshot: baseline };
            fresh.branchHeadLineage = [];
            fresh.recovery = {
                version: 3,
                kind: 'historical',
                status: plan.messageIds.length ? 'running' : 'complete',
                ownerSessionId: plan.messageIds.length ? recoverySessionId : '',
                leaseUntil: plan.messageIds.length ? recoveryNow() + recoveryLeaseMs : null,
                relationshipMode: mode,
                startMessageId: plan.startMessageId,
                endMessageId: plan.endMessageId,
                messageIds: plan.messageIds,
                plannedLineage: plan.plannedLineage,
                anchorLineage: [],
                completed: 0,
                total: plan.messageIds.length,
                lastCompletedMessageId: null,
                nextMessageId: plan.messageIds[0] ?? null,
                reason: plan.messageIds.length ? 'Historical reconstruction started.' : 'No assistant exchanges exist in the selected range.',
                error: '',
                startedAt: Date.now(),
                updatedAt: Date.now(),
                completedAt: plan.messageIds.length ? null : Date.now(),
            };
            fresh.updatedAt = Date.now();
            await installFreshSidecar(chatKey, fresh, { allowExisting });
            return { ok: true };
        });
        if (!prepared?.ok) return prepared;
        if (!plan.messageIds.length) {
            const state = cache.get(chatKey);
            return { ok: true, complete: true, recovery: decoratedRecoveryStatus(state?.recovery || null, chatKey), state: state ? structuredClone(state) : null };
        }
        return runHistoricalRecoveryLoop(chatKey);
    }

    async function resumeHistoricalRecovery() {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        if (recoveryRuns.has(chatKey)) return recoveryRuns.get(chatKey);
        if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-resume' };
        recoverySignals.set(chatKey, { pause: false, cancel: false, reason: '' });
        const prepared = await exclusive(chatKey, async () => {
            const state = normalizeState(await loadChat(chatKey), chatKey);
            const recovery = state.recovery;
            if (!recovery) return { ok: false, reason: 'no-recovery' };
            if (recoveryOwnedElsewhere(recovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (recovery.status === 'cancelled') return { ok: false, reason: 'recovery-cancelled', recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (recovery.status === 'stale') return { ok: false, reason: 'restart-required', recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-resume' };
            const context = getContext();
            if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-resume' };
            const replanned = replanRecoverySuffix(recovery, context.chat || []);
            if (!replanned.ok || (recovery.status === 'complete' && state.branchSafety?.status !== 'safe')) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'stale';
                state.recovery.reason = 'Completed recovery history changed. Restart is required; completed exchanges will not be replayed automatically.';
                state.recovery.error = replanned.ok ? 'completed-recovery-branch-unsafe' : replanned.reason;
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, reason: 'restart-required', restartRequired: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
            }
            if (recovery.status === 'complete') {
                // A completed recovery is only successful if its completed prefix still owns
                // the current history and the branch itself remains safe.
                if (replanned.recovery.completed !== replanned.recovery.total) {
                    state.recovery = claimRecoveryOwnership({ ...replanned.recovery, status: 'running', completedAt: null, error: '', updatedAt: Date.now() });
                    const persisted = await persist(chatKey, state);
                    return { ok: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
                }
                if (replanned.changed) {
                    state.recovery = releaseRecoveryOwnership({ ...replanned.recovery, status: 'complete', error: '', updatedAt: Date.now() });
                    const persisted = await persist(chatKey, state);
                    return { ok: true, complete: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
                }
                return { ok: true, complete: true, recovery: decoratedRecoveryStatus(recovery, chatKey), state: structuredClone(state) };
            }
            state.recovery = claimRecoveryOwnership({ ...replanned.recovery, status: 'running', error: '', updatedAt: Date.now() });
            const persisted = await persist(chatKey, state);
            return { ok: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
        });
        if (!prepared?.ok || prepared.complete) return prepared;
        return runHistoricalRecoveryLoop(chatKey);
    }

    async function pauseHistoricalRecovery(reason = '') {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        if (recoveryRuns.has(chatKey)) {
            const signal = recoverySignals.get(chatKey) || {};
            signal.pause = true;
            signal.cancel = false;
            signal.reason = String(reason || 'Historical reconstruction was paused after the last committed exchange.').slice(0, 500);
            recoverySignals.set(chatKey, signal);
            return { ok: true, requested: true, reason: 'pause-requested' };
        }
        const state = cache.get(chatKey) || await loadChat(chatKey);
        if (!state?.recovery || state.recovery.status === 'complete' || state.recovery.status === 'cancelled') return { ok: false, reason: 'no-active-recovery' };
        if (recoveryOwnedElsewhere(state.recovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
        return markRecoveryStatus(chatKey, 'paused', String(reason || 'Historical reconstruction was paused after the last committed exchange.').slice(0, 500), '');
    }

    async function cancelHistoricalRecovery() {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        if (recoveryRuns.has(chatKey)) {
            const signal = recoverySignals.get(chatKey) || {};
            signal.cancel = true;
            signal.pause = false;
            recoverySignals.set(chatKey, signal);
            invalidate(chatKey);
            return { ok: true, requested: true, reason: 'cancel-requested' };
        }
        const state = cache.get(chatKey) || await loadChat(chatKey);
        if (!state?.recovery || state.recovery.status === 'complete') return { ok: false, reason: 'no-active-recovery' };
        if (recoveryOwnedElsewhere(state.recovery)) return { ok: false, reason: 'recovery-owned-elsewhere', activeElsewhere: true, recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
        return markRecoveryStatus(chatKey, 'cancelled', 'Historical reconstruction was cancelled. The partial reconstructed state remains available.', '');
    }

    function recoveryRange({ startMessageId = null, endMessageId = null } = {}) {
        const chatKey = getChatKey();
        const context = getContext();
        if (getChatKey() !== chatKey) {
            const error = new Error('Active chat changed while calculating the recovery range.');
            error.code = 'NPC_STATE_V04_BETA_RECOVERY_CHAT_CHANGED';
            throw error;
        }
        const chat = context.chat || [];
        const range = computeRecoveryRangeForChat(chat, startMessageId, endMessageId);
        return {
            firstAssistantMessageId: range.firstAssistantMessageId,
            latestAssistantMessageId: range.latestAssistantMessageId,
            assistantExchangeCount: range.messageIds.length,
            startMessageId: range.startMessageId,
            endMessageId: range.endMessageId,
        };
    }

    async function previewRebase({ relationshipMode = 'rollback' } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        const state = await loadChat(chatKey);
        if (getChatKey() !== chatKey) return { ok: false, discarded: true, reason: 'chat-changed', stage: 'preview-after-load' };
        if (!state) return { ok: false, reason: 'not-hydrated' };
        const context = getContext();
        if (getChatKey() !== chatKey) return { ok: false, discarded: true, reason: 'chat-changed', stage: 'preview-before-read' };
        const chat = context.chat || [];
        const mode = normalizeRebaseRelationshipMode(relationshipMode);
        return { ok: true, ...previewRelationshipRebase(state, chat, { relationshipMode: mode }) };
    }

    async function reconcileBranch({ rescan = false, rebase = false, relationshipMode = 'preserve' } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        // History reconciliation owns the timeline. Stop an older recovery run before
        // choosing a snapshot so a delayed recovery step cannot commit into the new branch.
        await stopExistingRecoveryRun(chatKey);
        let result;
        const mode = rebase ? normalizeRebaseRelationshipMode(relationshipMode) : 'preserve';
        const chatChanged = stage => ({ ok: false, changed: false, discarded: true, reason: 'chat-changed', stage });
        await exclusive(chatKey, async () => {
            if (getChatKey() !== chatKey) { result = chatChanged('after-queue'); return; }
            const state = await loadChat(chatKey);
            if (getChatKey() !== chatKey) { result = chatChanged('after-load'); return; }
            if (!state) { result = { ok: false, reason: 'not-hydrated' }; return; }
            const context = getContext();
            if (getChatKey() !== chatKey) { result = chatChanged('before-read'); return; }
            const chat = context.chat || [];
            const ownership = captureOperationOwnership(rebase ? 'explicit-rebase' : 'branch-reconcile', chatKey, chat, null);
            const operationId = beginOperationDiagnostics(ownership, '');

            if (rebase) {
                const rebased = rebaseToCurrentChat(state, chat, { relationshipMode: mode });
                if (!rebased.rebaseBackup?.snapshot) throw new Error('Timeline rebase refused to persist without a restorable pre-rebase snapshot.');
                if (getChatKey() !== chatKey) { result = chatChanged('before-commit'); return; }
                const commit = await commitState({ token: ownership, operationId, state: rebased, chat, checkpoint: false });
                if (!commit.ok) { result = { ...commit, changed: true, rebased: true, relationshipMode: mode }; return; }
                const persisted = commit.state;
                result = {
                    ok: true, changed: true, rebased: true, relationshipMode: mode,
                    unsafeDivergence: false, needsRecovery: false,
                    checkpoint: persisted.branchBase || null,
                    rebaseBackup: persisted.rebaseBackup ? { createdAt: persisted.rebaseBackup.createdAt, relationshipMode: persisted.rebaseBackup.relationshipMode } : null,
                    state: structuredClone(persisted),
                };
                return;
            }

            const reconciled = reconcileToCurrentBranch(state, chat);
            if (reconciled.unsafeDivergence) {
                const blocked = normalizeState(reconciled.state, chatKey);
                cache.set(chatKey, blocked);
                hydration.set(chatKey, { status: 'ready', error: null });
                emitStateChanged(chatKey, blocked);
                let persisted = blocked;
                let persistenceError = null;
                try { persisted = await persist(chatKey, blocked); }
                catch (error) { persistenceError = error; hydration.set(chatKey, { status: 'ready', error }); }
                operationLog.finish(operationId, { status: 'blocked', persistence: { status: persistenceError ? 'failed' : 'committed', revision: Number(persisted.revision) || null }, checkpoint: reconciled.checkpoint ? { restoredMessageId: reconciled.checkpoint.messageId, reason: reconciled.checkpoint.reason || '' } : {}, failure: { stage: 'rollback', reason: reconciled.reason || 'recovery-required' } });
                result = {
                    ok: false, reason: 'recovery-required', changed: true,
                    unsafeDivergence: true, needsRecovery: true,
                    persistenceFailed: Boolean(persistenceError),
                    persistenceError: persistenceError ? String(persistenceError?.message || persistenceError).slice(0, 500) : '',
                    branchSafety: structuredClone(persisted.branchSafety), state: structuredClone(persisted),
                };
                return;
            }
            if (!reconciled.changed) {
                operationLog.finish(operationId, { status: 'unchanged', checkpoint: reconciled.checkpoint ? { restoredMessageId: reconciled.checkpoint.messageId, reason: reconciled.checkpoint.reason || '' } : {} });
                result = { ok: true, changed: false, unsafeDivergence: false, needsRecovery: false, checkpoint: reconciled.checkpoint || null, state: structuredClone(reconciled.state) };
                return;
            }
            if (getChatKey() !== chatKey) { result = chatChanged('before-commit'); return; }

            const manualRelationshipLimitations = reconciled.manualRelationshipLimitations || [];
            const autoRecover = reconciled.needsRecovery && !manualRelationshipLimitations.length && getSettings().branchRescan !== false;
            let candidate = normalizeState(reconciled.state, chatKey);
            if (reconciled.needsRecovery) {
                candidate = prepareBranchRecoveryState(candidate, chat, reconciled.recoveryMessageIds, reconciled.checkpoint?.lineage || [], autoRecover);
            }
            let persisted;
            try {
                operationLog.patch(operationId, { checkpoint: reconciled.checkpoint ? { restoredMessageId: reconciled.checkpoint.messageId, reason: reconciled.checkpoint.reason || '' } : {}, recovery: { required: reconciled.needsRecovery, total: reconciled.recoveryMessageIds?.length || 0 } });
                const commit = await commitState({ token: ownership, operationId, state: candidate, chat, checkpoint: false });
                if (!commit.ok) { result = { ...commit, changed: true, unsafeDivergence: false, needsRecovery: true, checkpoint: reconciled.checkpoint || null }; return; }
                persisted = commit.state;
            } catch (error) {
                const blocked = normalizeState(candidate, chatKey);
                if (blocked.recovery) {
                    blocked.recovery = releaseRecoveryOwnership(blocked.recovery);
                    blocked.recovery.status = 'failed';
                    blocked.recovery.reason = 'Rollback selected a valid state but persistence failed. Reload/retry before normal scanning resumes.';
                    blocked.recovery.error = String(error?.message || error).slice(0, 1200);
                    blocked.recovery.updatedAt = Date.now();
                }
                blocked.branchSafety = {
                    status: 'rebase-required', kind: 'rollback-save-failed',
                    reason: 'NPC State could not persist the restored timeline safely. The in-memory view is blocked from normal scanning until persistence succeeds or the chat is reloaded.',
                };
                cache.set(chatKey, blocked);
                hydration.set(chatKey, { status: 'ready', error });
                emitStateChanged(chatKey, blocked);
                result = {
                    ok: false, reason: 'rollback-persistence-failed', changed: true, unsafeDivergence: false,
                    needsRecovery: true, persistenceFailed: true,
                    persistenceError: String(error?.message || error).slice(0, 500), state: structuredClone(blocked),
                };
                return;
            }
            result = {
                ok: manualRelationshipLimitations.length === 0,
                reason: manualRelationshipLimitations.length ? 'manual-relationship-correction-uncertain' : '',
                changed: true, unsafeDivergence: false,
                needsRecovery: reconciled.needsRecovery, fullyRestored: reconciled.fullyRestored,
                recoveryStarted: autoRecover, checkpoint: reconciled.checkpoint || null,
                manualRelationshipLimitations: structuredClone(manualRelationshipLimitations),
                state: structuredClone(persisted),
            };
        });

        if (result?.recoveryStarted) {
            const recoveryResult = await runHistoricalRecoveryLoop(chatKey);
            const finalState = recoveryResult?.state || (cache.has(chatKey) ? structuredClone(cache.get(chatKey)) : result.state);
            return {
                ...result,
                ok: recoveryResult?.ok === true,
                reason: recoveryResult?.ok === true ? '' : (recoveryResult?.reason || 'branch-recovery-failed'),
                branchReconstructionHandled: true,
                needsRecovery: recoveryResult?.complete !== true,
                recoveryResult,
                state: finalState,
            };
        }
        if (result?.needsRecovery && !result?.unsafeDivergence && !result?.persistenceFailed) {
            return { ...result, ok: false, reason: 'recovery-required', branchReconstructionHandled: true };
        }
        if (result?.unsafeDivergence || !result?.ok) return result;

        if (rescan && (rebase || getSettings().branchRescan !== false)) {
            if (getChatKey() !== chatKey) { result.rescan = chatChanged('before-refresh'); return result; }
            const context = getContext();
            if (getChatKey() !== chatKey) { result.rescan = chatChanged('before-refresh-read'); return result; }
            const id = latestAssistantMessageId(context.chat || []);
            if (id >= 0) result.rescan = await scan(id, {
                manual: rebase === true,
                force: true,
                applyRelationship: rebase && mode === 'preserve' ? false : null,
            });
        }
        return result;
    }

    function branchSafetyStatus(chatKey = getChatKey()) {
        const key = chatKey || getChatKey();
        const current = cache.get(key);
        return current?.branchSafety ? structuredClone(current.branchSafety) : null;
    }

    function getInjectionState(chatKey = getChatKey()) {
        const key = chatKey || getChatKey();
        const current = cache.get(key);
        return current ? injectionStateProjection(current) : null;
    }

    function getDossierIndex(chatKey = getChatKey()) {
        const key = chatKey || getChatKey();
        const current = cache.get(key);
        return current ? (current.npcs || []).map(dossierIndexProjection) : null;
    }

    function getDossierNpc(reference, chatKey = getChatKey()) {
        const key = chatKey || getChatKey();
        const current = cache.get(key);
        if (!current) return null;
        const raw = String(reference || '');
        const npc = (current.npcs || []).find(item => item?.id === raw) || findNpcByReference(current, raw);
        return npc ? structuredClone(npc) : null;
    }

    function getNpcPortraitSource(reference, chatKey = getChatKey()) {
        const key = chatKey || getChatKey();
        const current = cache.get(key);
        if (!current) return '';
        const raw = String(reference || '');
        const npc = (current.npcs || []).find(item => item?.id === raw) || findNpcByReference(current, raw);
        return npcPortraitSource(npc);
    }

    return Object.freeze({
        loadChat,
        scan,
        recheckMissingDetails,
        refreshDossier,
        importStructuredDossier,
        addNpc,
        updateNpc,
        clearManualRelationshipCorrection,
        fillMissingBirthdays,
        archiveNpc,
        resetNpcStaleness,
        deleteNpc,
        getStaleReport,
        exportBundle,
        previewBundleImport,
        importBundle,
        initializeFresh,
        startHistoricalRecovery,
        resumeHistoricalRecovery,
        pauseHistoricalRecovery,
        cancelHistoricalRecovery,
        recoveryRange,
        previewRebase,
        reconcileBranch,
        renameChatKey,
        deleteChatKey,
        invalidate,
        branchSafetyStatus,
        getInjectionState,
        getDossierIndex,
        getDossierNpc,
        getNpcPortraitSource,
        operationDiagnosticsSummary: chatKey => operationLog.summary(chatKey || getChatKey()),
        operationDiagnostics: (chatKey, options = {}) => operationLog.records(chatKey || getChatKey(), options),
        // Full immutable state snapshots remain available for compatibility/debugging.
        getState: chatKey => cache.has(chatKey || getChatKey()) ? structuredClone(cache.get(chatKey || getChatKey())) : null,
        hydrationStatus: chatKey => hydration.get(chatKey || getChatKey()) || { status: cache.has(chatKey || getChatKey()) ? 'ready' : 'unloaded', error: null },
        recoveryStatus: chatKey => {
            const key = chatKey || getChatKey();
            return decoratedRecoveryStatus(cache.get(key)?.recovery || null, key);
        },
        isRecoveryRunning: chatKey => recoveryRuns.has(chatKey || getChatKey()),
        isBusy: chatKey => locks.has(chatKey || getChatKey()),
    });
}

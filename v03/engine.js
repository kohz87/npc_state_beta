import { chatLineage, bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';
import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText, retentionEvidenceText, structuredDossierBlocksForNpc } from './evidence-adapter.js';
import {
    applyNpcStateBundleImport,
    bundleSuggestedFilename,
    createNpcStateBundle,
    previewNpcStateBundleImport,
} from './bundle.js';
import {
    DEFAULT_RELATIONSHIP_CAPS,
    applyBirthdayFill,
    createEmptyState,
    findNpcByReference,
    makeNpcId,
    normalizeName,
    normalizeActualAge,
    normalizeApparentAge,
    normalizeScannerResponseTokens,
    normalizeRecoveryRelationshipMode,
    normalizeNpc,
    normalizeBirthdayFillMode,
    normalizeRelationship,
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
    buildStructuredDossierImportPrompt,
    buildTargetedRefreshPrompt,
    currentExchange,
    parseScanJson,
    reconcileFamilyGraphState,
    sanitizeStructuredDossierPatch,
} from './scanner.js';
import {
    applyStaleLifecycle,
    buildStaleReport,
    narrativeTurnForMessage,
    referencedNpcIdsFromExchange,
} from './stale.js';
import { clearV3PointerHint, createRecoveryV3Sidecar, deleteV3SidecarFile, readV3PointerHint, readV3Sidecar, retireV3Sidecar, writeV3Sidecar } from './storage.js';

const SYSTEM_PROMPT = 'Return only valid JSON for the NPC State v0.4.28 recovery scanner. Obey the supplied schema and evidence rules exactly.';

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

function relationshipContextForExchange(exchange) {
    if (!exchange) return '';
    return [exchange.user?.mes, exchange.assistant?.mes].map(value => relationshipEvidenceText(value).trim()).filter(Boolean).join('\n');
}

function latestAssistantMessageId(chat = []) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) return i;
    }
    return -1;
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
function recoveryRangeForChat(chat = [], startMessageId = null, endMessageId = null) {
    const firstAssistant = assistantMessageIdsInRange(chat, 0, chat.length - 1)[0] ?? null;
    const latestAssistant = latestAssistantMessageId(chat);
    if (latestAssistant < 0 || firstAssistant === null) {
        return { firstAssistantMessageId: null, latestAssistantMessageId: null, startMessageId: 0, endMessageId: -1, messageIds: [], plannedLineage: [] };
    }
    const start = Number.isInteger(startMessageId) ? Math.max(0, Math.min(startMessageId, latestAssistant)) : firstAssistant;
    const end = Number.isInteger(endMessageId) ? Math.max(0, Math.min(endMessageId, latestAssistant)) : latestAssistant;
    if (end < start) {
        const error = new Error('Recovery end message must not be before the start message.');
        error.code = 'NPC_STATE_V04_BETA_RECOVERY_RANGE';
        throw error;
    }
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

export function createNpcStateEngine(adapters = {}) {
    const cache = new Map();
    const hydration = new Map();
    const operationEpoch = new Map();
    const locks = new Map();
    const recoverySignals = new Map();
    const recoveryRuns = new Map();

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
    const onStateChanged = adapters.onStateChanged || (() => {});
    const notify = adapters.notify || (() => {});

    if (typeof getContext !== 'function' || typeof getChatKey !== 'function' || typeof getSettings !== 'function' || typeof generate !== 'function') {
        throw new Error('NPC State v0.4.28 engine requires getContext, getChatKey, getSettings, and generate adapters.');
    }

    function epoch(chatKey) { return operationEpoch.get(chatKey) || 0; }
    function invalidate(chatKey = getChatKey()) {
        if (!chatKey || chatKey === 'no-chat') return 0;
        const next = epoch(chatKey) + 1;
        operationEpoch.set(chatKey, next);
        return next;
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

    async function persist(chatKey, state) {
        const result = await writeV3Sidecar({
            chatKey,
            state,
            pointer: getPointer(chatKey),
            fetchFn,
            headers: getHeaders(),
        });
        setPointer(chatKey, result.pointer);
        persistSettings();
        cache.set(chatKey, result.state);
        hydration.set(chatKey, { status: 'ready', error: null });
        onStateChanged(chatKey, structuredClone(result.state));
        return result.state;
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
        onStateChanged(chatKey, structuredClone(result.state));
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
            const recoveryInterrupted = normalized.recovery?.status === 'running';
            if (recoveryInterrupted) {
                normalized.recovery.status = 'paused';
                normalized.recovery.reason = 'Recovery was interrupted by reload and can be resumed from the last committed exchange.';
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
            state = recoveryBlocksLiveScan(normalized) ? normalized : ensureBranchBase(normalized, getContext().chat || []);
            if (importedStable || fingerprintUpgraded || recoveryInterrupted) {
                state = await persist(chatKey, state);
                if (importedStable) {
                    notify('success', 'Cloned stable NPC State v0.3 dossiers into an independent v0.4.28 beta sidecar. Stable data was not modified.');
                } else if (fingerprintUpgraded) {
                    notify('info', 'Upgraded branch checkpoint fingerprints for transport-safe, swipe-index-independent rollback. Existing dossiers were preserved; old rollback hashes were reset once.');
                } else if (recoveryInterrupted) {
                    notify('info', 'Historical recovery was interrupted by reload and is paused at the last committed exchange. Resume it from Recovery & Branch Safety.');
                }
            }
            cache.set(chatKey, state);
            hydration.set(chatKey, { status: 'ready', error: null });
            onStateChanged(chatKey, structuredClone(state));
            return state;
        } catch (error) {
            hydration.set(chatKey, { status: 'error', error });
            throw error;
        }
    }

    async function invokeJson(prompt, label = 'scan') {
        const responseLength = normalizeScannerResponseTokens(getSettings().scannerResponseTokens);
        let raw = await generate({ systemPrompt: SYSTEM_PROMPT, prompt, responseLength, label });
        try { return parseScanJson(raw); }
        catch (firstError) {
            raw = await generate({
                systemPrompt: SYSTEM_PROMPT,
                prompt: `${prompt}\n\nYour previous response was malformed. Return exactly one valid JSON object, no markdown and no commentary.`,
                responseLength,
                label: `${label}-json-retry`,
            });
            try { return parseScanJson(raw); }
            catch (secondError) {
                secondError.cause = firstError;
                throw secondError;
            }
        }
    }

    async function scan(messageId, { manual = false, force = false } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        const settings = getSettings();
        if (!manual && settings.enabled === false) return { ok: false, reason: 'disabled' };
        if (!manual && settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };
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
            const startEpoch = epoch(chatKey);
            const startFingerprint = fingerprintMessage(chat[messageId] || {});
            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);
            const prompt = buildScanPrompt({
                state,
                chat,
                assistantMessageId: messageId,
                scanDepth: settings.scanDepth,
                relationshipCriteria: settings.relationshipCriteria,
                relationshipCaps: settings.relationshipCaps,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            });
            const parsed = await invokeJson(prompt, manual ? 'manual-current-cast' : 'automatic-current-cast');
            const liveCtx = getContext();
            const liveChat = liveCtx.chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {
                return { ok: false, discarded: true, reason: 'stale-operation', messageId };
            }
            const working = normalizeState(state, chatKey);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const applied = applyScanResult(working, parsed, {
                sourceMessageId: messageId,
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: relationshipContextForExchange(exchange),
                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
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
                applyRelationship: !alreadyScannedMessage,
            });
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
            let committed = recordCheckpoint(stale.state, liveChat, messageId, manual ? 'manual-scan' : 'auto-scan');
            committed.lastScannedMessageId = messageId;
            committed.updatedAt = Date.now();
            const persisted = await persist(chatKey, committed);
            const notice = lifecycleNotice(stale);
            if (notice) notify('info', `Stale management ${notice}.`);
            return {
                ok: true,
                messageId,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds,
                targetNpcIds: applied.targetNpcIds,
                stale: {
                    archivedIds: stale.archivedIds,
                    restoredIds: stale.restoredIds,
                    deletedIds: stale.deletedIds,
                    currentTurn: stale.currentTurn,
                },
                state: structuredClone(persisted),
            };
        });
    }

    async function applyEmbeddedScan(messageId, parsed, options = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        const settings = getSettings();
        if (settings.enabled === false || settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };
        return exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (!state) return { ok: false, reason: 'no-state' };
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', messageId, recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };
            const ctx = getContext();
            const chat = ctx.chat || [];
            const message = chat[messageId];
            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };
            if (typeof options.expectedMessageText === 'string') {
                const expectedFingerprint = fingerprintMessage({ ...message, mes: options.expectedMessageText });
                if (fingerprintMessage(message) !== expectedFingerprint) {
                    return { ok: false, discarded: true, reason: 'stale-operation', messageId };
                }
            }
            if (Number.isInteger(state.lastScannedMessageId) && messageId <= state.lastScannedMessageId) {
                const lineage = chatLineage(chat, messageId);
                const matches = lineage.every((entry, index) => state.branchHeadLineage?.[index] === entry);
                if (!matches) return { ok: false, reason: 'branch-unreconciled', messageId };
                return { ok: true, skipped: true, reason: 'already-scanned', messageId, embedded: true, state: structuredClone(state) };
            }
            const startEpoch = epoch(chatKey);
            const startFingerprint = fingerprintMessage(message);
            const exchange = currentExchange(chat, messageId) || { assistant: { ...message, id: messageId }, user: null };
            const working = normalizeState(state, chatKey);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const applied = applyScanResult(working, parsed, {
                sourceMessageId: messageId,
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: relationshipContextForExchange(exchange),
                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
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
            });
            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);
            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);
            const retentionExchange = { ...exchange, user: exchange.user ? { ...exchange.user, mes: retentionEvidenceText(exchange.user.mes) } : null, assistant: exchange.assistant ? { ...exchange.assistant, mes: retentionEvidenceText(exchange.assistant.mes) } : null };
            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, retentionExchange);
            const stale = applyStaleLifecycle(applied.state, {
                settings,
                currentTurn: narrativeTurnForMessage(chat, messageId),
                sourceMessageId: messageId,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds,
            });
            const liveCtx = getContext();
            const liveChat = liveCtx.chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {
                return { ok: false, discarded: true, reason: 'stale-operation', messageId };
            }
            let committed = recordCheckpoint(stale.state, liveChat, messageId, 'embedded-foreground');
            committed.lastScannedMessageId = messageId;
            committed.updatedAt = Date.now();
            const persisted = await persist(chatKey, committed);
            const notice = lifecycleNotice(stale);
            if (notice) notify('info', 'Stale management ' + notice + '.');
            return {
                ok: true, messageId, embedded: true,
                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,
                finalPresentNpcIds: applied.finalPresentNpcIds,
                worldActiveNpcIds: applied.worldActiveNpcIds,
                referencedNpcIds, targetNpcIds: applied.targetNpcIds,
                state: structuredClone(persisted),
            };
        });
    }

    async function importStructuredDossier(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
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
            const startEpoch = epoch(chatKey);
            const startFingerprint = fingerprintMessage(chat[messageId] || {});
            const sourceContext = blocks.map(block => block.body).join('\n');
            const prompt = buildStructuredDossierImportPrompt({
                npc,
                blocks,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
            });
            const parsedRaw = await invokeJson(prompt, 'structured-import-' + npc.id);
            const candidate = (parsedRaw.npcs || []).find(patch => {
                const patchId = String(patch?.id || '').trim();
                return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);
            });
            if (!candidate) return { ok: false, reason: 'structured-source-no-target', npcId: npc.id };
            const parsed = {
                exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [],
                npcs: [sanitizeStructuredDossierPatch(candidate, npc)], socialEdges: [], familyFacts: [],
            };
            const liveChat = getContext().chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {
                return { ok: false, discarded: true, reason: 'stale-operation' };
            }
            const applied = applyScanResult(state, parsed, {
                sourceMessageId: messageId,
                turn: state.turn,
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
            const committed = recordCheckpoint(applied.state, liveChat, messageId, 'structured-dossier-import');
            const persisted = await persist(chatKey, committed);
            return { ok: true, npcId: npc.id, sourceCount: blocks.length, state: structuredClone(persisted) };
        });
    }

    async function refreshDossier(reference) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
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
            const startEpoch = epoch(chatKey);
            const startFingerprint = fingerprintMessage(chat[messageId] || {});
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
            const parsedRaw = await invokeJson(prompt, `targeted-${npc.id}`);
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
            };
            const liveChat = getContext().chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {
                return { ok: false, discarded: true, reason: 'stale-operation' };
            }
            const applied = applyScanResult(state, parsed, {
                sourceMessageId: messageId,
                turn: state.turn,
                preservePresence: true,
                preserveObservation: true,
                applyRelationship: false,
                allowHistoricalProfilePatches: true,
                profileContext: profileContextForWindow(liveChat, messageId, settings.scanDepth),
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,
                reconcileFamilyGraph: false,
            });
            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);
            const committed = recordCheckpoint(applied.state, liveChat, messageId, 'targeted-refresh');
            const persisted = await persist(chatKey, committed);
            return { ok: true, npcId: npc.id, state: structuredClone(persisted) };
        });
    }

    async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        return exclusive(chatKey, async () => {
            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const result = await mutator(state);
            if (result === false) return { ok: false, reason: 'rejected' };
            if (result?.rejected) return { ok: false, reason: String(result.rejected) };
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            let next = normalizeState(state, chatKey);
            if (messageId >= 0) next = recordCheckpoint(next, chat, messageId, checkpointReason);
            next.updatedAt = Date.now();
            const persisted = await persist(chatKey, next);
            return { ok: true, label, state: structuredClone(persisted), result };
        });
    }

    async function addNpc(name) {
        const clean = String(name || '').trim().slice(0, 120);
        if (!clean) return { ok: false, reason: 'empty-name' };
        return mutate('add', state => {
            const existing = findNpcByReference(state, clean);
            if (existing) return { npcId: existing.id, existing: true };
            if ((state.suppressedNames || []).some(value => normalizeName(value) === normalizeName(clean))) {
                state.suppressedNames = state.suppressedNames.filter(value => normalizeName(value) !== normalizeName(clean));
            }
            const chat = getContext().chat || [];
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

    async function updateNpc(reference, patch = {}, options = {}) {
        return mutate('update', state => {
            const matched = findNpcByReference(state, reference);
            const index = matched ? state.npcs.findIndex(npc => npc.id === matched.id) : -1;
            if (index < 0) return false;
            const current = state.npcs[index];
            if (Number.isFinite(Number(options.expectedUpdatedAt)) && Number(current.updatedAt) !== Number(options.expectedUpdatedAt)) return { rejected: 'stale-editor' };
            const nextRaw = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1), manual: true };
            const manualAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'age')
                && normalizeActualAge(patch.age) !== normalizeActualAge(current.age);
            const manualApparentAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'apparentAge')
                && normalizeApparentAge(patch.apparentAge) !== normalizeApparentAge(current.apparentAge);
            if (manualAgeChanged || manualApparentAgeChanged) {
                nextRaw.ageProgressionBaselineAge = normalizeActualAge(manualAgeChanged ? patch.age : current.age);
            }
            if (patch?.relationship && typeof patch.relationship === 'object') {
                const before = normalizeRelationship(current.relationship);
                const after = normalizeRelationship({ ...before, ...patch.relationship });
                nextRaw.relationship = after;
                const changedAxes = Object.keys(before).filter(axis => before[axis] !== after[axis]);
                const inferred = normalizeRelationshipMilestones([], after, { inferFromRelationship: true, includeBoundary: true })
                    .filter(entry => changedAxes.includes(entry.axis));
                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(
                    [...(current.relationshipMilestones || []), ...inferred], after, { inferFromRelationship: false });
                const delta = Object.fromEntries(Object.keys(before).map(axis => [axis, after[axis] - before[axis]]));
                nextRaw.relationshipProgress = { ...(current.relationshipProgress || {}) };
                for (const axis of Object.keys(delta)) if (delta[axis] !== 0) nextRaw.relationshipProgress[axis] = 0;
                if (Object.values(delta).some(value => value !== 0)) {
                    const event = {
                        impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.',
                        sourceMessageId: latestAssistantMessageId(getContext().chat || []), turn: Number.isInteger(state.turn) ? state.turn : null, at: Date.now(),
                    };
                    const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(getSettings().relationshipHistoryLimit);
                    nextRaw.lastRelationshipChange = event;
                    nextRaw.relationshipHistory = [...(current.relationshipHistory || []), event].slice(-relationshipHistoryLimit);
                }
            }
            let next = normalizeNpc(nextRaw);
            if (next.name !== current.name && current.name) next.aliases = [...new Set([...(next.aliases || []), current.name])].slice(0, 10);
            next = normalizeNpc(next);
            const nextIdentityKeys = new Set([next.name, ...(next.aliases || [])].map(value => normalizeName(value)).filter(Boolean));
            const collision = state.npcs.some((npc, i) => i !== index && [npc.name, ...(npc.aliases || [])]
                .map(value => normalizeName(value)).filter(Boolean).some(key => nextIdentityKeys.has(key)));
            if (collision) return { rejected: 'identity-collision' };
            state.npcs[index] = next;
            if (Object.prototype.hasOwnProperty.call(patch || {}, 'keyRelationships')) {
                const reconciled = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(getContext().chat || []), dossierLimits: getSettings().dossierLimits });
                state.npcs = reconciled.npcs;
                state.socialGraph = reconciled.socialGraph;
                state.familySlots = reconciled.familySlots;
            }
            return { npcId: current.id };
        }, { checkpointReason: 'manual-edit' });
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
        return mutate(archived ? 'archive' : 'restore', state => {
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
                const chat = getContext().chat || [];
                const messageId = latestAssistantMessageId(chat);
                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);
                next.lastActivityMessageId = messageId >= 0 ? messageId : null;
                next.lastActivityReason = 'manual-restore';
            }
            state.npcs[index] = normalizeNpc(next);
            return { npcId: npc.id };
        }, { checkpointReason: archived ? 'manual-archive' : 'manual-restore' });
    }

    async function resetNpcStaleness(reference) {
        return mutate('reset-staleness', state => {
            const npc = findNpcByReference(state, reference);
            if (!npc) return false;
            const index = state.npcs.findIndex(item => item.id === npc.id);
            const chat = getContext().chat || [];
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
            const imported = applyNpcStateBundleImport(state, bundleInput, {
                ...options,
                currentNarrativeTurn: narrativeTurnForMessage(chat, messageId),
            });
            if (!imported.ok) return imported;
            let next = normalizeState(imported.state, chatKey);
            if (messageId >= 0) next = recordCheckpoint(next, chat, messageId, imported.mode === 'replace' ? 'bundle-restore' : 'bundle-merge');
            next.updatedAt = Date.now();
            const persisted = await persist(chatKey, next);
            return {
                ok: true,
                mode: imported.mode,
                preview: imported.preview,
                result: imported.result,
                state: structuredClone(persisted),
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
                    const nextState = normalizeState(source.state, targetKey);
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
            state.recovery.status = status;
            state.recovery.reason = String(reason || '').slice(0, 500);
            state.recovery.error = String(errorText || '').slice(0, 1200);
            state.recovery.updatedAt = Date.now();
            if (status === 'complete') state.recovery.completedAt = Date.now();
            state.updatedAt = Date.now();
            const persisted = await persist(chatKey, state);
            return { ok: true, recovery: structuredClone(persisted.recovery), state: structuredClone(persisted) };
        });
    }

    async function finalizeHistoricalRecoveryUnlocked(chatKey, state, chat, settings) {
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
        next.recovery = {
            ...recovery,
            status: 'complete',
            completed: recovery.total || 0,
            nextMessageId: null,
            reason: 'Historical reconstruction completed.',
            error: '',
            updatedAt: Date.now(),
            completedAt: Date.now(),
        };
        next.branchSafety = { status: 'safe', kind: '', reason: '' };
        next.updatedAt = Date.now();
        const persisted = await persist(chatKey, next);
        notify('success', 'Historical reconstruction completed. Normal scanning and continuity injection are active again.');
        return { ok: true, complete: true, recovery: structuredClone(persisted.recovery), state: structuredClone(persisted) };
    }

    async function historicalRecoveryStep(chatKey) {
        return exclusive(chatKey, async () => {
            let state = normalizeState(await loadChat(chatKey), chatKey);
            if (!state.recovery) return { ok: false, reason: 'no-recovery' };
            if (state.recovery.status !== 'running') return { ok: false, reason: 'recovery-not-running', recovery: structuredClone(state.recovery) };
            const settings = getSettings();
            const liveChat = getContext().chat || [];
            const replanned = replanRecoverySuffix(state.recovery, liveChat);
            if (!replanned.ok) {
                state.recovery.status = 'stale';
                state.recovery.reason = 'A message at or before the last completed recovery exchange changed. Restart recovery to avoid replaying already-committed history against a different past.';
                state.recovery.error = replanned.reason;
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, restartRequired: true, reason: 'completed-history-changed', recovery: structuredClone(persisted.recovery) };
            }
            state.recovery = replanned.recovery;
            const nextMessageId = state.recovery.messageIds[state.recovery.completed] ?? null;
            state.recovery.nextMessageId = nextMessageId;
            if (!Number.isInteger(nextMessageId)) return finalizeHistoricalRecoveryUnlocked(chatKey, state, liveChat, settings);

            const historicalChat = liveChat.slice(0, nextMessageId + 1);
            const exchange = currentExchange(historicalChat, nextMessageId);
            if (!exchange) {
                state.recovery.status = 'failed';
                state.recovery.reason = 'The next planned recovery item is no longer an assistant exchange.';
                state.recovery.error = 'not-assistant-message';
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, failed: true, reason: 'not-assistant-message', recovery: structuredClone(persisted.recovery) };
            }

            const startEpoch = epoch(chatKey);
            const startLineage = chatLineage(historicalChat, nextMessageId);
            const prompt = buildScanPrompt({
                state,
                chat: historicalChat,
                assistantMessageId: nextMessageId,
                scanDepth: settings.scanDepth,
                relationshipCriteria: settings.relationshipCriteria,
                relationshipCaps: settings.relationshipCaps,
                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            });
            let parsed;
            try {
                parsed = await invokeJson(prompt, 'historical-recovery-' + nextMessageId);
            } catch (error) {
                state.recovery.status = 'failed';
                state.recovery.reason = 'Historical scanner request failed. Resume retries this same exchange without replaying completed work.';
                state.recovery.error = String(error?.message || error).slice(0, 1200);
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, failed: true, reason: 'generation-failed', error, recovery: structuredClone(persisted.recovery) };
            }

            const currentChat = getContext().chat || [];
            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || !recoveryLineageEqual(chatLineage(currentChat, nextMessageId), startLineage)) {
                return { ok: false, discarded: true, reason: 'stale-operation', messageId: nextMessageId };
            }

            const working = normalizeState(state, chatKey);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const applied = applyScanResult(working, parsed, {
                sourceMessageId: nextMessageId,
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: relationshipContextForExchange(exchange),
                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\n'),
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
            let committed = recordCheckpoint(stale.state, historicalChat, nextMessageId, 'history-recovery');
            committed.lastScannedMessageId = nextMessageId;
            committed.recovery = {
                ...state.recovery,
                status: 'running',
                completed: Math.min(state.recovery.total, state.recovery.completed + 1),
                lastCompletedMessageId: nextMessageId,
                nextMessageId: state.recovery.messageIds[state.recovery.completed + 1] ?? null,
                reason: replanned.changed ? 'Unprocessed suffix changed and was safely replanned; completed history was not replayed.' : '',
                error: '',
                updatedAt: Date.now(),
            };
            committed.updatedAt = Date.now();
            const persisted = await persist(chatKey, committed);
            return {
                ok: true,
                messageId: nextMessageId,
                recovery: structuredClone(persisted.recovery),
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
                    try { await markRecoveryStatus(chatKey, 'failed', 'Historical recovery persistence/orchestration failed. Resume retries from the last committed exchange.', error?.message || error); }
                    catch { /* preserve the original failure */ }
                    return { ok: false, failed: true, reason: 'recovery-step-failed', error };
                }
                if (step?.complete || step?.failed || step?.restartRequired) return step;
                if (step?.discarded) {
                    const afterDiscard = recoverySignals.get(chatKey) || {};
                    if (afterDiscard.cancel) continue;
                    if (afterDiscard.pause) continue;
                    // A chat edit in the unprocessed suffix is replanned on the next iteration.
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
        await stopExistingRecoveryRun(chatKey);
        invalidate(chatKey);
        recoverySignals.set(chatKey, { pause: false, cancel: false, reason: '' });
        const chat = getContext().chat || [];
        const plan = recoveryRangeForChat(chat, startMessageId, endMessageId);
        const mode = normalizeRecoveryRelationshipMode(relationshipMode);
        await exclusive(chatKey, async () => {
            const fresh = createEmptyState(chatKey);
            const baseline = createEmptyState(chatKey);
            fresh.branchBase = { messageId: null, lineage: [], createdAt: Date.now(), snapshot: baseline };
            fresh.branchHeadLineage = [];
            fresh.recovery = {
                version: 1,
                status: plan.messageIds.length ? 'running' : 'complete',
                relationshipMode: mode,
                startMessageId: plan.startMessageId,
                endMessageId: plan.endMessageId,
                messageIds: plan.messageIds,
                plannedLineage: plan.plannedLineage,
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
        });
        if (!plan.messageIds.length) {
            const state = cache.get(chatKey);
            return { ok: true, complete: true, recovery: structuredClone(state?.recovery || null), state: state ? structuredClone(state) : null };
        }
        return runHistoricalRecoveryLoop(chatKey);
    }

    async function resumeHistoricalRecovery() {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };
        if (recoveryRuns.has(chatKey)) return recoveryRuns.get(chatKey);
        recoverySignals.set(chatKey, { pause: false, cancel: false, reason: '' });
        const prepared = await exclusive(chatKey, async () => {
            const state = normalizeState(await loadChat(chatKey), chatKey);
            const recovery = state.recovery;
            if (!recovery) return { ok: false, reason: 'no-recovery' };
            if (recovery.status === 'complete') return { ok: true, complete: true, recovery: structuredClone(recovery) };
            if (recovery.status === 'cancelled') return { ok: false, reason: 'recovery-cancelled', recovery: structuredClone(recovery) };
            if (recovery.status === 'stale') return { ok: false, reason: 'restart-required', recovery: structuredClone(recovery) };
            const replanned = replanRecoverySuffix(recovery, getContext().chat || []);
            if (!replanned.ok) {
                state.recovery.status = 'stale';
                state.recovery.reason = 'Completed recovery history changed. Restart is required; completed exchanges will not be replayed automatically.';
                state.recovery.error = replanned.reason;
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, reason: 'restart-required', recovery: structuredClone(persisted.recovery) };
            }
            state.recovery = { ...replanned.recovery, status: 'running', error: '', updatedAt: Date.now() };
            const persisted = await persist(chatKey, state);
            return { ok: true, recovery: structuredClone(persisted.recovery) };
        });
        if (!prepared?.ok || prepared.complete) return prepared;
        return runHistoricalRecoveryLoop(chatKey);
    }

    async function pauseHistoricalRecovery(reason = '') {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        const signal = recoverySignals.get(chatKey) || {};
        signal.pause = true;
        signal.cancel = false;
        signal.reason = String(reason || 'Historical reconstruction was paused after the last committed exchange.').slice(0, 500);
        recoverySignals.set(chatKey, signal);
        if (recoveryRuns.has(chatKey)) return { ok: true, requested: true, reason: 'pause-requested' };
        const state = cache.get(chatKey) || await loadChat(chatKey);
        if (!state?.recovery || state.recovery.status === 'complete' || state.recovery.status === 'cancelled') return { ok: false, reason: 'no-active-recovery' };
        return markRecoveryStatus(chatKey, 'paused', signal.reason, '');
    }

    async function cancelHistoricalRecovery() {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        const signal = recoverySignals.get(chatKey) || {};
        signal.cancel = true;
        signal.pause = false;
        recoverySignals.set(chatKey, signal);
        invalidate(chatKey);
        if (recoveryRuns.has(chatKey)) return { ok: true, requested: true, reason: 'cancel-requested' };
        const state = cache.get(chatKey) || await loadChat(chatKey);
        if (!state?.recovery || state.recovery.status === 'complete') return { ok: false, reason: 'no-active-recovery' };
        return markRecoveryStatus(chatKey, 'cancelled', 'Historical reconstruction was cancelled. The partial reconstructed state remains available.', '');
    }

    function recoveryRange() {
        const chat = getContext().chat || [];
        const range = recoveryRangeForChat(chat, null, null);
        return {
            firstAssistantMessageId: range.firstAssistantMessageId,
            latestAssistantMessageId: range.latestAssistantMessageId,
            assistantExchangeCount: range.messageIds.length,
        };
    }

    async function reconcileBranch({ rescan = false, rebase = false } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        let result;
        await exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) {
                result = { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };
                return;
            }
            const chat = getContext().chat || [];
            if (rebase) {
                const rebased = rebaseToCurrentChat(state, chat);
                const persisted = await persist(chatKey, rebased);
                result = {
                    ok: true,
                    changed: true,
                    rebased: true,
                    unsafeDivergence: false,
                    checkpoint: persisted.branchBase || null,
                    state: structuredClone(persisted),
                };
                return;
            }
            const reconciled = reconcileToCurrentBranch(state, chat);
            if (!reconciled.changed) {
                result = { ok: true, changed: false, unsafeDivergence: false, checkpoint: bestCheckpoint(state, chat) };
                return;
            }
            const persisted = await persist(chatKey, reconciled.state);
            result = { ok: true, changed: true, unsafeDivergence: reconciled.unsafeDivergence === true, checkpoint: reconciled.checkpoint, state: structuredClone(persisted) };
        });
        if (result?.unsafeDivergence) return result;
        if (rescan && (rebase || getSettings().branchRescan !== false)) {
            const id = latestAssistantMessageId(getContext().chat || []);
            if (id >= 0) result.rescan = await scan(id, { manual: rebase === true, force: true });
        }
        return result;
    }

    return Object.freeze({
        loadChat,
        scan,
        applyEmbeddedScan,
        refreshDossier,
        importStructuredDossier,
        addNpc,
        updateNpc,
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
        reconcileBranch,
        renameChatKey,
        deleteChatKey,
        invalidate,
        getState: chatKey => cache.has(chatKey || getChatKey()) ? structuredClone(cache.get(chatKey || getChatKey())) : null,
        hydrationStatus: chatKey => hydration.get(chatKey || getChatKey()) || { status: cache.has(chatKey || getChatKey()) ? 'ready' : 'unloaded', error: null },
        recoveryStatus: chatKey => structuredClone(cache.get(chatKey || getChatKey())?.recovery || null),
        isRecoveryRunning: chatKey => recoveryRuns.has(chatKey || getChatKey()),
        isBusy: chatKey => locks.has(chatKey || getChatKey()),
    });
}

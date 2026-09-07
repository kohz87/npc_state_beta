/* NPC State Beta - clean runtime */
import { extension_settings, getContext } from '../../../../extensions.js';
import { extension_prompt_types, extension_prompt_roles, getRequestHeaders } from '../../../../../script.js';
import { createBundleManagementUi } from './bundle-ui.js';
import { createNpcStateEngine } from './engine.js';
import { characterOwnerRenamePairs, getChatIdentity, qualifiedChatKeysForOwner, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from './identity.js';
import { buildInjection, injectionDiagnostics } from './injection.js';
import { consumeNpcStateControl } from './foreground.js';
import { hasRecognizedStructuredBlocks, profileEvidenceText } from './evidence-adapter.js';
import { createMeguminBlockIntegration } from './megumin.js';
import { createPortraitPromptUi } from './portrait-ui.js';
import { inspectCapturedPayload, storeCapturedPayload, captureSourceIdentity, captureSourceMatches, captureTransportHash, activeSwipeMetadata } from './operation-diagnostics.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';
import { extensionSettings } from './settings.js';
import { runSharedQuietGeneration } from './shared-generation-queue.js';
import { generateWithScanRoute, resolveScanGenerationRoute, scanConnectionProfileOptions } from './scan-connection.js';
import { createCompletenessCoordinator } from './completeness-coordinator.js';
import { checkpointStorageBytes, fingerprintMessage, latestAssistantMessageId } from './branches.js';
import { createStaleManagementUi } from './stale-ui.js';
import { createNpcStateUi } from './ui.js';

const PROMPT_KEY = 'npc_state_v04_beta_foreground';
let initialized = false;
let eventsRegistered = false;
let activeChatKey = 'no-chat';
let ui = null;
let staleUi = null;
let bundleUi = null;
let portraitUi = null;
let completionCoordinator = null;
const completenessUiStatus = new Map();

function getSettings() {
    return extensionSettings(extension_settings);
}

function persistSettings() {
    const ctx = getContext();
    if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
}

function getChatKey() {
    return getChatIdentity(getContext()).key;
}

function getV3Pointer(chatKey) {
    return getSettings().dataFiles?.[chatKey] || null;
}

function setV3Pointer(chatKey, pointer) {
    getSettings().dataFiles[chatKey] = structuredClone(pointer);
}

function deleteV3Pointer(chatKey) {
    if (!chatKey) return false;
    const files = getSettings().dataFiles || {};
    if (!Object.prototype.hasOwnProperty.call(files, chatKey)) return false;
    delete files[chatKey];
    return true;
}

function notify(kind, message) {
    const fn = globalThis.toastr?.[kind];
    if (typeof fn === 'function') fn(`NPC State: ${message}`);
}

async function generateJson({ systemPrompt, prompt, responseLength, route = null, signal = null }) {
    const selectedRoute = route || resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);
    return runSharedQuietGeneration('npc-state-scan', () => generateWithScanRoute({
        getContext, route: selectedRoute, systemPrompt, prompt, responseLength, signal,
    }));
}

function resolveNpcScanRoute() {
    return resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);
}

function npcScanProfileOptions() {
    return scanConnectionProfileOptions(getContext);
}

function currentCompletenessStatus(chatKey = getChatKey()) {
    return structuredClone(completenessUiStatus.get(chatKey) || { status: 'idle', messageId: null, detail: '' });
}

function setCompletenessStatus(chatKey, status, messageId = null, detail = '') {
    if (!chatKey || chatKey === 'no-chat') return;
    completenessUiStatus.set(chatKey, { status, messageId, detail: String(detail || '').slice(0, 400) });
    ui?.refresh();
}

function cleanForegroundHistoryText(value) {
    return profileEvidenceText(value)
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*?<\/npc_state_v1\s*>/gi, '')
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*$/gi, '')
        .replace(/<!--\s*INVENTORY_BLOCK_(?:V05|UPDATE)\b[\s\S]*?-->/gi, '')
        .replace(/<Inventory\b[^>]*>[\s\S]*?<\/Inventory\s*>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function buildForegroundNewNpcHistory(chat = [], settings = {}) {
    if (settings.newNpcHistoryEnrichment === false) return '';
    const source = Array.isArray(chat) ? chat : [];
    let end = source.length;
    while (end > 0 && source[end - 1]?.is_system) end -= 1;
    // The newest user message is part of the live exchange, not historical enrichment.
    if (end > 0 && source[end - 1]?.is_user) end -= 1;
    const depth = Math.max(2, Math.min(6, Math.round(Number(settings.scanDepth) || 6)));
    const candidates = source.slice(0, end).map((message, id) => ({ ...message, id }))
        .filter(message => message && !message.is_system)
        .slice(-depth);
    const rows = [];
    let used = 0;
    const cap = 3500;
    for (const message of candidates) {
        const text = cleanForegroundHistoryText(message.mes).slice(0, 1400);
        if (!text) continue;
        const row = '[' + (message.is_user ? 'USER' : 'ASSISTANT') + ' #' + message.id + '] ' + text;
        if (used + row.length > cap) {
            const remaining = cap - used;
            if (remaining > 160) rows.push(row.slice(0, remaining));
            break;
        }
        rows.push(row);
        used += row.length + 1;
    }
    return rows.join('\n');
}

function latestForegroundUserText(chat = []) {
    const source = Array.isArray(chat) ? chat : [];
    for (let i = source.length - 1; i >= 0; i -= 1) {
        const message = source[i];
        if (!message || message.is_system) continue;
        return message.is_user ? cleanForegroundHistoryText(message.mes).slice(0, 12000) : '';
    }
    return '';
}

function updateInjection() {
    const ctx = getContext();
    const settings = getSettings();
    const key = getChatKey();
    const state = key === 'no-chat' ? null : engine.getInjectionState(key);
    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));
    const foregroundNewNpcHistory = buildForegroundNewNpcHistory(ctx.chat || [], settings);
    const foregroundCurrentUserText = latestForegroundUserText(ctx.chat || []);
    const recoveryPending = ['running', 'paused', 'failed', 'stale'].includes(String(state?.recovery?.status || ''));
    const prompt = state && !recoveryPending ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory, foregroundCurrentUserText }) : '';
    ctx.setExtensionPrompt?.(
        PROMPT_KEY,
        prompt,
        extension_prompt_types.IN_CHAT,
        settings.injectDepth,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

const engine = createNpcStateEngine({
    getContext,
    getChatKey,
    getSettings,
    getPointer: getV3Pointer,
    setPointer: setV3Pointer,
    deletePointer: deleteV3Pointer,
    getStablePointer: chatKey => extension_settings?.npc_state?.v3?.dataFiles?.[chatKey] || null,
    persistSettings,
    getHeaders: () => getRequestHeaders(),
    fetchFn: (...args) => globalThis.fetch(...args),
    generate: generateJson,
    resolveGenerationRoute: resolveNpcScanRoute,
    notify,
    stateChangeSnapshot: false,
    onStateChanged: () => {
        updateInjection();
        ui?.refresh();
        staleUi?.refresh();
        bundleUi?.refresh();
        portraitUi?.refresh();
    },
});

ui = createNpcStateUi({
    engine,
    getContext,
    getChatKey,
    getSettings,
    persistSettings,
    getScanConnectionProfiles: npcScanProfileOptions,
    getCompletenessStatus: currentCompletenessStatus,
    onSettingsChanged: updateInjection,
});

completionCoordinator = createCompletenessCoordinator({
    getSource: sourceForCompletedResponse,
    getSettings,
    runEmbedded: processEmbeddedScan,
    runCompleteness: (messageId, options) => engine.completenessScan(messageId, options),
    readRecord: source => activeCompletionMeta(source.message),
    writeRecord: (source, value) => {
        if (sourceForCompletedResponse(source.messageId).identity === source.identity) storeCompletionMeta(source.ctx, source.messageId, value);
    },
    setStatus: setCompletenessStatus,
    invalidateCompleteness: chatKey => engine.invalidateCompleteness(chatKey),
    logError: error => console.error('[NPC State Beta] automatic completeness scan failed safely', error),
});

staleUi = createStaleManagementUi({
    engine,
    ui,
    getSettings,
    persistSettings,
});

bundleUi = createBundleManagementUi({
    engine,
    ui,
});

portraitUi = createPortraitPromptUi({
    engine,
    getSettings,
    persistSettings,
});

const meguminBlockIntegration = createMeguminBlockIntegration({
    renderInline: () => ui?.renderInline(),
});

function refreshSurfaces() {
    updateInjection();
    ui.refresh();
    staleUi.refresh();
    bundleUi.refresh();
    portraitUi.refresh();
}

async function hydrateActiveChat({ reconcile = true } = {}) {
    const identity = getChatIdentity(getContext());
    const key = identity.key;
    if (identity.pending || key === 'no-chat') {
        activeChatKey = key;
        refreshSurfaces();
        return null;
    }
    activeChatKey = key;
    try {
        const state = await engine.loadChat(key);
        if (getChatKey() !== key) return null;
        const recoveryPending = ['running', 'paused', 'failed', 'stale'].includes(String(state?.recovery?.status || ''));
        if (reconcile && !recoveryPending) {
            const branch = await engine.reconcileBranch({ rescan: false });
            if (branch?.unsafeDivergence) notify('warning', 'timeline rebase required. Durable dossiers are intact; accept the current surviving timeline from NPC State settings or return to the original baseline branch.');
        }
        if (getChatKey() !== key) return null;
        refreshSurfaces();
        return state;
    } catch (error) {
        console.error('[NPC State Beta] hydration failed safely', error);
        notify('error', `could not load this dossier. Existing sidecar data was not overwritten. ${error?.message || error}`);
        refreshSurfaces();
        return null;
    }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function completedResponseIdentity(chatKey, messageId, message = {}, chat = [message]) {
    const control = consumeNpcStateControl(message.mes);
    // Removal of a malformed/partial transport tag must not change completion identity
    // between the host's duplicate completion events. Narrative ownership stays strict.
    const identityChat = chat.slice(0, messageId + 1);
    identityChat[messageId] = control.found ? { ...message, mes: control.cleanedText } : message;
    const source = captureSourceIdentity(chatKey, identityChat, messageId);
    const transportHash = control.found ? captureTransportHash(control.raw) : (activeSwipeMetadata(message).meta?.transportHash || '');
    return [chatKey, messageId, source.swipeId, source.fingerprint, source.history.length, source.history.hash, transportHash].join('|');
}

function activeCompletionMeta(message) {
    if (!message) return null;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId] : null;
    if (Array.isArray(message.swipe_info)) return swipe?.extra?.npc_state_beta_completion_v1 || null;
    return message.extra?.npc_state_beta_completion_v1 || null;
}

// message.extra bookkeeping must not rebuild peer-rendered message DOM.
function persistMessageMetadata(ctx) {
    try {
        const save = ctx?.saveChat?.();
        if (save?.catch) save.catch(() => {});
    } catch {}
}

function storeCompletionMeta(ctx, messageId, value) {
    const message = ctx?.chat?.[messageId];
    if (!message) return;
    const meta = { version: 1, ...structuredClone(value), at: Date.now() };
    message.extra ??= {};
    message.extra.npc_state_beta_completion_v1 = meta;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_completion_v1 = structuredClone(meta); }
    persistMessageMetadata(ctx);
}

function persistMessageMutation(ctx, messageId) {
    const message = ctx.chat?.[messageId];
    const owner = captureSourceIdentity(getChatIdentity(ctx).key, ctx.chat || [], messageId);
    setTimeout(() => {
        if (getContext().chat?.[messageId] !== message || !captureSourceMatches(owner, getChatKey(), getContext().chat || [], messageId)) return;
        try { ctx.updateMessageBlock?.(messageId, message); } catch {}
    }, 0);
    try { const save = ctx.saveChat?.(); if (save?.catch) save.catch(() => {}); } catch {}
}

function stripNpcTransportOnly(messageId, capture = null) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;
    if (capture && (!captureSourceMatches(capture.source, getChatKey(), ctx.chat, id)
        || activeSwipeMetadata(message).meta?.captureId !== capture.captureId)) return false;
    const consumed = consumeNpcStateControl(message.mes);
    if (!consumed.found || (capture && captureTransportHash(consumed.raw) !== capture.transportHash)) return false;
    message.mes = consumed.cleanedText;
    persistMessageMutation(ctx, id);
    return true;
}

function scheduleTransportHygiene(messageId, capture) {
    for (const delay of [50, 250]) setTimeout(() => stripNpcTransportOnly(messageId, capture), delay);
}

function invalidateEmbeddedMeta(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;
    if (message.extra) {
        delete message.extra.npc_state_beta_v1;
        delete message.extra.npc_state_beta_completion_v1;
    }
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe?.extra) {
        delete swipe.extra.npc_state_beta_v1;
        delete swipe.extra.npc_state_beta_completion_v1;
    }
    persistMessageMutation(ctx, id);
    return true;
}

async function runSeparateRecoveryScan(messageId, reason = 'recovery', capture = null) {
    const settings = getSettings();
    const id = Number(messageId);
    if (!Number.isInteger(id) || id < 0) return { ok: false, reason: 'no-assistant-message' };
    if (settings.enabled === false || settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };
    try {
        const result = await engine.scan(id, { manual: false, force: true, captureId: capture?.captureId || '', expectedSource: capture?.source || null });
        // A successful commit already refreshed via engine.onStateChanged. Only a stale discarded run needs a local surface catch-up.
        if (result?.discarded) refreshSurfaces();
        if (!result?.ok && !result?.discarded) console.warn('[NPC State Beta] Separate recovery scan did not commit:', reason, result?.reason);
        return result?.ok ? { ...result, coverage: 'full-recovery' } : { ...result, coverage: 'failure' };
    } catch (error) {
        console.error('[NPC State Beta] separate recovery scan failed safely', reason, error);
        notify('error', 'recovery scanner failed without committing partial state. ' + (error?.message || error));
        return { ok: false, reason: 'recovery-scan-failed', coverage: 'failure', error };
    }
}

async function maybeForegroundFallback(messageId, reason, capture = null) {
    if (getSettings().fallbackScan !== true) return { ok: false, reason, coverage: 'failure' };
    console.warn('[NPC State Beta] Embedded capture failed; invoking separate recovery scanner:', reason);
    return runSeparateRecoveryScan(messageId, 'foreground-' + reason, capture);
}

// only newly generated embedded payloads require the lifecycle channel.
export async function processEmbeddedScan(messageId, { expectedFingerprint = '', expectedSwipeId = null, expectedSource = null } = {}) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };
    const activeSwipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    if ((expectedSource && !captureSourceMatches(expectedSource, getChatKey(), ctx.chat, id))
        || (expectedFingerprint && fingerprintMessage(message) !== expectedFingerprint)
        || (Number.isInteger(expectedSwipeId) && expectedSwipeId !== activeSwipeId)) {
        return { ok: false, discarded: true, reason: 'stale-operation', coverage: 'failure' };
    }
    const settings = getSettings();
    if (settings.enabled === false || settings.autoScan === false) {
        stripNpcTransportOnly(id);
        return { ok: false, reason: 'auto-disabled', coverage: 'skipped' };
    }
    const consumed = consumeNpcStateControl(message.mes, { requireLifeStateUpdates: true });
    if (!consumed.found) {
        consumed.errors = ['NPC State missing-block: response omitted the required <npc_state_v1> block.'];
        consumed.errorCodes = ['missing-block'];
    }

    message.mes = consumed.cleanedText;
    const capture = storeCapturedPayload({ chatKey: getChatKey(), chat: ctx.chat, messageId: id, consumed });
    persistMessageMutation(ctx, id);
    scheduleTransportHygiene(id, capture);

    if (consumed.errors.length || !consumed.parsed) {
        console.warn('[NPC State Beta] Foreground NPC payload rejected.', consumed.errors);
        const fallback = await maybeForegroundFallback(id, consumed.found ? 'invalid-control' : 'missing-control', capture);
        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan discarded: ' + consumed.errors.slice(0, 2).join('; ').slice(0, 480) + ' State was left unchanged. Details: NPCState.captureDiagnostics().');
        return { ...fallback, errors: consumed.errors, errorCodes: consumed.errorCodes };
    }

    try {
        const result = await engine.applyEmbeddedScan(id, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: activeSwipeId, captureId: capture.captureId, captureSource: capture.source });
        // Ordinary commits already refreshed via persistence. Skips have no persistence callback.
        if (result?.ok && result?.skipped) refreshSurfaces();
        return { ...result, coverage: result?.ok && !result?.skipped ? 'embedded' : 'embedded-skipped' };
    } catch (error) {
        console.error('[NPC State Beta] embedded scan failed safely', error);
        notify('error', 'embedded scan failed without committing partial state. ' + (error?.message || error));
        return { ok: false, reason: 'apply-failed', coverage: 'failure', error };
    }
}

function sourceForCompletedResponse(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { valid: false, reason: 'not-assistant-message' };
    const chatKey = getChatKey();
    return {
        valid: true, ctx, chatKey, messageId: id, message,
        identity: completedResponseIdentity(chatKey, id, message, ctx.chat),
        expectedSource: captureSourceIdentity(chatKey, ctx.chat, id),
        expectedFingerprint: fingerprintMessage(message),
        expectedSwipeId: Number.isInteger(message.swipe_id) ? message.swipe_id : 0,
    };
}

export function processCompletedAssistantResponse(messageId) {
    return completionCoordinator.process(messageId);
}

async function settledBranchReconcile({ reason = 'branch-change' } = {}) {
    const key = getChatKey();
    if (!key || key === 'no-chat') return;
    engine.invalidate(key);
    try {
        await sleep(90);
        if (getChatKey() !== key) return;
        const result = await engine.reconcileBranch({ rescan: false });
        if (result?.unsafeDivergence || result?.needsRecovery || !result?.ok) {
            const detail = result?.state?.branchSafety?.reason || result?.branchSafety?.reason || result?.reason || 'Timeline recovery is required.';
            notify('warning', detail);
        }
        refreshSurfaces();
    } catch (error) {
        console.error('[NPC State Beta] branch reconciliation failed safely', reason, error);
        notify('error', 'branch reconciliation failed without claiming a current timeline. ' + (error?.message || error));
        refreshSurfaces();
    }
}

function runBoundedLifecycleEvent(label, task, timeoutMs = 8000) {
    let timer = null;
    const work = Promise.resolve().then(task).catch(error => {
        console.error('[NPC State Beta] ' + label + ' failed safely', error);
        notify('error', label + ' failed safely; beta sidecar pointers were not guessed or partially replaced. ' + (error?.message || error));
        return { ok: false, reason: 'lifecycle-error', error };
    });
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve({ ok: false, reason: 'lifecycle-timeout' }), timeoutMs);
    });
    return Promise.race([work, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

async function handleChatRenameLifecycle(eventData = {}) {
    const settings = getSettings();
    const resolved = resolveRenameLifecycleKeys(settings.dataFiles, eventData);
    if (!resolved) {
        console.info('[NPC State Beta] Ignoring chat rename without unique owner-qualified beta source.', eventData);
        return { ok: false, reason: 'unresolved-owner' };
    }
    if (settings.dataFiles?.[resolved.newKey]?.path) {
        console.warn('[NPC State Beta] Refusing chat rename because destination already owns a beta sidecar.', resolved);
        return { ok: false, reason: 'destination-exists' };
    }
    const result = await engine.renameChatKey(resolved.oldKey, resolved.newKey);
    if (result?.ok && activeChatKey === resolved.oldKey) activeChatKey = resolved.newKey;
    refreshSurfaces();
    return result;
}

async function handleChatDeleteLifecycle(chatId, kind = 'chat') {
    const key = resolveLifecycleChatKey(getSettings().dataFiles, { kind, ownerId: '', chatId });
    if (!key) {
        console.info('[NPC State Beta] Ignoring chat deletion without a unique owner-qualified beta source.', { kind, chatId });
        return { ok: false, reason: 'unresolved-owner' };
    }
    const result = await engine.deleteChatKey(key);
    if (result?.ok && activeChatKey === key) activeChatKey = 'no-chat';
    refreshSurfaces();
    return result;
}

async function handleCharacterRenameLifecycle(oldAvatar, newAvatar) {
    const pairs = characterOwnerRenamePairs(getSettings().dataFiles, oldAvatar, newAvatar);
    if (!pairs.length) return { ok: true, moved: 0, failures: [] };
    const failures = [];
    let moved = 0;
    for (const pair of pairs) {
        try {
            const result = await engine.renameChatKey(pair.oldKey, pair.newKey);
            if (result?.ok) {
                moved += 1;
                if (activeChatKey === pair.oldKey) activeChatKey = pair.newKey;
            } else failures.push({ oldKey: pair.oldKey, newKey: pair.newKey, reason: result?.reason || 'rename-rejected' });
        } catch (error) {
            failures.push({ oldKey: pair.oldKey, newKey: pair.newKey, reason: error?.code || error?.message || 'rename-failed' });
        }
    }
    refreshSurfaces();
    if (failures.length) console.warn('[NPC State Beta] Character-owner rename migrated the safe chats and preserved failed sources for retry.', failures);
    return { ok: failures.length === 0, moved, failures };
}

async function handleCharacterDeleteLifecycle(eventData = {}) {
    const avatar = String(eventData?.character?.avatar || eventData?.avatar || (typeof eventData === 'string' ? eventData : '') || '').trim();
    if (!avatar) return { ok: false, reason: 'missing-owner' };
    const keys = qualifiedChatKeysForOwner(getSettings().dataFiles, { kind: 'chat', ownerId: avatar });
    const failures = [];
    let retired = 0;
    for (const key of keys) {
        try {
            const result = await engine.deleteChatKey(key);
            if (result?.ok) {
                retired += 1;
                if (activeChatKey === key) activeChatKey = 'no-chat';
            } else failures.push({ key, reason: result?.reason || 'delete-rejected' });
        } catch (error) {
            failures.push({ key, reason: error?.code || error?.message || 'delete-failed' });
        }
    }
    refreshSurfaces();
    if (failures.length) console.warn('[NPC State Beta] Character deletion retired the safe chats and preserved failed sources for retry.', failures);
    return { ok: failures.length === 0, retired, failures };
}

function registerEvents() {
    if (eventsRegistered) return;
    const ctx = getContext();
    const events = ctx.eventTypes || ctx.event_types || {};
    const source = ctx.eventSource;
    if (!source?.on) return;
    eventsRegistered = true;

    if (events.MESSAGE_SENT) source.on(events.MESSAGE_SENT, () => {
        const key = getChatKey();
        if (key && key !== 'no-chat') engine.invalidate(key);
        // MESSAGE_SENT runs after the live user message enters chat. Rebuild the cheap
        // extension prompt now so explicit NPC references affect this response.
        updateInjection();
    });

    if (events.MESSAGE_RECEIVED) source.on(events.MESSAGE_RECEIVED, messageId => {
        // Background bookkeeping must not hold SillyTavern's awaited event bus open.
        // This also lets peer post-response processors finish and release any shared
        // hidden-generation barrier before NPC State reaches generateRaw().
        void processCompletedAssistantResponse(messageId);
    });

    const load = async () => {
        if (activeChatKey && activeChatKey !== 'no-chat') engine.invalidate(activeChatKey);
        await hydrateActiveChat({ reconcile: true });
    };
    if (events.CHAT_LOADED) source.on(events.CHAT_LOADED, load);
    if (events.CHAT_CHANGED) source.on(events.CHAT_CHANGED, load);

    if (events.MESSAGE_EDITED) source.on(events.MESSAGE_EDITED, messageId => {
        invalidateEmbeddedMeta(messageId);
        void settledBranchReconcile({ reason: 'message-edited' });
    });
    if (events.MESSAGE_SWIPED) source.on(events.MESSAGE_SWIPED, messageId => {
        void settledBranchReconcile({ reason: 'message-swiped' });
    });
    if (events.MESSAGE_DELETED) source.on(events.MESSAGE_DELETED, () => {
        void settledBranchReconcile({ reason: 'message-deleted' });
    });
    if (events.MESSAGE_SWIPE_DELETED) source.on(events.MESSAGE_SWIPE_DELETED, messageId => {
        void settledBranchReconcile({ reason: 'swipe-deleted' });
    });

    if (events.CHAT_RENAMED) source.on(events.CHAT_RENAMED, eventData =>
        runBoundedLifecycleEvent('chat rename migration', () => handleChatRenameLifecycle(eventData || {})));
    if (events.CHAT_DELETED) source.on(events.CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'chat')));
    if (events.GROUP_CHAT_DELETED) source.on(events.GROUP_CHAT_DELETED, chatId =>
        runBoundedLifecycleEvent('group chat deletion retirement', () => handleChatDeleteLifecycle(chatId, 'group')));
    // SillyTavern exposes the owner avatar pair on CHARACTER_RENAMED and the deleted
    // character/avatar payload on CHARACTER_DELETED. These events are owner-authoritative,
    // unlike filename-only CHAT_DELETED, so every beta sidecar in that character namespace
    // can be migrated/retired without borrowing the currently open chat as evidence.
    if (events.CHARACTER_RENAMED) source.on(events.CHARACTER_RENAMED, (oldAvatar, newAvatar) =>
        runBoundedLifecycleEvent('character owner rename migration', () => handleCharacterRenameLifecycle(oldAvatar, newAvatar), 20000));
    if (events.CHARACTER_DELETED) source.on(events.CHARACTER_DELETED, data =>
        runBoundedLifecycleEvent('character owner deletion retirement', () => handleCharacterDeleteLifecycle(data), 20000));

    for (const event of [events.CHARACTER_MESSAGE_RENDERED, events.MESSAGE_UPDATED, events.MORE_MESSAGES_LOADED].filter(Boolean)) {
        source.on(event, () => ui.renderInline());
    }
}

async function init() {
    getSettings();
    ui.scheduleMount();
    staleUi.scheduleMount();
    bundleUi.scheduleMount();
    portraitUi.scheduleMount();
    meguminBlockIntegration.start();
    registerEvents();
    await hydrateActiveChat({ reconcile: true });
    if (!initialized) console.log(`[NPC State] v${NPC_STATE_VERSION} clean runtime loaded`);
    initialized = true;
}

async function safeInit() {
    try { await init(); }
    catch (error) { console.error('[NPC State Beta] initialization failed', error); }
}

if (typeof globalThis.$ === 'function') globalThis.$(safeInit);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit, { once: true });
else void safeInit();

try {
    const ctx = getContext();
    const events = ctx.eventTypes || ctx.event_types || {};
    if (ctx.eventSource?.on) {
        if (events.APP_READY) ctx.eventSource.on(events.APP_READY, safeInit);
        if (events.EXTENSION_SETTINGS_LOADED) ctx.eventSource.on(events.EXTENSION_SETTINGS_LOADED, safeInit);
    }
} catch (error) {
    console.debug('[NPC State Beta] lifecycle bootstrap will rely on DOM ready.', error);
}

function npcStateDebugStatus() {
    const chatKey = getChatKey();
    const settings = getSettings();
    const state = chatKey && chatKey !== 'no-chat' ? engine.getState(chatKey) : null;
    const pointer = chatKey && chatKey !== 'no-chat' ? getV3Pointer(chatKey) : null;
    const observation = state?.lastObservation || {};
    return {
        version: NPC_STATE_VERSION,
        chatKey,
        sidecar: pointer ? { name: pointer.name || '', path: pointer.path || '', revision: Number(pointer.revision) || 0, updatedAt: Number(pointer.updatedAt) || 0 } : null,
        hydration: chatKey && chatKey !== 'no-chat' ? engine.hydrationStatus(chatKey) : { status: 'no-chat' },
        busy: chatKey && chatKey !== 'no-chat' ? engine.isBusy(chatKey) : false,
        branchSafety: state?.branchSafety ? structuredClone(state.branchSafety) : null,
        checkpointCount: Array.isArray(state?.checkpoints) ? state.checkpoints.length : 0,
        checkpointBytes: state ? checkpointStorageBytes(state) : 0,
        npcCount: Array.isArray(state?.npcs) ? state.npcs.length : 0,
        inChatNpcIds: [...(observation.finalPresentNpcIds || [])],
        exchangeActiveNpcIds: [...(observation.exchangeActiveNpcIds || [])],
        worldActiveNpcIds: [...(observation.worldActiveNpcIds || [])],
        lastScannedMessageId: state?.lastScannedMessageId ?? null,
        recovery: state?.recovery ? structuredClone(state.recovery) : null,
        recoveryRunning: engine.isRecoveryRunning(chatKey),
        structuredEvidenceDetected: (getContext().chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes)),
        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),
        scanConnectionProfileId: settings.scanConnectionProfileId || '',
        scanAfterEachResponse: settings.scanAfterEachResponse === true,
        completeness: currentCompletenessStatus(chatKey),
        injection: state ? injectionDiagnostics(state, { ...settings, foregroundCurrentUserText: latestForegroundUserText(getContext().chat || []) }) : null,
        operations: chatKey && chatKey !== 'no-chat' ? engine.operationDiagnosticsSummary(chatKey) : { count: 0, running: 0, latest: null },
    };
}

function npcStateCaptureDiagnostics(messageId = null) {
    const chatKey = getChatKey();
    const chat = getContext().chat || [];
    const operations = chatKey && chatKey !== 'no-chat' ? engine.operationDiagnostics(chatKey, { limit: 64 }) : [];
    return inspectCapturedPayload({ chat, chatKey, messageId, operations });
}

async function copyNpcStateCapturedPayload(messageId = null) {
    const result = npcStateCaptureDiagnostics(messageId);
    if (!result.available || !result.parsedSuccessfully || !result.payload) return { ...result, copied: false };
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') return { ...result, copied: false, copyReason: 'clipboard-unavailable' };
    try {
        await clipboard.writeText(result.payload);
        return { ...result, copied: true };
    } catch (error) {
        return { ...result, copied: false, copyReason: String(error?.message || error).slice(0, 240) };
    }
}

function npcStateScanMetrics() {
    const status = npcStateDebugStatus();
    return {
        npcCount: status.npcCount,
        inChatCount: status.inChatNpcIds.length,
        exchangeActiveCount: status.exchangeActiveNpcIds.length,
        worldActiveCount: status.worldActiveNpcIds.length,
        checkpointCount: status.checkpointCount,
        checkpointBytes: status.checkpointBytes,
        lastScannedMessageId: status.lastScannedMessageId,
        selectedInjectionNpcIds: status.injection?.selectedNpcIds || [],
    };
}

globalThis.NPCState = Object.freeze({
    version: NPC_STATE_VERSION,
    debugStatus: npcStateDebugStatus,
    scanMetrics: npcStateScanMetrics,
    operationDiagnostics: options => engine.operationDiagnostics(getChatKey(), options),
    captureDiagnostics: messageId => npcStateCaptureDiagnostics(messageId),
    copyCapturedPayload: messageId => copyNpcStateCapturedPayload(messageId),
    scanConnectionProfiles: npcScanProfileOptions,
    completenessStatus: () => currentCompletenessStatus(getChatKey()),
    scan: () => {
        const chat = getContext().chat || [];
        let id = -1;
        for (let i = chat.length - 1; i >= 0; i -= 1) if (chat[i] && !chat[i].is_system && !chat[i].is_user) { id = i; break; }
        return id >= 0 ? engine.scan(id, { manual: true, force: true }) : Promise.resolve({ ok: false, reason: 'no-assistant-message' });
    },
    refreshFromChat: reference => engine.refreshDossier(reference),
    importStructuredDossier: reference => engine.importStructuredDossier(reference),
    getState: () => engine.getState(getChatKey()),
    branchSafetyStatus: () => engine.branchSafetyStatus(getChatKey()),
    hydrationStatus: () => engine.hydrationStatus(getChatKey()),
    recoveryStatus: () => engine.recoveryStatus(getChatKey()),
    recoveryRange: options => engine.recoveryRange(options),
    previewRebase: options => engine.previewRebase(options),
    isRecoveryRunning: () => engine.isRecoveryRunning(getChatKey()),
    initializeFresh: options => engine.initializeFresh(options),
    rebuildFromChat: options => engine.startHistoricalRecovery(options),
    resumeRebuild: () => engine.resumeHistoricalRecovery(),
    pauseRebuild: reason => engine.pauseHistoricalRecovery(reason),
    cancelRebuild: () => engine.cancelHistoricalRecovery(),
    isBusy: () => engine.isBusy(getChatKey()),
    addNpc: name => engine.addNpc(name),
    updateNpc: (reference, patch) => engine.updateNpc(reference, patch),
    clearRelationshipCorrection: reference => engine.clearManualRelationshipCorrection(reference),
    archive: reference => engine.archiveNpc(reference, true),
    restore: reference => engine.archiveNpc(reference, false),
    resetStaleness: reference => engine.resetNpcStaleness(reference),
    staleReport: () => engine.getStaleReport(),
    openStaleReview: () => staleUi.openReview(),
    exportBundle: reference => engine.exportBundle(reference),
    previewBundleImport: (bundle, options) => engine.previewBundleImport(bundle, options),
    importBundle: (bundle, options) => engine.importBundle(bundle, options),
    portraitPrompts: reference => portraitUi.buildPairFor(reference),
    portraitPrompt: reference => portraitUi.buildFor(reference),
    copyPortraitPositivePrompt: reference => portraitUi.copyPositiveFor(reference),
    copyPortraitNegativePrompt: reference => portraitUi.copyNegativeFor(reference),
    copyPortraitPrompts: reference => portraitUi.copyBothFor(reference),
    copyPortraitPrompt: reference => portraitUi.copyFor(reference),
    deleteNpc: reference => engine.deleteNpc(reference),
    reconcile: options => engine.reconcileBranch(options),
    openLibrary: reference => ui.openLibrary(reference),
    activeEditorNpcId: () => ui.activeEditorNpcId,
    settings: () => structuredClone(getSettings()),
});

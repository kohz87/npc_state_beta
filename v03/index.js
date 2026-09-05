/* NPC State v0.3.2 - clean runtime */
import { extension_settings, getContext } from '../../../../extensions.js';
import { extension_prompt_types, extension_prompt_roles, getRequestHeaders } from '../../../../../script.js';
import { createBundleManagementUi } from './bundle-ui.js';
import { createNpcStateEngine } from './engine.js';
import { characterOwnerRenamePairs, getChatIdentity, qualifiedChatKeysForOwner, resolveLifecycleChatKey, resolveRenameLifecycleKeys } from './identity.js';
import { buildInjection, injectionDiagnostics } from './injection.js';
import { consumeNpcStateControl } from './foreground.js';
import { hasRecognizedStructuredBlocks, profileEvidenceText } from './evidence-adapter.js';
import { createMeguminBlockIntegration } from './megumin.js';
import {
    DEFAULT_PORTRAIT_NEGATIVE_PROMPT,
    DEFAULT_PORTRAIT_POSITIVE_PROMPT,
    DEFAULT_PORTRAIT_PRESET,
    normalizePortraitPromptSettings,
} from './portrait-prompt.js';
import { createPortraitPromptUi } from './portrait-ui.js';
import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeScannerResponseTokens, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode, normalizeRelationshipCaps } from './schema.js';
import { runSharedQuietGeneration } from './shared-generation-queue.js';
import { checkpointStorageBytes } from './branches.js';
import { createStaleManagementUi } from './stale-ui.js';
import { createNpcStateUi } from './ui.js';

const EXTENSION_NAME = 'npc_state_beta';
const PROMPT_KEY = 'npc_state_v04_beta_foreground';
const SETTINGS_SCHEMA = 1;
let initialized = false;
let eventsRegistered = false;
let activeChatKey = 'no-chat';
let ui = null;
let staleUi = null;
let bundleUi = null;
let portraitUi = null;

const PRE_GATE_RELATIONSHIP_CRITERIA = `Relationship deltas measure only changes caused by the current USER+ASSISTANT exchange.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player.
Desire: attraction or intimate interest. Never infer it from friendliness, gratitude, beauty, proximity, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events should usually change 0-1 points. Meaningful events may change up to 2, major events up to 5, extreme life-defining events up to 10. Zero is correct when evidence is weak or merely repeated from earlier context.`;

const LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421 = `Relationship deltas measure only genuinely NEW changes caused by the current USER+ASSISTANT exchange. Routine continuation, repeated aftermath, greetings, neutral transactions, and already-scored beats are normally zero.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment. Trust is not obedience.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player. Affection is not devotion, clinginess, jealousy, or self-erasure.
Desire: attraction or intimate interest. Positive Desire requires explicit attraction/romantic/intimate/physical evidence. Never infer it from friendliness, gratitude, beauty, rescue, proximity, trust, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events may change up to 1 point on one supported axis. Meaningful events may change up to 2 per supported axis and at most two axes, major up to 5 and at most three axes, extreme up to 10 and at most four axes. Every moved axis needs its own concrete evidence. Raw deltas are evidence weights: deep established relationships gain further depth progressively more slowly, and accepted fractional evidence is retained behind the integer display. Do not replay the same event or its aftermath; semantically duplicate recent events score zero.
RELATIONSHIP MILESTONES: outward depth is gated independently by axis and direction at 25, 50, 75, and 90. Ordinary evidence may reach 25 but cannot deepen past a locked gate. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement back toward neutral is never checkpoint-blocked. Never inflate a tier or delta just to pass a gate.`;

const DEFAULT_RELATIONSHIP_CRITERIA = `The shared relationship-judgment rubric is the default authority. Use this field only for optional campaign-specific calibration; custom criteria are additive and do not replace current-exchange evidence, per-axis meanings, or deterministic score mechanics.`;

const DEFAULT_MEMORY_CRITERIA = `Store only durable NPC memories that can matter in later scenes: consequential promises, betrayals, rescues, injuries, discoveries, relationship-defining exchanges, major gifts/debts, established secrets, lasting changes of circumstance, and other facts the NPC would reasonably remember later. Do not store routine dialogue, transient mood, narration texture, or duplicate paraphrases of an existing memory.`;

const V3_DEFAULTS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA,
    enabled: true,
    autoScan: true,
    scanDepth: 8,
    scannerResponseTokens: 7000,
    inject: true,
    injectDepth: 1,
    injectLimit: 6,
    injectBudgetTokens: 1800,
    branchRescan: true,
    fallbackScan: false,
    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    birthdayFillMode: 'off',
    birthdayRandomCalendar: DEFAULT_BIRTHDAY_RANDOM_CALENDAR,
    birthdayRandomDaysPerMonth: 30,
    staleManagementEnabled: true,
    staleArchiveAfter: 30,
    staleDeleteAfter: 50,
    portraitPromptMode: 'hybrid',
    portraitPreset: DEFAULT_PORTRAIT_PRESET,
    portraitPositivePrompt: DEFAULT_PORTRAIT_POSITIVE_PROMPT,
    portraitNegativePrompt: DEFAULT_PORTRAIT_NEGATIVE_PROMPT,
    dossierLimits: { ...DOSSIER_LIMIT_DEFAULTS },
    relationshipCaps: { ...DEFAULT_RELATIONSHIP_CAPS },
    relationshipCriteria: DEFAULT_RELATIONSHIP_CRITERIA,
    memoryCriteria: DEFAULT_MEMORY_CRITERIA,
    dataFiles: {},
});

function rootSettings() {
    let root = extension_settings[EXTENSION_NAME];
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
        root = {};
        extension_settings[EXTENSION_NAME] = root;
    }
    return root;
}

function getSettings() {
    const root = rootSettings();
    if (!root.v3 || typeof root.v3 !== 'object' || Array.isArray(root.v3)) root.v3 = {};
    const settings = root.v3;
    const legacyPositivePrompt = settings.portraitPositivePrompt === undefined ? settings.portraitGenerationPrompt : undefined;
    for (const [key, value] of Object.entries(V3_DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    if (legacyPositivePrompt !== undefined) settings.portraitPositivePrompt = legacyPositivePrompt;
    const relationshipCriteriaText = String(settings.relationshipCriteria || '').trim();
    if (relationshipCriteriaText === PRE_GATE_RELATIONSHIP_CRITERIA.trim() || relationshipCriteriaText === LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421.trim()) settings.relationshipCriteria = DEFAULT_RELATIONSHIP_CRITERIA;
    settings.schemaVersion = SETTINGS_SCHEMA;
    settings.scannerResponseTokens = normalizeScannerResponseTokens(settings.scannerResponseTokens);
    settings.scanDepth = Math.max(2, Math.min(30, Math.round(Number(settings.scanDepth) || 8)));
    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);
    settings.birthdayRandomCalendar = String(settings.birthdayRandomCalendar ?? DEFAULT_BIRTHDAY_RANDOM_CALENDAR).slice(0, 6000);
    settings.birthdayRandomDaysPerMonth = Math.max(1, Math.min(999, Math.round(Number(settings.birthdayRandomDaysPerMonth) || 30)));
    settings.injectDepth = Math.max(0, Math.min(20, Math.round(Number(settings.injectDepth) || 1)));
    settings.injectLimit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    settings.injectBudgetTokens = Math.max(256, Math.min(8000, Math.round(Number(settings.injectBudgetTokens) || 1800)));
    settings.staleArchiveAfter = Math.max(1, Math.min(9999, Math.round(Number(settings.staleArchiveAfter) || 30)));
    settings.staleDeleteAfter = Math.max(settings.staleArchiveAfter + 1, Math.min(10000, Math.round(Number(settings.staleDeleteAfter) || 50)));
    settings.dossierLimits = normalizeDossierLimits(settings.dossierLimits);
    const portrait = normalizePortraitPromptSettings(settings);
    settings.portraitPromptMode = portrait.portraitPromptMode;
    settings.portraitPreset = structuredClone(portrait.portraitPreset);
    settings.portraitPositivePrompt = portrait.portraitPositivePrompt;
    settings.portraitNegativePrompt = portrait.portraitNegativePrompt;
    delete settings.portraitGenerationPrompt;
    delete settings.portraitPositivePreset;
    delete settings.portraitNegativePreset;
    settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);
    if (!settings.dataFiles || typeof settings.dataFiles !== 'object' || Array.isArray(settings.dataFiles)) settings.dataFiles = {};
    return settings;
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

async function generateJson({ systemPrompt, prompt, responseLength }) {
    const ctx = getContext();
    if (typeof ctx.generateRaw !== 'function') throw new Error('SillyTavern generateRaw() is unavailable.');
    return runSharedQuietGeneration('npc-state-scan', () => ctx.generateRaw({
        systemPrompt,
        prompt,
        quietToLoud: false,
        instructOverride: true,
        responseLength,
    }));
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
    const state = key === 'no-chat' ? null : engine.getState(key);
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
    notify,
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
    onSettingsChanged: updateInjection,
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

function latestAssistantMessageId(chat = []) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (message && !message.is_system && !message.is_user) return i;
    }
    return -1;
}

function activeEmbeddedMeta(message) {
    if (!message) return null;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId] : null;
    if (swipe) return swipe.extra?.npc_state_beta_v1 || null;
    return message.extra?.npc_state_beta_v1 || null;
}

function persistMessageMutation(ctx, messageId) {
    setTimeout(() => { try { ctx.updateMessageBlock?.(messageId, ctx.chat?.[messageId]); } catch {} }, 0);
    try { const save = ctx.saveChat?.(); if (save?.catch) save.catch(() => {}); } catch {}
}

function stripNpcTransportOnly(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;
    const consumed = consumeNpcStateControl(message.mes);
    if (!consumed.found) return false;
    message.mes = consumed.cleanedText;
    persistMessageMutation(ctx, id);
    return true;
}

function scheduleTransportHygiene(messageId) {
    for (const delay of [50, 250]) setTimeout(() => stripNpcTransportOnly(messageId), delay);
}

function storeEmbeddedMeta(ctx, messageId, consumed) {
    const message = ctx?.chat?.[messageId];
    if (!message) return;
    const accepted = consumed.errors.length === 0 && Boolean(consumed.parsed);
    const meta = { version: 1, accepted, payload: accepted ? consumed.raw : null, errors: accepted ? [] : [...consumed.errors], at: Date.now() };
    message.extra ??= {};
    message.extra.npc_state_beta_v1 = meta;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_v1 = structuredClone(meta); }
}

function invalidateEmbeddedMeta(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;
    if (message.extra) delete message.extra.npc_state_beta_v1;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe?.extra) delete swipe.extra.npc_state_beta_v1;
    persistMessageMutation(ctx, id);
    return true;
}

async function runSeparateRecoveryScan(messageId, reason = 'recovery') {
    const settings = getSettings();
    const id = Number(messageId);
    if (!Number.isInteger(id) || id < 0) return { ok: false, reason: 'no-assistant-message' };
    if (settings.enabled === false || settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };
    try {
        const result = await engine.scan(id, { manual: false, force: true });
        if (result?.ok || result?.discarded) refreshSurfaces();
        if (!result?.ok && !result?.discarded) console.warn('[NPC State Beta] Separate recovery scan did not commit:', reason, result?.reason);
        return result;
    } catch (error) {
        console.error('[NPC State Beta] separate recovery scan failed safely', reason, error);
        notify('error', 'recovery scanner failed without committing partial state. ' + (error?.message || error));
        return { ok: false, reason: 'recovery-scan-failed', error };
    }
}

async function maybeForegroundFallback(messageId, reason) {
    if (getSettings().fallbackScan !== true) return { ok: false, reason };
    console.warn('[NPC State Beta] Embedded capture failed; invoking separate recovery scanner:', reason);
    return runSeparateRecoveryScan(messageId, 'foreground-' + reason);
}

async function processEmbeddedScan(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };
    const settings = getSettings();
    if (settings.enabled === false || settings.autoScan === false) {
        stripNpcTransportOnly(id);
        return { ok: false, reason: 'auto-disabled' };
    }
    const consumed = consumeNpcStateControl(message.mes);
    if (!consumed.found) {
        console.warn('[NPC State Beta] Foreground response omitted <npc_state_v1>; running one full recovery scan.');
        return runSeparateRecoveryScan(id, 'foreground-missing-control');
    }

    message.mes = consumed.cleanedText;
    storeEmbeddedMeta(ctx, id, consumed);
    persistMessageMutation(ctx, id);
    scheduleTransportHygiene(id);

    if (consumed.errors.length || !consumed.parsed) {
        console.warn('[NPC State Beta] Foreground NPC payload rejected.', consumed.errors);
        const fallback = await maybeForegroundFallback(id, 'invalid-control');
        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan was malformed and discarded. State was left unchanged; use Scan current cast for recovery.');
        return fallback;
    }

    try {
        const result = await engine.applyEmbeddedScan(id, consumed.parsed, { expectedMessageText: consumed.cleanedText });
        if (result?.ok) refreshSurfaces();
        return result;
    } catch (error) {
        console.error('[NPC State Beta] embedded scan failed safely', error);
        notify('error', 'embedded scan failed without committing partial state. ' + (error?.message || error));
        return { ok: false, reason: 'apply-failed', error };
    }
}

async function reapplyStoredEmbeddedPayload(messageId) {
    const ctx = getContext();
    const id = Number(messageId);
    const message = ctx?.chat?.[id];
    const meta = activeEmbeddedMeta(message);
    if (!meta?.accepted || !meta.payload) return { ok: false, reason: 'no-stored-payload' };
    const consumed = consumeNpcStateControl(meta.payload);
    if (consumed.errors.length || !consumed.parsed) return { ok: false, reason: 'stored-payload-invalid' };
    const result = await engine.applyEmbeddedScan(id, consumed.parsed);
    if (result?.ok) refreshSurfaces();
    return result;
}

async function settledBranchReconcile({ reason = 'branch-change', messageId = null, preferStoredPayload = false } = {}) {
    const key = getChatKey();
    if (!key || key === 'no-chat') return;
    engine.invalidate(key);
    try {
        await sleep(90);
        if (getChatKey() !== key) return;
        const recovery = engine.getState(key)?.recovery;
        if (['running', 'paused', 'failed', 'stale'].includes(String(recovery?.status || ''))) {
            if (recovery?.status === 'running') await engine.pauseHistoricalRecovery('Chat history changed while recovery was running. Resume will validate completed history and replan only the unprocessed suffix when safe.');
            refreshSurfaces();
            return;
        }
        const result = await engine.reconcileBranch({ rescan: false });
        if (result?.unsafeDivergence) {
            notify('warning', 'timeline rebase required. Durable dossiers are intact; open NPC State settings and choose Rebase to current chat to accept the surviving timeline.');
            refreshSurfaces();
            return;
        }
        if (!result?.changed) { refreshSurfaces(); return; }

        const ctx = getContext();
        const requestedId = Number(messageId);
        const activeId = Number.isInteger(requestedId) && requestedId >= 0 ? requestedId : latestAssistantMessageId(ctx.chat || []);
        const checkpointAlreadyContainsTarget = Number.isInteger(activeId)
            && result?.checkpoint?.messageId === activeId
            && result?.checkpoint?.isBranchBase !== true
            && result?.checkpoint?.reason !== 'v3-baseline';

        if (!checkpointAlreadyContainsTarget && preferStoredPayload && activeId >= 0) {
            const replay = await reapplyStoredEmbeddedPayload(activeId);
            if (replay?.ok) return;
        }

        if (!checkpointAlreadyContainsTarget && getSettings().branchRescan !== false) {
            const scanId = latestAssistantMessageId(ctx.chat || []);
            if (scanId >= 0) await runSeparateRecoveryScan(scanId, reason);
        }
        refreshSurfaces();
    } catch (error) {
        console.error('[NPC State Beta] branch reconciliation failed safely', error);
        notify('error', 'branch reconciliation failed without committing partial state. ' + (error?.message || error));
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
    });

    if (events.MESSAGE_RECEIVED) source.on(events.MESSAGE_RECEIVED, messageId => {
        // Background bookkeeping must not hold SillyTavern's awaited event bus open.
        // This also lets peer post-response processors finish and release any shared
        // hidden-generation barrier before NPC State reaches generateRaw().
        void processEmbeddedScan(messageId);
    });

    const load = async () => {
        if (activeChatKey && activeChatKey !== 'no-chat') engine.invalidate(activeChatKey);
        await hydrateActiveChat({ reconcile: true });
    };
    if (events.CHAT_LOADED) source.on(events.CHAT_LOADED, load);
    if (events.CHAT_CHANGED) source.on(events.CHAT_CHANGED, load);

    if (events.MESSAGE_EDITED) source.on(events.MESSAGE_EDITED, messageId => {
        invalidateEmbeddedMeta(messageId);
        void settledBranchReconcile({ reason: 'message-edited', messageId, preferStoredPayload: false });
    });
    if (events.MESSAGE_SWIPED) source.on(events.MESSAGE_SWIPED, messageId => {
        void settledBranchReconcile({ reason: 'message-swiped', messageId, preferStoredPayload: true });
    });
    if (events.MESSAGE_DELETED) source.on(events.MESSAGE_DELETED, () => {
        void settledBranchReconcile({ reason: 'message-deleted' });
    });
    if (events.MESSAGE_SWIPE_DELETED) source.on(events.MESSAGE_SWIPE_DELETED, messageId => {
        void settledBranchReconcile({ reason: 'swipe-deleted', messageId, preferStoredPayload: true });
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
        injection: state ? injectionDiagnostics(state, { ...settings, foregroundCurrentUserText: latestForegroundUserText(getContext().chat || []) }) : null,
    };
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
    scan: () => {
        const chat = getContext().chat || [];
        let id = -1;
        for (let i = chat.length - 1; i >= 0; i -= 1) if (chat[i] && !chat[i].is_system && !chat[i].is_user) { id = i; break; }
        return id >= 0 ? engine.scan(id, { manual: true, force: true }) : Promise.resolve({ ok: false, reason: 'no-assistant-message' });
    },
    refreshFromChat: reference => engine.refreshDossier(reference),
    importStructuredDossier: reference => engine.importStructuredDossier(reference),
    getState: () => engine.getState(getChatKey()),
    hydrationStatus: () => engine.hydrationStatus(getChatKey()),
    recoveryStatus: () => engine.recoveryStatus(getChatKey()),
    recoveryRange: () => engine.recoveryRange(),
    isRecoveryRunning: () => engine.isRecoveryRunning(getChatKey()),
    initializeFresh: options => engine.initializeFresh(options),
    rebuildFromChat: options => engine.startHistoricalRecovery(options),
    resumeRebuild: () => engine.resumeHistoricalRecovery(),
    pauseRebuild: reason => engine.pauseHistoricalRecovery(reason),
    cancelRebuild: () => engine.cancelHistoricalRecovery(),
    isBusy: () => engine.isBusy(getChatKey()),
    addNpc: name => engine.addNpc(name),
    updateNpc: (reference, patch) => engine.updateNpc(reference, patch),
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

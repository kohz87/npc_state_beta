import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.28 recovery marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Schema: persist bounded recovery orchestration state, but never copy it into
// rollback checkpoints.
// ---------------------------------------------------------------------------
let schema = read('v03/schema.js');

if (!schema.includes('RECOVERY_RELATIONSHIP_MODES')) {
    schema = replaceRequired(
        schema,
        `export const NPC_ADMISSION_MODES = Object.freeze(['balanced', 'named_preferred', 'manual']);`,
        `export const RECOVERY_RELATIONSHIP_MODES = Object.freeze(['fresh', 're-evaluate']);
export const RECOVERY_STATUSES = Object.freeze(['running', 'paused', 'failed', 'cancelled', 'complete', 'stale']);
export function normalizeRecoveryRelationshipMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return RECOVERY_RELATIONSHIP_MODES.includes(mode) ? mode : 'fresh';
}
function recoveryText(value, max = 1000) {
    return String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
}
export function normalizeRecoveryState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const statusRaw = String(value.status || '').trim().toLocaleLowerCase();
    const status = RECOVERY_STATUSES.includes(statusRaw) ? statusRaw : 'paused';
    const messageIds = Array.isArray(value.messageIds)
        ? value.messageIds.filter(Number.isInteger).filter(id => id >= 0).slice(0, 20000)
        : [];
    const plannedLineage = Array.isArray(value.plannedLineage)
        ? value.plannedLineage.map(item => String(item || '')).filter(Boolean).slice(0, 40000)
        : [];
    const total = Math.max(0, Math.trunc(Number(value.total) || messageIds.length));
    const completed = Math.max(0, Math.min(total, Math.trunc(Number(value.completed) || 0)));
    return {
        version: 1,
        status,
        relationshipMode: normalizeRecoveryRelationshipMode(value.relationshipMode),
        startMessageId: Number.isInteger(value.startMessageId) ? Math.max(0, value.startMessageId) : null,
        endMessageId: Number.isInteger(value.endMessageId) ? value.endMessageId : null,
        messageIds,
        plannedLineage,
        completed,
        total,
        lastCompletedMessageId: Number.isInteger(value.lastCompletedMessageId) ? value.lastCompletedMessageId : null,
        nextMessageId: Number.isInteger(value.nextMessageId) ? value.nextMessageId : null,
        reason: recoveryText(value.reason, 500),
        error: recoveryText(value.error, 1200),
        startedAt: Number(value.startedAt) || Date.now(),
        updatedAt: Number(value.updatedAt) || Date.now(),
        completedAt: Number(value.completedAt) || null,
    };
}

export const NPC_ADMISSION_MODES = Object.freeze(['balanced', 'named_preferred', 'manual']);`,
        'recovery schema constants',
    );
}

schema = replaceRequired(
    schema,
    `        migration: null,
        createdAt: Date.now(),`,
    `        migration: null,
        recovery: null,
        createdAt: Date.now(),`,
    'empty-state recovery slot',
);

schema = replaceRequired(
    schema,
    `        migration: input.migration && typeof input.migration === 'object' ? structuredClone(input.migration) : null,
        createdAt: Number(input.createdAt) || Date.now(),`,
    `        migration: input.migration && typeof input.migration === 'object' ? structuredClone(input.migration) : null,
        recovery: normalizeRecoveryState(input.recovery),
        createdAt: Number(input.createdAt) || Date.now(),`,
    'normalized recovery state',
);

schema = replaceRequired(
    schema,
    `    copy.checkpoints = [];
    copy.branchBase = null;`,
    `    copy.checkpoints = [];
    copy.branchBase = null;
    copy.recovery = null;`,
    'checkpoint recovery exclusion',
);

write('v03/schema.js', schema);

// ---------------------------------------------------------------------------
// Storage: replacement recovery creates a NEW uniquely named sidecar under the
// existing writer lock. It never overwrites a healthy source file and refuses
// to race a newer cross-tab pointer hint.
// ---------------------------------------------------------------------------
let storage = read('v03/storage.js');
if (!storage.includes('export async function createRecoveryV3Sidecar')) {
    storage = replaceRequired(
        storage,
        `\n\nexport async function retireV3Sidecar({ chatKey, pointer, reason = 'retired', redirectChatKey = '', fetchFn = globalThis.fetch, headers = {}, retryDelays = TRANSIENT_WRITE_RETRY_DELAYS }) {`,
        String.raw`

function makeRecoveryV3FileName(chatKey) {
    const base = makeV3FileName(chatKey).replace(/\.json$/i, '');
    return base + '-recovery-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.json';
}

export async function createRecoveryV3Sidecar({
    chatKey,
    state,
    previousPointer = null,
    allowExisting = false,
    fetchFn = globalThis.fetch,
    headers = {},
    retryDelays = TRANSIENT_WRITE_RETRY_DELAYS,
}) {
    if (typeof fetchFn !== 'function') throw new Error('fetch() is unavailable for NPC State recovery persistence.');
    return withWriterLock(chatKey, async () => {
        const previousPath = String(previousPointer?.path || '');
        const hint = readV3PointerHint(chatKey);
        if (hint?.path && hint.path !== previousPath) {
            const hinted = await readV3Sidecar({ chatKey, pointer: hint, fetchFn });
            if (hinted && !hinted.retired) {
                throw conflict('NPC State recovery found a newer sidecar pointer from another tab. Reload before replacing anything.', previousPointer?.revision ?? null, hint.revision ?? hinted.revision ?? null);
            }
        }

        if (previousPath) {
            const remote = await readV3Sidecar({ chatKey, pointer: previousPointer, fetchFn });
            if (remote?.retired) {
                const error = new Error('NPC State recovery source is retired. Reload the renamed/deleted chat rather than replacing it.');
                error.code = 'NPC_STATE_V04_BETA_RETIRED_SIDECAR';
                error.redirectChatKey = remote.redirectChatKey || '';
                throw error;
            }
            if (remote) {
                const expected = previousPointer?.revision == null ? null : Math.max(0, Math.trunc(Number(previousPointer.revision) || 0));
                if (!allowExisting) {
                    const error = new Error('NPC State sidecar still exists. Explicit healthy-state rebuild confirmation is required before replacing this chat pointer.');
                    error.code = 'NPC_STATE_V04_BETA_RECOVERY_SOURCE_EXISTS';
                    throw error;
                }
                if (expected === null || Number(remote.revision || 0) !== expected) {
                    throw conflict('NPC State recovery source changed before replacement. Reload and retry from the newest revision.', expected, remote.revision || 0);
                }
            }
        }

        const revision = 1;
        const normalized = normalizeState(state, chatKey);
        normalized.revision = revision;
        normalized.updatedAt = Date.now();
        const name = makeRecoveryV3FileName(chatKey);
        const json = encodeV3Payload(chatKey, normalized, revision);
        const response = await fetchPersistenceMutation(fetchFn, '/api/files/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({ name, data: toBase64(json) }),
        }, { label: 'NPC State recovery sidecar creation', retryDelays });
        if (!response?.ok) throw new Error('NPC State recovery sidecar creation failed with HTTP ' + (response?.status || 'error') + '.');
        const result = await response.json();
        if (!result?.path) throw new Error('NPC State recovery sidecar upload returned no path.');
        const pointer = { name, path: result.path, revision, updatedAt: Date.now() };
        writeV3PointerHint(chatKey, pointer);
        return { state: normalized, pointer, previousPointer: previousPointer ? structuredClone(previousPointer) : null };
    });
}

export async function retireV3Sidecar({ chatKey, pointer, reason = 'retired', redirectChatKey = '', fetchFn = globalThis.fetch, headers = {}, retryDelays = TRANSIENT_WRITE_RETRY_DELAYS }) {`,
        'recovery sidecar creation',
    );
}
write('v03/storage.js', storage);

// ---------------------------------------------------------------------------
// Engine orchestration.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    `    normalizeScannerResponseTokens,
    normalizeNpc,`,
    `    normalizeScannerResponseTokens,
    normalizeRecoveryRelationshipMode,
    normalizeNpc,`,
    'engine recovery relationship mode import',
);
engine = replaceRequired(
    engine,
    `import { clearV3PointerHint, deleteV3SidecarFile, readV3PointerHint, readV3Sidecar, retireV3Sidecar, writeV3Sidecar } from './storage.js';`,
    `import { clearV3PointerHint, createRecoveryV3Sidecar, deleteV3SidecarFile, readV3PointerHint, readV3Sidecar, retireV3Sidecar, writeV3Sidecar } from './storage.js';`,
    'engine recovery storage import',
);

if (!engine.includes('const RECOVERY_ACTIVE_STATUSES')) {
    engine = replaceRequired(
        engine,
        `function lifecycleNotice(result) {
    const parts = [];
    if (result?.archivedIds?.length) parts.push(\`archived \${result.archivedIds.length} stale dossier\${result.archivedIds.length === 1 ? '' : 's'}\`);
    if (result?.restoredIds?.length) parts.push(\`restored \${result.restoredIds.length} narratively active dossier\${result.restoredIds.length === 1 ? '' : 's'}\`);
    if (result?.deletedIds?.length) parts.push(\`removed \${result.deletedIds.length} stale archive\${result.deletedIds.length === 1 ? '' : 's'}\`);
    return parts.join(', ');
}
`,
        `function lifecycleNotice(result) {
    const parts = [];
    if (result?.archivedIds?.length) parts.push(\`archived \${result.archivedIds.length} stale dossier\${result.archivedIds.length === 1 ? '' : 's'}\`);
    if (result?.restoredIds?.length) parts.push(\`restored \${result.restoredIds.length} narratively active dossier\${result.restoredIds.length === 1 ? '' : 's'}\`);
    if (result?.deletedIds?.length) parts.push(\`removed \${result.deletedIds.length} stale archive\${result.deletedIds.length === 1 ? '' : 's'}\`);
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
`,
        'engine recovery helpers',
    );
}

engine = replaceRequired(
    engine,
    `    const operationEpoch = new Map();
    const locks = new Map();`,
    `    const operationEpoch = new Map();
    const locks = new Map();
    const recoverySignals = new Map();
    const recoveryRuns = new Map();`,
    'engine recovery coordination maps',
);

engine = replaceRequired(
    engine,
    `    async function loadChat(chatKey = getChatKey()) {`,
    `    async function installFreshSidecar(chatKey, state, { allowExisting = false } = {}) {
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

    async function loadChat(chatKey = getChatKey()) {`,
    'fresh recovery persistence path',
);

engine = replaceRequired(
    engine,
    `                if (!loaded) throw new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement.');`,
    `                if (!loaded) {
                    const error = new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement without explicit recovery.');
                    error.code = 'NPC_STATE_V04_BETA_MISSING_SIDECAR';
                    error.pointer = structuredClone(pointer);
                    throw error;
                }`,
    'missing sidecar error code',
);

engine = replaceRequired(
    engine,
    `            const normalized = normalizeState(state, chatKey);
            const fingerprintUpgraded = Number(normalized.branchFingerprintVersion || 0) < 3;`,
    `            const normalized = normalizeState(state, chatKey);
            const recoveryInterrupted = normalized.recovery?.status === 'running';
            if (recoveryInterrupted) {
                normalized.recovery.status = 'paused';
                normalized.recovery.reason = 'Recovery was interrupted by reload and can be resumed from the last committed exchange.';
                normalized.recovery.error = '';
                normalized.recovery.updatedAt = Date.now();
            }
            const fingerprintUpgraded = Number(normalized.branchFingerprintVersion || 0) < 3;`,
    'interrupted recovery normalization',
);

engine = replaceRequired(
    engine,
    `            state = ensureBranchBase(normalized, getContext().chat || []);
            if (importedStable || fingerprintUpgraded) {
                state = await persist(chatKey, state);`,
    `            state = recoveryBlocksLiveScan(normalized) ? normalized : ensureBranchBase(normalized, getContext().chat || []);
            if (importedStable || fingerprintUpgraded || recoveryInterrupted) {
                state = await persist(chatKey, state);`,
    'recovery-aware hydration',
);

engine = replaceRequired(
    engine,
    `                } else if (fingerprintUpgraded) {
                    notify('info', 'Upgraded branch checkpoint fingerprints for transport-safe, swipe-index-independent rollback. Existing dossiers were preserved; old rollback hashes were reset once.');
                }
            }`,
    `                } else if (fingerprintUpgraded) {
                    notify('info', 'Upgraded branch checkpoint fingerprints for transport-safe, swipe-index-independent rollback. Existing dossiers were preserved; old rollback hashes were reset once.');
                } else if (recoveryInterrupted) {
                    notify('info', 'Historical recovery was interrupted by reload and is paused at the last committed exchange. Resume it from Recovery & Branch Safety.');
                }
            }`,
    'recovery reload notice',
);

// Live scans and ordinary mutations must not interleave with incomplete history.
engine = replaceRequired(
    engine,
    `            const state = await loadChat(chatKey);
            if (!state) return { ok: false, reason: 'no-state' };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };`,
    `            const state = await loadChat(chatKey);
            if (!state) return { ok: false, reason: 'no-state' };
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', messageId, recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };`,
    'manual/automatic scan recovery exclusion',
);

// applyEmbeddedScan has the same load + branch guard text after the first replacement.
const embeddedGuard = `            const state = await loadChat(chatKey);\n            if (!state) return { ok: false, reason: 'no-state' };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };`;
if (engine.includes(embeddedGuard)) {
    engine = engine.replace(
        embeddedGuard,
        `            const state = await loadChat(chatKey);\n            if (!state) return { ok: false, reason: 'no-state' };\n            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', messageId, recovery: structuredClone(state.recovery) };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };`,
    );
}

engine = replaceRequired(
    engine,
    `            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const result = await mutator(state);`,
    `            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const result = await mutator(state);`,
    'manual mutation recovery exclusion',
);

// Targeted/import write paths are separate from mutate().
engine = engine.replaceAll(
    `            const state = await loadChat(chatKey);\n            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };`,
    `            const state = await loadChat(chatKey);\n            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };\n            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };`,
);
engine = replaceRequired(
    engine,
    `            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            const imported = applyNpcStateBundleImport`,
    `            const state = normalizeState(await loadChat(chatKey), chatKey);
            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };
            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };
            const chat = getContext().chat || [];
            const messageId = latestAssistantMessageId(chat);
            const imported = applyNpcStateBundleImport`,
    'bundle import recovery exclusion',
);

const recoveryMethods = String.raw`
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

`;

if (!engine.includes('async function startHistoricalRecovery')) {
    const marker = `    async function reconcileBranch({ rescan = false, rebase = false } = {}) {`;
    if (!engine.includes(marker)) throw new Error('Missing reconcileBranch insertion marker');
    engine = engine.replace(marker, recoveryMethods + marker);
}

engine = replaceRequired(
    engine,
    `        await exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            const chat = getContext().chat || [];`,
    `        await exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) {
                result = { ok: false, reason: 'recovery-active', recovery: structuredClone(state?.recovery) };
                return;
            }
            const chat = getContext().chat || [];`,
    'branch reconciliation recovery exclusion',
);

engine = replaceRequired(
    engine,
    `        importBundle,
        reconcileBranch,`,
    `        importBundle,
        initializeFresh,
        startHistoricalRecovery,
        resumeHistoricalRecovery,
        pauseHistoricalRecovery,
        cancelHistoricalRecovery,
        recoveryRange,
        reconcileBranch,`,
    'engine recovery API exports',
);
engine = replaceRequired(
    engine,
    `        hydrationStatus: chatKey => hydration.get(chatKey || getChatKey()) || { status: cache.has(chatKey || getChatKey()) ? 'ready' : 'unloaded', error: null },
        isBusy: chatKey => locks.has(chatKey || getChatKey()),`,
    `        hydrationStatus: chatKey => hydration.get(chatKey || getChatKey()) || { status: cache.has(chatKey || getChatKey()) ? 'ready' : 'unloaded', error: null },
        recoveryStatus: chatKey => structuredClone(cache.get(chatKey || getChatKey())?.recovery || null),
        isRecoveryRunning: chatKey => recoveryRuns.has(chatKey || getChatKey()),
        isBusy: chatKey => locks.has(chatKey || getChatKey()),`,
    'engine recovery status exports',
);

write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Index: suppress partial-state injection, skip branch reconciliation while a
// recovery owns chronology, expose recovery operations, and pause a running
// rebuild when an edit event arrives.
// ---------------------------------------------------------------------------
let index = read('v03/index.js');
index = replaceRequired(
    index,
    `    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory, foregroundCurrentUserText }) : '';`,
    `    const recoveryPending = ['running', 'paused', 'failed', 'stale'].includes(String(state?.recovery?.status || ''));
    const prompt = state && !recoveryPending ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory, foregroundCurrentUserText }) : '';`,
    'partial recovery injection suppression',
);
index = replaceRequired(
    index,
    `        if (reconcile) {
            const branch = await engine.reconcileBranch({ rescan: false });`,
    `        const recoveryPending = ['running', 'paused', 'failed', 'stale'].includes(String(state?.recovery?.status || ''));
        if (reconcile && !recoveryPending) {
            const branch = await engine.reconcileBranch({ rescan: false });`,
    'recovery-aware hydration branch skip',
);
index = replaceRequired(
    index,
    `        await sleep(90);
        if (getChatKey() !== key) return;
        const result = await engine.reconcileBranch({ rescan: false });`,
    `        await sleep(90);
        if (getChatKey() !== key) return;
        const recovery = engine.getState(key)?.recovery;
        if (['running', 'paused', 'failed', 'stale'].includes(String(recovery?.status || ''))) {
            if (recovery?.status === 'running') await engine.pauseHistoricalRecovery('Chat history changed while recovery was running. Resume will validate completed history and replan only the unprocessed suffix when safe.');
            refreshSurfaces();
            return;
        }
        const result = await engine.reconcileBranch({ rescan: false });`,
    'edit event recovery pause',
);
index = replaceRequired(
    index,
    `        lastScannedMessageId: state?.lastScannedMessageId ?? null,
        structuredEvidenceDetected:`,
    `        lastScannedMessageId: state?.lastScannedMessageId ?? null,
        recovery: state?.recovery ? structuredClone(state.recovery) : null,
        recoveryRunning: engine.isRecoveryRunning(chatKey),
        structuredEvidenceDetected:`,
    'debug recovery status',
);
index = replaceRequired(
    index,
    `    hydrationStatus: () => engine.hydrationStatus(getChatKey()),
    isBusy: () => engine.isBusy(getChatKey()),`,
    `    hydrationStatus: () => engine.hydrationStatus(getChatKey()),
    recoveryStatus: () => engine.recoveryStatus(getChatKey()),
    recoveryRange: () => engine.recoveryRange(),
    isRecoveryRunning: () => engine.isRecoveryRunning(getChatKey()),
    initializeFresh: options => engine.initializeFresh(options),
    rebuildFromChat: options => engine.startHistoricalRecovery(options),
    resumeRebuild: () => engine.resumeHistoricalRecovery(),
    pauseRebuild: reason => engine.pauseHistoricalRecovery(reason),
    cancelRebuild: () => engine.cancelHistoricalRecovery(),
    isBusy: () => engine.isBusy(getChatKey()),`,
    'global recovery API',
);
write('v03/index.js', index);

console.log('Applied NPC State 0.4.28 resumable recovery and chronological rebuild core');

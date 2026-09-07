apply([
('src/completeness-coordinator.js', '2c3aaaaa2930b9a1b5a6d3889643a0ce7fb6dbca', [
(46, 0, r'''                expectedSource: source.expectedSource,
'''),
(80, 0, r'''                expectedSource: source.expectedSource,
'''),
]),
('src/engine.js', 'c3606055db41f7d1c0bee485e29d25c37a4967e1', [
(57, 1, r'''import { captureSourceMatches, createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from './operation-diagnostics.js';
'''),
(381, 0, r'''                ...(extra.captureId ? { captureId: extra.captureId } : {}),
'''),
(395, 0, r'''            application: { status: 'applied' },
'''),
(797, 0, r'''        const ownership = captureOperationOwnership('first-pass', chatKey, getContext().chat || [], messageId);
        const operationId = beginOperationDiagnostics(ownership, '', { captureId: options.captureId });
        const stop = result => {
            operationLog.finish(operationId, {
                status: result.discarded ? 'discarded' : (result.skipped ? 'skipped' : 'rejected'),
                failure: { stage: 'pre-application', reason: result.reason },
            });
            return result;
        };
'''),
(798, 0, r'''          try {
'''),
(799, 3, r'''            if (!operationOwnershipMatches(ownership) || (options.captureSource && !captureSourceMatches(options.captureSource, getChatKey(), getContext().chat || [], messageId))) {
                return stop({ ok: false, discarded: true, reason: 'stale-operation', messageId });
            }
            if (!state) return stop({ ok: false, reason: 'no-state' });
            if (recoveryBlocksLiveScan(state)) return stop({ ok: false, reason: 'recovery-active', messageId, recovery: structuredClone(state.recovery) });
            if (state.branchSafety?.status !== 'safe') return stop({ ok: false, reason: 'branch-unsafe', messageId });
'''),
(805, 1, r'''            if (!message || message.is_system || message.is_user) return stop({ ok: false, reason: 'not-assistant-message' });
'''),
(808, 1, r'''                return stop({ ok: false, discarded: true, reason: 'stale-operation', messageId });
'''),
(813, 1, r'''                    return stop({ ok: false, discarded: true, reason: 'stale-operation', messageId });
'''),
(819, 2, r'''                if (!matches) return stop({ ok: false, reason: 'branch-unreconciled', messageId });
                return stop({ ok: true, skipped: true, reason: 'already-scanned', messageId, embedded: true, state: structuredClone(state) });
'''),
(822, 2, r''''''),
(882, 0, r'''          } catch (error) {
            // commitState already closes persistence failures; finish is a no-op for
            // completed records, while parse/application failures cannot stay running.
            operationLog.finish(operationId, { status: 'failed', failure: { stage: 'application', reason: String(error?.message || error).slice(0, 300) } });
            throw error;
          }
'''),
]),
('src/foreground-context.js', 'b5562182ad0c0670dbf5874e1e16fef2d9cb9db9', [
(198, 1, r'''        .slice(sizes.evidence > 0 ? -sizes.evidence : 0, sizes.evidence > 0 ? undefined : 0)
'''),
]),
('src/index.js', '4f19960ad017ee2896fc5f9be4d7b8df4a2072d3', [
(11, 1, r'''import { inspectCapturedPayload, storeCapturedPayload, captureSourceIdentity, captureSourceMatches, captureTransportHash, activeSwipeMetadata } from './operation-diagnostics.js';
'''),
(201, 1, r'''    writeRecord: (source, value) => {
        if (sourceForCompletedResponse(source.messageId).identity === source.identity) storeCompletionMeta(source.ctx, source.messageId, value);
    },
'''),
(267, 3, r'''export function completedResponseIdentity(chatKey, messageId, message = {}, chat = [message], transportHash = '') {
    const source = captureSourceIdentity(chatKey, chat, messageId);
    return [chatKey, messageId, source.swipeId, fingerprintMessage(message), source.history.length, source.history.hash, transportHash].join('|');
'''),
(276, 1, r'''    if (Array.isArray(message.swipe_info)) return swipe?.extra?.npc_state_beta_completion_v1 || null;
'''),
(301, 1, r'''    const message = ctx.chat?.[messageId];
    const owner = captureSourceIdentity(getChatIdentity(ctx).key, ctx.chat || [], messageId);
    setTimeout(() => {
        if (getContext().chat?.[messageId] !== message || !captureSourceMatches(owner, getChatKey(), getContext().chat || [], messageId)) return;
        try { ctx.updateMessageBlock?.(messageId, message); } catch {}
    }, 0);
'''),
(305, 1, r'''function stripNpcTransportOnly(messageId, capture = null) {
'''),
(310, 0, r'''    if (capture && (!captureSourceMatches(capture.source, getChatKey(), ctx.chat, id)
        || activeSwipeMetadata(message).meta?.captureId !== capture.captureId)) return false;
'''),
(311, 1, r'''    if (!consumed.found || (capture && captureTransportHash(consumed.raw) !== capture.transportHash)) return false;
'''),
(317, 14, r'''function scheduleTransportHygiene(messageId, capture) {
    for (const delay of [50, 250]) setTimeout(() => stripNpcTransportOnly(messageId, capture), delay);
'''),
(377, 1, r'''export async function processEmbeddedScan(messageId, { expectedFingerprint = '', expectedSwipeId = null, expectedSource = null } = {}) {
'''),
(383, 1, r'''    if ((expectedSource && !captureSourceMatches(expectedSource, getChatKey(), ctx.chat, id))
        || (expectedFingerprint && fingerprintMessage(message) !== expectedFingerprint)
'''),
(394, 2, r'''        consumed.errors = ['NPC State missing-block: response omitted the required <npc_state_v1> block.'];
        consumed.errorCodes = ['missing-block'];
'''),
(399, 1, r'''    const capture = storeCapturedPayload({ chatKey: getChatKey(), chat: ctx.chat, messageId: id, consumed });
'''),
(401, 1, r'''    scheduleTransportHygiene(id, capture);
'''),
(405, 3, r'''        const fallback = await maybeForegroundFallback(id, consumed.found ? 'invalid-control' : 'missing-control');
        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan discarded: ' + consumed.errors.slice(0, 2).join('; ').slice(0, 480) + ' State was left unchanged. Details: NPCState.captureDiagnostics().');
        return { ...fallback, errors: consumed.errors, errorCodes: consumed.errorCodes };
'''),
(411, 1, r'''        const result = await engine.applyEmbeddedScan(id, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: activeSwipeId, captureId: capture.captureId, captureSource: capture.source });
'''),
(430, 1, r'''        identity: completedResponseIdentity(chatKey, id, message, ctx.chat, (() => {
            const control = consumeNpcStateControl(message.mes);
            return control.found ? captureTransportHash(control.raw) : (activeSwipeMetadata(message).meta?.transportHash || '');
        })()),
        expectedSource: captureSourceIdentity(chatKey, ctx.chat, id),
'''),
]),
('src/injection.js', 'b54e3bfc7f027eed532fb829d679e13c39b59c04', [
(144, 7, r'''    let instructionTokenEstimate = estimateForegroundTokens(instructionText);
    let dynamicBudgetTokens = Math.max(0, actualBudgetTokens - instructionTokenEstimate);
'''),
(176, 0, r'''    }

    if (optional) {
        const candidate = `${instructionText}\n${optional}`;
        if (estimateForegroundTokens(`${candidate}\n${FOREGROUND_CONTEXT_PREFIX}${dynamicText}`) <= actualBudgetTokens) {
            instructionText = candidate;
            instructionTokenEstimate = estimateForegroundTokens(candidate);
            dynamicBudgetTokens = Math.max(0, actualBudgetTokens - instructionTokenEstimate);
        }
'''),
]),
('src/model/semantic-updates.js', '8652e33962deb3ba701876935827250cc9a46bb9', [
(27, 1, r'''export const NPC_STATE_MODEL_CONTRACT_VERSION = 5;
'''),
(166, 1, r'''        'SEMANTIC UPDATE REFERENCE (explanatory placeholders, NOT a literal valid payload):',
'''),
]),
('src/operation-diagnostics.js', '01cb749c6628dc052c23e6178d66bcb6a54b041a', [
(0, 0, r'''import { chatLineage, fingerprintMessage } from './branches.js';

'''),
(104, 1, r'''export function activeSwipeMetadata(message) {
'''),
(107, 1, r'''    if (Array.isArray(message?.swipe_info)) return { swipeId, meta: swipe?.extra?.npc_state_beta_v1 || null, source: 'swipe' };
'''),
(109, 0, r'''}

export function captureTransportHash(raw) { return raw ? operationHistoryIdentity([String(raw)]).hash : ''; }

let captureSequence = 0;

export function captureSourceIdentity(chatKey, chat, messageId) {
    const message = chat?.[messageId];
    return {
        chatKey: String(chatKey || ''), messageId,
        fingerprint: fingerprintMessage(message),
        swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : 0,
        history: operationHistoryIdentity(chatLineage(chat, messageId)),
    };
}

export function captureSourceMatches(source, chatKey, chat, messageId = source?.messageId) {
    if (!source || !Number.isInteger(messageId) || !chat?.[messageId]) return false;
    const current = captureSourceIdentity(chatKey, chat, messageId);
    return ['chatKey', 'messageId', 'fingerprint', 'swipeId'].every(key => current[key] === source[key])
        && current.history.length === source.history?.length && current.history.hash === source.history?.hash;
}

export function storeCapturedPayload({ chatKey, chat, messageId, consumed }) {
    const message = chat?.[messageId];
    if (!message) return null;
    const accepted = !consumed.errors?.length && Boolean(consumed.parsed);
    captureSequence += 1;
    const meta = {
        version: 2, accepted, payload: accepted ? consumed.raw : null,
        errors: accepted ? [] : (consumed.errors || []).slice(0, 12).map(value => clean(value, 300)),
        errorCodes: (consumed.errorCodes || []).slice(0, 12).map(value => clean(value, 80)),
        at: Date.now(),
        captureId: globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${captureSequence.toString(36)}`,
        source: captureSourceIdentity(chatKey, chat, messageId),
        transportHash: captureTransportHash(consumed.raw),
    };
    message.extra ??= {};
    message.extra.npc_state_beta_v1 = meta;
    const swipe = message.swipe_info?.[meta.source.swipeId];
    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_v1 = structuredClone(meta); }
    return meta;
'''),
(120, 2, r'''    if (id < 0 || !message || message.is_user || message.is_system) {
        return { available: false, reason: 'not-assistant-message', chatKey: clean(chatKey, 300), messageId: id, swipeId: null };
'''),
(125, 8, r'''    if (!meta) return { available: false, reason: selected.source === 'swipe' ? 'capture-metadata-unavailable-for-active-swipe' : 'capture-metadata-unavailable', chatKey: clean(chatKey, 300), messageId: id, swipeId: selected.swipeId };
'''),
(134, 0, r'''    const owned = meta.source && meta.captureId
        ? (captureSourceMatches(meta.source, chatKey, source, id) && !/<npc_state_v1\b/i.test(message.mes) ? 'current' : 'stale')
        : 'unavailable';
    // A capture ID identifies an attempt, not just an address. Full source ownership
    // must also agree. Legacy/evicted outcomes never borrow an older operation.
    const operation = owned === 'current' && parsedSuccessfully ? (Array.isArray(operations) ? operations : []).findLast(row =>
        row?.type === 'first-pass' && row.chatKey === chatKey && row.source?.captureId === meta.captureId
        && row.source?.messageId === id && row.source?.fingerprint === meta.source.fingerprint
        && row.source?.swipeId === meta.source.swipeId
        && row.source?.history?.length === meta.source.history.length && row.source?.history?.hash === meta.source.history.hash) : null;
    const unavailable = reason => ({ available: false, status: 'unavailable', applicationStatus: 'unavailable', persistenceStatus: 'unavailable', revision: null, proposals: null, reason });
    let application = unavailable(owned === 'unavailable' ? 'capture-ownership-unavailable' : 'matching-first-pass-operation-not-retained');
    if (owned === 'stale') application = { ...unavailable('capture-history-changed'), status: 'stale' };
    else if (!parsedSuccessfully) application = { available: true, status: 'rejected', applicationStatus: 'not-run', persistenceStatus: 'not-run', revision: null, proposals: null, reason: 'capture-parse-rejected' };
    else if (operation) application = {
        available: true, operationId: clean(operation.id, 160), status: clean(operation.status, 80),
        applicationStatus: clean(operation.application?.status, 80) || 'not-run',
        persistenceStatus: clean(operation.persistence?.status, 120) || 'not-run',
        revision: Number.isInteger(operation.persistence?.revision) ? operation.persistence.revision : null,
        proposals: operation.proposals && typeof operation.proposals === 'object' ? structuredClone(operation.proposals) : null,
        reason: clean(operation.failure?.reason, 300),
    };
'''),
(135, 18, r'''        available: true, chatKey: clean(chatKey, 300), messageId: id, swipeId: selected.swipeId,
        metadataSource: selected.source, ownershipStatus: owned, parsedSuccessfully,
        parseStatus: parsedSuccessfully ? 'parsed' : 'rejected',
        payload: parsedSuccessfully ? meta.payload : '',
        parseErrors: Array.isArray(meta.errors) ? meta.errors.slice(0, 12).map(value => clean(value, 300)).filter(Boolean) : [],
        errorCodes: Array.isArray(meta.errorCodes) ? meta.errorCodes.slice(0, 12).map(value => clean(value, 80)) : [],
        capturedAt: Number(meta.at) || null, application,
'''),
]),
('src/scan-application.js', '7fee1df34bde103e84c23ce73473882fdcf0e705', [
(5, 1, r''''''),
(862, 3, r'''    // scanner.js owns parsing/compatibility once, before identity preparation.
    const result = resultInput;
'''),
]),
('src/scanner.js', '9e6d5522f6e32873292db03bc7e02393e8c32cf1', [
(1, 1, r'''import { normalizeScanPayload, parseScanJson } from './scan-payload.js';
'''),
(39, 1, r'''    const parsed = typeof resultInput === 'string' ? parseScanJson(resultInput) : normalizeScanPayload(structuredClone(resultInput || {}), { allowOmittedSupplemental: true });
'''),
]),
('src/schema.js', '6c663d87a8f162ac4b19b412923500d6aede39c3', [
(3, 1, r'''export const NPC_STATE_VERSION = '0.7.7';
'''),
]),
])

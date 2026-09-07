const DEFAULT_LIMIT = 64;
const MAX_REASONS = 12;

function clean(value, max = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function uniqueStrings(values = [], limit = MAX_REASONS) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const text = clean(value, 300);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
        if (out.length >= limit) break;
    }
    return out;
}

function boundedIds(values = [], limit = 40) {
    return uniqueStrings(Array.isArray(values) ? values : [], limit).map(value => value.slice(0, 160));
}

export function operationHistoryIdentity(lineage = []) {
    const rows = Array.isArray(lineage) ? lineage.map(value => String(value || '')).filter(Boolean) : [];
    return {
        length: rows.length,
        hash: rows.length ? fnv1a(rows.join('|')) : '',
    };
}

export function summarizeProposalDiagnostics(semanticDiagnostics = [], coverageDiagnostics = []) {
    const summary = { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] };
    let insufficient = 0;
    let unavailable = 0;
    const reasons = [];
    const identityFailures = new Set();
    const countIdentityFailure = row => {
        const status = String(row?.status || '');
        const key = `${Number.isInteger(row?.patchIndex) ? row.patchIndex : ''}|${status}|${clean(row?.reason, 220)}`;
        if (identityFailures.has(key)) return;
        identityFailures.add(key);
        summary.rejected += 1;
        reasons.push([status, row?.reason].filter(Boolean).join(': '));
    };
    for (const row of Array.isArray(semanticDiagnostics) ? semanticDiagnostics : []) {
        const status = String(row?.status || '');
        if (status === 'applied') summary.accepted += 1;
        else if (status === 'no-change-proposed') summary.unchanged += 1;
        else if (status === 'evaluated-unchanged') summary.unchanged += Math.max(1, Array.isArray(row?.evaluatedGroups) ? row.evaluatedGroups.length : 1);
        else if (status === 'insufficient-evidence') insufficient += 1;
        else if (status === 'context-unavailable') unavailable += 1;
        else if (status === 'no-field-proposal') reasons.push('no-field-proposal');
        else if (status === 'identity-rejected' || status === 'identity-unresolved') countIdentityFailure(row);
        else {
            summary.rejected += 1;
            reasons.push([status, row?.reason].filter(Boolean).join(': '));
        }
    }
    for (const row of Array.isArray(coverageDiagnostics) ? coverageDiagnostics : []) {
        const status = String(row?.status || '');
        if (status === 'missing-npc-patch' || status === 'incomplete-evaluation') {
            summary.omitted += Math.max(1, Array.isArray(row?.missingGroups) ? row.missingGroups.length : 1);
            const groups = Array.isArray(row?.missingGroups) ? row.missingGroups.join(',') : '';
            reasons.push([status, groups].filter(Boolean).join(': '));
        } else if (status === 'identity-rejected' || status === 'identity-unresolved') {
            countIdentityFailure(row);
        } else if (status) {
            summary.rejected += 1;
            reasons.push([status, row?.reason].filter(Boolean).join(': '));
        }
    }
    if (insufficient > 0) summary.insufficient = insufficient;
    if (unavailable > 0) summary.unavailable = unavailable;
    summary.reasons = uniqueStrings(reasons);
    return summary;
}

function mergeRecord(target, patch = {}) {
    for (const [key, value] of Object.entries(patch || {})) {
        if (value === undefined) continue;
        if (value && typeof value === 'object' && !Array.isArray(value)
            && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            target[key] = { ...target[key], ...structuredClone(value) };
        } else {
            target[key] = structuredClone(value);
        }
    }
    if (Array.isArray(target.selectedNpcIds)) target.selectedNpcIds = boundedIds(target.selectedNpcIds);
    if (target.proposals?.reasons) target.proposals.reasons = uniqueStrings(target.proposals.reasons);
    return target;
}

function activeSwipeMetadata(message) {
    const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message?.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe) return { swipeId, meta: swipe.extra?.npc_state_beta_v1 || null, source: 'swipe' };
    return { swipeId, meta: message?.extra?.npc_state_beta_v1 || null, source: 'message' };
}

export function inspectCapturedPayload({ chat = [], chatKey = '', messageId = null, operations = [] } = {}) {
    const source = Array.isArray(chat) ? chat : [];
    let id = Number.isInteger(messageId) ? messageId : -1;
    if (id < 0) {
        for (let index = source.length - 1; index >= 0; index -= 1) {
            if (source[index] && !source[index].is_user && !source[index].is_system) { id = index; break; }
        }
    }
    const message = source[id];
    if (!Number.isInteger(id) || id < 0 || !message || message.is_user || message.is_system) {
        return { available: false, reason: 'not-assistant-message', chatKey: clean(chatKey, 300), messageId: Number.isInteger(id) ? id : null, swipeId: null };
    }
    const selected = activeSwipeMetadata(message);
    const meta = selected.meta;
    if (!meta) {
        return { available: false, reason: selected.source === 'swipe' ? 'capture-metadata-unavailable-for-active-swipe' : 'capture-metadata-unavailable', chatKey: clean(chatKey, 300), messageId: id, swipeId: selected.swipeId };
    }
    const rows = (Array.isArray(operations) ? operations : []).filter(row =>
        String(row?.type || '') === 'first-pass'
        && Number(row?.source?.messageId) === id
        && Number(row?.source?.swipeId ?? 0) === selected.swipeId);
    const operation = rows.at(-1) || null;
    const parsedSuccessfully = meta.accepted === true && typeof meta.payload === 'string' && Boolean(meta.payload.trim());
    return {
        available: true,
        chatKey: clean(chatKey, 300),
        messageId: id,
        swipeId: selected.swipeId,
        metadataSource: selected.source,
        parsedSuccessfully,
        payload: parsedSuccessfully ? String(meta.payload) : '',
        parseErrors: Array.isArray(meta.errors) ? meta.errors.map(value => clean(value, 300)).filter(Boolean).slice(0, 12) : [],
        capturedAt: Number(meta.at) || null,
        application: operation ? {
            available: true,
            operationId: clean(operation.id, 160),
            status: clean(operation.status, 80),
            persistenceStatus: clean(operation.persistence?.status, 120) || 'not-run',
            revision: Number.isInteger(operation.persistence?.revision) ? operation.persistence.revision : null,
            proposals: operation.proposals && typeof operation.proposals === 'object' ? structuredClone(operation.proposals) : null,
            reason: clean(operation.failure?.reason, 300),
        } : { available: false, status: 'unavailable', persistenceStatus: 'unavailable', revision: null, proposals: null, reason: 'matching-first-pass-operation-not-retained' },
    };
}

export function createOperationDiagnostics({ limit = DEFAULT_LIMIT, now = () => Date.now() } = {}) {
    const max = Math.max(8, Math.min(256, Math.trunc(Number(limit) || DEFAULT_LIMIT)));
    const byChat = new Map();
    const pending = new Map();
    let sequence = 0;

    function rows(chatKey) {
        const key = String(chatKey || '');
        if (!byChat.has(key)) byChat.set(key, []);
        return byChat.get(key);
    }

    function prune(chatKey) {
        const list = rows(chatKey);
        while (list.length > max) {
            const removed = list.shift();
            if (removed?.id) pending.delete(removed.id);
        }
    }

    function start(input = {}) {
        const chatKey = clean(input.chatKey, 300);
        const startedAt = Number(input.startedAt) || now();
        sequence += 1;
        const id = clean(input.id, 160) || `${startedAt.toString(36)}-${sequence.toString(36)}`;
        const record = {
            id,
            type: clean(input.type, 80) || 'operation',
            status: 'running',
            chatKey,
            source: input.source && typeof input.source === 'object' ? structuredClone(input.source) : {},
            selectedNpcIds: boundedIds(input.selectedNpcIds),
            prompt: input.prompt && typeof input.prompt === 'object' ? structuredClone(input.prompt) : {},
            proposals: { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] },
            persistence: { status: 'not-run', revision: null },
            checkpoint: {},
            recovery: input.recovery && typeof input.recovery === 'object' ? structuredClone(input.recovery) : {},
            failure: {},
            startedAt,
            finishedAt: null,
        };
        rows(chatKey).push(record);
        pending.set(id, record);
        prune(chatKey);
        return id;
    }

    function patch(id, values = {}) {
        const record = pending.get(String(id || ''));
        if (!record) return false;
        mergeRecord(record, values);
        return true;
    }

    function finish(id, values = {}) {
        const key = String(id || '');
        const record = pending.get(key);
        if (!record) return false;
        mergeRecord(record, values);
        record.status = clean(values.status, 80) || record.status || 'complete';
        record.finishedAt = Number(values.finishedAt) || now();
        pending.delete(key);
        return true;
    }

    function summary(chatKey) {
        const list = rows(chatKey);
        const latest = list.at(-1) || null;
        return {
            count: list.length,
            running: list.filter(row => row.status === 'running').length,
            latest: latest ? {
                id: latest.id,
                type: latest.type,
                status: latest.status,
                sourceMessageId: Number.isInteger(latest.source?.messageId) ? latest.source.messageId : null,
                persistenceStatus: latest.persistence?.status || 'not-run',
                revision: Number.isInteger(latest.persistence?.revision) ? latest.persistence.revision : null,
                startedAt: latest.startedAt,
                finishedAt: latest.finishedAt,
            } : null,
        };
    }

    function records(chatKey, { limit: requested = max } = {}) {
        const count = Math.max(1, Math.min(max, Math.trunc(Number(requested) || max)));
        return structuredClone(rows(chatKey).slice(-count));
    }

    function clear(chatKey) {
        const key = String(chatKey || '');
        for (const row of rows(key)) pending.delete(row.id);
        byChat.delete(key);
    }

    return Object.freeze({ start, patch, finish, summary, records, clear });
}

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
        else if (status === 'evaluated-unchanged') summary.unchanged += 1;
        else if (status === 'evaluated-groups') { /* group-level compatibility marker; not field-level unchanged */ }
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
        if (['missing-npc-patch', 'incomplete-evaluation', 'missing-candidate-accounting', 'invalid-candidate-accounting', 'candidate-unresolved', 'candidate-accounting-conflict'].includes(status)) {
            const fields = Array.isArray(row?.missingFields) ? row.missingFields.filter(Boolean) : [];
            const groups = Array.isArray(row?.missingGroups) ? row.missingGroups.filter(Boolean) : [];
            summary.omitted += Math.max(1, fields.length || groups.length);
            const detail = fields.length ? `fields=${fields.slice(0, 12).join(',')}` : (groups.length ? `groups=${groups.join(',')}` : String(row?.reason || ''));
            reasons.push([status, detail].filter(Boolean).join(': '));
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

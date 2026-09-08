function boundedDetail(value) {
    return String(value || '').trim().slice(0, 400);
}

function resultStatus(result) {
    if (result?.ok) {
        if (result?.discarded) return 'blocked';
        const partial = (result.coverageDiagnostics || []).some(row => row?.status === 'incomplete-evaluation')
            || (result.semanticDiagnostics || []).some(row => ['rejected-proposal', 'invalid-source-reference', 'invalid-structure'].includes(row?.status));
        return partial ? 'partial' : 'complete';
    }
    if (result?.discarded || ['branch-unsafe', 'recovery-active', 'stale-operation', 'stale-operation-before-dispatch'].includes(result?.reason)) return 'blocked';
    if (result?.skipped && ['already-scanned', 'auto-disabled', 'disabled'].includes(result?.reason)) return result.reason === 'already-scanned' ? 'complete' : 'idle';
    return 'failed';
}

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(() => resolve({ ok: false, reason: 'scan-wait-timeout', timeout: true }), ms));
}

export function createPostResponseCoordinator(adapters = {}) {
    const getSource = adapters.getSource;
    const getLatestSource = adapters.getLatestSource;
    const getSettings = adapters.getSettings;
    const runScan = adapters.runScan;
    const publishStatus = adapters.setStatus || (() => {});
    const logError = adapters.logError || (() => {});
    if (![getSource, getLatestSource, getSettings, runScan].every(fn => typeof fn === 'function')) {
        throw new Error('NPC State post-response coordinator requires source, latest-source, settings, and scan adapters.');
    }

    const jobs = new Map();
    const currentByChat = new Map();
    const statuses = new Map();

    function status(chatKey) {
        return structuredClone(statuses.get(chatKey) || { status: 'idle', messageId: null, detail: '', identity: '' });
    }

    function setStatus(source, next, detail = '') {
        if (!source?.chatKey || currentByChat.get(source.chatKey) !== source.identity) return;
        const value = { status: next, messageId: source.messageId, detail: boundedDetail(detail), identity: source.identity };
        statuses.set(source.chatKey, value);
        publishStatus(source.chatKey, value);
    }

    function process(messageId) {
        const source = getSource(messageId);
        if (!source?.valid) return Promise.resolve({ ok: false, reason: source?.reason || 'not-assistant-message' });
        const settings = getSettings();
        if (settings.enabled === false || settings.autoScan === false) {
            currentByChat.set(source.chatKey, source.identity);
            setStatus(source, 'idle', settings.enabled === false ? 'extension-disabled' : 'auto-scan-disabled');
            return Promise.resolve({ ok: false, skipped: true, reason: settings.enabled === false ? 'disabled' : 'auto-disabled', messageId: source.messageId });
        }
        const existing = jobs.get(source.identity);
        if (existing) return existing.promise;

        currentByChat.set(source.chatKey, source.identity);
        setStatus(source, 'queued');
        const job = { source, promise: null, result: null, controller: new AbortController(), timedOut: false };
        job.promise = Promise.resolve().then(async () => {
            setStatus(source, 'scanning');
            try {
                const result = await runScan(source.messageId, {
                    source,
                    signal: job.controller.signal,
                    onPhase: phase => {
                        if (phase === 'saving') setStatus(source, 'saving');
                        else if (phase === 'scanning') setStatus(source, 'scanning');
                    },
                });
                job.result = result;
                const next = resultStatus(result);
                if (!job.timedOut) setStatus(source, next, result?.reason || '');
                return result;
            } catch (error) {
                job.result = { ok: false, reason: 'scan-failed', error };
                if (!job.timedOut) setStatus(source, 'failed', error?.message || error);
                logError(error, source);
                return job.result;
            }
        });
        jobs.set(source.identity, job);
        return job.promise;
    }

    async function settleLatest({ timeoutMs = 45000 } = {}) {
        const settings = getSettings();
        if (settings.enabled === false || settings.autoScan === false) return { ok: true, skipped: true, reason: 'auto-disabled' };
        const source = getLatestSource();
        if (!source?.valid) return { ok: true, skipped: true, reason: source?.reason || 'no-assistant-message' };
        const promise = process(source.messageId);
        const result = await Promise.race([promise, timeoutPromise(Math.max(1000, Math.min(120000, Number(timeoutMs) || 45000)))]);
        if (result?.timeout) {
            currentByChat.set(source.chatKey, source.identity);
            const job = jobs.get(source.identity);
            if (job) job.timedOut = true;
            job?.controller?.abort();
            setStatus(source, 'failed', 'Previous NPC scan did not settle before the generation synchronization timeout. Retry the scan before generating again.');
            return result;
        }
        // A successful persisted scan may still be semantically partial. It is synchronized
        // and safe to continue; the UI preserves the partial status for user awareness.
        return result?.ok ? result : { ...result, synchronized: false };
    }

    function retryLatest() {
        const source = getLatestSource();
        if (!source?.valid) return Promise.resolve({ ok: false, reason: source?.reason || 'no-assistant-message' });
        jobs.delete(source.identity);
        return process(source.messageId);
    }

    function clearChat(chatKey) {
        currentByChat.delete(chatKey);
        statuses.delete(chatKey);
    }

    return Object.freeze({ process, settleLatest, retryLatest, status, clearChat });
}

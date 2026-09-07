export function createCompletenessCoordinator(adapters = {}) {
    const getSource = adapters.getSource;
    const getSettings = adapters.getSettings;
    const runEmbedded = adapters.runEmbedded;
    const runCompleteness = adapters.runCompleteness;
    const readRecord = adapters.readRecord || (() => null);
    const writeRecord = adapters.writeRecord || (() => {});
    const setStatus = adapters.setStatus || (() => {});
    const invalidateCompleteness = adapters.invalidateCompleteness || (() => {});
    const logError = adapters.logError || (() => {});
    const runs = new Map();
    // disabled completeness must not create a second post-response mutation.
    const embeddedOnlyDone = new Map();

    function rememberEmbeddedOnly(identity, result) {
        const key = String(identity || '');
        if (!key) return;
        embeddedOnlyDone.delete(key);
        embeddedOnlyDone.set(key, { ...result });
        while (embeddedOnlyDone.size > 256) embeddedOnlyDone.delete(embeddedOnlyDone.keys().next().value);
    }

    if (typeof getSource !== 'function' || typeof getSettings !== 'function' || typeof runEmbedded !== 'function' || typeof runCompleteness !== 'function') {
        throw new Error('NPC State completeness coordinator requires source, settings, embedded, and completeness adapters.');
    }

    async function process(messageId) {
        const source = getSource(messageId);
        if (!source?.valid) return { ok: false, reason: source?.reason || 'not-assistant-message' };
        const recorded = readRecord(source);
        if (recorded?.identity === source.identity && ['complete', 'failed'].includes(String(recorded.status || ''))) {
            return { ok: recorded.status === 'complete', skipped: true, reason: 'completion-already-recorded', coverage: recorded.coverage || 'recorded' };
        }
        const embeddedOnly = embeddedOnlyDone.get(source.identity);
        if (embeddedOnly) return { ...embeddedOnly, skipped: true, reason: 'completion-already-recorded' };
        if (runs.has(source.identity)) return runs.get(source.identity);
        invalidateCompleteness(source.chatKey);

        const work = (async () => {
            const settingsAtStart = getSettings();
            const completenessRequested = settingsAtStart.enabled !== false
                && settingsAtStart.autoScan !== false
                && settingsAtStart.scanAfterEachResponse === true;
            const embedded = await runEmbedded(source.messageId, {
                expectedFingerprint: source.expectedFingerprint,
                expectedSwipeId: source.expectedSwipeId,
            });
            if (!embedded?.ok) {
                const skipped = embedded?.coverage === 'skipped';
                writeRecord(source, { identity: source.identity, status: skipped ? 'complete' : 'failed', coverage: embedded?.coverage || 'failure', completeness: 'not-run', reason: embedded?.reason || (skipped ? 'embedded-skipped' : 'embedded-failed') });
                return embedded;
            }
            if (embedded.coverage === 'full-recovery') {
                writeRecord(source, { identity: source.identity, status: 'complete', coverage: 'full-recovery', completeness: 'suppressed', reason: 'full-recovery-covered-response' });
                setStatus(source.chatKey, 'idle');
                return { ...embedded, completeness: 'suppressed' };
            }
            if (embedded.coverage !== 'embedded') {
                writeRecord(source, { identity: source.identity, status: 'complete', coverage: embedded.coverage || 'embedded-skipped', completeness: 'not-run', reason: embedded.reason || 'embedded-skipped' });
                setStatus(source.chatKey, 'idle');
                return embedded;
            }
            const settingsNow = getSettings();
            const completenessEnabled = completenessRequested
                && settingsNow.enabled !== false
                && settingsNow.autoScan !== false
                && settingsNow.scanAfterEachResponse === true;
            if (!completenessEnabled) {
                const disabled = { ...embedded, completeness: 'disabled' };
                rememberEmbeddedOnly(source.identity, disabled);
                setStatus(source.chatKey, 'idle');
                return disabled;
            }

            setStatus(source.chatKey, 'pending', source.messageId, 'Completeness scan queued.');
            setStatus(source.chatKey, 'running', source.messageId, 'Completeness scan running.');
            try {
                const result = await runCompleteness(source.messageId, {
                    expectedFingerprint: source.expectedFingerprint,
                    expectedSwipeId: source.expectedSwipeId,
                });
                if (result?.ok) {
                    writeRecord(source, { identity: source.identity, status: 'complete', coverage: 'embedded+completeness', completeness: 'complete', reason: '' });
                    setStatus(source.chatKey, 'idle');
                    return { ...embedded, completeness: 'complete', completenessResult: result };
                }
                const reason = result?.reason || 'completeness-not-committed';
                writeRecord(source, { identity: source.identity, status: 'failed', coverage: 'embedded', completeness: result?.discarded ? 'discarded' : 'failed', reason });
                setStatus(source.chatKey, result?.discarded ? 'idle' : 'failed', source.messageId, result?.discarded ? '' : reason);
                return { ...embedded, completeness: result?.discarded ? 'discarded' : 'failed', completenessResult: result };
            } catch (error) {
                logError(error);
                const detail = String(error?.message || error || 'Completeness scan failed.');
                writeRecord(source, { identity: source.identity, status: 'failed', coverage: 'embedded', completeness: 'failed', reason: detail });
                setStatus(source.chatKey, 'failed', source.messageId, detail);
                return { ...embedded, completeness: 'failed', completenessResult: { ok: false, reason: 'completeness-failed', error } };
            }
        })();
        runs.set(source.identity, work);
        try { return await work; }
        finally { if (runs.get(source.identity) === work) runs.delete(source.identity); }
    }

    return Object.freeze({ process, inFlightCount: () => runs.size });
}

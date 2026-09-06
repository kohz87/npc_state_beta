import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.29 hardening marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.29 hardening section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// Persist recovery ownership/lease metadata and relationship source-event identity.
{
    const path = 'v03/schema.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `        version: 1,\n        status,\n        relationshipMode: normalizeRecoveryRelationshipMode(value.relationshipMode),`,
        `        version: 2,\n        status,\n        ownerSessionId: recoveryText(value.ownerSessionId, 160),\n        leaseUntil: Number(value.leaseUntil) || null,\n        relationshipMode: normalizeRecoveryRelationshipMode(value.relationshipMode),`,
        'recovery owner and lease schema');
    source = replaceRequired(source,
        `        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),\n        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,`,
        `        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),\n        sourceEventKey: text(raw?.sourceEventKey, 240),\n        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,`,
        'relationship evidence source-event key');
    source = replaceRequired(source,
        `        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),\n        axisReasons: normalizeRelationshipAxisReasons(raw?.axisReasons),`,
        `        verifiedSources: normalizeRelationshipVerifiedSources(raw?.verifiedSources),\n        sourceEventKey: text(raw?.sourceEventKey, 240),\n        axisReasons: normalizeRelationshipAxisReasons(raw?.axisReasons),`,
        'relationship diagnostic source-event key');
    fs.writeFileSync(path, source);
}

// Duplicate protection is event-scoped, not quotation-text-scoped.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    const duplicateSection = `function relationshipEventFingerprint(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function relationshipSourceEventKey(options = {}) {
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const sources = relationshipEvidenceSourcesForOptions(options);
    const canonicalSources = sources.map(source => [
        String(source?.id || ''),
        String(source?.kind || ''),
        relationshipDuplicateEvidenceKey(source?.text || ''),
    ].join('\\0')).join('\\1');
    if (canonicalSources) return 'msg:' + String(sourceMessageId ?? 'na') + ':' + relationshipEventFingerprint(canonicalSources);
    if (sourceMessageId !== null) return 'msg:' + String(sourceMessageId);
    if (Number.isInteger(options.turn)) return 'turn:' + String(options.turn);
    return '';
}

function relationshipAxisLooksDuplicate(npc, change, axis, options = {}) {
    const currentEventKey = relationshipSourceEventKey(options);
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : null;
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        if (currentEventKey && previous.sourceEventKey) return previous.sourceEventKey === currentEventKey;
        // Legacy evidence events predate sourceEventKey. Keep conservative same-event replay
        // protection for those rows, but never use identical quotation text as event identity.
        if (!previous.sourceEventKey) {
            if (sourceMessageId !== null && Number.isInteger(previous.sourceMessageId) && previous.sourceMessageId === sourceMessageId) return true;
            if (turn !== null && Number.isInteger(previous.turn) && previous.turn === turn) return true;
        }
        return false;
    });
}
`;
    source = replaceSection(source,
        'function relationshipAxisLooksDuplicate(',
        '\nfunction relationshipEvidenceSourcesForOptions',
        duplicateSection,
        'event-scoped relationship duplicate detection');
    source = replaceRequired(source,
        `        axisEvidence: change.axisEvidence || {}, priority: change.priority || [], verifiedSources: change.verifiedSources || {},\n        axisReasons: relationshipAxisReasons(reasons),\n        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),`,
        `        axisEvidence: change.axisEvidence || {}, priority: change.priority || [], verifiedSources: change.verifiedSources || {},\n        sourceEventKey: relationshipSourceEventKey(options),\n        axisReasons: relationshipAxisReasons(reasons),\n        reasons, unlocks, sourceMessageId: options.sourceMessageId, turn: options.turn, at: Date.now(),`,
        'diagnostic source-event identity');
    source = replaceRequired(source,
        `        verifiedSources: acceptedVerifiedSources,\n        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,`,
        `        verifiedSources: acceptedVerifiedSources,\n        sourceEventKey: relationshipSourceEventKey(options),\n        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,`,
        'accepted relationship source-event identity');
    fs.writeFileSync(path, source);
}

// Recovery orchestration: strict ranges, chat binding, session lease ownership, and
// cancellation precedence over generation failures.
{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceSection(source,
        'function recoveryRangeForChat(',
        '\nfunction recoveryCompletedPrefixMatches',
`function recoveryRangeForChat(chat = [], startMessageId = null, endMessageId = null) {
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
`, 'strict recovery range validation');

    source = replaceRequired(source,
        `\nexport function createNpcStateEngine(adapters = {}) {`,
        `\nfunction defaultRecoverySessionId() {\n    try {\n        const generated = globalThis.crypto?.randomUUID?.();\n        if (generated) return String(generated);\n    } catch {}\n    return 'recovery-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);\n}\n\nexport function createNpcStateEngine(adapters = {}) {`,
        'recovery session id helper');

    source = replaceRequired(source,
        `    const notify = adapters.notify || (() => {});\n\n    if (typeof getContext !== 'function' || typeof getChatKey !== 'function' || typeof getSettings !== 'function' || typeof generate !== 'function') {`,
        `    const notify = adapters.notify || (() => {});\n    const recoverySessionId = String(adapters.recoverySessionId || defaultRecoverySessionId()).slice(0, 160);\n    const recoveryLeaseMs = Math.max(30000, Math.min(3600000, Number(adapters.recoveryLeaseMs) || 900000));\n    const recoveryNow = typeof adapters.recoveryNow === 'function' ? adapters.recoveryNow : () => Date.now();\n\n    function recoveryOwnedByThisSession(recovery) {\n        return Boolean(recovery?.ownerSessionId && recovery.ownerSessionId === recoverySessionId);\n    }\n    function recoveryLeaseActive(recovery) {\n        return String(recovery?.status || '') === 'running'\n            && Boolean(recovery?.ownerSessionId)\n            && Number(recovery?.leaseUntil || 0) > recoveryNow();\n    }\n    function recoveryOwnedElsewhere(recovery) {\n        return recoveryLeaseActive(recovery) && !recoveryOwnedByThisSession(recovery);\n    }\n    function claimRecoveryOwnership(recoveryInput) {\n        return { ...structuredClone(recoveryInput || {}), ownerSessionId: recoverySessionId, leaseUntil: recoveryNow() + recoveryLeaseMs };\n    }\n    function releaseRecoveryOwnership(recoveryInput) {\n        return { ...structuredClone(recoveryInput || {}), ownerSessionId: '', leaseUntil: null };\n    }\n    function decoratedRecoveryStatus(recoveryInput, chatKey) {\n        if (!recoveryInput) return null;\n        const recovery = structuredClone(recoveryInput);\n        const localRunning = recoveryRuns.has(chatKey);\n        const activeElsewhere = recoveryOwnedElsewhere(recovery);\n        const expiredAbandoned = recovery.status === 'running' && !localRunning && !activeElsewhere && Number(recovery.leaseUntil || 0) <= recoveryNow();\n        if (expiredAbandoned) {\n            recovery.status = 'paused';\n            recovery.reason = 'Recovery ownership lease expired and can be resumed from the last committed exchange.';\n            recovery.abandoned = true;\n        }\n        recovery.ownedByThisSession = recoveryOwnedByThisSession(recovery);\n        recovery.activeElsewhere = activeElsewhere;\n        return recovery;\n    }\n\n    if (typeof getContext !== 'function' || typeof getChatKey !== 'function' || typeof getSettings !== 'function' || typeof generate !== 'function') {`,
        'session lease helpers');

    source = replaceRequired(source,
        `            const recoveryInterrupted = normalized.recovery?.status === 'running';\n            if (recoveryInterrupted) {\n                normalized.recovery.status = 'paused';\n                normalized.recovery.reason = 'Recovery was interrupted by reload and can be resumed from the last committed exchange.';\n                normalized.recovery.error = '';\n                normalized.recovery.updatedAt = Date.now();\n            }`,
        `            const recoveryWasRunning = normalized.recovery?.status === 'running';\n            const recoveryObservedElsewhere = recoveryWasRunning && recoveryOwnedElsewhere(normalized.recovery);\n            const recoveryInterrupted = recoveryWasRunning && !recoveryObservedElsewhere;\n            if (recoveryInterrupted) {\n                normalized.recovery = releaseRecoveryOwnership(normalized.recovery);\n                normalized.recovery.status = 'paused';\n                normalized.recovery.reason = 'Recovery ownership was abandoned or its lease expired. Resume from the last committed exchange.';\n                normalized.recovery.error = '';\n                normalized.recovery.updatedAt = Date.now();\n            }`,
        'hydration lease ownership');

    source = replaceSection(source,
        '    async function markRecoveryStatus(',
        '\n    async function finalizeHistoricalRecoveryUnlocked',
`    async function markRecoveryStatus(chatKey, status, reason = '', errorText = '') {
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
`, 'recovery status ownership');

    source = replaceSection(source,
        '    async function finalizeHistoricalRecoveryUnlocked(',
        '\n    async function historicalRecoveryStep',
`    async function finalizeHistoricalRecoveryUnlocked(chatKey, state, chat, settings) {
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
        const persisted = await persist(chatKey, next);
        notify('success', 'Historical reconstruction completed. Normal scanning and continuity injection are active again.');
        return { ok: true, complete: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey), state: structuredClone(persisted) };
    }
`, 'chat-bound recovery completion');

    source = replaceSection(source,
        '    async function historicalRecoveryStep(',
        '\n    async function runHistoricalRecoveryLoop',
`    async function historicalRecoveryStep(chatKey) {
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
            if (epoch(chatKey) !== startEpoch || !recoveryLineageEqual(chatLineage(currentChat, nextMessageId), startLineage)) {
                return { ok: false, discarded: true, reason: 'stale-operation', messageId: nextMessageId };
            }

            const working = normalizeState(state, chatKey);
            working.turn = Math.max(0, Number(working.turn) || 0) + 1;
            const applied = applyScanResult(working, parsed, {
                sourceMessageId: nextMessageId,
                turn: working.turn,
                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: relationshipContextForExchange(exchange),
                profileContext: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),
                evidencePolicy: buildExchangeEvidencePolicy(exchange),
                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),
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
            committed.recovery = claimRecoveryOwnership({
                ...state.recovery,
                status: 'running',
                completed: Math.min(state.recovery.total, state.recovery.completed + 1),
                lastCompletedMessageId: nextMessageId,
                nextMessageId: state.recovery.messageIds[state.recovery.completed + 1] ?? null,
                reason: replanned.changed ? 'Unprocessed suffix changed and was safely replanned; completed history was not replayed.' : '',
                error: '',
                updatedAt: Date.now(),
            });
            committed.updatedAt = Date.now();
            const persisted = await persist(chatKey, committed);
            return {
                ok: true,
                messageId: nextMessageId,
                recovery: decoratedRecoveryStatus(persisted.recovery, chatKey),
                state: structuredClone(persisted),
            };
        });
    }
`, 'chat-bound owned recovery step');

    source = replaceSection(source,
        '    async function runHistoricalRecoveryLoop(',
        '\n    async function startHistoricalRecovery',
`    async function runHistoricalRecoveryLoop(chatKey) {
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
`, 'cancellation-safe recovery loop');

    source = replaceSection(source,
        '    async function startHistoricalRecovery(',
        '\n    async function resumeHistoricalRecovery',
`    async function startHistoricalRecovery({
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
        const plan = recoveryRangeForChat(chat, startMessageId, endMessageId);
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
            fresh.branchBase = { messageId: null, lineage: [], createdAt: Date.now(), snapshot: baseline };
            fresh.branchHeadLineage = [];
            fresh.recovery = {
                version: 2,
                status: plan.messageIds.length ? 'running' : 'complete',
                ownerSessionId: plan.messageIds.length ? recoverySessionId : '',
                leaseUntil: plan.messageIds.length ? recoveryNow() + recoveryLeaseMs : null,
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
            return { ok: true };
        });
        if (!prepared?.ok) return prepared;
        if (!plan.messageIds.length) {
            const state = cache.get(chatKey);
            return { ok: true, complete: true, recovery: decoratedRecoveryStatus(state?.recovery || null, chatKey), state: state ? structuredClone(state) : null };
        }
        return runHistoricalRecoveryLoop(chatKey);
    }
`, 'strict chat-bound recovery start');

    source = replaceSection(source,
        '    async function resumeHistoricalRecovery(',
        '\n    async function pauseHistoricalRecovery',
`    async function resumeHistoricalRecovery() {
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
            if (recovery.status === 'complete') return { ok: true, complete: true, recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (recovery.status === 'cancelled') return { ok: false, reason: 'recovery-cancelled', recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (recovery.status === 'stale') return { ok: false, reason: 'restart-required', recovery: decoratedRecoveryStatus(recovery, chatKey) };
            if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-resume' };
            const context = getContext();
            if (getChatKey() !== chatKey) return { ok: false, reason: 'chat-switched-before-resume' };
            const replanned = replanRecoverySuffix(recovery, context.chat || []);
            if (!replanned.ok) {
                state.recovery = releaseRecoveryOwnership(state.recovery);
                state.recovery.status = 'stale';
                state.recovery.reason = 'Completed recovery history changed. Restart is required; completed exchanges will not be replayed automatically.';
                state.recovery.error = replanned.reason;
                state.recovery.updatedAt = Date.now();
                const persisted = await persist(chatKey, state);
                return { ok: false, reason: 'restart-required', recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
            }
            state.recovery = claimRecoveryOwnership({ ...replanned.recovery, status: 'running', error: '', updatedAt: Date.now() });
            const persisted = await persist(chatKey, state);
            return { ok: true, recovery: decoratedRecoveryStatus(persisted.recovery, chatKey) };
        });
        if (!prepared?.ok || prepared.complete) return prepared;
        return runHistoricalRecoveryLoop(chatKey);
    }
`, 'owned recovery resume');

    source = replaceSection(source,
        '    async function pauseHistoricalRecovery(',
        '\n    function recoveryRange()',
`    async function pauseHistoricalRecovery(reason = '') {
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
        const range = recoveryRangeForChat(chat, startMessageId, endMessageId);
        return {
            firstAssistantMessageId: range.firstAssistantMessageId,
            latestAssistantMessageId: range.latestAssistantMessageId,
            assistantExchangeCount: range.messageIds.length,
            startMessageId: range.startMessageId,
            endMessageId: range.endMessageId,
        };
    }
`, 'owned pause cancel and range preview');

    source = replaceRequired(source,
        `        recoveryStatus: chatKey => structuredClone(cache.get(chatKey || getChatKey())?.recovery || null),\n        isRecoveryRunning: chatKey => recoveryRuns.has(chatKey || getChatKey()),`,
        `        recoveryStatus: chatKey => {\n            const key = chatKey || getChatKey();\n            return decoratedRecoveryStatus(cache.get(key)?.recovery || null, key);\n        },\n        isRecoveryRunning: chatKey => recoveryRuns.has(chatKey || getChatKey()),`,
        'decorated recovery status');

    fs.writeFileSync(path, source);
}

// Expose range previews with explicit bounds through the public API.
{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `    recoveryRange: () => engine.recoveryRange(),`,
        `    recoveryRange: options => engine.recoveryRange(options),`,
        'public recovery range options');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.29 recovery concurrency, interruption, range, and relationship-event hardening');

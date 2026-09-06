import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.42 engine marker: ' + label);
    return source.replace(from, to);
}

const path = 'v03/engine.js';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(source,
    `    buildScanPrompt,\n    buildStructuredDossierImportPrompt,`,
    `    buildScanPrompt,\n    buildCompletenessPrompt,\n    buildStructuredDossierImportPrompt,`,
    'completeness prompt import');
source = replaceRequired(source,
    `    const operationEpoch = new Map();\n    const locks = new Map();`,
    `    const operationEpoch = new Map();\n    const completenessEpoch = new Map();\n    const locks = new Map();`,
    'completeness epoch map');
source = replaceRequired(source,
    `    const generate = adapters.generate;\n    const onStateChanged = adapters.onStateChanged || (() => {});`,
    `    const generate = adapters.generate;\n    const resolveGenerationRoute = adapters.resolveGenerationRoute || (() => ({ kind: 'current' }));\n    const onStateChanged = adapters.onStateChanged || (() => {});`,
    'generation route adapter');
source = replaceRequired(source,
    `    function epoch(chatKey) { return operationEpoch.get(chatKey) || 0; }\n    function invalidate(chatKey = getChatKey()) {`,
    `    function epoch(chatKey) { return operationEpoch.get(chatKey) || 0; }\n    function completenessGeneration(chatKey) { return completenessEpoch.get(chatKey) || 0; }\n    function invalidateCompleteness(chatKey = getChatKey()) {\n        if (!chatKey || chatKey === 'no-chat') return 0;\n        const next = completenessGeneration(chatKey) + 1;\n        completenessEpoch.set(chatKey, next);\n        return next;\n    }\n    function invalidate(chatKey = getChatKey()) {`,
    'completeness invalidation helper');
source = replaceRequired(source,
    `        operationEpoch.set(chatKey, next);\n        return next;\n    }`,
    `        operationEpoch.set(chatKey, next);\n        invalidateCompleteness(chatKey);\n        return next;\n    }`,
    'ordinary invalidation cancels completeness');
source = replaceRequired(source,
    `    async function invokeJson(prompt, label = 'scan') {\n        const responseLength = normalizeScannerResponseTokens(getSettings().scannerResponseTokens);\n        let raw = await generate({ systemPrompt: SYSTEM_PROMPT, prompt, responseLength, label });`,
    `    async function invokeJson(prompt, label = 'scan') {\n        const responseLength = normalizeScannerResponseTokens(getSettings().scannerResponseTokens);\n        // Resolve once so the first request and its JSON retry cannot mix connection/profile configuration.\n        const route = await resolveGenerationRoute({ label });\n        let raw = await generate({ systemPrompt: SYSTEM_PROMPT, prompt, responseLength, label, route });`,
    'route capture');
source = replaceRequired(source,
    `                responseLength,\n                label: \`\${label}-json-retry\`,\n            });`,
    `                responseLength,\n                label: \`\${label}-json-retry\`,\n                route,\n            });`,
    'retry route reuse');
source = replaceRequired(source,
    `        if (!manual && settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };\n        return exclusive(chatKey, async () => {`,
    `        if (!manual && settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };\n        if (manual) invalidateCompleteness(chatKey);\n        return exclusive(chatKey, async () => {`,
    'manual scan invalidation');

const completenessFunction = `\n    async function completenessScan(messageId, { expectedFingerprint = '', expectedSwipeId = null } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat', kind: 'completeness' };\n        const settings = getSettings();\n        if (settings.enabled === false || settings.autoScan === false || settings.scanAfterEachResponse !== true) {\n            return { ok: false, skipped: true, reason: 'completeness-disabled', kind: 'completeness', messageId };\n        }\n        return exclusive(chatKey, async () => {\n            const state = await loadChat(chatKey);\n            if (!state) return { ok: false, reason: 'no-state', kind: 'completeness', messageId };\n            if (recoveryBlocksLiveScan(state)) return { ok: false, skipped: true, reason: 'recovery-active', kind: 'completeness', messageId, recovery: structuredClone(state.recovery) };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, skipped: true, reason: 'branch-unsafe', kind: 'completeness', messageId };\n            if (state.lastScannedMessageId !== messageId) return { ok: false, skipped: true, reason: 'source-not-committed', kind: 'completeness', messageId };\n            const context = getContext();\n            const chat = context.chat || [];\n            const exchange = currentExchange(chat, messageId);\n            if (!exchange) return { ok: false, reason: 'not-assistant-message', kind: 'completeness', messageId };\n            const sourceMessage = chat[messageId] || {};\n            const startFingerprint = fingerprintMessage(sourceMessage);\n            const startSwipeId = Number.isInteger(sourceMessage?.swipe_id) ? sourceMessage.swipe_id : 0;\n            if (expectedFingerprint && expectedFingerprint !== startFingerprint) return { ok: false, discarded: true, reason: 'source-changed-before-completeness', kind: 'completeness', messageId };\n            if (Number.isInteger(expectedSwipeId) && expectedSwipeId !== startSwipeId) return { ok: false, discarded: true, reason: 'swipe-changed-before-completeness', kind: 'completeness', messageId };\n            const startEpoch = epoch(chatKey);\n            const startCompletenessGeneration = completenessGeneration(chatKey);\n            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);\n            const prompt = buildCompletenessPrompt({\n                state,\n                chat,\n                assistantMessageId: messageId,\n                scanDepth: settings.scanDepth,\n                relationshipCriteria: settings.relationshipCriteria,\n                relationshipCaps: settings.relationshipCaps,\n                memoryCriteria: settings.memoryCriteria,\n                dossierLimits: settings.dossierLimits,\n                admissionMode: settings.newNpcAdmissionMode,\n            });\n            const parsed = await invokeJson(prompt, 'automatic-completeness');\n            const liveContext = getContext();\n            const liveChat = liveContext.chat || [];\n            const liveMessage = liveChat[messageId] || {};\n            const liveSwipeId = Number.isInteger(liveMessage?.swipe_id) ? liveMessage.swipe_id : 0;\n            if (getChatKey() !== chatKey\n                || epoch(chatKey) !== startEpoch\n                || completenessGeneration(chatKey) !== startCompletenessGeneration\n                || fingerprintMessage(liveMessage) !== startFingerprint\n                || liveSwipeId !== startSwipeId) {\n                return { ok: false, discarded: true, reason: 'stale-completeness', kind: 'completeness', messageId };\n            }\n            const working = normalizeState(state, chatKey);\n            const currentEvidence = [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n');\n            const applied = applyScanResult(working, parsed, {\n                sourceMessageId: messageId,\n                turn: working.turn,\n                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                relationshipContext: '',\n                profileContext: currentEvidence,\n                evidencePolicy: buildExchangeEvidencePolicy(exchange),\n                currentAdmissionText: currentEvidence,\n                admissionMode: settings.newNpcAdmissionMode,\n                dossierLimits: settings.dossierLimits,\n                birthdayFill: {\n                    mode: settings.birthdayFillMode,\n                    calendar: settings.birthdayRandomCalendar,\n                    fallbackDays: settings.birthdayRandomDaysPerMonth,\n                },\n                applyReturnedNpcPatches: true,\n                applyRelationship: false,\n                preservePresence: true,\n                preserveObservation: true,\n                supplementalPass: true,\n            });\n            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);\n            let committed = recordCheckpoint(applied.state, liveChat, messageId, 'completeness-pass');\n            committed.lastScannedMessageId = messageId;\n            committed.updatedAt = Date.now();\n            const persisted = await persist(chatKey, committed);\n            return {\n                ok: true, kind: 'completeness', messageId,\n                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,\n                finalPresentNpcIds: applied.finalPresentNpcIds,\n                worldActiveNpcIds: applied.worldActiveNpcIds,\n                targetNpcIds: applied.targetNpcIds,\n                state: structuredClone(persisted),\n            };\n        });\n    }\n`;
source = replaceRequired(source, `\n    async function importStructuredDossier(reference) {`, completenessFunction + `\n    async function importStructuredDossier(reference) {`, 'completeness method');
source = replaceRequired(source,
    `    async function importStructuredDossier(reference) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };`,
    `    async function importStructuredDossier(reference) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        invalidateCompleteness(chatKey);`,
    'structured import invalidation');
source = replaceRequired(source,
    `    async function refreshDossier(reference) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        return exclusive(chatKey, async () => {`,
    `    async function refreshDossier(reference) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        invalidateCompleteness(chatKey);\n        return exclusive(chatKey, async () => {`,
    'refresh invalidation');
source = replaceRequired(source,
    `    async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };`,
    `    async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };\n        // A user/editor mutation requested while a completeness model call is running wins.\n        invalidateCompleteness(chatKey);`,
    'manual mutation invalidation');
source = replaceRequired(source, `        loadChat,\n        scan,\n        applyEmbeddedScan,`, `        loadChat,\n        scan,\n        completenessScan,\n        applyEmbeddedScan,`, 'public completeness method');
source = replaceRequired(source, `        deleteChatKey,\n        invalidate,\n        branchSafetyStatus,`, `        deleteChatKey,\n        invalidate,\n        invalidateCompleteness,\n        branchSafetyStatus,`, 'public completeness invalidation');
fs.writeFileSync(path, source);
console.log('Applied v0.4.42 routed generation and turn-neutral completeness engine path');

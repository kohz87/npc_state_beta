import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.42 index marker: ' + label);
    return source.replace(from, to);
}

const path = 'v03/index.js';
let source = fs.readFileSync(path, 'utf8');
source = replaceRequired(source,
    `import { runSharedQuietGeneration } from './shared-generation-queue.js';\nimport { checkpointStorageBytes } from './branches.js';`,
    `import { runSharedQuietGeneration } from './shared-generation-queue.js';\nimport { generateWithScanRoute, resolveScanGenerationRoute, scanConnectionProfileOptions } from './scan-connection.js';\nimport { createCompletenessCoordinator } from './completeness-coordinator.js';\nimport { checkpointStorageBytes, fingerprintMessage } from './branches.js';`,
    'routing imports');
source = replaceRequired(source, `let portraitUi = null;`, `let portraitUi = null;\nlet completionCoordinator = null;\nconst completenessUiStatus = new Map();`, 'coordinator state');
source = replaceRequired(source, `    scannerResponseTokens: 7000,`, `    scannerResponseTokens: 7000,\n    scanConnectionProfileId: '',\n    scanAfterEachResponse: false,`, 'new defaults');
source = replaceRequired(source,
    `    settings.scannerResponseTokens = normalizeScannerResponseTokens(settings.scannerResponseTokens);`,
    `    settings.scannerResponseTokens = normalizeScannerResponseTokens(settings.scannerResponseTokens);\n    settings.scanConnectionProfileId = String(settings.scanConnectionProfileId || '').trim().slice(0, 240);\n    settings.scanAfterEachResponse = settings.scanAfterEachResponse === true;`,
    'new setting normalization');
source = replaceRequired(source,
    `async function generateJson({ systemPrompt, prompt, responseLength }) {\n    const ctx = getContext();\n    if (typeof ctx.generateRaw !== 'function') throw new Error('SillyTavern generateRaw() is unavailable.');\n    return runSharedQuietGeneration('npc-state-scan', () => ctx.generateRaw({\n        systemPrompt,\n        prompt,\n        quietToLoud: false,\n        instructOverride: true,\n        responseLength,\n    }));\n}`,
    `async function generateJson({ systemPrompt, prompt, responseLength, route = null, signal = null }) {\n    const selectedRoute = route || resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);\n    return runSharedQuietGeneration('npc-state-scan', () => generateWithScanRoute({\n        getContext, route: selectedRoute, systemPrompt, prompt, responseLength, signal,\n    }));\n}\n\nfunction resolveNpcScanRoute() {\n    return resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);\n}\n\nfunction npcScanProfileOptions() {\n    return scanConnectionProfileOptions(getContext);\n}\n\nfunction currentCompletenessStatus(chatKey = getChatKey()) {\n    return structuredClone(completenessUiStatus.get(chatKey) || { status: 'idle', messageId: null, detail: '' });\n}\n\nfunction setCompletenessStatus(chatKey, status, messageId = null, detail = '') {\n    if (!chatKey || chatKey === 'no-chat') return;\n    completenessUiStatus.set(chatKey, { status, messageId, detail: String(detail || '').slice(0, 400) });\n    ui?.refresh();\n}`,
    'routed generation adapter');
source = replaceRequired(source, `    generate: generateJson,\n    notify,`, `    generate: generateJson,\n    resolveGenerationRoute: resolveNpcScanRoute,\n    notify,`, 'engine route adapter');
source = replaceRequired(source,
    `    persistSettings,\n    onSettingsChanged: updateInjection,`,
    `    persistSettings,\n    getScanConnectionProfiles: npcScanProfileOptions,\n    getCompletenessStatus: currentCompletenessStatus,\n    onSettingsChanged: updateInjection,`,
    'UI route/status adapters');
source = replaceRequired(source,
    `staleUi = createStaleManagementUi({`,
    `completionCoordinator = createCompletenessCoordinator({\n    getSource: sourceForCompletedResponse,\n    getSettings,\n    runEmbedded: processEmbeddedScan,\n    runCompleteness: (messageId, options) => engine.completenessScan(messageId, options),\n    readRecord: source => activeCompletionMeta(source.message),\n    writeRecord: (source, value) => storeCompletionMeta(source.ctx, source.messageId, value),\n    setStatus: setCompletenessStatus,\n    invalidateCompleteness: chatKey => engine.invalidateCompleteness(chatKey),\n    logError: error => console.error('[NPC State Beta] automatic completeness scan failed safely', error),\n});\n\nstaleUi = createStaleManagementUi({`,
    'coordinator wiring');
source = replaceRequired(source,
    `function activeEmbeddedMeta(message) {`,
    `export function completedResponseIdentity(chatKey, messageId, message = {}) {\n    const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;\n    return [String(chatKey || ''), Number(messageId), swipeId, fingerprintMessage(message)].join('|');\n}\n\nfunction activeCompletionMeta(message) {\n    if (!message) return null;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId] : null;\n    if (swipe) return swipe.extra?.npc_state_beta_completion_v1 || null;\n    return message.extra?.npc_state_beta_completion_v1 || null;\n}\n\nfunction storeCompletionMeta(ctx, messageId, value) {\n    const message = ctx?.chat?.[messageId];\n    if (!message) return;\n    const meta = { version: 1, ...structuredClone(value), at: Date.now() };\n    message.extra ??= {};\n    message.extra.npc_state_beta_completion_v1 = meta;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;\n    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_completion_v1 = structuredClone(meta); }\n    persistMessageMutation(ctx, messageId);\n}\n\nfunction activeEmbeddedMeta(message) {`,
    'completion metadata');
source = replaceRequired(source,
    `    if (message.extra) delete message.extra.npc_state_beta_v1;`,
    `    if (message.extra) {\n        delete message.extra.npc_state_beta_v1;\n        delete message.extra.npc_state_beta_completion_v1;\n    }`,
    'message completion metadata invalidation');
source = replaceRequired(source,
    `    if (swipe?.extra) delete swipe.extra.npc_state_beta_v1;`,
    `    if (swipe?.extra) {\n        delete swipe.extra.npc_state_beta_v1;\n        delete swipe.extra.npc_state_beta_completion_v1;\n    }`,
    'swipe completion metadata invalidation');
source = replaceRequired(source,
    `        return result;\n    } catch (error) {\n        console.error('[NPC State Beta] separate recovery scan failed safely', reason, error);`,
    `        return result?.ok ? { ...result, coverage: 'full-recovery' } : { ...result, coverage: 'failure' };\n    } catch (error) {\n        console.error('[NPC State Beta] separate recovery scan failed safely', reason, error);`,
    'full recovery outcome');
source = replaceRequired(source,
    `        return { ok: false, reason: 'recovery-scan-failed', error };`,
    `        return { ok: false, reason: 'recovery-scan-failed', coverage: 'failure', error };`,
    'recovery failure outcome');
source = replaceRequired(source,
    `    if (getSettings().fallbackScan !== true) return { ok: false, reason };`,
    `    if (getSettings().fallbackScan !== true) return { ok: false, reason, coverage: 'failure' };`,
    'fallback failure outcome');
source = replaceRequired(source,
    `    if (settings.enabled === false || settings.autoScan === false) {\n        stripNpcTransportOnly(id);\n        return { ok: false, reason: 'auto-disabled' };\n    }`,
    `    if (settings.enabled === false || settings.autoScan === false) {\n        stripNpcTransportOnly(id);\n        return { ok: false, reason: 'auto-disabled', coverage: 'skipped' };\n    }`,
    'embedded skipped outcome');
source = replaceRequired(source,
    `        if (result?.ok && result?.skipped) refreshSurfaces();\n        return result;\n    } catch (error) {\n        console.error('[NPC State Beta] embedded scan failed safely', error);`,
    `        if (result?.ok && result?.skipped) refreshSurfaces();\n        return { ...result, coverage: result?.ok && !result?.skipped ? 'embedded' : 'embedded-skipped' };\n    } catch (error) {\n        console.error('[NPC State Beta] embedded scan failed safely', error);`,
    'embedded success outcome');
source = replaceRequired(source,
    `        return { ok: false, reason: 'apply-failed', error };\n    }\n}\n\nasync function reapplyStoredEmbeddedPayload`,
    `        return { ok: false, reason: 'apply-failed', coverage: 'failure', error };\n    }\n}\n\nfunction sourceForCompletedResponse(messageId) {\n    const ctx = getContext();\n    const id = Number(messageId);\n    const message = ctx?.chat?.[id];\n    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { valid: false, reason: 'not-assistant-message' };\n    const chatKey = getChatKey();\n    return {\n        valid: true, ctx, chatKey, messageId: id, message,\n        identity: completedResponseIdentity(chatKey, id, message),\n        expectedFingerprint: fingerprintMessage(message),\n        expectedSwipeId: Number.isInteger(message.swipe_id) ? message.swipe_id : 0,\n    };\n}\n\nexport function processCompletedAssistantResponse(messageId) {\n    return completionCoordinator.process(messageId);\n}\n\nasync function reapplyStoredEmbeddedPayload`,
    'completed response wrapper');
source = replaceRequired(source, `        void processEmbeddedScan(messageId);`, `        void processCompletedAssistantResponse(messageId);`, 'MESSAGE_RECEIVED scheduler');
source = replaceRequired(source,
    `        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),`,
    `        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),\n        scanConnectionProfileId: settings.scanConnectionProfileId || '',\n        scanAfterEachResponse: settings.scanAfterEachResponse === true,\n        completeness: currentCompletenessStatus(chatKey),`,
    'debug status fields');
source = replaceRequired(source,
    `    scanMetrics: npcStateScanMetrics,`,
    `    scanMetrics: npcStateScanMetrics,\n    scanConnectionProfiles: npcScanProfileOptions,\n    completenessStatus: () => currentCompletenessStatus(getChatKey()),`,
    'debug public profile surface');
fs.writeFileSync(path, source);
console.log('Applied v0.4.42 alternate scan routing and completed-response scheduling');

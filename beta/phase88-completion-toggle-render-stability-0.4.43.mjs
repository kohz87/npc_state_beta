import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.43 completion marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/completeness-coordinator.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(source,
        `    const logError = adapters.logError || (() => {});\n    const runs = new Map();`,
        `    const logError = adapters.logError || (() => {});\n    const runs = new Map();\n    // PHASE88_COMPLETENESS_TOGGLE_GATE: disabled completeness must not create a second post-response mutation.\n    const embeddedOnlyDone = new Map();\n\n    function rememberEmbeddedOnly(identity, result) {\n        const key = String(identity || '');\n        if (!key) return;\n        embeddedOnlyDone.delete(key);\n        embeddedOnlyDone.set(key, { ...result });\n        while (embeddedOnlyDone.size > 256) embeddedOnlyDone.delete(embeddedOnlyDone.keys().next().value);\n    }`,
        'bounded embedded-only dedupe');

    source = replaceRequired(source,
        `        const recorded = readRecord(source);\n        if (recorded?.identity === source.identity && ['complete', 'failed'].includes(String(recorded.status || ''))) {\n            return { ok: recorded.status === 'complete', skipped: true, reason: 'completion-already-recorded', coverage: recorded.coverage || 'recorded' };\n        }\n        if (runs.has(source.identity)) return runs.get(source.identity);\n        invalidateCompleteness(source.chatKey);\n\n        const work = (async () => {\n            const embedded = await runEmbedded(source.messageId);`,
        `        const recorded = readRecord(source);\n        if (recorded?.identity === source.identity && ['complete', 'failed'].includes(String(recorded.status || ''))) {\n            return { ok: recorded.status === 'complete', skipped: true, reason: 'completion-already-recorded', coverage: recorded.coverage || 'recorded' };\n        }\n        const embeddedOnly = embeddedOnlyDone.get(source.identity);\n        if (embeddedOnly) return { ...embeddedOnly, skipped: true, reason: 'completion-already-recorded' };\n        if (runs.has(source.identity)) return runs.get(source.identity);\n        invalidateCompleteness(source.chatKey);\n\n        const work = (async () => {\n            const settingsAtStart = getSettings();\n            const completenessRequested = settingsAtStart.enabled !== false\n                && settingsAtStart.autoScan !== false\n                && settingsAtStart.scanAfterEachResponse === true;\n            const embedded = await runEmbedded(source.messageId);`,
        'pre-embedded toggle snapshot and in-memory dedupe');

    source = replaceRequired(source,
        `            const settings = getSettings();\n            if (settings.enabled === false || settings.autoScan === false || settings.scanAfterEachResponse !== true) {\n                writeRecord(source, { identity: source.identity, status: 'complete', coverage: 'embedded', completeness: 'disabled', reason: 'completeness-disabled' });\n                setStatus(source.chatKey, 'idle');\n                return { ...embedded, completeness: 'disabled' };\n            }`,
        `            const settingsNow = getSettings();\n            const completenessEnabled = completenessRequested\n                && settingsNow.enabled !== false\n                && settingsNow.autoScan !== false\n                && settingsNow.scanAfterEachResponse === true;\n            if (!completenessEnabled) {\n                const disabled = { ...embedded, completeness: 'disabled' };\n                rememberEmbeddedOnly(source.identity, disabled);\n                setStatus(source.chatKey, 'idle');\n                return disabled;\n            }`,
        'disabled branch without persistent completion bookkeeping');

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        `function storeCompletionMeta(ctx, messageId, value) {\n    const message = ctx?.chat?.[messageId];\n    if (!message) return;\n    const meta = { version: 1, ...structuredClone(value), at: Date.now() };\n    message.extra ??= {};\n    message.extra.npc_state_beta_completion_v1 = meta;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;\n    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_completion_v1 = structuredClone(meta); }\n    persistMessageMutation(ctx, messageId);\n}\n\nfunction activeEmbeddedMeta(message) {`,
        `// PHASE88_RENDERLESS_COMPLETION_METADATA: message.extra bookkeeping must not rebuild peer-rendered message DOM.\nfunction persistMessageMetadata(ctx) {\n    try {\n        const save = ctx?.saveChat?.();\n        if (save?.catch) save.catch(() => {});\n    } catch {}\n}\n\nfunction storeCompletionMeta(ctx, messageId, value) {\n    const message = ctx?.chat?.[messageId];\n    if (!message) return;\n    const meta = { version: 1, ...structuredClone(value), at: Date.now() };\n    message.extra ??= {};\n    message.extra.npc_state_beta_completion_v1 = meta;\n    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;\n    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;\n    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_completion_v1 = structuredClone(meta); }\n    persistMessageMetadata(ctx);\n}\n\nfunction activeEmbeddedMeta(message) {`,
        'renderless completion metadata persistence');
    fs.writeFileSync(path, source);
}

// Source-owned transform stays deterministic when replayed onto the pinned v0.3.2 baseline.
console.log('Applied v0.4.43 completeness toggle gate and render-stable metadata persistence');

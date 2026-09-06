import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function requireReplace(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.31 state-boundary marker: ' + label);
    return source.replace(from, to);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
    if (source.includes(replacement)) return source;
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing v0.4.31 state-boundary range: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// Persist the accepted relationship replay boundary. It is timeline metadata rather than
// relationship scoring policy, so it survives ordinary checkpoint snapshots.
{
    const path = 'v03/schema.js';
    let source = read(path);
    source = requireReplace(
        source,
        `        recovery: null,\n        rebaseBackup: null,`,
        `        recovery: null,\n        relationshipReplayBoundary: null,\n        rebaseBackup: null,`,
        'empty-state replay boundary',
    );
    if (!source.includes('const rawRelationshipReplayBoundary = input.relationshipReplayBoundary')) {
        const marker = `    const rawRebaseBackup = input.rebaseBackup && typeof input.rebaseBackup === 'object' && !Array.isArray(input.rebaseBackup) ? input.rebaseBackup : null;`;
        if (!source.includes(marker)) throw new Error('Missing v0.4.31 schema insertion marker');
        const addition = `    // PHASE64_REBASE_STATE_BOUNDARIES: preserve-mode rebase stores the accepted lineage boundary so retries/reloads cannot rescore it.\n    const rawRelationshipReplayBoundary = input.relationshipReplayBoundary && typeof input.relationshipReplayBoundary === 'object' && !Array.isArray(input.relationshipReplayBoundary) ? input.relationshipReplayBoundary : null;\n    const replayThroughMessageId = Number.isInteger(rawRelationshipReplayBoundary?.throughMessageId) && rawRelationshipReplayBoundary.throughMessageId >= 0\n        ? rawRelationshipReplayBoundary.throughMessageId\n        : null;\n    const replayLineage = Array.isArray(rawRelationshipReplayBoundary?.lineage)\n        ? rawRelationshipReplayBoundary.lineage.map(value => String(value || '')).filter(Boolean)\n        : [];\n    const relationshipReplayBoundary = replayThroughMessageId !== null && replayLineage.length > replayThroughMessageId\n        ? {\n            throughMessageId: replayThroughMessageId,\n            lineage: replayLineage.slice(0, replayThroughMessageId + 1),\n            acceptedAt: Number(rawRelationshipReplayBoundary.acceptedAt) || null,\n        }\n        : null;\n`;
        source = source.replace(marker, addition + marker);
    }
    source = requireReplace(
        source,
        `        recovery: normalizeRecoveryState(input.recovery),\n        rebaseBackup,`,
        `        recovery: normalizeRecoveryState(input.recovery),\n        relationshipReplayBoundary,\n        rebaseBackup,`,
        'normalized replay boundary',
    );
    write(path, source);
}

// Preserve rebase recovery metadata outside timeline checkpoints and establish the accepted
// relationship boundary before the new branch base snapshot is created.
{
    const path = 'v03/branches.js';
    let source = read(path);
    source = requireReplace(
        source,
        `    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;\n    next.checkpoints = [];`,
        `    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;\n    // PHASE64_REBASE_STATE_BOUNDARIES: preserved relationship state already represents the accepted timeline through this boundary.\n    next.relationshipReplayBoundary = mode === 'preserve' && latestAssistantId >= 0\n        ? { throughMessageId: latestAssistantId, lineage: chatLineage(chat, latestAssistantId), acceptedAt: rebasedAt }\n        : null;\n    next.checkpoints = [];`,
        'rebase accepted replay boundary',
    );
    source = requireReplace(
        source,
        `    restored.branchBase = structuredClone(normalized.branchBase || null);\n    restored.branchHeadLineage = currentLineage;`,
        `    restored.branchBase = structuredClone(normalized.branchBase || null);\n    // PHASE64_REBASE_STATE_BOUNDARIES: rebase backup is durable recovery metadata, not rollback timeline state.\n    restored.rebaseBackup = structuredClone(normalized.rebaseBackup || null);\n    restored.branchHeadLineage = currentLineage;`,
        'checkpoint restore retains rebase backup',
    );
    write(path, source);
}

{
    const path = 'v03/engine.js';
    let source = read(path);

    if (!source.includes('function relationshipReplayProtected(state, chat = [], messageId = null)')) {
        const marker = `function recoveryLineageEqual(left = [], right = []) {\n    return left.length === right.length && left.every((value, index) => value === right[index]);\n}\n`;
        if (!source.includes(marker)) throw new Error('Missing v0.4.31 replay helper insertion marker');
        const addition = `// PHASE64_REBASE_STATE_BOUNDARIES: accepted preserve-rebase history cannot be scored again after refresh failure/reload.\nfunction relationshipReplayProtected(state, chat = [], messageId = null) {\n    const boundary = state?.relationshipReplayBoundary;\n    if (!Number.isInteger(messageId) || messageId < 0 || !Number.isInteger(boundary?.throughMessageId) || messageId > boundary.throughMessageId) return false;\n    const accepted = Array.isArray(boundary.lineage) ? boundary.lineage.slice(0, messageId + 1) : [];\n    const current = chatLineage(chat, messageId);\n    return accepted.length === current.length && accepted.every((value, index) => value === current[index]);\n}\n`;
        source = source.replace(marker, marker + addition);
    }

    source = requireReplace(
        source,
        `            const exchange = currentExchange(chat, messageId);\n            if (!exchange) return { ok: false, reason: 'not-assistant-message' };\n            const startEpoch = epoch(chatKey);`,
        `            const exchange = currentExchange(chat, messageId);\n            if (!exchange) return { ok: false, reason: 'not-assistant-message' };\n            const relationshipApplyRequested = applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true;\n            const replayProtectedRelationship = relationshipReplayProtected(state, chat, messageId);\n            const startEpoch = epoch(chatKey);`,
        'scan replay protection decision',
    );
    source = requireReplace(
        source,
        `                applyReturnedNpcPatches: true,\n                applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true,`,
        `                applyReturnedNpcPatches: true,\n                applyRelationship: relationshipApplyRequested && !replayProtectedRelationship,`,
        'scan replay protection application',
    );

    const embeddedStart = source.indexOf('    async function applyEmbeddedScan(messageId, parsed, options = {}) {');
    const embeddedEnd = source.indexOf('\n    async function importStructuredDossier(reference) {', embeddedStart);
    if (embeddedStart < 0 || embeddedEnd < 0) throw new Error('Missing v0.4.31 embedded scan range');
    let embedded = source.slice(embeddedStart, embeddedEnd);
    embedded = requireReplace(
        embedded,
        `                applyReturnedNpcPatches: true,\n            });`,
        `                applyReturnedNpcPatches: true,\n                applyRelationship: !relationshipReplayProtected(state, chat, messageId),\n            });`,
        'embedded replay protection',
    );
    source = source.slice(0, embeddedStart) + embedded + source.slice(embeddedEnd);

    const replacement = `    async function previewRebase({ relationshipMode = 'rollback' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        const state = await loadChat(chatKey);\n        if (getChatKey() !== chatKey) return { ok: false, discarded: true, reason: 'chat-changed', stage: 'preview-after-load' };\n        if (!state) return { ok: false, reason: 'not-hydrated' };\n        const context = getContext();\n        if (getChatKey() !== chatKey) return { ok: false, discarded: true, reason: 'chat-changed', stage: 'preview-before-read' };\n        const chat = context.chat || [];\n        const mode = normalizeRebaseRelationshipMode(relationshipMode);\n        return { ok: true, ...previewRelationshipRebase(state, chat, { relationshipMode: mode }) };\n    }\n\n    async function reconcileBranch({ rescan = false, rebase = false, relationshipMode = 'preserve' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };\n        invalidate(chatKey);\n        let result;\n        const mode = rebase ? normalizeRebaseRelationshipMode(relationshipMode) : 'preserve';\n        const chatChanged = stage => ({ ok: false, changed: false, discarded: true, reason: 'chat-changed', stage });\n        await exclusive(chatKey, async () => {\n            // A queued reconcile/rebase is owned by the chat that requested it. Never borrow\n            // whichever chat happens to be active when its queue slot finally opens.\n            if (getChatKey() !== chatKey) {\n                result = chatChanged('after-queue');\n                return;\n            }\n            const state = await loadChat(chatKey);\n            if (getChatKey() !== chatKey) {\n                result = chatChanged('after-load');\n                return;\n            }\n            if (!state) {\n                result = { ok: false, reason: 'not-hydrated' };\n                return;\n            }\n            if (recoveryBlocksLiveScan(state)) {\n                result = { ok: false, reason: 'recovery-active', recovery: decoratedRecoveryStatus(state.recovery, chatKey) };\n                return;\n            }\n            const context = getContext();\n            if (getChatKey() !== chatKey) {\n                result = chatChanged('before-read');\n                return;\n            }\n            const chat = context.chat || [];\n            if (rebase) {\n                const rebased = rebaseToCurrentChat(state, chat, { relationshipMode: mode });\n                if (!rebased.rebaseBackup?.snapshot) throw new Error('Timeline rebase refused to persist without a restorable pre-rebase snapshot.');\n                if (getChatKey() !== chatKey) {\n                    result = chatChanged('before-commit');\n                    return;\n                }\n                const persisted = await persist(chatKey, rebased);\n                result = {\n                    ok: true,\n                    changed: true,\n                    rebased: true,\n                    relationshipMode: mode,\n                    unsafeDivergence: false,\n                    checkpoint: persisted.branchBase || null,\n                    rebaseBackup: persisted.rebaseBackup ? { createdAt: persisted.rebaseBackup.createdAt, relationshipMode: persisted.rebaseBackup.relationshipMode } : null,\n                    state: structuredClone(persisted),\n                };\n                return;\n            }\n            const reconciled = reconcileToCurrentBranch(state, chat);\n            if (reconciled.unsafeDivergence) {\n                // Publish the blocked state before durable I/O. If persistence fails, every\n                // live consumer still observes rebase-required and scanning remains disabled.\n                const blocked = normalizeState(reconciled.state, chatKey);\n                cache.set(chatKey, blocked);\n                hydration.set(chatKey, { status: 'ready', error: null });\n                onStateChanged(chatKey, structuredClone(blocked));\n                let persisted = blocked;\n                let persistenceError = null;\n                try {\n                    persisted = await persist(chatKey, blocked);\n                } catch (error) {\n                    persistenceError = error;\n                    hydration.set(chatKey, { status: 'ready', error });\n                }\n                result = {\n                    ok: false,\n                    reason: 'rebase-required',\n                    changed: true,\n                    unsafeDivergence: true,\n                    persistenceFailed: Boolean(persistenceError),\n                    persistenceError: persistenceError ? String(persistenceError?.message || persistenceError).slice(0, 500) : '',\n                    branchSafety: structuredClone(persisted.branchSafety),\n                    state: structuredClone(persisted),\n                };\n                return;\n            }\n            if (!reconciled.changed) {\n                result = { ok: true, changed: false, unsafeDivergence: false, checkpoint: reconciled.checkpoint || null, state: structuredClone(reconciled.state) };\n                return;\n            }\n            if (getChatKey() !== chatKey) {\n                result = chatChanged('before-commit');\n                return;\n            }\n            const persisted = await persist(chatKey, reconciled.state);\n            result = { ok: true, changed: true, unsafeDivergence: false, checkpoint: reconciled.checkpoint || null, state: structuredClone(persisted) };\n        });\n        if (result?.unsafeDivergence || !result?.ok) return result;\n        if (rescan && (rebase || getSettings().branchRescan !== false)) {\n            if (getChatKey() !== chatKey) {\n                result.rescan = chatChanged('before-refresh');\n                return result;\n            }\n            const context = getContext();\n            if (getChatKey() !== chatKey) {\n                result.rescan = chatChanged('before-refresh-read');\n                return result;\n            }\n            const id = latestAssistantMessageId(context.chat || []);\n            if (id >= 0) result.rescan = await scan(id, {\n                manual: rebase === true,\n                force: true,\n                applyRelationship: rebase && mode === 'preserve' ? false : null,\n            });\n        }\n        return result;\n    }\n\n`;
    source = replaceRange(
        source,
        `    async function previewRebase({ relationshipMode = 'rollback' } = {}) {`,
        `    return Object.freeze({`,
        replacement,
        'preview/reconcile chat ownership and unsafe publication',
    );

    write(path, source);
}

console.log('Applied NPC State v0.4.31 rebase state and operation-boundary hardening');

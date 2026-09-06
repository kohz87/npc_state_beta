import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function requireReplace(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.32 operation-boundary marker: ' + label);
    return source.replace(from, to);
}

// Keep only the still-valid accepted relationship prefix when an explicit rollback follows
// a preserve rebase. This protects previously accepted exchanges without suppressing rewritten
// or genuinely new exchanges after the first lineage divergence.
{
    const path = 'v03/branches.js';
    let source = read(path);
    if (!source.includes('function retainValidRelationshipReplayBoundary(boundary, chat = [])')) {
        const marker = `export function rebaseToCurrentChat(state, chat = [], { relationshipMode = 'preserve' } = {}) {`;
        if (!source.includes(marker)) throw new Error('Missing v0.4.32 rebase helper insertion marker');
        const addition = `function retainValidRelationshipReplayBoundary(boundary, chat = []) {\n    if (!Number.isInteger(boundary?.throughMessageId) || boundary.throughMessageId < 0 || !Array.isArray(boundary?.lineage)) return null;\n    const acceptedLineage = boundary.lineage.map(value => String(value || ''));\n    const currentLineage = chatLineage(chat);\n    const limit = Math.min(boundary.throughMessageId, acceptedLineage.length - 1, currentLineage.length - 1);\n    let throughMessageId = -1;\n    for (let i = 0; i <= limit; i += 1) {\n        if (acceptedLineage[i] !== currentLineage[i]) break;\n        if (String(acceptedLineage[i] || '').startsWith('a:')) throughMessageId = i;\n    }\n    if (throughMessageId < 0) return null;\n    return {\n        throughMessageId,\n        lineage: acceptedLineage.slice(0, throughMessageId + 1),\n        acceptedAt: Number(boundary.acceptedAt) || null,\n    };\n}\n\n`;
        source = source.replace(marker, addition + marker);
    }
    source = requireReplace(
        source,
        `    next.relationshipReplayBoundary = mode === 'preserve' && latestAssistantId >= 0\n        ? { throughMessageId: latestAssistantId, lineage: chatLineage(chat, latestAssistantId), acceptedAt: rebasedAt }\n        : null;`,
        `    next.relationshipReplayBoundary = mode === 'preserve' && latestAssistantId >= 0\n        ? { throughMessageId: latestAssistantId, lineage: chatLineage(chat, latestAssistantId), acceptedAt: rebasedAt }\n        : retainValidRelationshipReplayBoundary(source.relationshipReplayBoundary, chat);`,
        'rollback replay-boundary retention',
    );
    write(path, source);
}

// Manual dossier mutations are owned by the chat that initiated them. They must never wait
// behind another operation and then borrow the currently visible chat's timeline/checkpoints.
{
    const path = 'v03/engine.js';
    let source = read(path);
    source = requireReplace(
        source,
        `    async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };\n        return exclusive(chatKey, async () => {\n            const state = normalizeState(await loadChat(chatKey), chatKey);\n            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };\n            const result = await mutator(state);\n            if (result === false) return { ok: false, reason: 'rejected' };\n            if (result?.rejected) return { ok: false, reason: String(result.rejected) };\n            const chat = getContext().chat || [];\n            const messageId = latestAssistantMessageId(chat);\n            let next = normalizeState(state, chatKey);\n            if (messageId >= 0) next = recordCheckpoint(next, chat, messageId, checkpointReason);\n            next.updatedAt = Date.now();\n            const persisted = await persist(chatKey, next);\n            return { ok: true, label, state: structuredClone(persisted), result };\n        });\n    }`,
        `    async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {\n        const chatKey = getChatKey();\n        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };\n        const chatChanged = stage => ({ ok: false, discarded: true, reason: 'chat-changed', stage });\n        return exclusive(chatKey, async () => {\n            if (getChatKey() !== chatKey) return chatChanged('mutation-after-queue');\n            const state = normalizeState(await loadChat(chatKey), chatKey);\n            if (getChatKey() !== chatKey) return chatChanged('mutation-after-load');\n            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };\n            const context = getContext();\n            if (getChatKey() !== chatKey) return chatChanged('mutation-before-read');\n            const chat = context.chat || [];\n            if (getChatKey() !== chatKey) return chatChanged('mutation-before-apply');\n            const result = await mutator(state, chat);\n            if (result === false) return { ok: false, reason: 'rejected' };\n            if (result?.rejected) return { ok: false, reason: String(result.rejected) };\n            if (getChatKey() !== chatKey) return chatChanged('mutation-before-commit');\n            const messageId = latestAssistantMessageId(chat);\n            let next = normalizeState(state, chatKey);\n            if (messageId >= 0) next = recordCheckpoint(next, chat, messageId, checkpointReason);\n            if (getChatKey() !== chatKey) return chatChanged('mutation-before-persist');\n            next.updatedAt = Date.now();\n            const persisted = await persist(chatKey, next);\n            return { ok: true, label, state: structuredClone(persisted), result };\n        });\n    }`,
        'chat-owned mutate helper',
    );

    source = requireReplace(source, `        return mutate('add', state => {`, `        return mutate('add', (state, chat) => {`, 'add NPC origin chat');
    source = requireReplace(
        source,
        `            const chat = getContext().chat || [];\n            const messageId = latestAssistantMessageId(chat);\n            const npc = normalizeNpc({`,
        `            const messageId = latestAssistantMessageId(chat);\n            const npc = normalizeNpc({`,
        'add NPC origin chat context',
    );

    source = requireReplace(source, `        return mutate('update', state => {`, `        return mutate('update', (state, chat) => {`, 'update NPC origin chat');
    source = requireReplace(
        source,
        `                        sourceMessageId: latestAssistantMessageId(getContext().chat || []), turn: Number.isInteger(state.turn) ? state.turn : null, at: Date.now(),`,
        `                        sourceMessageId: latestAssistantMessageId(chat), turn: Number.isInteger(state.turn) ? state.turn : null, at: Date.now(),`,
        'manual relationship event origin chat',
    );
    source = requireReplace(
        source,
        `                const reconciled = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(getContext().chat || []), dossierLimits: getSettings().dossierLimits });`,
        `                const reconciled = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(chat), dossierLimits: getSettings().dossierLimits });`,
        'family graph origin chat',
    );

    source = requireReplace(source, `        return mutate(archived ? 'archive' : 'restore', state => {`, `        return mutate(archived ? 'archive' : 'restore', (state, chat) => {`, 'archive/restore origin chat');
    source = requireReplace(
        source,
        `                const chat = getContext().chat || [];\n                const messageId = latestAssistantMessageId(chat);\n                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);`,
        `                const messageId = latestAssistantMessageId(chat);\n                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);`,
        'restore origin chat context',
    );

    source = requireReplace(source, `        return mutate('reset-staleness', state => {`, `        return mutate('reset-staleness', (state, chat) => {`, 'stale reset origin chat');
    source = requireReplace(
        source,
        `            const chat = getContext().chat || [];\n            const messageId = latestAssistantMessageId(chat);\n            const next = structuredClone(npc);`,
        `            const messageId = latestAssistantMessageId(chat);\n            const next = structuredClone(npc);`,
        'stale reset origin chat context',
    );

    write(path, source);
}

console.log('Applied NPC State v0.4.32 operation-context and rollback replay-boundary hardening');

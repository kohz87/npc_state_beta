export function encodeKeyPart(value) {
    return encodeURIComponent(String(value ?? '').trim());
}

export function buildQualifiedChatKey(kind, ownerId, chatId) {
    const prefix = kind === 'group' ? 'group' : (kind === 'chat' ? 'chat' : '');
    const owner = String(ownerId ?? '').trim();
    const chat = String(chatId ?? '').replace(/\.jsonl$/i, '').trim();
    if (!prefix || !owner || !chat) return '';
    return `${prefix}:${encodeKeyPart(owner)}:${encodeKeyPart(chat)}`;
}

export function getCharacterOwnerId(ctx = {}) {
    const id = ctx.characterId;
    if (id === undefined || id === null) return '';
    return String(ctx.characters?.[id]?.avatar || '').trim();
}

export function getChatIdentity(ctx = {}) {
    const raw = ctx.chatId || ctx.getCurrentChatId?.();
    const groupId = ctx.groupId;
    if (groupId !== undefined && groupId !== null && String(groupId).trim()) {
        const ownerId = String(groupId).trim();
        return raw
            ? { key: buildQualifiedChatKey('group', ownerId, raw), kind: 'group', ownerId, chatId: String(raw), pending: false }
            : { key: `group-pending:${encodeKeyPart(ownerId)}`, kind: 'group', ownerId, chatId: '', pending: true };
    }
    const ownerId = getCharacterOwnerId(ctx);
    if (raw && ownerId) return { key: buildQualifiedChatKey('chat', ownerId, raw), kind: 'chat', ownerId, chatId: String(raw), pending: false };
    if (raw) return { key: `chat-pending:${encodeKeyPart(raw)}`, kind: 'chat', ownerId: '', chatId: String(raw), pending: true };
    if (ownerId) return { key: `character-pending:${encodeKeyPart(ownerId)}`, kind: 'chat', ownerId, chatId: '', pending: true };
    return { key: 'no-chat', kind: 'none', ownerId: '', chatId: '', pending: true };
}


export function parseQualifiedChatKey(value) {
    const match = String(value || '').match(/^(chat|group):([^:]+):(.+)$/);
    if (!match) return null;
    try {
        return { kind: match[1], ownerId: decodeURIComponent(match[2]), chatId: decodeURIComponent(match[3]) };
    } catch {
        return null;
    }
}

export function normalizeLifecycleChatId(value) {
    return String(value ?? '').replace(/\.jsonl$/i, '').trim();
}

export function resolveLifecycleChatKey(dataFiles = {}, { kind = 'chat', ownerId = '', chatId = '' } = {}) {
    const type = kind === 'group' ? 'group' : 'chat';
    const id = normalizeLifecycleChatId(chatId);
    const owner = String(ownerId || '').trim();
    if (!id) return '';
    if (owner) {
        const exact = buildQualifiedChatKey(type, owner, id);
        return dataFiles?.[exact]?.path ? exact : '';
    }
    const matches = Object.keys(dataFiles || {}).filter(key => {
        const parsed = parseQualifiedChatKey(key);
        return parsed?.kind === type && normalizeLifecycleChatId(parsed.chatId) === id && dataFiles?.[key]?.path;
    });
    return matches.length === 1 ? matches[0] : '';
}

export function resolveRenameLifecycleKeys(dataFiles = {}, eventData = {}) {
    const oldId = normalizeLifecycleChatId(eventData?.oldFileName);
    const newId = normalizeLifecycleChatId(eventData?.newFileName);
    if (!oldId || !newId || oldId === newId) return null;
    const groupOwner = eventData?.groupId === undefined || eventData?.groupId === null ? '' : String(eventData.groupId).trim();
    const chatOwner = eventData?.avatarId === undefined || eventData?.avatarId === null ? '' : String(eventData.avatarId).trim();
    const kind = groupOwner ? 'group' : 'chat';
    const ownerId = groupOwner || chatOwner;
    const oldKey = resolveLifecycleChatKey(dataFiles, { kind, ownerId, chatId: oldId });
    if (!oldKey) return null;
    const parsed = parseQualifiedChatKey(oldKey);
    if (!parsed?.ownerId) return null;
    const newKey = buildQualifiedChatKey(kind, parsed.ownerId, newId);
    if (!newKey || newKey === oldKey) return null;
    return { kind, ownerId: parsed.ownerId, oldId, newId, oldKey, newKey };
}


export function qualifiedChatKeysForOwner(dataFiles = {}, { kind = 'chat', ownerId = '' } = {}) {
    const type = kind === 'group' ? 'group' : 'chat';
    const owner = String(ownerId || '').trim();
    if (!owner) return [];
    return Object.keys(dataFiles || {}).filter(key => {
        const parsed = parseQualifiedChatKey(key);
        return parsed?.kind === type && parsed.ownerId === owner && Boolean(dataFiles?.[key]?.path);
    }).sort();
}

export function characterOwnerRenamePairs(dataFiles = {}, oldOwnerId = '', newOwnerId = '') {
    const oldOwner = String(oldOwnerId || '').trim();
    const newOwner = String(newOwnerId || '').trim();
    if (!oldOwner || !newOwner || oldOwner === newOwner) return [];
    return qualifiedChatKeysForOwner(dataFiles, { kind: 'chat', ownerId: oldOwner }).map(oldKey => {
        const parsed = parseQualifiedChatKey(oldKey);
        const newKey = parsed ? buildQualifiedChatKey('chat', newOwner, parsed.chatId) : '';
        return { oldKey, newKey, chatId: parsed?.chatId || '', oldOwnerId: oldOwner, newOwnerId: newOwner };
    }).filter(pair => pair.newKey && pair.newKey !== pair.oldKey);
}

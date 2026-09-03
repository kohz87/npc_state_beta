import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing deep-hardening marker: ' + label);
    return source.replace(from, to);
}

function replaceAllRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing deep-hardening marker: ' + label);
    return source.replaceAll(from, to);
}

// 1) Bundle compatibility: 0.4.1 must accept the v3-compatible bundle schema it emits.
let bundle = read('v03/bundle.js');
bundle = replaceRequired(
    bundle,
    "    if (!/^0\\.3(?:\\.|$)/.test(String(raw.appVersion || ''))) throw new Error(`Bundle app version ${text(raw.appVersion, 80) || 'missing'} is not a v0.3 bundle.`);",
    "    const appVersion = String(raw.appVersion || '');\n    if (!/^(?:0\\.3(?:\\.|$)|0\\.4(?:\\.|$))/.test(appVersion)) throw new Error(`Bundle app version ${text(appVersion, 80) || 'missing'} is not compatible with the v3 dossier schema.`);",
    'bundle app-version compatibility',
);
bundle = replaceAllRequired(bundle, 'v0.3 dossier', 'v3-compatible dossier', 'bundle copy wording');
bundle = replaceAllRequired(bundle, 'v0.3 schema', 'v3-compatible schema', 'bundle schema wording');
write('v03/bundle.js', bundle);

let bundleUi = read('v03/bundle-ui.js');
bundleUi = replaceAllRequired(bundleUi, 'v0.3 dossier data only', 'v3-compatible dossier data only', 'bundle UI intro');
bundleUi = replaceAllRequired(bundleUi, 'full-chat v0.3 backup', 'full-chat NPC State backup', 'bundle UI full export');
bundleUi = replaceAllRequired(bundleUi, 'selected v0.3 dossier bundle', 'selected NPC State dossier bundle', 'bundle UI selected export');
write('v03/bundle-ui.js', bundleUi);

// 2) Relationship-history settings must remain inside the beta namespace.
let historyUi = read('v03/relationship-history-ui.js');
historyUi = replaceAllRequired(historyUi, 'extension_settings.npc_state', 'extension_settings.npc_state_beta', 'relationship-history beta namespace');
write('v03/relationship-history-ui.js', historyUi);

// 3) Embedded apply needs the same stale-operation guard as separate scans.
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "            const ctx = getContext();\n            const chat = ctx.chat || [];\n            const message = chat[messageId];\n            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };\n            const working = normalizeState(state, chatKey);",
    "            const ctx = getContext();\n            const chat = ctx.chat || [];\n            const message = chat[messageId];\n            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };\n            const startEpoch = epoch(chatKey);\n            const startFingerprint = fingerprintMessage(message);\n            const working = normalizeState(state, chatKey);",
    'embedded stale-operation capture',
);
engine = replaceRequired(
    engine,
    "            let committed = recordCheckpoint(stale.state, chat, messageId, 'embedded-foreground');",
    "            const liveCtx = getContext();\n            const liveChat = liveCtx.chat || [];\n            if (getChatKey() !== chatKey || epoch(chatKey) !== startEpoch || fingerprintMessage(liveChat[messageId] || {}) !== startFingerprint) {\n                return { ok: false, discarded: true, reason: 'stale-operation', messageId };\n            }\n            let committed = recordCheckpoint(stale.state, liveChat, messageId, 'embedded-foreground');",
    'embedded stale-operation commit guard',
);

// 4) Unsafe branch state must block targeted refresh and ordinary durable mutations.
engine = replaceRequired(
    engine,
    "            if (state?.branchSafety?.status === 'prebaseline-diverged') return { ok: false, reason: 'branch-unsafe' };",
    "            if (state?.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };",
    'targeted refresh branch safety',
);
engine = replaceRequired(
    engine,
    "            const state = normalizeState(await loadChat(chatKey), chatKey);\n            const result = await mutator(state);",
    "            const state = normalizeState(await loadChat(chatKey), chatKey);\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };\n            const result = await mutator(state);",
    'manual mutation branch safety',
);

// 5) Targeted refresh must hard-filter to the requested stable identity.
engine = replaceRequired(
    engine,
    "            const parsed = await invokeJson(prompt, `targeted-${npc.id}`);\n            const liveChat = getContext().chat || [];",
    "            const parsedRaw = await invokeJson(prompt, `targeted-${npc.id}`);\n            const parsed = {\n                ...parsedRaw,\n                exchangeActiveNpcIds: [],\n                finalPresentNpcIds: [],\n                worldActiveNpcIds: [],\n                npcs: (parsedRaw.npcs || []).filter(patch => {\n                    const patchId = String(patch?.id || '').trim();\n                    return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);\n                }).slice(0, 1),\n                socialEdges: [],\n            };\n            const liveChat = getContext().chat || [];",
    'targeted refresh deterministic filter',
);
write('v03/engine.js', engine);

// 6) Model-produced collection values must not decay to [object Object].
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "function list(value, max = 12, itemMax = 500) {\n    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);\n    const out = [];\n    const seen = new Set();\n    for (const item of input) {\n        const clean = text(item, itemMax);",
    "function collectionEntry(value, itemMax = 500) {\n    if (value && typeof value === 'object' && !Array.isArray(value)) {\n        const candidates = [value.text, value.value, value.summary, value.description, value.name, value.label, value.memory, value.mannerism, value.behavior, value.trait, value.alias];\n        for (const candidate of candidates) {\n            const clean = text(candidate, itemMax);\n            if (clean && clean !== '[object Object]') return clean;\n        }\n        return '';\n    }\n    const clean = text(value, itemMax);\n    return clean === '[object Object]' ? '' : clean;\n}\n\nfunction list(value, max = 12, itemMax = 500) {\n    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);\n    const out = [];\n    const seen = new Set();\n    for (const item of input) {\n        const clean = collectionEntry(item, itemMax);",
    'generic collection normalization',
);
write('v03/schema.js', schema);

let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "function appendUnique(existing = [], incoming = [], max = 12) {\n    const out = [...existing];\n    const seen = new Set(existing.map(item => normalizeName(item)));\n    for (const item of incoming || []) {\n        const clean = String(item ?? '').trim();",
    "function collectionPatchEntry(value) {\n    if (value && typeof value === 'object' && !Array.isArray(value)) {\n        for (const candidate of [value.text, value.value, value.summary, value.description, value.name, value.label, value.memory, value.mannerism, value.behavior, value.trait, value.alias]) {\n            const clean = String(candidate ?? '').trim();\n            if (clean && clean !== '[object Object]') return clean;\n        }\n        return '';\n    }\n    const clean = String(value ?? '').trim();\n    return clean === '[object Object]' ? '' : clean;\n}\n\nfunction appendUnique(existing = [], incoming = [], max = 12) {\n    const out = [...existing];\n    const seen = new Set(existing.map(item => normalizeName(item)));\n    for (const item of incoming || []) {\n        const clean = collectionPatchEntry(item);",
    'scanner collection normalization',
);
write('v03/scanner.js', scanner);

// 7) Portrait payloads must not be duplicated through the rollback history.
schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export function snapshotForCheckpoint(state) {\n    const copy = normalizeState(state, state?.chatKey || '');\n    copy.checkpoints = [];\n    copy.branchBase = null;\n    return copy;\n}",
    "export function snapshotForCheckpoint(state) {\n    const copy = normalizeState(state, state?.chatKey || '');\n    copy.checkpoints = [];\n    copy.branchBase = null;\n    // Portrait binary/data URLs are durable presentation assets, not timeline state.\n    // Excluding them keeps up to 48 rollback checkpoints from multiplying megabytes\n    // of identical image data. Restoration merges the current portrait back by id.\n    copy.npcs = copy.npcs.map(npc => ({ ...npc, portrait: null }));\n    return copy;\n}",
    'portrait-light checkpoint snapshots',
);
write('v03/schema.js', schema);

let branches = read('v03/branches.js');
branches = replaceRequired(
    branches,
    "function preserveTombstones(restored, current) {\n    const tombstones = new Set(current.deletedNpcIds || []);",
    "function preserveCurrentPresentation(restored, current) {\n    const currentById = new Map((current?.npcs || []).map(npc => [npc.id, npc]));\n    restored.npcs = (restored.npcs || []).map(npc => {\n        const live = currentById.get(npc.id);\n        return live?.portrait ? { ...npc, portrait: structuredClone(live.portrait) } : npc;\n    });\n    return restored;\n}\n\nfunction preserveTombstones(restored, current) {\n    const tombstones = new Set(current.deletedNpcIds || []);",
    'checkpoint presentation restoration helper',
);
branches = replaceRequired(
    branches,
    "    const restored = preserveTombstones(normalizeState(checkpoint.snapshot, normalized.chatKey), normalized);",
    "    const restored = preserveCurrentPresentation(preserveTombstones(normalizeState(checkpoint.snapshot, normalized.chatKey), normalized), normalized);",
    'checkpoint portrait merge',
);
write('v03/branches.js', branches);

// 8) Inventory Block v0.5 transport compatibility in prompts, truncation recovery, and fingerprints.
let foreground = read('v03/foreground.js');
foreground = replaceRequired(
    foreground,
    "const INVENTORY_TAIL = /<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*$/i;",
    "const INVENTORY_TAIL = /(?:<!--\\s*(?:INVENTORY_BLOCK_UPDATE|INVENTORY_BLOCK_V05)\\b[\\s\\S]*$|<Inventory\\b[\\s\\S]*$)/i;",
    'Inventory v0.5 truncated-tail preservation',
);
write('v03/foreground.js', foreground);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'If Inventory Block requires INVENTORY_BLOCK_UPDATE to be final, place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',",
    "        'If Inventory Block emits an Inventory machine snapshot (including INVENTORY_BLOCK_V05 or older INVENTORY_BLOCK_UPDATE transport), keep it standalone and place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',",
    'Inventory v0.5 foreground wording',
);
write('v03/injection.js', injection);

branches = read('v03/branches.js');
branches = replaceRequired(
    branches,
    "    const withoutInventory = withoutNpc.replace(/<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*?-->\\.?/gi, '');\n    return withoutInventory.replace(/\\n{3,}/g, '\\n\\n').trimEnd();",
    "    const withoutInventory = withoutNpc\n        .replace(/<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*?-->\\.?/gi, '')\n        .replace(/<!--\\s*INVENTORY_BLOCK_V05\\b[\\s\\S]*?-->/gi, '')\n        .replace(/<Inventory\\b[^>]*>[\\s\\S]*?<\\/Inventory\\s*>/gi, '');\n    return withoutInventory.replace(/\\n{3,}/g, '\\n\\n').trimEnd();",
    'Inventory v0.5 branch canonicalization',
);
write('v03/branches.js', branches);

// 9) Injection budget must include the identity directory, not just full dossiers.
injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "    const directory = identityDirectory(state);\n    let dossiers = '';",
    "    const directoryRaw = identityDirectory(state);\n    const directory = directoryRaw.slice(0, maxChars);\n    const remainingChars = Math.max(0, maxChars - directory.length);\n    let dossiers = '';",
    'total injection budget directory accounting',
);
injection = replaceRequired(
    injection,
    "        if ((dossiers + block).length > maxChars) break;",
    "        if ((dossiers + block).length > remainingChars) break;",
    'total injection budget dossier accounting',
);
write('v03/injection.js', injection);

// 10) Checkpoints should prefer one canonical snapshot per assistant message id to prevent swipe churn consuming the whole window.
branches = read('v03/branches.js');
branches = replaceRequired(
    branches,
    "    const existing = next.checkpoints.findIndex(item => item.messageId === messageId && arraysEqual(item.lineage, lineage));\n    if (existing >= 0) next.checkpoints[existing] = checkpoint;\n    else next.checkpoints.push(checkpoint);",
    "    // One current rollback snapshot per assistant message id. Swipe/regeneration variants\n    // replace that message's checkpoint instead of consuming the entire 48-entry window.\n    next.checkpoints = next.checkpoints.filter(item => item.messageId !== messageId);\n    next.checkpoints.push(checkpoint);",
    'checkpoint swipe churn compaction',
);
write('v03/branches.js', branches);

let changelog = read('CHANGELOG.md');
const lines = [
    '- Deep hardening: fixed 0.4.1 bundle self-compatibility, beta relationship-history namespace isolation, embedded stale-operation protection, unsafe-branch mutation gates, and deterministic targeted Refresh isolation.',
    '- Deep hardening: added Inventory Block v0.5 transport compatibility, portrait-light rollback snapshots, generic structured collection normalization, total injection-budget accounting, and per-message checkpoint compaction for swipe-heavy chats.',
];
for (const line of lines.reverse()) {
    if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
}
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 deep hardening pass');

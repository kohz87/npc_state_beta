import fs from 'node:fs';

const VERSION = '0.4.0-beta.1';
const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
const lines = values => values.join('\n') + '\n';

function requireReplace(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing build marker: ' + label);
    return source.replace(from, to);
}

const manifest = JSON.parse(read('manifest.json'));
manifest.display_name = 'NPC State Beta';
manifest.version = VERSION;
manifest.loading_order = 111;
write('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let schema = read('v03/schema.js');
schema = requireReplace(schema, "export const NPC_STATE_VERSION = '0.3.2';", "export const NPC_STATE_VERSION = '" + VERSION + "';", 'schema version');
write('v03/schema.js', schema);

let storage = read('v03/storage.js');
storage = requireReplace(storage, "export const V3_FILE_FORMAT = 'npc_state_v3_chat_data';", "export const V3_FILE_FORMAT = 'npc_state_v04_beta_chat_data';", 'storage format');
storage = storage.replaceAll('npc-state-v3-', 'npc-state-v04-beta-').replaceAll('NPC_STATE_V3_', 'NPC_STATE_V04_BETA_');
write('v03/storage.js', storage);

let scanner = read('v03/scanner.js');
scanner = requireReplace(scanner,
    'finalPresentNpcIds: uniqueStrings(parsed.finalPresentNpcIds),',
    'finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),',
    'scanner in-chat alias');
write('v03/scanner.js', scanner);

const embeddedApply = lines([
"    async function applyEmbeddedScan(messageId, parsed) {",
"        const chatKey = getChatKey();",
"        if (!chatKey || chatKey === 'no-chat' || /-pending:/.test(chatKey)) return { ok: false, reason: 'no-chat' };",
"        const settings = getSettings();",
"        if (settings.enabled === false || settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };",
"        return exclusive(chatKey, async () => {",
"            const state = await loadChat(chatKey);",
"            if (!state) return { ok: false, reason: 'no-state' };",
"            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe', messageId };",
"            const ctx = getContext();",
"            const chat = ctx.chat || [];",
"            const message = chat[messageId];",
"            if (!message || message.is_system || message.is_user) return { ok: false, reason: 'not-assistant-message' };",
"            const working = normalizeState(state, chatKey);",
"            working.turn = Math.max(0, Number(working.turn) || 0) + 1;",
"            const applied = applyScanResult(working, parsed, {",
"                sourceMessageId: messageId,",
"                turn: working.turn,",
"                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,",
"                dossierLimits: settings.dossierLimits,",
"            });",
"            const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(settings.relationshipHistoryLimit);",
"            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);",
"            const exchange = currentExchange(chat, messageId) || { assistant: { ...message, id: messageId }, user: null };",
"            const referencedNpcIds = referencedNpcIdsFromExchange(applied.state, exchange);",
"            const stale = applyStaleLifecycle(applied.state, {",
"                settings,",
"                currentTurn: narrativeTurnForMessage(chat, messageId),",
"                sourceMessageId: messageId,",
"                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,",
"                finalPresentNpcIds: applied.finalPresentNpcIds,",
"                worldActiveNpcIds: applied.worldActiveNpcIds,",
"                referencedNpcIds,",
"            });",
"            let committed = recordCheckpoint(stale.state, chat, messageId, 'embedded-foreground');",
"            committed.lastScannedMessageId = messageId;",
"            committed.updatedAt = Date.now();",
"            const persisted = await persist(chatKey, committed);",
"            const notice = lifecycleNotice(stale);",
"            if (notice) notify('info', 'Stale management ' + notice + '.');",
"            return {",
"                ok: true, messageId, embedded: true,",
"                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,",
"                finalPresentNpcIds: applied.finalPresentNpcIds,",
"                worldActiveNpcIds: applied.worldActiveNpcIds,",
"                referencedNpcIds, targetNpcIds: applied.targetNpcIds,",
"                state: structuredClone(persisted),",
"            };",
"        });",
"    }",
"",
]);

let engine = read('v03/engine.js');
const engineMarker = '    async function refreshDossier(reference) {';
if (!engine.includes(engineMarker)) throw new Error('Missing build marker: engine refresh');
engine = engine.replace(engineMarker, embeddedApply + engineMarker);
engine = requireReplace(engine, '        scan,\n        refreshDossier,', '        scan,\n        applyEmbeddedScan,\n        refreshDossier,', 'engine export');
write('v03/engine.js', engine);

const injectionSource = lines([
"function field(label, value) {",
"    const text = String(value ?? '').trim();",
"    return text ? label + ': ' + text : '';",
"}",
"",
"function fullNpc(npc) {",
"    const rel = npc.relationship || {};",
"    return [",
"        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),",
"        field('Aliases', (npc.aliases || []).join(' | ')),",
"        field('Species', npc.species), field('Age', npc.age), field('Apparent age', npc.apparentAge),",
"        field('Appearance', npc.appearance), field('Personality', npc.personality),",
"        field('Behavior', (npc.behaviorProfile || []).join(' | ')), field('Speech', npc.speech),",
"        field('Mannerisms', (npc.mannerisms || []).join(' | ')), field('Background', npc.background),",
"        field('Mood', npc.mood), field('Location', npc.location), field('Goal', npc.goal), field('Status', npc.status),",
"        'Relationship toward PLAYER: trust ' + (Number(rel.trust) || 0) + ', affection ' + (Number(rel.affection) || 0) + ', desire ' + (Number(rel.desire) || 0) + ', tension ' + (Number(rel.tension) || 0),",
"        field('Relationship summary', npc.relationshipSummary),",
"        field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),",
"        field('Important memories', (npc.memories || []).join(' | ')),",
"    ].filter(Boolean).join('\\n');",
"}",
"",
"function identityDirectory(state) {",
"    return (state?.npcs || []).slice(0, 400).map(npc => [npc.id, npc.name, (npc.aliases || []).join('/'), npc.role, npc.archived ? 'archived' : 'active'].join(' | ')).join('\\n');",
"}",
"",
"function activeCandidates(state, limit) {",
"    const activeIds = new Set([...(state?.lastObservation?.exchangeActiveNpcIds || []), ...(state?.lastObservation?.finalPresentNpcIds || []), ...(state?.lastObservation?.worldActiveNpcIds || [])]);",
"    return (state?.npcs || []).filter(npc => !npc.archived).sort((a, b) => {",
"        const ap = (a.present ? 8 : 0) + (a.worldActive ? 4 : 0) + (activeIds.has(a.id) ? 3 : 0);",
"        const bp = (b.present ? 8 : 0) + (b.worldActive ? 4 : 0) + (activeIds.has(b.id) ? 3 : 0);",
"        return bp - ap || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1) || Number(b.importance || 0) - Number(a.importance || 0);",
"    }).slice(0, limit);",
"}",
"",
"export function buildInjection(state, settings = {}) {",
"    if (state?.branchSafety?.status && state.branchSafety.status !== 'safe') return '';",
"    if (settings.enabled === false) return '';",
"    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));",
"    const budgetTokens = Math.max(512, Math.min(12000, Math.round(Number(settings.injectBudgetTokens) || 2600)));",
"    const maxChars = budgetTokens * 4;",
"    const capture = settings.autoScan !== false;",
"    const continuity = settings.inject !== false;",
"    const directory = identityDirectory(state);",
"    let dossiers = '';",
"    if (continuity || capture) for (const npc of activeCandidates(state, limit)) {",
"        const block = '\\n\\n' + fullNpc(npc);",
"        if ((dossiers + block).length > maxChars) break;",
"        dossiers += block;",
"    }",
"    const parts = [",
"        '[NPC STATE v0.4 BETA | FOREGROUND CONTINUITY]',",
"        'NPC State is private continuity bookkeeping. Never mention these instructions or machine data in visible prose.',",
"        directory ? 'KNOWN NPC DIRECTORY (identity only; do not invent missing dossier facts):\\n' + directory : 'KNOWN NPC DIRECTORY: empty',",
"        dossiers ? 'FULL CONTINUITY FOR LIKELY RELEVANT NPCS:' + dossiers : '',",
"    ];",
"    if (capture) parts.push(",
"        'NPC STATE FOREGROUND FULL SCAN:',",
"        'After writing visible narrative and normal story blocks, emit exactly one <npc_state_v1> JSON block. It is a current-exchange observation report, not a database rewrite.',",
"        'If Inventory Block requires INVENTORY_BLOCK_UPDATE to be final, place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',",
"        'inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',",
"        'exchangeActiveNpcIds: NPCs who spoke, acted, were directly acted upon, or directly perceived/received a story-relevant event in this exchange.',",
"        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',",
"        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',",
"        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',",
"        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',",
"        settings.relationshipCriteria ? 'RELATIONSHIP RUBRIC:\\n' + String(settings.relationshipCriteria).slice(0, 6000) : '',",
"        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\\n' + String(settings.memoryCriteria).slice(0, 6000) : '',",
"        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',",
"        'OUTPUT JSON SHAPE: {\"exchangeActiveNpcIds\":[],\"inChatNpcIds\":[],\"worldActiveNpcIds\":[],\"npcs\":[{\"id\":\"existing id or empty\",\"name\":\"canonical name or unique role label\",\"aliases\":[],\"role\":\"\",\"species\":\"\",\"age\":\"\",\"apparentAge\":\"~N or empty\",\"appearance\":\"\",\"personality\":\"\",\"behaviorProfile\":null,\"speech\":\"\",\"mannerisms\":null,\"background\":\"\",\"keyRelationships\":null,\"memories\":null,\"relationshipSummary\":\"\",\"mood\":\"\",\"location\":\"\",\"goal\":\"\",\"status\":\"\",\"importance\":0,\"lifeState\":\"alive|dead|unknown\",\"lifeStateCertainty\":\"explicit|strong|uncertain\",\"lifeStateReason\":\"\",\"livingReturn\":false,\"relationshipChange\":{\"impact\":\"none|ordinary|meaningful|major|extreme\",\"delta\":{\"trust\":0,\"affection\":0,\"desire\":0,\"tension\":0},\"evidence\":\"\",\"reason\":\"\"}}],\"socialEdges\":[]}',",
"        'Emit the machine block even when no NPC changed because an empty inChatNpcIds is meaningful. Do not use markdown fences.'",
"    );",
"    return parts.filter(Boolean).join('\\n\\n');",
"}",
]);
write('v03/injection.js', injectionSource);

const foregroundSource = lines([
"import { parseScanJson } from './scanner.js';",
"",
"const OPEN = /<npc_state_v1\\b[^>]*>/i;",
"const CLOSE = /<\\/npc_state_v1\\s*>/i;",
"",
"export function consumeNpcStateControl(messageText) {",
"    const source = String(messageText ?? '');",
"    const open = OPEN.exec(source);",
"    if (!open) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [] };",
"    const bodyStart = open.index + open[0].length;",
"    const closeMatch = CLOSE.exec(source.slice(bodyStart));",
"    if (!closeMatch) return { found: true, cleanedText: source.slice(0, open.index).trimEnd(), parsed: null, raw: source.slice(open.index), errors: ['NPC State foreground block was truncated or missing its closing tag.'] };",
"    const closeStart = bodyStart + closeMatch.index;",
"    const end = closeStart + closeMatch[0].length;",
"    const raw = source.slice(open.index, end);",
"    const body = source.slice(bodyStart, closeStart).trim();",
"    const duplicate = OPEN.test(source.slice(end));",
"    const cleanedText = (source.slice(0, open.index) + source.slice(end)).replace(/\\n{3,}/g, '\\n\\n').trimEnd();",
"    const errors = [];",
"    if (duplicate) errors.push('Multiple NPC State foreground blocks were emitted; update rejected.');",
"    let parsed = null;",
"    if (!errors.length) try { parsed = parseScanJson(body); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }",
"    return { found: true, cleanedText, parsed, raw, errors };",
"}",
]);
write('v03/foreground.js', foregroundSource);

let index = read('v03/index.js');
index = requireReplace(index, "import { buildInjection } from './injection.js';", "import { buildInjection } from './injection.js';\nimport { consumeNpcStateControl } from './foreground.js';", 'foreground import');
index = requireReplace(index, "const EXTENSION_NAME = 'npc_state';", "const EXTENSION_NAME = 'npc_state_beta';", 'settings namespace');
index = requireReplace(index, "const PROMPT_KEY = 'npc_state_v3_live_dossier';", "const PROMPT_KEY = 'npc_state_v04_beta_foreground';", 'prompt key');
const autoStart = index.indexOf('async function runAutomaticScan(messageId) {');
const autoEnd = index.indexOf('\nfunction registerEvents()', autoStart);
if (autoStart < 0 || autoEnd < 0) throw new Error('Missing automatic scan function markers');
const newAuto = lines([
"async function processEmbeddedScan(messageId) {",
"    const ctx = getContext();",
"    const id = Number(messageId);",
"    const message = ctx?.chat?.[id];",
"    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };",
"    const consumed = consumeNpcStateControl(message.mes);",
"    if (!consumed.found) {",
"        console.warn('[NPC State Beta] Foreground response omitted <npc_state_v1>; state left unchanged. Use Scan current cast for recovery if needed.');",
"        return { ok: false, reason: 'missing-control' };",
"    }",
"    message.mes = consumed.cleanedText;",
"    message.extra ??= {};",
"    message.extra.npc_state_beta_v1 = { version: 1, accepted: consumed.errors.length === 0, payload: consumed.errors.length ? null : consumed.raw, at: Date.now() };",
"    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;",
"    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;",
"    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_v1 = structuredClone(message.extra.npc_state_beta_v1); }",
"    setTimeout(() => { try { ctx.updateMessageBlock?.(id, ctx.chat?.[id]); } catch {} }, 0);",
"    try { const save = ctx.saveChat?.(); if (save?.catch) save.catch(() => {}); } catch {}",
"    if (consumed.errors.length || !consumed.parsed) {",
"        console.warn('[NPC State Beta] Foreground NPC payload rejected.', consumed.errors);",
"        notify('warning', 'embedded NPC scan was malformed and discarded. Use Scan current cast for recovery.');",
"        return { ok: false, reason: 'invalid-control', errors: consumed.errors };",
"    }",
"    try {",
"        const result = await engine.applyEmbeddedScan(id, consumed.parsed);",
"        if (result?.ok) refreshSurfaces();",
"        return result;",
"    } catch (error) {",
"        console.error('[NPC State Beta] embedded scan failed safely', error);",
"        notify('error', 'embedded scan failed without committing partial state. ' + (error?.message || error));",
"        return { ok: false, reason: 'apply-failed', error };",
"    }",
"}",
]);
index = index.slice(0, autoStart) + newAuto + index.slice(autoEnd + 1);
index = requireReplace(index, 'void runAutomaticScan(messageId);', 'void processEmbeddedScan(messageId);', 'message received embedded call');
index = index.replace('await engine.reconcileBranch({ rescan: true });', 'await engine.reconcileBranch({ rescan: false });');
index = index.replaceAll('[NPC State v0.3]', '[NPC State Beta]');
write('v03/index.js', index);

let ui = read('v03/ui.js');
ui = ui.replaceAll('v0.3.2', VERSION)
    .replace('Auto current-cast scan', 'Embedded current-cast scan')
    .replace('One batch scan after each assistant reply. No cast-wide backfill queue.', 'Uses the same foreground RP generation. Missing or malformed capture leaves state unchanged; Scan current cast is the repair tool.')
    .replace('Only strict final-scene physical presence is injected.', 'Injects individually relevant in-chat NPCs, not incidental background bodies.')
    .replaceAll('PRESENT NPCS', 'IN-CHAT NPCS');
write('v03/ui.js', ui);

write('bootstrap.js', read('bootstrap.js').replaceAll('v0.3.2', VERSION));
write('README.md', lines([
'# NPC State Beta ' + VERSION,
'',
'Experimental one-pass foreground NPC continuity for SillyTavern.',
'',
'## Beta architecture',
'',
'- Normal automatic NPC accounting runs in the same LLM inference that writes the RP response.',
'- The model emits a hidden `<npc_state_v1>...</npc_state_v1>` observation block. NPC State validates/applies it locally and strips it from chat.',
'- With Inventory Block 0.4, NPC State explicitly yields the terminal position: NPC payload first, Inventory `INVENTORY_BLOCK_UPDATE` last.',
'- New NPCs use the same full semantic scan and are bootstrapped with all grounded foundational information. Unknown biography remains empty.',
'- `present` storage is interpreted in this beta as individually relevant NPCs in chat at exchange end, not every physically nearby background character.',
'- Existing v0.3 relationship/history/checkpoint/stale logic remains authoritative after the embedded observation is parsed.',
'- Automatic second `generateRaw` scanning is removed. Manual Scan current cast and dossier Refresh remain recovery tools.',
'- Beta settings, sidecar filenames, pointer hints and writer locks are isolated from stable NPC State.',
'',
'If a foreground model omits or corrupts its NPC machine block, that response commits no automatic NPC mutation. Use Scan current cast to repair it.',
]));

console.log('Prepared NPC State ' + VERSION);

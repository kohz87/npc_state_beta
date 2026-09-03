import fs from 'node:fs';

const VERSION = '0.4.1';
const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
const lines = values => values.join('\n') + '\n';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.1 marker: ' + label);
    return source.replace(from, to);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.1 range: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// Version surface.
const manifest = JSON.parse(read('manifest.json'));
manifest.version = VERSION;
manifest.display_name = 'NPC State Beta';
write('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let schema = read('v03/schema.js');
schema = schema.replace(/export const NPC_STATE_VERSION = '[^']+';/, `export const NPC_STATE_VERSION = '${VERSION}';`);
write('v03/schema.js', schema);

write('bootstrap.js', read('bootstrap.js').replaceAll('0.4.0-beta.1', VERSION).replaceAll('v0.3.2', 'v' + VERSION));

// v0.4.1 is a direct continuation from stable v0.3.x. Remove the v0.2 importer entirely.
let engine = read('v03/engine.js');
engine = engine.replace("import { readLegacyV02Sidecar } from './migrate-v02.js';\n", '');
engine = engine.replace("    const getLegacyPointer = adapters.getLegacyPointer || (() => null);\n", '');
engine = engine.replace("const SYSTEM_PROMPT = 'Return only valid JSON for the NPC State v0.3.2 structured scanner. Obey the supplied schema and evidence rules exactly.';",
    "const SYSTEM_PROMPT = 'Return only valid JSON for the NPC State v0.4.1 recovery scanner. Obey the supplied schema and evidence rules exactly.';");
engine = engine.replaceAll('NPC State v0.3 engine requires', 'NPC State v0.4.1 engine requires');

const loadStart = "            let state;\n            let importedLegacy = false;\n            let importedStable = false;\n";
const loadEnd = "            cache.set(chatKey, state);";
const loadReplacement = lines([
"            let state;",
"            let importedStable = false;",
"            if (pointer?.path) {",
"                const loaded = await readV3Sidecar({ chatKey, pointer, fetchFn });",
"                if (!loaded) throw new Error('NPC State beta sidecar pointer exists but the file is missing. Refusing to create a blank replacement.');",
"                state = loaded.state;",
"                if (!configuredPointer?.path || Number(pointer.revision || 0) > Number(configuredPointer.revision || 0)) {",
"                    setPointer(chatKey, pointer);",
"                    persistSettings();",
"                }",
"            } else {",
"                const stablePointer = getStablePointer(chatKey);",
"                if (stablePointer?.path) {",
"                    const stable = await readV3Sidecar({ chatKey, pointer: stablePointer, fetchFn });",
"                    if (!stable) throw new Error('Stable NPC State v0.3 sidecar pointer exists but the file is missing. Refusing to create a blank beta replacement.');",
"                    state = stable.state;",
"                    importedStable = true;",
"                } else {",
"                    state = createEmptyState(chatKey);",
"                }",
"            }",
"            state = ensureBranchBase(normalizeState(state, chatKey), getContext().chat || []);",
"            if (importedStable) {",
"                state = await persist(chatKey, state);",
"                notify('success', 'Cloned stable NPC State v0.3 dossiers into an independent v0.4.1 beta sidecar. Stable data was not modified.');",
"            }",
]);
engine = replaceRange(engine, loadStart, loadEnd, loadReplacement, 'stable-only load path');
write('v03/engine.js', engine);

if (fs.existsSync('v03/migrate-v02.js')) fs.unlinkSync('v03/migrate-v02.js');

// Recovery scanner uses the same in-chat semantics as foreground capture.
let scanner = read('v03/scanner.js');
scanner = scanner
    .replaceAll('NPC State v0.3.1', 'NPC State v0.4.1')
    .replaceAll('NPC State v0.3 scanner', 'NPC State v0.4.1 recovery scanner')
    .replace("        finalPresentNpcIds: ['existing dossier id OR exact canonical name'],", "        inChatNpcIds: ['existing dossier id OR exact canonical name'],")
    .replace("        '- finalPresentNpcIds: NPCs physically present at the END of the current assistant scene. This is strict physical presence. Off-screen activity does not count.',",
             "        '- inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',")
    .replace("        '- worldActiveNpcIds: NPCs explicitly active off-screen in the current world state. Keep this separate from physical presence.',",
             "        '- worldActiveNpcIds: NPCs explicitly active off-screen in the current world state. Keep this separate from in-chat participation.',")
    .replace("        'Do NOT change relationship scores or propose relationship deltas in a targeted refresh. Do NOT change global physical presence for other NPCs.',",
             "        'Do NOT change relationship scores or propose relationship deltas in a targeted refresh. Do NOT change global in-chat state for other NPCs.',")
    .replace('`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs:',
             '`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs:');
// Keep the internal state field name for v0.3 sidecar compatibility, but accept the v0.4 contract.
scanner = scanner.replace('finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),',
                          'finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),');
write('v03/scanner.js', scanner);

// Robust transport stripping. Duplicate/truncated NPC controls are rejected and removed,
// while Inventory Block's terminal control is preserved.
write('v03/foreground.js', lines([
"import { parseScanJson } from './scanner.js';",
"",
"const OPEN = /<npc_state_v1\\b[^>]*>/i;",
"const COMPLETE_BLOCK = /<npc_state_v1\\b[^>]*>[\\s\\S]*?<\\/npc_state_v1\\s*>/gi;",
"const INVENTORY_TAIL = /<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*$/i;",
"",
"function tidy(value) { return String(value ?? '').replace(/\\n{3,}/g, '\\n\\n').trimEnd(); }",
"",
"function removeTruncatedTail(source) {",
"    const open = OPEN.exec(source);",
"    if (!open) return source;",
"    const tailSource = source.slice(open.index);",
"    const inventory = INVENTORY_TAIL.exec(tailSource);",
"    const tail = inventory ? tailSource.slice(inventory.index) : '';",
"    return tidy(source.slice(0, open.index) + (tail ? '\\n\\n' + tail : ''));",
"}",
"",
"export function consumeNpcStateControl(messageText) {",
"    const source = String(messageText ?? '');",
"    const blocks = [...source.matchAll(new RegExp(COMPLETE_BLOCK.source, 'gi'))];",
"    const firstOpen = OPEN.exec(source);",
"    if (!blocks.length && !firstOpen) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [] };",
"",
"    const errors = [];",
"    if (!blocks.length) {",
"        return {",
"            found: true,",
"            cleanedText: removeTruncatedTail(source),",
"            parsed: null,",
"            raw: source.slice(firstOpen.index),",
"            errors: ['NPC State foreground block was truncated or missing its closing tag.'],",
"        };",
"    }",
"",
"    if (blocks.length > 1) errors.push('Multiple NPC State foreground blocks were emitted; update rejected.');",
"    const raw = blocks[0][0];",
"    const open = /<npc_state_v1\\b[^>]*>/i.exec(raw);",
"    const close = /<\\/npc_state_v1\\s*>/i.exec(raw);",
"    const body = raw.slice((open?.index || 0) + (open?.[0]?.length || 0), close?.index ?? raw.length).trim();",
"",
"    let cleanedText = tidy(source.replace(new RegExp(COMPLETE_BLOCK.source, 'gi'), ''));",
"    if (OPEN.test(cleanedText)) {",
"        errors.push('A truncated extra NPC State foreground block was emitted; update rejected.');",
"        cleanedText = removeTruncatedTail(cleanedText);",
"    }",
"",
"    let parsed = null;",
"    if (!errors.length) {",
"        try { parsed = parseScanJson(body); }",
"        catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }",
"    }",
"    return { found: true, cleanedText, parsed, raw, errors };",
"}",
]));

// Runtime orchestration: one-pass foreground by default, full scanner retained as contingency.
let index = read('v03/index.js');
index = index.replaceAll('0.4.0-beta.1', VERSION);
index = index.replace("    branchRescan: true,\n", "    branchRescan: true,\n    fallbackScan: false,\n");

// Remove v0.2 pointer plumbing from the beta runtime.
const legacyFnStart = index.indexOf('function getLegacyPointer(chatKey) {');
if (legacyFnStart >= 0) {
    const legacyFnEnd = index.indexOf('\nfunction notify(', legacyFnStart);
    if (legacyFnEnd < 0) throw new Error('Missing 0.4.1 range: legacy pointer function');
    index = index.slice(0, legacyFnStart) + index.slice(legacyFnEnd + 1);
}
index = index.replace('    getLegacyPointer,\n', '');

const runtimeStart = 'function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }';
const runtimeEnd = 'function registerEvents() {';
const runtimeReplacement = lines([
"function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }",
"",
"function latestAssistantMessageId(chat = []) {",
"    for (let i = chat.length - 1; i >= 0; i -= 1) {",
"        const message = chat[i];",
"        if (message && !message.is_system && !message.is_user) return i;",
"    }",
"    return -1;",
"}",
"",
"function activeEmbeddedMeta(message) {",
"    if (!message) return null;",
"    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;",
"    const swipeMeta = Array.isArray(message.swipe_info) ? message.swipe_info?.[swipeId]?.extra?.npc_state_beta_v1 : null;",
"    return swipeMeta || message.extra?.npc_state_beta_v1 || null;",
"}",
"",
"function persistMessageMutation(ctx, messageId) {",
"    setTimeout(() => { try { ctx.updateMessageBlock?.(messageId, ctx.chat?.[messageId]); } catch {} }, 0);",
"    try { const save = ctx.saveChat?.(); if (save?.catch) save.catch(() => {}); } catch {}",
"}",
"",
"function stripNpcTransportOnly(messageId) {",
"    const ctx = getContext();",
"    const id = Number(messageId);",
"    const message = ctx?.chat?.[id];",
"    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;",
"    const consumed = consumeNpcStateControl(message.mes);",
"    if (!consumed.found) return false;",
"    message.mes = consumed.cleanedText;",
"    persistMessageMutation(ctx, id);",
"    return true;",
"}",
"",
"function scheduleTransportHygiene(messageId) {",
"    for (const delay of [50, 250]) setTimeout(() => stripNpcTransportOnly(messageId), delay);",
"}",
"",
"function storeEmbeddedMeta(ctx, messageId, consumed) {",
"    const message = ctx?.chat?.[messageId];",
"    if (!message) return;",
"    const accepted = consumed.errors.length === 0 && Boolean(consumed.parsed);",
"    const meta = { version: 1, accepted, payload: accepted ? consumed.raw : null, errors: accepted ? [] : [...consumed.errors], at: Date.now() };",
"    message.extra ??= {};",
"    message.extra.npc_state_beta_v1 = meta;",
"    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;",
"    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;",
"    if (swipe) { swipe.extra ??= {}; swipe.extra.npc_state_beta_v1 = structuredClone(meta); }",
"}",
"",
"function invalidateEmbeddedMeta(messageId) {",
"    const ctx = getContext();",
"    const id = Number(messageId);",
"    const message = ctx?.chat?.[id];",
"    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return false;",
"    if (message.extra) delete message.extra.npc_state_beta_v1;",
"    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;",
"    const swipe = Array.isArray(message.swipe_info) ? message.swipe_info[swipeId] : null;",
"    if (swipe?.extra) delete swipe.extra.npc_state_beta_v1;",
"    persistMessageMutation(ctx, id);",
"    return true;",
"}",
"",
"async function runSeparateRecoveryScan(messageId, reason = 'recovery') {",
"    const settings = getSettings();",
"    const id = Number(messageId);",
"    if (!Number.isInteger(id) || id < 0) return { ok: false, reason: 'no-assistant-message' };",
"    if (settings.enabled === false || settings.autoScan === false) return { ok: false, reason: 'auto-disabled' };",
"    try {",
"        const result = await engine.scan(id, { manual: false, force: true });",
"        if (result?.ok || result?.discarded) refreshSurfaces();",
"        if (!result?.ok && !result?.discarded) console.warn('[NPC State Beta] Separate recovery scan did not commit:', reason, result?.reason);",
"        return result;",
"    } catch (error) {",
"        console.error('[NPC State Beta] separate recovery scan failed safely', reason, error);",
"        notify('error', 'recovery scanner failed without committing partial state. ' + (error?.message || error));",
"        return { ok: false, reason: 'recovery-scan-failed', error };",
"    }",
"}",
"",
"async function maybeForegroundFallback(messageId, reason) {",
"    if (getSettings().fallbackScan !== true) return { ok: false, reason };",
"    console.warn('[NPC State Beta] Embedded capture failed; invoking separate recovery scanner:', reason);",
"    return runSeparateRecoveryScan(messageId, 'foreground-' + reason);",
"}",
"",
"async function processEmbeddedScan(messageId) {",
"    const ctx = getContext();",
"    const id = Number(messageId);",
"    const message = ctx?.chat?.[id];",
"    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) return { ok: false, reason: 'not-assistant-message' };",
"    const consumed = consumeNpcStateControl(message.mes);",
"    if (!consumed.found) {",
"        console.warn('[NPC State Beta] Foreground response omitted <npc_state_v1>.');",
"        const fallback = await maybeForegroundFallback(id, 'missing-control');",
"        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan was missing. State was left unchanged; use Scan current cast for recovery.');",
"        return fallback;",
"    }",
"",
"    message.mes = consumed.cleanedText;",
"    storeEmbeddedMeta(ctx, id, consumed);",
"    persistMessageMutation(ctx, id);",
"    scheduleTransportHygiene(id);",
"",
"    if (consumed.errors.length || !consumed.parsed) {",
"        console.warn('[NPC State Beta] Foreground NPC payload rejected.', consumed.errors);",
"        const fallback = await maybeForegroundFallback(id, 'invalid-control');",
"        if (!fallback.ok && getSettings().fallbackScan !== true) notify('warning', 'embedded NPC scan was malformed and discarded. State was left unchanged; use Scan current cast for recovery.');",
"        return fallback;",
"    }",
"",
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
"",
"async function reapplyStoredEmbeddedPayload(messageId) {",
"    const ctx = getContext();",
"    const id = Number(messageId);",
"    const message = ctx?.chat?.[id];",
"    const meta = activeEmbeddedMeta(message);",
"    if (!meta?.accepted || !meta.payload) return { ok: false, reason: 'no-stored-payload' };",
"    const consumed = consumeNpcStateControl(meta.payload);",
"    if (consumed.errors.length || !consumed.parsed) return { ok: false, reason: 'stored-payload-invalid' };",
"    const result = await engine.applyEmbeddedScan(id, consumed.parsed);",
"    if (result?.ok) refreshSurfaces();",
"    return result;",
"}",
"",
"async function settledBranchReconcile({ reason = 'branch-change', messageId = null, preferStoredPayload = false } = {}) {",
"    const key = getChatKey();",
"    if (!key || key === 'no-chat') return;",
"    engine.invalidate(key);",
"    try {",
"        await sleep(90);",
"        if (getChatKey() !== key) return;",
"        const result = await engine.reconcileBranch({ rescan: false });",
"        if (result?.unsafeDivergence) {",
"            notify('warning', 'timeline rebase required. Durable dossiers are intact; open NPC State settings and choose Rebase to current chat to accept the surviving timeline.');",
"            refreshSurfaces();",
"            return;",
"        }",
"        if (!result?.changed) { refreshSurfaces(); return; }",
"",
"        const ctx = getContext();",
"        const requestedId = Number(messageId);",
"        const activeId = Number.isInteger(requestedId) && requestedId >= 0 ? requestedId : latestAssistantMessageId(ctx.chat || []);",
"        const checkpointAlreadyContainsTarget = Number.isInteger(activeId)",
"            && result?.checkpoint?.messageId === activeId",
"            && result?.checkpoint?.isBranchBase !== true",
"            && result?.checkpoint?.reason !== 'v3-baseline';",
"",
"        if (!checkpointAlreadyContainsTarget && preferStoredPayload && activeId >= 0) {",
"            const replay = await reapplyStoredEmbeddedPayload(activeId);",
"            if (replay?.ok) return;",
"        }",
"",
"        if (!checkpointAlreadyContainsTarget && getSettings().branchRescan !== false) {",
"            const scanId = latestAssistantMessageId(ctx.chat || []);",
"            if (scanId >= 0) await runSeparateRecoveryScan(scanId, reason);",
"        }",
"        refreshSurfaces();",
"    } catch (error) {",
"        console.error('[NPC State Beta] branch reconciliation failed safely', error);",
"        notify('error', 'branch reconciliation failed without committing partial state. ' + (error?.message || error));",
"    }",
"}",
"",
]);
index = replaceRange(index, runtimeStart, runtimeEnd, runtimeReplacement, 'runtime recovery orchestration');

// Replace generic branch listeners with edit/swipe-aware recovery.
const listenerStart = "    for (const event of [events.MESSAGE_EDITED, events.MESSAGE_DELETED, events.MESSAGE_SWIPED, events.MESSAGE_SWIPE_DELETED].filter(Boolean)) {";
const listenerEnd = "    for (const event of [events.CHARACTER_MESSAGE_RENDERED, events.MESSAGE_UPDATED, events.MORE_MESSAGES_LOADED].filter(Boolean)) {";
const listenerReplacement = lines([
"    if (events.MESSAGE_EDITED) source.on(events.MESSAGE_EDITED, messageId => {",
"        invalidateEmbeddedMeta(messageId);",
"        void settledBranchReconcile({ reason: 'message-edited', messageId, preferStoredPayload: false });",
"    });",
"    if (events.MESSAGE_SWIPED) source.on(events.MESSAGE_SWIPED, messageId => {",
"        void settledBranchReconcile({ reason: 'message-swiped', messageId, preferStoredPayload: true });",
"    });",
"    if (events.MESSAGE_DELETED) source.on(events.MESSAGE_DELETED, () => {",
"        void settledBranchReconcile({ reason: 'message-deleted' });",
"    });",
"    if (events.MESSAGE_SWIPE_DELETED) source.on(events.MESSAGE_SWIPE_DELETED, messageId => {",
"        void settledBranchReconcile({ reason: 'swipe-deleted', messageId, preferStoredPayload: true });",
"    });",
"",
]);
index = replaceRange(index, listenerStart, listenerEnd, listenerReplacement, 'branch event listeners');
write('v03/index.js', index);

// UI wording and fallback control.
let ui = read('v03/ui.js');
ui = ui.replaceAll('0.4.0-beta.1', VERSION)
    .replace('v0.3 uses one current-exchange scanner transaction. Exchange participation, strict final physical presence, and off-screen world activity are independent signals. Existing v0.2 sidecars are imported once into a separate v0.3 file and never rewritten.',
             'v0.4.1 uses foreground embedded capture for normal turns. Exchange participation, in-chat relevance, and explicit off-screen activity are independent signals. Stable v0.3 dossiers can be cloned once into an independent beta sidecar.')
    .replace('<b>Inject present NPCs</b>', '<b>Inject in-chat NPCs</b>')
    .replace('Restores the best v0.3 checkpoint and rescans the surviving latest exchange.', 'Restores tracked swipes locally from checkpoints/payloads. Edited or untracked branches use the separate recovery scanner when needed.');
const fallbackRow = '<label class="npc-state-setting-row"><span><b>Automatic recovery scanner</b><small>If embedded capture is missing or malformed, run one separate scanner call. Off by default; manual Scan current cast is always available.</small></span><input id="npc_state_v04_fallback" type="checkbox"></label>';
ui = replaceRequired(ui,
    '<label class="npc-state-setting-row"><span><b>Embedded current-cast scan</b><small>Uses the same foreground RP generation. Missing or malformed capture leaves state unchanged; Scan current cast is the repair tool.</small></span><input id="npc_state_v3_auto" type="checkbox"></label>',
    '<label class="npc-state-setting-row"><span><b>Embedded current-cast scan</b><small>Uses the same foreground RP generation. Missing or malformed capture leaves state unchanged unless automatic recovery is enabled.</small></span><input id="npc_state_v3_auto" type="checkbox"></label>\n              ' + fallbackRow,
    'fallback settings row');
ui = replaceRequired(ui,
    "        panel.querySelector('#npc_state_v3_auto').checked = settings.autoScan !== false;",
    "        panel.querySelector('#npc_state_v3_auto').checked = settings.autoScan !== false;\n        panel.querySelector('#npc_state_v04_fallback').checked = settings.fallbackScan === true;",
    'fallback settings sync');
ui = replaceRequired(ui,
    "        bindCheck('#npc_state_v3_auto', 'autoScan');",
    "        bindCheck('#npc_state_v3_auto', 'autoScan');\n        bindCheck('#npc_state_v04_fallback', 'fallbackScan');",
    'fallback settings bind');
write('v03/ui.js', ui);

let dossier = read('v03/dossier-view.js');
dossier = dossier.replace("    if (npc.present) return 'Present';", "    if (npc.present) return 'In chat';");
write('v03/dossier-view.js', dossier);

let branchUi = read('v03/branch-recovery-ui.js');
branchUi = branchUi.replace('It clears live presence, chat-local message references, and incompatible branch checkpoints, then scans the latest surviving assistant exchange.',
                            'It clears live in-chat state, chat-local message references, and incompatible branch checkpoints, then scans the latest surviving assistant exchange.')
    .replaceAll('[NPC State v0.3.2]', '[NPC State v0.4.1]');
write('v03/branch-recovery-ui.js', branchUi);

let injection = read('v03/injection.js');
injection = injection.replace('[NPC STATE v0.4 BETA | FOREGROUND CONTINUITY]', '[NPC STATE v0.4.1 BETA | FOREGROUND CONTINUITY]');
write('v03/injection.js', injection);

write('README.md', lines([
'# NPC State Beta 0.4.1',
'',
'Experimental one-pass foreground NPC continuity for SillyTavern, continuing directly from stable NPC State v0.3.2.',
'',
'## Architecture',
'',
'- Normal turns use the same foreground RP inference for NPC State capture. No mandatory second scanner request.',
'- The model emits one hidden `<npc_state_v1>...</npc_state_v1>` observation block; NPC State validates it, applies deterministic state rules, stores per-message/per-swipe metadata, and strips the transport from chat.',
'- With Inventory Block 0.4, NPC State yields the terminal position: NPC payload first, Inventory `INVENTORY_BLOCK_UPDATE` last.',
'- `present` remains the internal v0.3-compatible storage field, but its v0.4.1 meaning is **in chat**: individually relevant NPC participants at exchange end, not everyone physically nearby.',
'- New NPCs use the same full semantic scan and receive all grounded foundational information established by the exchange. Unknown biography stays unknown.',
'- The full separate v0.3-style scanner is retained as a contingency for manual Scan current cast, dossier Refresh, timeline rebase, edited/untracked branch recovery, and optional foreground failure fallback.',
'- Automatic recovery after missing/malformed foreground capture is optional and off by default.',
'- Known tracked swipes restore from branch checkpoints; stored embedded payloads are available as a local replay fallback before another LLM call is considered.',
'- Stable v0.3.x sidecars can be cloned once into an independent beta sidecar. v0.2 migration is intentionally removed from the 0.4 line.',
'- Beta settings, sidecar filenames, pointer hints, and writer locks remain isolated from stable NPC State.',
'',
'## Testing beside stable NPC State',
'',
'Disable the stable NPC State extension while exercising this beta. Stable may remain installed and its settings/data remain untouched. On first load for a chat with no beta sidecar, 0.4.1 clones the stable v0.3 sidecar into a beta-owned sidecar and then diverges independently.',
]));

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## v0.4.1')) {
    const entry = lines([
'## v0.4.1',
'',
'- Retained the full separate structured scanner as a contingency while keeping normal automatic turns on the one-pass embedded foreground path.',
'- Added optional **Automatic recovery scanner** fallback for missing or malformed `<npc_state_v1>` capture. It is off by default; manual **Scan current cast** remains available regardless.',
'- Restored changed-branch recovery without reintroducing a mandatory second request: tracked swipes restore from checkpoints, stored swipe payloads can replay locally when needed, and edited/untracked branches fall back to the separate scanner when branch rescan is enabled.',
'- Invalidated stored embedded metadata on assistant edits so stale machine observations cannot be reapplied to rewritten prose.',
'- Hardened foreground transport stripping so duplicate NPC blocks are rejected and removed, truncated NPC output is fail-closed, and Inventory Block 0.4 terminal controls are preserved.',
'- Standardized the separate recovery scanner on the same **in-chat** semantics as embedded mode instead of the v0.3.2 strict physical-presence rule.',
'- Updated dossier/status/settings wording from **Present** / strict physical presence to **In chat** / individually relevant current participants while keeping the internal `present` field for v0.3 sidecar compatibility.',
'- Removed the v0.2 migration path from the 0.4 beta. The supported upgrade path is stable v0.3.x -> independent v0.4.1 beta clone.',
'- Kept stable v0.3 relationship/history, memories, dossier evolution, portraits, bundles, stale management, branch checkpoints/rebase, manual tools, social graph, Megumin integration, and sidecar protections intact.',
'',
]);
    changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + entry);
}
write('CHANGELOG.md', changelog);

console.log('Applied NPC State ' + VERSION + ' hardening');

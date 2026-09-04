import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-7B marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Foreground injection: optional, bounded visible-history capsule. It does not
// make another model call. Current exchange remains the only admission/activity
// authority; history can enrich stable bootstrap facts only after admission.
// ---------------------------------------------------------------------------
let injection = read('v03/injection.js');
injection = rep(injection,
    "    const capture = settings.autoScan !== false;\n    const continuity = settings.inject !== false;",
    "    const capture = settings.autoScan !== false;\n    const continuity = settings.inject !== false;\n    const newNpcHistory = capture && settings.newNpcHistoryEnrichment !== false ? String(settings.foregroundNewNpcHistory || '').trim().slice(0, 4000) : '';",
    'history capture setup');
injection = rep(injection,
    "        dossiers ? 'FULL CONTINUITY FOR LIKELY RELEVANT NPCS:' + dossiers : '',\n    ];",
    "        dossiers ? 'FULL CONTINUITY FOR LIKELY RELEVANT NPCS:' + dossiers : '',\n        newNpcHistory ? 'RECENT VISIBLE HISTORY FOR NEW-NPC ENRICHMENT ONLY (never an admission source):\\n' + newNpcHistory : '',\n    ];",
    'history capsule insertion');
injection = rep(injection,
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by this response. Unknown biography stays empty/null; never invent facts to fill the schema.',",
    "        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by the current exchange. If the NEW-NPC HISTORY capsule is present, the current exchange must STILL independently introduce/admit that NPC; only after admission may matching older visible history enrich durable foundational profile facts and important memories. Unknown biography stays empty/null; never invent facts to fill the schema.',",
    'new NPC history admission wording');
injection = rep(injection,
    "        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing all grounded entries established by this response; use [] only when none are supported. Do not use null for those four fields on a new NPC. The current response alone can establish behavior or mannerisms when it explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',",
    "        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing grounded entries established by the current exchange plus matching older visible history from the optional NEW-NPC HISTORY capsule; use [] only when none are supported. Do not use null for those four fields on a new NPC. History may enrich only the newly admitted NPC durable identity/profile/background/forms/key relationships/memories. It must NEVER create an NPC by itself, set exchangeActive/inChat/worldActive, supply current mood/location/goal/status, or replay relationshipChange/relationshipSummary. The current exchange alone determines those live and player-relationship channels.',",
    'new NPC bootstrap history wording');
write('v03/injection.js', injection);

// ---------------------------------------------------------------------------
// Scanner backend: even if the foreground model sees history, a genuinely new
// dossier must have a name/alias/role reference in CURRENT visible exchange.
// Also require new-NPC numeric relationship evidence to be grounded in current
// relationship context, never the enrichment capsule.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = rep(scanner,
    "function newPatchAllowedByEvidence(state, patch, policy) {\n    if (!policy?.detected || findNpcByReference(state, patch?.name || '')) return true;\n    const scope = restrictedEvidenceScope(state, patch, policy);\n    return !['world', 'inner', 'excluded'].includes(scope);\n}",
    `function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = '') {
    const source = String(currentAdmissionText || '').trim();
    if (!source) return true;
    const variants = [...new Set([
        patch?.name,
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
        patch?.role,
    ].map(value => String(value || '').trim()).filter(value => value && !isTechnicalNpcIdentity(value) && !GENERIC_REFERENCES.has(normalizeName(value))))];
    return variants.some(value => containsNormalizedPhrase(source, value));
}
function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '') {
    if (findNpcByReference(state, patch?.name || '')) return true;
    if (!newPatchMentionedInCurrentExchange(patch, currentAdmissionText)) return false;
    if (!policy?.detected) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    return !['world', 'inner', 'excluded'].includes(scope);
}`,
    'current-exchange new NPC admission helper');
scanner = rep(scanner,
    "    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const exchangeRefs",
    "    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const currentAdmissionText = String(options.currentAdmissionText || '').trim();\n    const exchangeRefs",
    'current admission option');
scanner = scanner.replaceAll(
    'newPatchAllowedByEvidence(state, patch, evidencePolicy)',
    'newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)'
);
scanner = rep(scanner,
    "    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return npc;\n    if (relationshipChangeLooksDuplicate(npc, change, options)) return npc;",
    "    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return npc;\n    if (options.requireCurrentRelationshipEvidence === true && !profileEvidenceGrounded(change.evidence, String(options.relationshipContext || ''))) return npc;\n    if (relationshipChangeLooksDuplicate(npc, change, options)) return npc;",
    'new NPC current-only relationship gate');
scanner = rep(scanner,
    "                relationshipContext: String(options.relationshipContext || ''),\n                sourceMessageId,",
    "                relationshipContext: String(options.relationshipContext || ''),\n                requireCurrentRelationshipEvidence: createdNpcIds.has(npc.id),\n                sourceMessageId,",
    'new NPC relationship evidence option');
write('v03/scanner.js', scanner);

// ---------------------------------------------------------------------------
// Engine passes current visible exchange explicitly to backend admission. The
// history capsule is never included in these deterministic current-only inputs.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = engine.replaceAll(
    'evidencePolicy: buildExchangeEvidencePolicy(exchange),',
    "evidencePolicy: buildExchangeEvidencePolicy(exchange),\n                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),"
);
write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Settings + local capsule builder. Six prior non-system messages maximum, 3500
// visible characters total, current user message excluded, Megumin reference
// blocks and NPC/Inventory transports stripped. No model call is made here.
// ---------------------------------------------------------------------------
let index = read('v03/index.js');
index = rep(index,
    "import { hasRecognizedStructuredBlocks } from './evidence-adapter.js';",
    "import { hasRecognizedStructuredBlocks, profileEvidenceText } from './evidence-adapter.js';",
    'history evidence import');
index = rep(index,
    "    fallbackScan: false,\n    staleManagementEnabled:",
    "    fallbackScan: false,\n    newNpcHistoryEnrichment: true,\n    staleManagementEnabled:",
    'history setting default');
index = rep(index,
    "function updateInjection() {",
    String.raw`function cleanForegroundHistoryText(value) {
    return profileEvidenceText(value)
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*?<\/npc_state_v1\s*>/gi, '')
        .replace(/<npc_state_v1\b[^>]*>[\s\S]*$/gi, '')
        .replace(/<!--\s*INVENTORY_BLOCK_(?:V05|UPDATE)\b[\s\S]*?-->/gi, '')
        .replace(/<Inventory\b[^>]*>[\s\S]*?<\/Inventory\s*>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function buildForegroundNewNpcHistory(chat = [], settings = {}) {
    if (settings.newNpcHistoryEnrichment === false) return '';
    const source = Array.isArray(chat) ? chat : [];
    let end = source.length;
    while (end > 0 && source[end - 1]?.is_system) end -= 1;
    // The newest user message is part of the live exchange, not historical enrichment.
    if (end > 0 && source[end - 1]?.is_user) end -= 1;
    const depth = Math.max(2, Math.min(6, Math.round(Number(settings.scanDepth) || 6)));
    const candidates = source.slice(0, end).map((message, id) => ({ ...message, id }))
        .filter(message => message && !message.is_system)
        .slice(-depth);
    const rows = [];
    let used = 0;
    const cap = 3500;
    for (const message of candidates) {
        const text = cleanForegroundHistoryText(message.mes).slice(0, 1400);
        if (!text) continue;
        const row = '[' + (message.is_user ? 'USER' : 'ASSISTANT') + ' #' + message.id + '] ' + text;
        if (used + row.length > cap) {
            const remaining = cap - used;
            if (remaining > 160) rows.push(row.slice(0, remaining));
            break;
        }
        rows.push(row);
        used += row.length + 1;
    }
    return rows.join('\n');
}

function updateInjection() {`,
    'history capsule builder');
index = rep(index,
    "    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));\n    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected }) : '';",
    "    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));\n    const foregroundNewNpcHistory = buildForegroundNewNpcHistory(ctx.chat || [], settings);\n    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory }) : '';",
    'history capsule injection');
write('v03/index.js', index);

// ---------------------------------------------------------------------------
// User-visible opt-out. Default remains enabled because it costs no extra
// generation, but users can remove the small capsule entirely.
// ---------------------------------------------------------------------------
let ui = read('v03/ui.js');
ui = rep(ui,
    "              <label class=\"npc-state-setting-row\"><span><b>Context depth</b><small>Older messages are profile/memory context only; relationship deltas remain current-exchange-only.</small></span><input id=\"npc_state_v3_scan_depth\" class=\"text_pole npc-state-number\" type=\"number\" min=\"2\" max=\"30\"></label>\n              <label class=\"npc-state-setting-row\"><span><b>Inject in-chat NPCs</b>",
    "              <label class=\"npc-state-setting-row\"><span><b>Context depth</b><small>Older messages are profile/memory context only; relationship deltas remain current-exchange-only.</small></span><input id=\"npc_state_v3_scan_depth\" class=\"text_pole npc-state-number\" type=\"number\" min=\"2\" max=\"30\"></label>\n              <label class=\"npc-state-setting-row\"><span><b>Enrich new NPCs from recent history</b><small>Adds a small visible-history capsule to the same foreground generation. Current exchange still decides admission, live state, and relationship changes. No extra model call.</small></span><input id=\"npc_state_v04_new_npc_history\" type=\"checkbox\"></label>\n              <label class=\"npc-state-setting-row\"><span><b>Inject in-chat NPCs</b>",
    'history setting UI');
ui = rep(ui,
    "        panel.querySelector('#npc_state_v3_scan_depth').value = settings.scanDepth;\n        panel.querySelector('#npc_state_v3_inject').checked",
    "        panel.querySelector('#npc_state_v3_scan_depth').value = settings.scanDepth;\n        panel.querySelector('#npc_state_v04_new_npc_history').checked = settings.newNpcHistoryEnrichment !== false;\n        panel.querySelector('#npc_state_v3_inject').checked",
    'history setting sync');
ui = rep(ui,
    "        bindCheck('#npc_state_v04_fallback', 'fallbackScan');\n        bindCheck('#npc_state_v3_inject', 'inject');",
    "        bindCheck('#npc_state_v04_fallback', 'fallbackScan');\n        bindCheck('#npc_state_v04_new_npc_history', 'newNpcHistoryEnrichment');\n        bindCheck('#npc_state_v3_inject', 'inject');",
    'history setting bind');
write('v03/ui.js', ui);

let changelog = read('CHANGELOG.md');
const line = '- Phase 7B adds optional one-pass new-NPC history enrichment without restoring v0.2 backfill calls. When enabled, the foreground capture receives at most six prior non-system messages / 3500 visible characters, with Megumin reference blocks and NPC/Inventory transports removed. The capsule can enrich only durable foundational facts and memories after the current exchange independently admits the new NPC. Backend current-exchange identity matching prevents history-only dossier creation, and new-NPC numeric relationship evidence must still be grounded in the live exchange. A settings toggle disables the capsule entirely.';
if (!changelog.includes(line)) changelog = rep(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase 7B changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 7B one-pass new-NPC history enrichment');

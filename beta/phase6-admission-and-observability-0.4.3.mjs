import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing Phase 6 marker: ' + label);
    return source.replace(from, to);
}

// 6A: small admission policy enum, no persistent candidate subsystem.
let schema = fs.readFileSync('v03/schema.js', 'utf8');
schema = replaceRequired(
    schema,
    "export const NPC_STATE_SCHEMA_VERSION = 1;\n",
    "export const NPC_STATE_SCHEMA_VERSION = 1;\nexport const NPC_ADMISSION_MODES = Object.freeze(['balanced', 'named_preferred', 'manual']);\nexport function normalizeNpcAdmissionMode(value) {\n    const mode = String(value || '').trim().toLocaleLowerCase();\n    return NPC_ADMISSION_MODES.includes(mode) ? mode : 'balanced';\n}\n",
    'admission enum',
);
fs.writeFileSync('v03/schema.js', schema);

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');
scanner = replaceRequired(
    scanner,
    "    normalizeName,\n    normalizeNpc,\n",
    "    normalizeName,\n    normalizeNpc,\n    normalizeNpcAdmissionMode,\n",
    'scanner admission import',
);
scanner = replaceRequired(
    scanner,
`function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '') {
    if (findNpcByReference(state, patch?.name || '')) return true;
    if (!newPatchMentionedInCurrentExchange(patch, currentAdmissionText)) return false;
    if (!policy?.detected) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    return !['world', 'inner', 'excluded'].includes(scope);
}
`,
`function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '') {
    if (findNpcByReference(state, patch?.name || '')) return true;
    if (!newPatchMentionedInCurrentExchange(patch, currentAdmissionText)) return false;
    if (!policy?.detected) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    return !['world', 'inner', 'excluded'].includes(scope);
}

export function newNpcAdmissionAllows(patch, mode = 'balanced', referenceCandidates = []) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'balanced') return true;
    if (policy === 'manual') return false;
    const kind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    if (['role-label', 'role', 'unnamed'].includes(kind)) return false;
    if (['named', 'proper-name', 'proper'].includes(kind)) return true;
    // Weak-model fallback for Named preferred: a human name that merely wraps its declared
    // occupation (Northern Gate Guard / role Guard) is treated as a role label. Otherwise a
    // canonical name/alias may admit. Balanced remains the backwards-compatible default.
    const name = canonicalPatchName(patch, referenceCandidates);
    const nameKey = normalizeName(name);
    const roleKey = normalizeName(patch?.role);
    if (!nameKey) return false;
    if (roleKey && (nameKey === roleKey || containsNormalizedPhrase(nameKey, roleKey))) return false;
    return true;
}

function admissionPromptRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION POLICY: Manual. Do not return NEW npcs entries or new-NPC activity references. Existing dossiers may still update normally.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION POLICY: Named preferred. A new dossier may be proposed only when a proper/personal canonical name is established. Set identityKind to named. Do not propose first-seen unnamed occupation/role labels as dossiers; they remain narrative-only until named or manually added.';
    return 'NEW NPC ADMISSION POLICY: Balanced. Preserve normal v0.4 admission: individually relevant named NPCs and genuinely unique role-label NPCs may be proposed; set identityKind to named or role-label accurately.';
}
`,
    'admission backend helpers',
);
scanner = replaceRequired(
    scanner,
`export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', memoryCriteria = '', playerName = '', dossierLimits = {} }) {
`,
`export function buildScanPrompt({ state, chat, assistantMessageId, scanDepth = 8, relationshipCriteria = '', memoryCriteria = '', playerName = '', dossierLimits = {}, admissionMode = 'balanced' }) {
`,
    'scan prompt admission parameter',
);
scanner = replaceRequired(
    scanner,
`        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',
`,
`        '- Every new NPC referenced by those arrays must also have one npcs entry so identity can be created safely.',
        admissionPromptRule(admissionMode),
`,
    'recovery admission rule',
);
scanner = replaceRequired(
    scanner,
`            name: 'human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*',
            aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty', appearance: 'shared/common appearance, or ordinary single-form appearance', currentForm: 'current named physical form or empty', appearanceForms: [{ name: 'newly established physical form', appearance: 'durable canonical appearance for this form' }], appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', evidence: 'explicit current-exchange correction/growth/change evidence' }], personality: '',
`,
`            name: 'human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*',
            identityKind: 'named|role-label',
            aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty', appearance: 'shared/common appearance, or ordinary single-form appearance', currentForm: 'current named physical form or empty', appearanceForms: [{ name: 'newly established physical form', appearance: 'durable canonical appearance for this form' }], appearanceFormChanges: [{ name: 'existing form explicitly corrected/changed', appearance: 'replacement canonical appearance', evidence: 'explicit current-exchange correction/growth/change evidence' }], personality: '',
`,
    'recovery identity kind contract',
);
scanner = scanner.replaceAll(
    `"name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","aliases":[]`,
    `"name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","identityKind":"named|role-label","aliases":[]`
);
scanner = replaceRequired(
    scanner,
`    const dossierLimits = normalizeDossierLimits(options.dossierLimits);

    state.npcs = state.npcs.map(npc => repairTechnicalStoredName(sanitizePlayerKeyRelationships(npc, playerName)));
`,
`    const dossierLimits = normalizeDossierLimits(options.dossierLimits);
    const admissionMode = normalizeNpcAdmissionMode(options.admissionMode);

    state.npcs = state.npcs.map(npc => repairTechnicalStoredName(sanitizePlayerKeyRelationships(npc, playerName)));
`,
    'apply admission mode',
);
scanner = replaceRequired(
    scanner,
`            return !knownId && name && !findNpcByReference(state, name) && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText);
`,
`            return !knownId && name && !findNpcByReference(state, name)
                && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)
                && newNpcAdmissionAllows(patch, admissionMode, identityRefs);
`,
    'bootstrap admission gate',
);
scanner = replaceRequired(
    scanner,
`        if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)) {
`,
`        if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {
`,
    'primary create admission gate',
);
scanner = replaceRequired(
    scanner,
`                    if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)) {
`,
`                    if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, [...identityRefs, ref])) {
`,
    'reference create admission gate',
);
fs.writeFileSync('v03/scanner.js', scanner);

// Foreground prompt uses exactly the same policy, while backend remains authoritative.
let injection = fs.readFileSync('v03/injection.js', 'utf8');
injection = replaceRequired(
    injection,
    "import { structuredEvidencePromptRules } from './evidence-adapter.js';\n",
    "import { structuredEvidencePromptRules } from './evidence-adapter.js';\nimport { normalizeNpcAdmissionMode } from './schema.js';\n",
    'injection admission import',
);
const injectionHelperMarker = `function field(label, value) {`;
if (!injection.includes(injectionHelperMarker)) throw new Error('Missing Phase 6 injection helper marker');
injection = injection.replace(injectionHelperMarker, `function foregroundAdmissionRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION POLICY: Manual. Do not emit new npcs entries or new activity references for untracked characters. Existing NPCs still update normally.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION POLICY: Named preferred. Propose a new dossier only when a proper/personal name is established, with identityKind named. First-seen unnamed role labels remain narrative-only.';
    return 'NEW NPC ADMISSION POLICY: Balanced. Individually relevant named NPCs and genuinely unique role-label NPCs may be proposed; set identityKind to named or role-label accurately.';
}

${injectionHelperMarker}`);
injection = replaceRequired(
    injection,
`    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
`,
`    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    const admissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
`,
    'foreground admission setting',
);
injection = replaceRequired(
    injection,
`        'Every new individually relevant NPC needs a full npcs entry with all grounded foundational information established by the current exchange. If the NEW-NPC HISTORY capsule is present, the current exchange must STILL independently introduce/admit that NPC; only after admission may matching older visible history enrich durable foundational profile facts and important memories. Unknown biography stays empty/null; never invent facts to fill the schema.',
`,
`        foregroundAdmissionRule(admissionMode),
        'Every new individually relevant NPC allowed by the active admission policy needs a full npcs entry with all grounded foundational information established by the current exchange. If the NEW-NPC HISTORY capsule is present, the current exchange must STILL independently introduce/admit that NPC; only after admission may matching older visible history enrich durable foundational profile facts and important memories. Unknown biography stays empty/null; never invent facts to fill the schema.',
`,
    'foreground admission rule placement',
);
injection = injection.replaceAll(
    `"name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","aliases":[]`,
    `"name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","identityKind":"named|role-label","aliases":[]`
);
// Read-only injection diagnostics share the same allocator/candidate selection as production.
injection += `

export function injectionDiagnostics(state, settings = {}) {
    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    const budgetTokens = Math.max(512, Math.min(12000, Math.round(Number(settings.injectBudgetTokens) || 2600)));
    const maxChars = budgetTokens * 4;
    return {
        budgetTokens,
        maxChars,
        dossierBudgetChars: Math.floor(maxChars * 0.68),
        directoryBudgetChars: Math.min(Math.floor(maxChars * 0.20), maxChars - Math.floor(maxChars * 0.68)),
        selectedNpcIds: activeCandidates(state, limit).map(npc => npc.id),
        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),
    };
}
`;
fs.writeFileSync('v03/injection.js', injection);

// Engine sends policy to both recovery and foreground apply paths.
let engine = fs.readFileSync('v03/engine.js', 'utf8');
engine = replaceRequired(
    engine,
`                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
            })}`, 
`,
`                memoryCriteria: settings.memoryCriteria,
                dossierLimits: settings.dossierLimits,
                admissionMode: settings.newNpcAdmissionMode,
            })}`, 
`,
    'recovery prompt admission mode',
);
// There are two normal current-exchange apply paths: separate scan and embedded foreground.
let applyNeedle = `                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),
                dossierLimits: settings.dossierLimits,`;
let applyReplacement = `                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),
                admissionMode: settings.newNpcAdmissionMode,
                dossierLimits: settings.dossierLimits,`;
let count = 0;
while (engine.includes(applyNeedle) && count < 2) {
    engine = engine.replace(applyNeedle, applyReplacement);
    count += 1;
}
if (count !== 2) throw new Error('Phase 6 expected exactly two current-exchange admission apply paths, found ' + count);
fs.writeFileSync('v03/engine.js', engine);

// Settings and public read-only diagnostics.
let index = fs.readFileSync('v03/index.js', 'utf8');
index = replaceRequired(
    index,
    "import { buildInjection } from './injection.js';",
    "import { buildInjection, injectionDiagnostics } from './injection.js';",
    'index injection diagnostics import',
);
index = replaceRequired(
    index,
    "import { DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeDossierLimits } from './schema.js';",
    "import { DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';",
    'index admission normalization import',
);
index = replaceRequired(
    index,
    "import { runSharedQuietGeneration } from './shared-generation-queue.js';",
    "import { runSharedQuietGeneration } from './shared-generation-queue.js';\nimport { checkpointStorageBytes } from './branches.js';",
    'index checkpoint diagnostics import',
);
index = replaceRequired(
    index,
`    newNpcHistoryEnrichment: true,
    staleManagementEnabled: true,
`,
`    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    staleManagementEnabled: true,
`,
    'admission default',
);
index = replaceRequired(
    index,
`    settings.scanDepth = Math.max(2, Math.min(30, Math.round(Number(settings.scanDepth) || 8)));
`,
`    settings.scanDepth = Math.max(2, Math.min(30, Math.round(Number(settings.scanDepth) || 8)));
    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
`,
    'admission settings normalization',
);
const globalMarker = `globalThis.NPCState = Object.freeze({`;
if (!index.includes(globalMarker)) throw new Error('Missing Phase 6 public API marker');
const debugHelpers = `function npcStateDebugStatus() {
    const chatKey = getChatKey();
    const settings = getSettings();
    const state = chatKey && chatKey !== 'no-chat' ? engine.getState(chatKey) : null;
    const pointer = chatKey && chatKey !== 'no-chat' ? getV3Pointer(chatKey) : null;
    const observation = state?.lastObservation || {};
    return {
        version: NPC_STATE_VERSION,
        chatKey,
        sidecar: pointer ? { name: pointer.name || '', path: pointer.path || '', revision: Number(pointer.revision) || 0, updatedAt: Number(pointer.updatedAt) || 0 } : null,
        hydration: chatKey && chatKey !== 'no-chat' ? engine.hydrationStatus(chatKey) : { status: 'no-chat' },
        busy: chatKey && chatKey !== 'no-chat' ? engine.isBusy(chatKey) : false,
        branchSafety: state?.branchSafety ? structuredClone(state.branchSafety) : null,
        checkpointCount: Array.isArray(state?.checkpoints) ? state.checkpoints.length : 0,
        checkpointBytes: state ? checkpointStorageBytes(state) : 0,
        npcCount: Array.isArray(state?.npcs) ? state.npcs.length : 0,
        inChatNpcIds: [...(observation.finalPresentNpcIds || [])],
        exchangeActiveNpcIds: [...(observation.exchangeActiveNpcIds || [])],
        worldActiveNpcIds: [...(observation.worldActiveNpcIds || [])],
        lastScannedMessageId: state?.lastScannedMessageId ?? null,
        structuredEvidenceDetected: (getContext().chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes)),
        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),
        injection: state ? injectionDiagnostics(state, settings) : null,
    };
}

function npcStateScanMetrics() {
    const status = npcStateDebugStatus();
    return {
        npcCount: status.npcCount,
        inChatCount: status.inChatNpcIds.length,
        exchangeActiveCount: status.exchangeActiveNpcIds.length,
        worldActiveCount: status.worldActiveNpcIds.length,
        checkpointCount: status.checkpointCount,
        checkpointBytes: status.checkpointBytes,
        lastScannedMessageId: status.lastScannedMessageId,
        selectedInjectionNpcIds: status.injection?.selectedNpcIds || [],
    };
}

`;
index = index.replace(globalMarker, debugHelpers + globalMarker);
index = replaceRequired(
    index,
`    version: NPC_STATE_VERSION,
    scan: () => {
`,
`    version: NPC_STATE_VERSION,
    debugStatus: npcStateDebugStatus,
    scanMetrics: npcStateScanMetrics,
    scan: () => {
`,
    'debug public API',
);
fs.writeFileSync('v03/index.js', index);

// Settings UI admission selector.
let ui = fs.readFileSync('v03/ui.js', 'utf8');
ui = replaceRequired(
    ui,
`              <label class="npc-state-setting-row"><span><b>Enrich new NPCs from recent history</b><small>Adds a small visible-history capsule to the same foreground generation. Current exchange still decides admission, live state, and relationship changes. No extra model call.</small></span><input id="npc_state_v04_new_npc_history" type="checkbox"></label>
`,
`              <label class="npc-state-setting-row"><span><b>Enrich new NPCs from recent history</b><small>Adds a small visible-history capsule to the same foreground generation. Current exchange still decides admission, live state, and relationship changes. No extra model call.</small></span><input id="npc_state_v04_new_npc_history" type="checkbox"></label>
              <label class="npc-state-setting-row"><span><b>New NPC admission</b><small>Balanced keeps current behavior. Named preferred ignores first-seen unnamed role labels. Manual prevents scanner-created dossiers while existing NPCs still update.</small></span><select id="npc_state_v04_admission" class="text_pole"><option value="balanced">Balanced</option><option value="named_preferred">Named preferred</option><option value="manual">Manual</option></select></label>
`,
    'admission setting UI',
);
ui = replaceRequired(
    ui,
`        panel.querySelector('#npc_state_v04_new_npc_history').checked = settings.newNpcHistoryEnrichment !== false;
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;
`,
`        panel.querySelector('#npc_state_v04_new_npc_history').checked = settings.newNpcHistoryEnrichment !== false;
        panel.querySelector('#npc_state_v04_admission').value = settings.newNpcAdmissionMode || 'balanced';
        panel.querySelector('#npc_state_v3_inject').checked = settings.inject !== false;
`,
    'admission setting sync',
);
ui = replaceRequired(
    ui,
`        bindCheck('#npc_state_v04_new_npc_history', 'newNpcHistoryEnrichment');
        bindCheck('#npc_state_v3_inject', 'inject');
`,
`        bindCheck('#npc_state_v04_new_npc_history', 'newNpcHistoryEnrichment');
        panel.querySelector('#npc_state_v04_admission')?.addEventListener('change', event => {
            const value = String(event.target.value || 'balanced');
            getSettings().newNpcAdmissionMode = ['balanced', 'named_preferred', 'manual'].includes(value) ? value : 'balanced';
            event.target.value = getSettings().newNpcAdmissionMode;
            persistSettings(); onSettingsChanged();
        });
        bindCheck('#npc_state_v3_inject', 'inject');
`,
    'admission setting binding',
);
fs.writeFileSync('v03/ui.js', ui);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 6 adds lightweight new-NPC admission control without reviving the v0.2 candidate database: Balanced preserves current behavior, Named preferred auto-admits only proper/personal names, and Manual prevents scanner-created dossiers while existing NPC updates continue. It also adds read-only NPCState.debugStatus() / scanMetrics() diagnostics covering sidecar revision, branch safety, checkpoint count/bytes, current activity sets, structured-block detection, admission mode, and actual injection selection/budget.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 6 admission control and observability');

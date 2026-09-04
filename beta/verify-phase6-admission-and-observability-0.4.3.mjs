import fs from 'node:fs';
import {
    createEmptyState,
    normalizeNpc,
    normalizeNpcAdmissionMode,
} from '../v03/schema.js';
import {
    applyScanResult,
    buildScanPrompt,
    newNpcAdmissionAllows,
} from '../v03/scanner.js';
import { buildInjection, injectionDiagnostics } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

assert(normalizeNpcAdmissionMode('balanced') === 'balanced', 'Balanced admission mode normalization failed');
assert(normalizeNpcAdmissionMode('named_preferred') === 'named_preferred', 'Named-preferred admission mode normalization failed');
assert(normalizeNpcAdmissionMode('manual') === 'manual', 'Manual admission mode normalization failed');
assert(normalizeNpcAdmissionMode('nonsense') === 'balanced', 'Unknown admission mode did not fail back to Balanced');

const namedPatch = { name: 'Corinne Holt', identityKind: 'named', role: 'Registrar' };
const rolePatch = { name: 'Northern Gate Guard', identityKind: 'role-label', role: 'Guard' };
const weakRolePatch = { name: 'Northern Gate Guard', role: 'Guard' };
assert(newNpcAdmissionAllows(namedPatch, 'balanced'), 'Balanced mode rejected a named NPC');
assert(newNpcAdmissionAllows(rolePatch, 'balanced'), 'Balanced mode rejected a unique role-label NPC');
assert(newNpcAdmissionAllows(namedPatch, 'named_preferred'), 'Named-preferred mode rejected an explicit proper name');
assert(!newNpcAdmissionAllows(rolePatch, 'named_preferred'), 'Named-preferred mode admitted explicit role-label NPC');
assert(!newNpcAdmissionAllows(weakRolePatch, 'named_preferred'), 'Named-preferred weak-model fallback admitted a name wrapping its role');
assert(!newNpcAdmissionAllows(namedPatch, 'manual'), 'Manual admission mode admitted a new NPC');

function scanNew(patch, mode) {
    const state = createEmptyState('phase6-' + mode + '-' + String(patch.name).replace(/\s+/g, '-'));
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: [patch.name],
        inChatNpcIds: [patch.name],
        worldActiveNpcIds: [],
        npcs: [{
            id: '', aliases: [], species: '', age: '', apparentAge: '', appearance: '', personality: '', behaviorProfile: [], speech: '', mannerisms: [], background: '', keyRelationships: [], memories: [],
            relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },
            ...patch,
        }],
        socialEdges: [],
    }, {
        sourceMessageId: 1,
        turn: 1,
        currentAdmissionText: patch.name + ' speaks directly to the player.',
        admissionMode: mode,
        applyReturnedNpcPatches: true,
    });
    return result.state;
}
assert(scanNew(namedPatch, 'balanced').npcs.length === 1, 'Balanced backend did not create named NPC');
assert(scanNew(rolePatch, 'balanced').npcs.length === 1, 'Balanced backend did not create unique role-label NPC');
assert(scanNew(namedPatch, 'manual').npcs.length === 0, 'Manual backend created a new dossier');
assert(scanNew(rolePatch, 'named_preferred').npcs.length === 0, 'Named-preferred backend created role-label dossier');
assert(scanNew(namedPatch, 'named_preferred').npcs.length === 1, 'Named-preferred backend did not create proper named dossier');

// Admission applies only to creation. Existing NPCs continue to receive grounded updates in Manual mode.
let existing = createEmptyState('phase6-existing');
existing.npcs = [normalizeNpc({ id: 'npc-existing-phase6', name: 'Mira', mood: 'Calm', present: true })];
existing = applyScanResult(existing, {
    exchangeActiveNpcIds: ['npc-existing-phase6'], inChatNpcIds: ['npc-existing-phase6'], worldActiveNpcIds: [],
    npcs: [{ id: 'npc-existing-phase6', name: 'Mira', mood: 'Concerned', relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }],
    socialEdges: [],
}, { sourceMessageId: 2, turn: 2, admissionMode: 'manual', applyReturnedNpcPatches: true }).state;
assert(existing.npcs[0].mood === 'Concerned', 'Manual admission mode blocked an existing NPC update');

const chat = [
    { is_user: true, is_system: false, mes: 'A named woman, Corinne Holt, approaches.' },
    { is_user: false, is_system: false, mes: 'Corinne Holt introduces herself as the registrar.' },
];
const recoveryPrompt = buildScanPrompt({ state: createEmptyState('phase6-prompt'), chat, assistantMessageId: 1, admissionMode: 'manual' });
assert(recoveryPrompt.includes('NEW NPC ADMISSION POLICY: Manual'), 'Recovery scanner did not receive Manual admission policy');
assert(recoveryPrompt.includes('identityKind'), 'Recovery output contract does not distinguish named vs role-label identity');

const foregroundState = createEmptyState('phase6-injection');
foregroundState.npcs = [
    normalizeNpc({ id: 'npc-present-phase6', name: 'Astra', present: true, importance: 0 }),
    normalizeNpc({ id: 'npc-offscreen-phase6', name: 'Remote Noble', present: false, importance: 100 }),
];
foregroundState.lastObservation = { exchangeActiveNpcIds: ['npc-present-phase6'], finalPresentNpcIds: ['npc-present-phase6'], worldActiveNpcIds: [] };
const foreground = buildInjection(foregroundState, { enabled: true, autoScan: true, inject: true, newNpcAdmissionMode: 'named_preferred', injectBudgetTokens: 1800 });
assert(foreground.includes('NEW NPC ADMISSION POLICY: Named preferred'), 'Foreground capture did not receive Named-preferred policy');
assert(foreground.includes('identityKind'), 'Foreground output contract does not carry identityKind');
const diag = injectionDiagnostics(foregroundState, { newNpcAdmissionMode: 'named_preferred', injectBudgetTokens: 1800, injectLimit: 6 });
assert(diag.admissionMode === 'named_preferred', 'Injection diagnostics reported wrong admission mode');
assert(diag.selectedNpcIds[0] === 'npc-present-phase6', 'Injection diagnostics do not use production salience ordering');
assert(diag.dossierBudgetChars > diag.directoryBudgetChars, 'Injection diagnostics do not expose reserved dossier-first budget');

const engineSource = fs.readFileSync(new URL('../v03/engine.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../v03/index.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../v03/ui.js', import.meta.url), 'utf8');
assert((engineSource.match(/admissionMode: settings\.newNpcAdmissionMode/g) || []).length >= 3, 'Recovery/foreground engine paths do not consistently carry admission policy');
assert(indexSource.includes("newNpcAdmissionMode: 'balanced'"), 'Balanced backwards-compatible admission default missing');
assert(indexSource.includes('debugStatus: npcStateDebugStatus'), 'NPCState.debugStatus public API missing');
assert(indexSource.includes('scanMetrics: npcStateScanMetrics'), 'NPCState.scanMetrics public API missing');
for (const field of ['checkpointBytes', 'inChatNpcIds', 'worldActiveNpcIds', 'structuredEvidenceDetected', 'admissionMode', 'injection']) {
    assert(indexSource.includes(field), 'debugStatus does not expose diagnostic field: ' + field);
}
assert(uiSource.includes('npc_state_v04_admission'), 'Admission mode settings UI missing');
assert(uiSource.includes('Named preferred') && uiSource.includes('Manual'), 'Admission UI mode choices incomplete');

console.log('NPC State 0.4.3 Phase 6 admission and observability verification passed');

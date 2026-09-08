import * as core from './scan-application.js';
import { normalizeScanPayload, parseScanJson, validateFocusedProposalPayload } from './scan-payload.js';
import { findNpcByReference, normalizeNpcAdmissionMode, normalizeRelationshipSummary } from './schema.js';
import { adaptLegacySemanticPayload } from './model/legacy-semantic-adapter.js';
import {
    applyModelLedFamilyFacts,
    applyModelLedSemanticUpdates,
    auditDossierEvaluationCoverage,
    prepareModelLedPayload,
} from './model/semantic-updates.js';

export { currentExchange } from './scan-helpers.js';
export { recentHistory, buildScanPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from './scan-prompts.js';
export { parseScanJson };
export { keyRelationshipReferencesPlayer, reconcileFamilyGraphState } from './scan-application.js';

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = core.sanitizeStructuredDossierPatch(patch, npc);
    if (Array.isArray(patch?.semanticUpdates)) out.semanticUpdates = structuredClone(patch.semanticUpdates);
    if (Array.isArray(patch?.evaluatedGroups)) out.evaluatedGroups = structuredClone(patch.evaluatedGroups);
    return out;
}

export function newNpcAdmissionAllows(patch, mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return false;
    const name = String(patch?.name || '').trim();
    if (!name || /^npc(?:[-_:]|$)/i.test(name)) return false;
    const kind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    if (policy === 'named_preferred') return ['named', 'proper-name', 'proper'].includes(kind);
    return ['named', 'proper-name', 'proper', 'role-label', 'role', 'unnamed', ''].includes(kind);
}

function currentDynamicCoverage(state, result, npcIds = [], patchResolutions = null, diagnostics = []) {
    const patches = Array.isArray(result?.npcs) ? result.npcs : [];
    const out = structuredClone(diagnostics);
    for (const npcId of npcIds) {
        const npc = (state?.npcs || []).find(item => item.id === npcId) || findNpcByReference(state, npcId);
        if (!npc || normalizeRelationshipSummary(npc.relationshipSummary)) continue;
        let patch = null;
        if (Array.isArray(patchResolutions)) {
            const resolution = patchResolutions.find(row => row?.status === 'accepted' && row.npcId === npc.id);
            if (resolution) patch = patches[Number(resolution.patchIndex)] || null;
        }
        if (!patch) {
            patch = patches.find(candidate => {
                if (String(candidate?.id || '').trim() === npc.id) return true;
                const name = String(candidate?.name || '').trim();
                return name && findNpcByReference({ npcs: [npc] }, name)?.id === npc.id;
            }) || null;
        }
        if (!patch || Object.prototype.hasOwnProperty.call(patch, 'relationshipSummary')) continue;
        const existing = out.find(row => row.npcId === npc.id && row.status === 'incomplete-evaluation');
        if (existing) {
            existing.missingFields = [...new Set([...(Array.isArray(existing.missingFields) ? existing.missingFields : []), 'relationshipSummary'])];
            continue;
        }
        out.push({
            npcId: npc.id,
            status: 'incomplete-evaluation',
            missingGroups: [],
            missingFields: ['relationshipSummary'],
            coverageKind: 'current-dynamic',
        });
    }
    return out;
}

export function applyScanResult(stateInput, resultInput, options = {}) {
    const semanticOptions = {
        ...options,
        semanticWorldContext: options.semanticWorldContext ?? options.evidencePolicy?.worldStateText ?? '',
        semanticPrivateContext: options.semanticPrivateContext ?? options.evidencePolicy?.innerChatterText ?? '',
    };
    const parsed = typeof resultInput === 'string' ? parseScanJson(resultInput) : normalizeScanPayload(structuredClone(resultInput || {}), { allowOmittedSupplemental: true });
    const compatibilityDiagnostics = [];
    const focused = validateFocusedProposalPayload(parsed);
    compatibilityDiagnostics.push(...focused.diagnostics);
    const adapted = adaptLegacySemanticPayload(stateInput, focused.result, { ...semanticOptions, compatibilityDiagnostics });
    const prepared = prepareModelLedPayload(stateInput, adapted, options.admissionMode);
    const applied = core.applyScanResult(stateInput, prepared, options);
    const semantic = applyModelLedSemanticUpdates(applied.state, adapted, {
        ...semanticOptions,
        patchResolutions: applied.patchResolutions,
    });
    const family = applyModelLedFamilyFacts(semantic.state, adapted, options);
    const coverageNpcIds = Array.isArray(options.coverageNpcIds)
        ? options.coverageNpcIds
        : (options.requireDossierCoverage === true ? applied.exchangeActiveNpcIds : []);
    const ordinaryCoverage = coverageNpcIds.length
        ? auditDossierEvaluationCoverage(family.state, adapted, { npcIds: coverageNpcIds, patchResolutions: applied.patchResolutions })
        : [];
    const coverageDiagnostics = coverageNpcIds.length
        ? currentDynamicCoverage(family.state, adapted, coverageNpcIds, applied.patchResolutions, ordinaryCoverage)
        : [];
    return {
        ...applied,
        state: family.state,
        semanticDiagnostics: [...compatibilityDiagnostics, ...(applied.applicationDiagnostics || []), ...semantic.diagnostics, ...family.diagnostics],
        coverageDiagnostics,
    };
}

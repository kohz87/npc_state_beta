import * as core from './scan-application.js';
import { normalizeScanPayload, parseScanJson, validateFocusedProposalPayload } from './scan-payload.js';
import { normalizeNpcAdmissionMode } from './schema.js';
import { adaptLegacySemanticPayload } from './model/legacy-semantic-adapter.js';
import {
    applyModelLedFamilyFacts,
    applyModelLedSemanticUpdates,
    auditDossierEvaluationCoverage,
    prepareModelLedPayload,
} from './model/semantic-updates.js';

export { currentExchange } from './scan-helpers.js';
export { recentHistory, buildScanPrompt, buildCompletenessPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from './scan-prompts.js';
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
    const coverageDiagnostics = coverageNpcIds.length
        ? auditDossierEvaluationCoverage(family.state, adapted, { npcIds: coverageNpcIds, patchResolutions: applied.patchResolutions })
        : [];
    return {
        ...applied,
        state: family.state,
        semanticDiagnostics: [...compatibilityDiagnostics, ...(applied.applicationDiagnostics || []), ...semantic.diagnostics, ...family.diagnostics],
        coverageDiagnostics,
    };
}

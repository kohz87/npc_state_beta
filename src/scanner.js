import * as core from './scan-application.js';
import { normalizeScanPayload, parseScanJson, validateFocusedProposalPayload } from './scan-payload.js';
import { findNpcByReference, normalizeNpcAdmissionMode, normalizeRelationshipSummary } from './schema.js';
import { adaptLegacySemanticPayload } from './model/legacy-semantic-adapter.js';
import { applyProfileObservations } from './profile-observations.js';
import {
    applyModelLedFamilyFacts,
    applyModelLedSemanticUpdates,
    auditDossierEvaluationCoverage,
    prepareModelLedPayload,
} from './model/semantic-updates.js';
import {
    SCAN_SYSTEM_PROMPT,
    recentHistory,
    relevantNpcsForExchange,
    buildScanPrompt as buildBaseScanPrompt,
    buildFirstContactCompletionPrompt,
    buildTargetedRefreshPrompt,
    buildStructuredDossierImportPrompt,
} from './scan-prompts.js';

export { currentExchange } from './scan-helpers.js';
export { SCAN_SYSTEM_PROMPT, recentHistory, relevantNpcsForExchange, buildFirstContactCompletionPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt };
export { parseScanJson };
export { keyRelationshipReferencesPlayer, reconcileFamilyGraphState } from './scan-application.js';

function canonicalRoutineScanPrompt(prompt) {
    return String(prompt || '')
        .replace(
            'NEW ordinary fields are flat; []=string arrays; appearanceForms:[{name,appearance}].',
            'NEW ordinary dossier fields use semanticUpdates with exact permitted sources; use establish for supported blank fields. Do not also emit flat ordinary field replacements. []=string arrays; appearanceForms:[{name,appearance}].',
        )
        .replace(
            'VALID FICTIONAL EXAMPLE: populated NEW live/profile + zero-delta Current Dynamic + insufficient fields. Never copy facts/ids.',
            'LEGACY-SHAPE FICTIONAL EXAMPLE: facts are illustrative only; do not copy its flat NEW ordinary-field layout. Current NEW ordinary dossier fields use semanticUpdates with exact permitted sources.',
        )
        .replace(
            'EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates; do not also emit legacy/direct ordinary replacements.',
            'NEW and EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates; do not also emit legacy/direct ordinary replacements. NEW uses establish for supported blank fields.',
        )
        .replace(
            'PIPELINE: ordinary EXISTING-dossier fields apply through semanticUpdates once;',
            'PIPELINE: ordinary NEW/EXISTING dossier fields apply through semanticUpdates once;',
        );
}

export function buildScanPrompt(options = {}) {
    return canonicalRoutineScanPrompt(buildBaseScanPrompt(options));
}

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

const NEW_PROFILE_ESTABLISHMENT_BASES = new Set(['explicit', 'reinforced']);

function normalizeNewNpcSemanticBootstrap(stateInput, resultInput, diagnostics = []) {
    const result = structuredClone(resultInput || {});
    const state = stateInput || {};
    for (let patchIndex = 0; patchIndex < (Array.isArray(result.npcs) ? result.npcs.length : 0); patchIndex += 1) {
        const patch = result.npcs[patchIndex];
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) continue;
        const patchId = String(patch.id || '').trim();
        const existing = (patchId ? (state.npcs || []).find(npc => npc.id === patchId) || null : null)
            || findNpcByReference(state, patch.name || '');
        if (existing) continue;

        const establishment = patch.profileEstablishment && typeof patch.profileEstablishment === 'object' && !Array.isArray(patch.profileEstablishment)
            ? patch.profileEstablishment
            : {};
        const mannerismBasis = String(establishment.mannerisms || '').trim().toLocaleLowerCase();
        const semanticUpdates = [];
        for (const raw of Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                semanticUpdates.push(raw);
                continue;
            }
            const update = structuredClone(raw);
            const field = String(update.field || '').trim();
            const operation = String(update.operation || '').trim().toLocaleLowerCase();
            if (field === 'mannerisms' && operation !== 'remove' && !NEW_PROFILE_ESTABLISHMENT_BASES.has(mannerismBasis)) {
                diagnostics.push({
                    npcId: '', patchIndex, field: 'mannerisms', group: 'profile', channel: 'new-semantic-bootstrap',
                    status: 'rejected-proposal', reason: 'profile-establishment-basis-required',
                });
                continue;
            }
            // Passive generated birthdays are metadata fallback. A grounded explicit birthday
            // from the same NEW admission must be able to supersede that generated value once
            // its source passes the ordinary semantic validator.
            if (field === 'birthday' && operation === 'establish') update.operation = 'replace';
            semanticUpdates.push(update);
        }
        if (Array.isArray(patch.semanticUpdates)) patch.semanticUpdates = semanticUpdates;
    }
    return result;
}

function auditCandidateAccounting(state, result, candidateNpcIds = [], exchangeActiveNpcIds = []) {
    const allowed = new Set(['evaluated', 'mentioned', 'inactive', 'unresolved']);
    const accounting = result?.candidateAccounting && typeof result.candidateAccounting === 'object' && !Array.isArray(result.candidateAccounting)
        ? result.candidateAccounting
        : {};
    const active = new Set(Array.isArray(exchangeActiveNpcIds) ? exchangeActiveNpcIds : []);
    const evaluatedNpcIds = [];
    const diagnostics = [];
    for (const npcId of Array.isArray(candidateNpcIds) ? candidateNpcIds : []) {
        const npc = (state?.npcs || []).find(item => item.id === npcId);
        if (!npc) continue;
        const status = typeof accounting[npc.id] === 'string' ? accounting[npc.id].trim().toLocaleLowerCase() : '';
        if (!status) {
            diagnostics.push({ npcId: npc.id, status: 'missing-candidate-accounting', coverageKind: 'candidate' });
            continue;
        }
        if (!allowed.has(status)) {
            diagnostics.push({ npcId: npc.id, status: 'invalid-candidate-accounting', coverageKind: 'candidate', reason: status.slice(0, 80) });
            continue;
        }
        if (status === 'evaluated') evaluatedNpcIds.push(npc.id);
        if (status === 'unresolved') diagnostics.push({ npcId: npc.id, status: 'candidate-unresolved', coverageKind: 'candidate' });
        if (active.has(npc.id) && status !== 'evaluated') {
            diagnostics.push({ npcId: npc.id, status: 'candidate-accounting-conflict', coverageKind: 'candidate', reason: `exchange-active-candidate-reported-${status}` });
        }
    }
    return { diagnostics, evaluatedNpcIds };
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
    const canonicalized = normalizeNewNpcSemanticBootstrap(stateInput, adapted, compatibilityDiagnostics);
    const prepared = prepareModelLedPayload(stateInput, canonicalized, options.admissionMode);
    const applied = core.applyScanResult(stateInput, prepared, options);
    const observations = applyProfileObservations(applied.state, canonicalized, {
        ...semanticOptions,
        patchResolutions: applied.patchResolutions,
    });
    const semantic = applyModelLedSemanticUpdates(observations.state, canonicalized, {
        ...semanticOptions,
        patchResolutions: applied.patchResolutions,
    });
    const family = applyModelLedFamilyFacts(semantic.state, canonicalized, options);
    const coverageNpcIds = Array.isArray(options.coverageNpcIds)
        ? options.coverageNpcIds
        : (options.requireDossierCoverage === true ? applied.exchangeActiveNpcIds : []);
    const candidateAudit = options.requireCandidateAccounting === true
        ? auditCandidateAccounting(family.state, canonicalized, coverageNpcIds, applied.exchangeActiveNpcIds)
        : { diagnostics: [], evaluatedNpcIds: coverageNpcIds };
    const ordinaryCoverageNpcIds = [...new Set([
        ...(options.requireCandidateAccounting === true ? candidateAudit.evaluatedNpcIds : coverageNpcIds),
        ...applied.exchangeActiveNpcIds,
    ])];
    const ordinaryCoverage = ordinaryCoverageNpcIds.length
        ? auditDossierEvaluationCoverage(family.state, canonicalized, { npcIds: ordinaryCoverageNpcIds, patchResolutions: applied.patchResolutions })
        : [];
    const dynamicCoverageNpcIds = options.requireCandidateAccounting === true ? applied.exchangeActiveNpcIds : ordinaryCoverageNpcIds;
    const coverageDiagnostics = currentDynamicCoverage(
        family.state,
        canonicalized,
        dynamicCoverageNpcIds,
        applied.patchResolutions,
        [...candidateAudit.diagnostics, ...ordinaryCoverage],
    );
    return {
        ...applied,
        state: family.state,
        semanticDiagnostics: [...compatibilityDiagnostics, ...(applied.applicationDiagnostics || []), ...observations.diagnostics, ...semantic.diagnostics, ...family.diagnostics],
        coverageDiagnostics,
    };
}

import * as core from './scanner-core.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';
import { adaptLegacySemanticPayload } from './model/legacy-semantic-adapter.js';
import {
    applyModelLedFamilyFacts,
    applyModelLedSemanticUpdates,
    auditDossierEvaluationCoverage,
    prepareModelLedPayload,
    semanticUpdatePrompt,
} from './model/semantic-updates.js';

export * from './scanner-core.js';

function nonSystemIds(chat = [], through = null, limit = 30) {
    const end = Number.isInteger(through) ? Math.min(through, chat.length - 1) : chat.length - 1;
    const out = [];
    for (let i = 0; i <= end; i += 1) if (chat[i] && !chat[i].is_system) out.push(i);
    return out.slice(-Math.max(2, Math.min(60, Number(limit) || 30)));
}

function released(text) {
    return String(text || '').replaceAll('v0.4.44', `v${NPC_STATE_VERSION}`);
}

function semanticAppend({ npcs = [], mode = 'scan', sourceIds = [] } = {}) {
    return [
        semanticUpdatePrompt({ npcs, mode, allowedSourceIds: sourceIds, compactContext: true }),
        'SINGLE-PIPELINE INVARIANT: after response compatibility normalization, every ordinary EXISTING-dossier field change is applied through semanticUpdates exactly once. Identity/admission, NPC-to-player relationship scoring/Current Dynamic, lifecycle, activity/presence, and family graph safety remain separate deterministic channels.',
        'MODEL-LED FAMILY / KINSHIP: familyFacts.relation is directional from owner toward each member. Preserve custom relation labels; add reciprocalRelation only when established or safely symmetric. Never invent members, gender, biological status, or reciprocity.',
    ].join('\n\n');
}

export function buildScanPrompt(args = {}) {
    const base = released(core.buildScanPrompt(args));
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(4, Number(args.scanDepth) || 8) + 2);
    return `${base}\n\n${semanticAppend({ npcs: args.state?.npcs || [], mode: 'scan', sourceIds: ids })}`;
}

export function buildCompletenessPrompt(args = {}) {
    const base = released(core.buildCompletenessPrompt(args));
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(4, Number(args.scanDepth) || 8) + 2);
    return `${base}\n\n${semanticAppend({ npcs: args.state?.npcs || [], mode: 'completeness', sourceIds: ids })}`;
}

export function buildTargetedRefreshPrompt(args = {}) {
    const base = released(core.buildTargetedRefreshPrompt(args));
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(2, Math.min(30, Math.round(Number(args.scanDepth) || 12))));
    return `${base}\n\n${semanticAppend({ npcs: args.npc ? [args.npc] : [], mode: 'refresh', sourceIds: ids })}`;
}

export function buildStructuredDossierImportPrompt(args = {}) {
    const base = released(core.buildStructuredDossierImportPrompt(args));
    const ids = (Array.isArray(args.blocks) ? args.blocks : []).map(block => block?.messageId).filter(Number.isInteger);
    return `${base}\n\n${semanticAppend({ npcs: args.npc ? [args.npc] : [], mode: 'structured-import', sourceIds: ids })}`;
}

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = core.sanitizeStructuredDossierPatch(patch, npc);
    if (Array.isArray(patch?.semanticUpdates)) out.semanticUpdates = structuredClone(patch.semanticUpdates);
    if (Array.isArray(patch?.evaluatedGroups)) out.evaluatedGroups = structuredClone(patch.evaluatedGroups);
    return out;
}

export function parseScanJson(raw, options = {}) {
    return core.parseScanJson(raw, options);
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
    const parsed = typeof resultInput === 'string' ? parseScanJson(resultInput) : structuredClone(resultInput || {});
    const adapted = adaptLegacySemanticPayload(stateInput, parsed, semanticOptions);
    const prepared = prepareModelLedPayload(stateInput, adapted, options.admissionMode);
    const applied = core.applyScanResult(stateInput, prepared, options);
    const semantic = applyModelLedSemanticUpdates(applied.state, adapted, semanticOptions);
    const family = applyModelLedFamilyFacts(semantic.state, adapted, options);
    const coverageNpcIds = Array.isArray(options.coverageNpcIds)
        ? options.coverageNpcIds
        : (options.requireDossierCoverage === true ? applied.exchangeActiveNpcIds : []);
    const coverageDiagnostics = coverageNpcIds.length
        ? auditDossierEvaluationCoverage(family.state, adapted, { npcIds: coverageNpcIds })
        : [];
    return {
        ...applied,
        state: family.state,
        semanticDiagnostics: [...semantic.diagnostics, ...family.diagnostics],
        coverageDiagnostics,
    };
}

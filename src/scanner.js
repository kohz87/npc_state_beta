import * as core from './scanner-core.js';
import { normalizeNpcAdmissionMode } from './schema.js';
import { adaptLegacySemanticPayload } from './model/legacy-semantic-adapter.js';
import {
    applyModelLedFamilyFacts,
    applyModelLedSemanticUpdates,
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

function semanticAppend({ npcs = [], mode = 'scan', sourceIds = [] } = {}) {
    return [
        semanticUpdatePrompt({ npcs, mode, allowedSourceIds: sourceIds }),
        'MODEL-LED FAMILY / KINSHIP: top-level familyFacts.relation is a directional relationship from owner toward each member. Interpret the supplied narrative semantically in any language. Do not depend on a fixed English kinship vocabulary. You may add reciprocalRelation only when the reciprocal relation is actually established or safely symmetric; otherwise leave it empty. Never invent a relative name, gender, biological status, or category. Unknown/custom relation labels are valid and should be preserved rather than forced into a different category.',
        'For existing dossiers, semanticUpdates is the authoritative durable-change channel in this contract. Direct stable fields may still be used for new-dossier bootstrap and compatibility, but do not use legacy profileChanges/canonChanges as the reason to withhold a grounded semantic update.',
    ].join('\n\n');
}

export function buildScanPrompt(args = {}) {
    const base = core.buildScanPrompt(args);
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(4, Number(args.scanDepth) || 8) + 2);
    return `${base}\n\n${semanticAppend({ npcs: args.state?.npcs || [], mode: 'scan', sourceIds: ids })}`;
}

export function buildCompletenessPrompt(args = {}) {
    const base = core.buildCompletenessPrompt(args);
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(4, Number(args.scanDepth) || 8) + 2);
    return `${base}\n\n${semanticAppend({ npcs: args.state?.npcs || [], mode: 'completeness', sourceIds: ids })}`;
}

export function buildTargetedRefreshPrompt(args = {}) {
    const base = core.buildTargetedRefreshPrompt(args);
    const ids = nonSystemIds(args.chat || [], args.assistantMessageId, Math.max(2, Math.min(30, Math.round(Number(args.scanDepth) || 12))));
    return `${base}\n\n${semanticAppend({ npcs: args.npc ? [args.npc] : [], mode: 'refresh', sourceIds: ids })}`;
}

export function buildStructuredDossierImportPrompt(args = {}) {
    const base = core.buildStructuredDossierImportPrompt(args);
    const ids = (Array.isArray(args.blocks) ? args.blocks : []).map(block => block?.messageId).filter(Number.isInteger);
    return `${base}\n\n${semanticAppend({ npcs: args.npc ? [args.npc] : [], mode: 'structured-import', sourceIds: ids })}`;
}

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = core.sanitizeStructuredDossierPatch(patch, npc);
    if (Array.isArray(patch?.semanticUpdates)) out.semanticUpdates = structuredClone(patch.semanticUpdates);
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
    const parsed = typeof resultInput === 'string' ? parseScanJson(resultInput) : structuredClone(resultInput || {});
    const adapted = adaptLegacySemanticPayload(stateInput, parsed, options);
    const prepared = prepareModelLedPayload(stateInput, adapted, options.admissionMode);
    const applied = core.applyScanResult(stateInput, prepared, options);
    const semantic = applyModelLedSemanticUpdates(applied.state, adapted, options);
    const family = applyModelLedFamilyFacts(semantic.state, adapted, options);
    return {
        ...applied,
        state: family.state,
        semanticDiagnostics: [...semantic.diagnostics, ...family.diagnostics],
    };
}

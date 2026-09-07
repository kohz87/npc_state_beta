from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    (ROOT / path).write_text(text)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing replacement anchor: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique replacement anchor: {label} ({text.count(old)})')
    return text.replace(old, new, 1)


def replace_span(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'missing span start: {label}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'missing span end: {label}')
    end += len(end_marker)
    return text[:start] + replacement + text[end:]


# Shared model-facing identity/bootstrap guidance. This is mandatory foreground text,
# and Scan imports the same compact rules instead of maintaining a second overlapping copy.
path = 'src/scan-helpers.js'
text = read(path)
anchor = "export function nonSystemMessages(chat = []) {"
shared_rules = """const DOSSIER_IDENTITY_BOOTSTRAP_RULES = Object.freeze([\n    'IDENTITY HANDOFF: EXISTING NPC patches use the supplied stable id. NEW NPC patches leave id empty, use the canonical human-facing name (or unique readable role label while genuinely unnamed), and reference that exact name/label in activity arrays. NPC State assigns the stored id locally.',\n    'NEW DOSSIER BOOTSTRAP: for a newly admitted relevant NPC, capture every supported fact established by the current exchange, including live state and grounded role/species/appearance/profile/canon/collection facts. Do not invent age, species, personality, relationships, or any other unsupported fact; empty/unknown is correct when evidence is absent.',\n    'NAME-ONLY ENRICHMENT: a dossier that already exists but has only identity remains an EXISTING dossier. Keep its stable id and enrich grounded missing fields through normal semanticUpdates; never create a duplicate just to fill Unknown fields.',\n]);\n\nexport function dossierIdentityBootstrapPromptRules() {\n    return [...DOSSIER_IDENTITY_BOOTSTRAP_RULES];\n}\n\n"""
text = replace_once(text, anchor, shared_rules + anchor, 'shared identity/bootstrap rules')
write(path, text)


# scan-application owns the accepted patch-to-NPC binding. Preserve concrete local
# rejection reasons and remove the duplicate admission attempt from resolveRefs.
path = 'src/scan-application.js'
text = read(path)
old_conflict = """function automaticIdentityPatchConflicts(state, npc, patch, referenceCandidates = []) {\n    const values = [\n        canonicalPatchName(patch, referenceCandidates),\n        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),\n    ].map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);\n    for (const value of values) {\n        const owner = identityOwnerForValue(state, value);\n        if (owner && (!npc || owner.id !== npc.id)) return true;\n    }\n    return false;\n}\n"""
new_conflict = """function automaticIdentityPatchConflict(state, npc, patch, referenceCandidates = []) {\n    const values = [\n        canonicalPatchName(patch, referenceCandidates),\n        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),\n    ].map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);\n    for (const value of values) {\n        const owner = identityOwnerForValue(state, value);\n        if (owner && (!npc || owner.id !== npc.id)) return { value, ownerId: owner.id };\n    }\n    return null;\n}\n\nfunction automaticIdentityPatchConflicts(state, npc, patch, referenceCandidates = []) {\n    return Boolean(automaticIdentityPatchConflict(state, npc, patch, referenceCandidates));\n}\n"""
text = replace_once(text, old_conflict, new_conflict, 'identity conflict detail helper')

start_marker = "    const deletedIds = new Set(state.deletedNpcIds || []);"
end_marker = "    const exchangeIds = resolveRefs(exchangeRefs);"
resolution_block = """    const deletedIds = new Set(state.deletedNpcIds || []);\n    const createdNpcIds = new Set();\n    const patchByNpcId = new Map();\n    // Runtime-only handoff. One deterministic identity/admission decision is reused by\n    // every downstream consumer; model transport ids never become stored identity authority.\n    const patchResolutions = [];\n    const setPatchResolution = (patchIndex, status, npcId = '', reason = '') => {\n        patchResolutions[patchIndex] = {\n            patchIndex,\n            status,\n            npcId: String(npcId || '').slice(0, 180),\n            reason: String(reason || '').slice(0, 220),\n        };\n    };\n    const acceptedNpcForPatchIndex = patchIndex => {\n        const resolution = patchResolutions[patchIndex];\n        if (resolution?.status !== 'accepted' || !resolution.npcId) return null;\n        return state.npcs.find(item => item.id === resolution.npcId) || null;\n    };\n    const acceptedNpcForReference = reference => {\n        for (let patchIndex = 0; patchIndex < result.npcs.length; patchIndex += 1) {\n            if (!patchReferenceMatches(result.npcs[patchIndex], reference)) continue;\n            const npc = acceptedNpcForPatchIndex(patchIndex);\n            if (npc) return npc;\n        }\n        return null;\n    };\n\n    for (let patchIndex = 0; patchIndex < result.npcs.length; patchIndex += 1) {\n        const patch = result.npcs[patchIndex];\n        const patchId = String(patch?.id || '').trim();\n        if (patchId && deletedIds.has(patchId)) {\n            setPatchResolution(patchIndex, 'rejected', '', 'deleted-npc-id');\n            continue;\n        }\n        const canonicalName = canonicalPatchName(patch, identityRefs);\n        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;\n        if (!npc && canonicalName) {\n            // Unknown model ids are transport hints only. Grounded canonical identity may\n            // resolve an existing dossier or be admitted under a locally allocated id.\n            npc = findNpcByReference(state, canonicalName);\n        }\n        const conflict = automaticIdentityPatchConflict(state, npc, patch, identityRefs);\n        if (conflict) {\n            setPatchResolution(patchIndex, 'rejected', '', 'identity-conflict:' + conflict.value);\n            continue;\n        }\n        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));\n        if (!npc) {\n            if (!referenced) {\n                setPatchResolution(patchIndex, 'unresolved', '', 'not-referenced');\n                continue;\n            }\n            if (!newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs)) {\n                setPatchResolution(patchIndex, 'unresolved', '', 'identity-evidence-unresolved');\n                continue;\n            }\n            if (!newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {\n                setPatchResolution(patchIndex, 'rejected', '', 'admission-policy-rejected');\n                continue;\n            }\n            const created = createFromPatch(patch, sourceMessageId, identityRefs);\n            if (!created) {\n                setPatchResolution(patchIndex, 'unresolved', '', 'invalid-canonical-identity');\n                continue;\n            }\n            if (deletedIds.has(created.id)) {\n                setPatchResolution(patchIndex, 'rejected', '', 'deleted-npc-id');\n                continue;\n            }\n            if ((state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {\n                setPatchResolution(patchIndex, 'rejected', '', 'suppressed-identity');\n                continue;\n            }\n            state.npcs.push(created);\n            createdNpcIds.add(created.id);\n            npc = created;\n        }\n        patchByNpcId.set(npc.id, patch);\n        setPatchResolution(patchIndex, 'accepted', npc.id, '');\n    }\n\n    const resolveRefs = refs => {\n        const ids = [];\n        for (const ref of refs) {\n            const npc = findNpcByReference(state, ref) || acceptedNpcForReference(ref);\n            if (npc && !ids.includes(npc.id)) ids.push(npc.id);\n        }\n        return ids;\n    };\n\n    const exchangeIds = resolveRefs(exchangeRefs);"""
text = replace_span(text, start_marker, end_marker, resolution_block, 'authoritative patch resolution')

old_returned = """    const resolveReturnedReference = reference => {\n        const direct = findNpcByReference(state, reference);\n        if (direct) return direct;\n        const patch = result.npcs.find(item => patchReferenceMatches(item, reference));\n        const canonicalName = patch ? canonicalPatchName(patch, [...identityRefs, reference]) : '';\n        return canonicalName ? findNpcByReference(state, canonicalName) : null;\n    };\n"""
new_returned = """    const resolveReturnedReference = reference =>\n        findNpcByReference(state, reference) || acceptedNpcForReference(reference);\n"""
text = replace_once(text, old_returned, new_returned, 'returned reference accepted binding')
old_return = """    return { state: normalizeState(state, state.chatKey), exchangeActiveNpcIds: exchangeIds, finalPresentNpcIds: presentIds, worldActiveNpcIds: worldIds, targetNpcIds: targetIds };\n"""
new_return = """    return {\n        state: normalizeState(state, state.chatKey),\n        exchangeActiveNpcIds: exchangeIds,\n        finalPresentNpcIds: presentIds,\n        worldActiveNpcIds: worldIds,\n        targetNpcIds: targetIds,\n        patchResolutions: patchResolutions.map(row => row ? structuredClone(row) : null),\n    };\n"""
text = replace_once(text, old_return, new_return, 'core patch resolution return')
write(path, text)


# Semantic application/coverage consume the authoritative identity handoff. The legacy
# fallback remains only for direct callers that do not come through scanner coordination.
path = 'src/model/semantic-updates.js'
text = read(path)
old_restore_start = """function restoreNewNpcModelLedRole(state, originalResult) {\n    for (const patch of Array.isArray(originalResult?.npcs) ? originalResult.npcs : []) {\n        const role = compact(patch?._modelLedRole ?? patch?.role, 240);\n        if (!role || String(patch?.identityKind || '').trim().toLocaleLowerCase() !== 'named') continue;\n        const npc = String(patch.id || '').trim() ? (state.npcs || []).find(item => item.id === String(patch.id).trim()) : findNpcByReference(state, patch.name || '');\n        if (!npc || manualProtected(npc, 'role') || npc.role) continue;\n        npc.role = role;\n        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n    }\n}\n"""
new_restore_start = """function patchResolutionAt(options = {}, patchIndex = -1) {\n    if (!Array.isArray(options.patchResolutions)) return null;\n    const row = options.patchResolutions.find(item => Number(item?.patchIndex) === patchIndex);\n    return row || { patchIndex, status: 'unresolved', npcId: '', reason: 'identity-handoff-missing' };\n}\n\nfunction legacyPatchTarget(state, patch) {\n    const id = String(patch?.id || '').trim();\n    return id ? (state.npcs || []).find(item => item.id === id) || null : findNpcByReference(state, patch?.name || '');\n}\n\nfunction resolvedPatchTarget(state, patch, patchIndex, options = {}) {\n    const resolution = patchResolutionAt(options, patchIndex);\n    if (!resolution) return { npc: legacyPatchTarget(state, patch), resolution: null };\n    if (resolution.status !== 'accepted' || !resolution.npcId) return { npc: null, resolution };\n    const npc = (state.npcs || []).find(item => item.id === resolution.npcId) || null;\n    return npc\n        ? { npc, resolution }\n        : { npc: null, resolution: { ...resolution, status: 'unresolved', reason: 'accepted-target-missing' } };\n}\n\nfunction proposedFieldsForPatch(patch = {}) {\n    const fields = [];\n    const add = value => {\n        const field = String(value || '').trim();\n        if (field && !fields.includes(field) && fields.length < 32) fields.push(field);\n    };\n    for (const field of DOSSIER_SEMANTIC_FIELDS) if (Object.prototype.hasOwnProperty.call(patch, field)) add(field);\n    for (const update of Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : []) add(update?.field);\n    return fields;\n}\n\nfunction identityDiagnostic(patch, patchIndex, resolution) {\n    const rejected = String(resolution?.status || '') === 'rejected';\n    return {\n        npcId: String(resolution?.npcId || ''),\n        patchIndex,\n        status: rejected ? 'identity-rejected' : 'identity-unresolved',\n        reason: String(resolution?.reason || (rejected ? 'identity-rejected' : 'identity-unresolved')).slice(0, 220),\n        proposedFields: proposedFieldsForPatch(patch),\n    };\n}\n\nfunction evaluatedGroupsForPatch(patch = {}) {\n    return [...new Set((Array.isArray(patch?.evaluatedGroups) ? patch.evaluatedGroups : [])\n        .map(value => String(value || '').trim())\n        .filter(value => DOSSIER_EVALUATION_GROUPS.includes(value)))];\n}\n\nfunction restoreNewNpcModelLedRole(state, originalResult, options = {}) {\n    const patches = Array.isArray(originalResult?.npcs) ? originalResult.npcs : [];\n    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {\n        const patch = patches[patchIndex];\n        const role = compact(patch?._modelLedRole ?? patch?.role, 240);\n        if (!role || String(patch?.identityKind || '').trim().toLocaleLowerCase() !== 'named') continue;\n        const { npc } = resolvedPatchTarget(state, patch, patchIndex, options);\n        if (!npc || manualProtected(npc, 'role') || npc.role) continue;\n        npc.role = role;\n        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n    }\n}\n"""
text = replace_once(text, old_restore_start, new_restore_start, 'semantic accepted identity helper')

old_apply_header = """export function applyModelLedSemanticUpdates(stateInput, resultInput, options = {}) {\n    const state = stateInput;\n    const diagnostics = [];\n    const seen = new Set();\n    const limits = normalizeDossierLimits(options.dossierLimits);\n    restoreNewNpcModelLedRole(state, resultInput);\n\n    for (const patch of Array.isArray(resultInput?.npcs) ? resultInput.npcs : []) {\n        const npc = String(patch?.id || '').trim()\n            ? (state.npcs || []).find(item => item.id === String(patch.id).trim())\n            : findNpcByReference(state, patch?.name || '');\n        if (!npc) continue;\n        for (const raw of Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []) {\n"""
new_apply_header = """export function applyModelLedSemanticUpdates(stateInput, resultInput, options = {}) {\n    const state = stateInput;\n    const diagnostics = [];\n    const seen = new Set();\n    const limits = normalizeDossierLimits(options.dossierLimits);\n    restoreNewNpcModelLedRole(state, resultInput, options);\n\n    const patches = Array.isArray(resultInput?.npcs) ? resultInput.npcs : [];\n    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {\n        const patch = patches[patchIndex];\n        const target = resolvedPatchTarget(state, patch, patchIndex, options);\n        const npc = target.npc;\n        if (!npc) {\n            diagnostics.push(identityDiagnostic(patch, patchIndex, target.resolution));\n            continue;\n        }\n        const ordinaryProposalFields = proposedFieldsForPatch(patch);\n        const semanticRows = Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [];\n        if (!ordinaryProposalFields.length) {\n            const evaluatedGroups = evaluatedGroupsForPatch(patch);\n            diagnostics.push(evaluatedGroups.length\n                ? { npcId: npc.id, patchIndex, status: 'evaluated-unchanged', evaluatedGroups }\n                : { npcId: npc.id, patchIndex, status: 'no-field-proposal' });\n        }\n        for (const raw of semanticRows) {\n"""
text = replace_once(text, old_apply_header, new_apply_header, 'semantic target handoff')

old_patch_for = """function patchForNpc(resultInput, npc) {\n    return (Array.isArray(resultInput?.npcs) ? resultInput.npcs : []).find(patch => {\n        const id = String(patch?.id || '').trim();\n        if (id) return id === npc.id;\n        const name = normalizeName(patch?.name);\n        return name && [npc.name, ...(npc.aliases || [])].some(label => normalizeName(label) === name);\n    }) || null;\n}\n\nexport function auditDossierEvaluationCoverage(stateInput, resultInput, { npcIds = [] } = {}) {\n    const state = stateInput || {};\n    const diagnostics = [];\n    const ids = [...new Set((Array.isArray(npcIds) ? npcIds : []).filter(Boolean))];\n    for (const id of ids) {\n        const npc = (state.npcs || []).find(item => item.id === id) || findNpcByReference(state, id);\n        if (!npc) continue;\n        const patch = patchForNpc(resultInput, npc);\n        if (!patch) {\n            diagnostics.push({ npcId: npc.id, status: 'missing-npc-patch', missingGroups: [...DOSSIER_EVALUATION_GROUPS] });\n            continue;\n        }\n        const groups = new Set((Array.isArray(patch.evaluatedGroups) ? patch.evaluatedGroups : []).map(value => String(value || '').trim()).filter(value => DOSSIER_EVALUATION_GROUPS.includes(value)));\n        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));\n        if (missingGroups.length) diagnostics.push({ npcId: npc.id, status: 'incomplete-evaluation', missingGroups });\n    }\n    return diagnostics;\n}\n"""
new_patch_for = """function patchReferencesNpc(patch, npc) {\n    const id = String(patch?.id || '').trim();\n    if (id && id === npc.id) return true;\n    const labels = [npc?.name, ...(npc?.aliases || [])].map(normalizeName).filter(Boolean);\n    return [patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])]\n        .map(normalizeName).filter(Boolean).some(label => labels.includes(label));\n}\n\nfunction patchForNpc(resultInput, npc, patchResolutions = null) {\n    const patches = Array.isArray(resultInput?.npcs) ? resultInput.npcs : [];\n    if (Array.isArray(patchResolutions)) {\n        for (let index = patchResolutions.length - 1; index >= 0; index -= 1) {\n            const resolution = patchResolutions[index];\n            if (resolution?.status === 'accepted' && resolution.npcId === npc.id) {\n                return { patch: patches[Number(resolution.patchIndex)] || null, resolution };\n            }\n        }\n        for (const resolution of patchResolutions) {\n            if (!resolution || resolution.status === 'accepted') continue;\n            const patch = patches[Number(resolution.patchIndex)];\n            if (patch && patchReferencesNpc(patch, npc)) return { patch, resolution };\n        }\n        return { patch: null, resolution: null };\n    }\n    const patch = patches.find(candidate => {\n        const id = String(candidate?.id || '').trim();\n        if (id) return id === npc.id;\n        const name = normalizeName(candidate?.name);\n        return name && [npc.name, ...(npc.aliases || [])].some(label => normalizeName(label) === name);\n    }) || null;\n    return { patch, resolution: null };\n}\n\nexport function auditDossierEvaluationCoverage(stateInput, resultInput, { npcIds = [], patchResolutions = null } = {}) {\n    const state = stateInput || {};\n    const diagnostics = [];\n    const ids = [...new Set((Array.isArray(npcIds) ? npcIds : []).filter(Boolean))];\n    for (const id of ids) {\n        const npc = (state.npcs || []).find(item => item.id === id) || findNpcByReference(state, id);\n        if (!npc) continue;\n        const binding = patchForNpc(resultInput, npc, patchResolutions);\n        const patch = binding.patch;\n        if (binding.resolution && binding.resolution.status !== 'accepted') {\n            diagnostics.push({ ...identityDiagnostic(patch || {}, Number(binding.resolution.patchIndex), binding.resolution), npcId: npc.id });\n            continue;\n        }\n        if (!patch) {\n            diagnostics.push({ npcId: npc.id, status: 'missing-npc-patch', missingGroups: [...DOSSIER_EVALUATION_GROUPS] });\n            continue;\n        }\n        const groups = new Set(evaluatedGroupsForPatch(patch));\n        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));\n        if (missingGroups.length) diagnostics.push({ npcId: npc.id, status: 'incomplete-evaluation', missingGroups });\n    }\n    return diagnostics;\n}\n"""
text = replace_once(text, old_patch_for, new_patch_for, 'coverage identity handoff')
write(path, text)


# Scanner coordinator carries the accepted binding into semantic application and coverage.
path = 'src/scanner.js'
text = read(path)
old = """    const applied = core.applyScanResult(stateInput, prepared, options);\n    const semantic = applyModelLedSemanticUpdates(applied.state, adapted, semanticOptions);\n    const family = applyModelLedFamilyFacts(semantic.state, adapted, options);\n"""
new = """    const applied = core.applyScanResult(stateInput, prepared, options);\n    const semantic = applyModelLedSemanticUpdates(applied.state, adapted, {\n        ...semanticOptions,\n        patchResolutions: applied.patchResolutions,\n    });\n    const family = applyModelLedFamilyFacts(semantic.state, adapted, options);\n"""
text = replace_once(text, old, new, 'scanner semantic handoff')
old = """        ? auditDossierEvaluationCoverage(family.state, adapted, { npcIds: coverageNpcIds })\n"""
new = """        ? auditDossierEvaluationCoverage(family.state, adapted, { npcIds: coverageNpcIds, patchResolutions: applied.patchResolutions })\n"""
text = replace_once(text, old, new, 'scanner coverage handoff')
write(path, text)


# Diagnostics keep the established compact summary shape while recognizing explicit
# unchanged/no-proposal/identity outcomes and deduplicating one identity failure reported
# by both semantic and coverage views.
path = 'src/operation-diagnostics.js'
text = read(path)
old = """export function summarizeProposalDiagnostics(semanticDiagnostics = [], coverageDiagnostics = []) {\n    const summary = { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] };\n    const reasons = [];\n    for (const row of Array.isArray(semanticDiagnostics) ? semanticDiagnostics : []) {\n        const status = String(row?.status || '');\n        if (status === 'applied') summary.accepted += 1;\n        else if (status === 'no-change-proposed') summary.unchanged += 1;\n        else {\n            summary.rejected += 1;\n            reasons.push([status, row?.reason].filter(Boolean).join(': '));\n        }\n    }\n    for (const row of Array.isArray(coverageDiagnostics) ? coverageDiagnostics : []) {\n        const status = String(row?.status || '');\n        if (status === 'missing-npc-patch' || status === 'incomplete-evaluation') {\n            summary.omitted += Math.max(1, Array.isArray(row?.missingGroups) ? row.missingGroups.length : 1);\n            const groups = Array.isArray(row?.missingGroups) ? row.missingGroups.join(',') : '';\n            reasons.push([status, groups].filter(Boolean).join(': '));\n        } else if (status) {\n            summary.rejected += 1;\n            reasons.push([status, row?.reason].filter(Boolean).join(': '));\n        }\n    }\n    summary.reasons = uniqueStrings(reasons);\n    return summary;\n}\n"""
new = """export function summarizeProposalDiagnostics(semanticDiagnostics = [], coverageDiagnostics = []) {\n    const summary = { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] };\n    const reasons = [];\n    const identityFailures = new Set();\n    const countIdentityFailure = row => {\n        const status = String(row?.status || '');\n        const key = `${Number.isInteger(row?.patchIndex) ? row.patchIndex : ''}|${status}|${clean(row?.reason, 220)}`;\n        if (identityFailures.has(key)) return;\n        identityFailures.add(key);\n        summary.rejected += 1;\n        reasons.push([status, row?.reason].filter(Boolean).join(': '));\n    };\n    for (const row of Array.isArray(semanticDiagnostics) ? semanticDiagnostics : []) {\n        const status = String(row?.status || '');\n        if (status === 'applied') summary.accepted += 1;\n        else if (status === 'no-change-proposed') summary.unchanged += 1;\n        else if (status === 'evaluated-unchanged') summary.unchanged += Math.max(1, Array.isArray(row?.evaluatedGroups) ? row.evaluatedGroups.length : 1);\n        else if (status === 'no-field-proposal') reasons.push('no-field-proposal');\n        else if (status === 'identity-rejected' || status === 'identity-unresolved') countIdentityFailure(row);\n        else {\n            summary.rejected += 1;\n            reasons.push([status, row?.reason].filter(Boolean).join(': '));\n        }\n    }\n    for (const row of Array.isArray(coverageDiagnostics) ? coverageDiagnostics : []) {\n        const status = String(row?.status || '');\n        if (status === 'missing-npc-patch' || status === 'incomplete-evaluation') {\n            summary.omitted += Math.max(1, Array.isArray(row?.missingGroups) ? row.missingGroups.length : 1);\n            const groups = Array.isArray(row?.missingGroups) ? row.missingGroups.join(',') : '';\n            reasons.push([status, groups].filter(Boolean).join(': '));\n        } else if (status === 'identity-rejected' || status === 'identity-unresolved') {\n            countIdentityFailure(row);\n        } else if (status) {\n            summary.rejected += 1;\n            reasons.push([status, row?.reason].filter(Boolean).join(': '));\n        }\n    }\n    summary.reasons = uniqueStrings(reasons);\n    return summary;\n}\n"""
text = replace_once(text, old, new, 'proposal diagnostic categories')
write(path, text)


# Shared prompt contract: foreground mandatory text and Scan both import the same rules.
path = 'src/foreground-contract.js'
text = read(path)
old = """import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';\n"""
new = """import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';\nimport { dossierIdentityBootstrapPromptRules } from './scan-helpers.js';\n"""
text = replace_once(text, old, new, 'foreground shared rule import')
old = """        'ACTIVITY/IDENTITY: inChatNpcIds = individually relevant NPCs participating at the end; exchangeActiveNpcIds = NPCs that spoke/acted/were directly affected now; worldActiveNpcIds = explicitly active off-screen. Existing NPCs use stable ids. New identity/activity claims need short exact current-visible excerpts. Mentions, crowds and incidental bodies are not active.',\n"""
new = """        'ACTIVITY/IDENTITY: inChatNpcIds = individually relevant NPCs participating at the end; exchangeActiveNpcIds = NPCs that spoke/acted/were directly affected now; worldActiveNpcIds = explicitly active off-screen. New identity/activity claims need short exact current-visible excerpts. Mentions, crowds and incidental bodies are not active.',\n        ...dossierIdentityBootstrapPromptRules(),\n"""
text = replace_once(text, old, new, 'foreground shared identity rules')
write(path, text)

path = 'src/scan-prompts.js'
text = read(path)
old = """import { relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';\n"""
new = """import { dossierIdentityBootstrapPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';\n"""
text = replace_once(text, old, new, 'scan shared rule import')
old = """        admissionPromptRule(admissionMode),\n        ...identityPresencePromptRules(),\n"""
new = """        admissionPromptRule(admissionMode),\n        ...dossierIdentityBootstrapPromptRules().map(rule => '- ' + rule),\n        ...identityPresencePromptRules(),\n"""
text = replace_once(text, old, new, 'scan shared identity rules')
old = """        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',\n"""
new = """        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed.',\n"""
text = replace_once(text, old, new, 'remove duplicated scan new-id rule')
old = """        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',\n"""
new = """        '- A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',\n"""
text = replace_once(text, old, new, 'remove duplicated scan activity-reference rule')
write(path, text)


# Release documentation and version labels.
path = 'manifest.json'
text = read(path)
text = replace_once(text, '"version": "0.7.4"', '"version": "0.7.5"', 'manifest release')
write(path, text)

path = 'src/schema.js'
text = read(path)
text = replace_once(text, "export const NPC_STATE_VERSION = '0.7.4';", "export const NPC_STATE_VERSION = '0.7.5';", 'schema release')
write(path, text)

path = 'DEVELOPMENT.md'
text = read(path)
text = replace_once(text, '- Extension release: `0.7.4`', '- Extension release: `0.7.5`', 'development release')
write(path, text)

path = 'tests/structure.test.mjs'
text = read(path)
text = text.replace("assert.equal(manifest.version, '0.7.4');", "assert.equal(manifest.version, '0.7.5');", 1)
text = text.replace("/NPC_STATE_VERSION = '0\\.7\\.4'/", "/NPC_STATE_VERSION = '0\\.7\\.5'/", 1)
write(path, text)

path = 'CHANGELOG.md'
text = read(path)
entry = """## 0.7.5\n\n- Carries the deterministic identity/admission decision through first-pass semantic application, role restoration, and coverage diagnostics. A newly admitted patch with an unexpected model transport id now targets the locally allocated stable dossier id, while a rejected id/name conflict cannot mutate either candidate through downstream ordinary fields.\n- Makes identity failure observable instead of silent: bounded diagnostics now distinguish identity rejection/unresolved binding, validation rejection, applied updates, explicit evaluated-unchanged groups, no field proposal, and incomplete or absent dossier coverage.\n- Shares one compact identity/bootstrap instruction between foreground capture and Scan: existing dossiers use stable ids, new dossiers leave id empty and use canonical names in activity references, grounded current-exchange facts should be captured, unsupported facts remain Unknown, and existing name-only dossiers are enriched rather than duplicated. Mandatory foreground rules remain present under budget compaction.\n- Consolidates new-NPC admission to one authoritative pass by removing the duplicate create-on-reference fallback. Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.\n\n"""
text = replace_once(text, '# Changelog\n\n', '# Changelog\n\n' + entry, 'changelog 0.7.5')
write(path, text)

path = 'README.md'
text = read(path)
text = replace_once(text,
    'NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.4 preserves relationship correction ownership and surviving story movement across legacy upgrades, with durable per-axis remediation state and no persisted-schema change.',
    'NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.5 carries accepted NPC identity through first-pass dossier application and diagnostics so newly admitted characters can be populated in the same response without weakening conflict safety.',
    'README release summary')
text = replace_once(text, '## Release 0.7.4', '## Release 0.7.5', 'README release heading')
old_para = 'The ordinary dossier registry records field kind, durability, normalization contract, permitted operations/evidence, first-pass requirements, and manual ownership. Manual relationship edits keep compact per-axis absolute correction records with monotonic revisions, separate from bounded visible relationship history and automatic-update locks. v0.7.4 migrates provable legacy correction axes into that representation before a new relationship edit can overwrite legacy metadata; new edits no longer create whole-relationship override records. Mixed legacy/new ownership is reconciled per axis, while ambiguous residual legacy axes remain blocked instead of being guessed.'
new_para = 'The ordinary dossier registry records field kind, durability, normalization contract, permitted operations/evidence, first-pass requirements, and manual ownership. First-pass identity/admission now produces one accepted patch-to-dossier binding that ordinary semantic updates, role restoration, and coverage all reuse; unknown model transport ids are never promoted to stored ids, and conflicting id/name bindings fail closed. The v0.7.4 compact per-axis relationship-correction and remediation behavior remains unchanged.'
text = replace_once(text, old_para, new_para, 'README release details')
text = replace_once(text, '- Extension release: `0.7.4`', '- Extension release: `0.7.5`', 'README version boundary')
write(path, text)

path = 'docs/core-contract.md'
text = read(path)
old = """Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. English keyword lists or arbitrary repetition counts must not become general semantic authority.\n"""
new = """Ordinary semantic operations are `establish`, `refine`, `replace`, and `remove`. The model decides narrative meaning. The validator owns permitted fields, source provenance, target identity, manual ownership, durability, collection/form targeting, and structural rules. English keyword lists or arbitrary repetition counts must not become general semantic authority.\n\nIdentity/admission produces one authoritative per-operation patch-to-NPC outcome before ordinary semantic application. Accepted patches carry the resolved stored NPC id, including a locally allocated id for a newly admitted dossier; rejected or unresolved patches carry a bounded reason. Role restoration, ordinary semantic updates, coverage, and patch-bound reference fallback must consume that same outcome rather than independently resolving the model's original transport id/name. An unknown model id is never accepted as a stored id merely because it was emitted, and a rejected id/name conflict cannot mutate either candidate through downstream ordinary fields. Independent focused channels keep their own established target rules.\n"""
text = replace_once(text, old, new, 'core contract identity handoff')
old = """`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal. Output omission alone is never re-labeled as confirmed evaluation.\n"""
new = """`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a patch explicitly records evaluated dossier groups with no field update. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics distinguish: no field proposal emitted, identity unresolved/rejected, field proposal rejected by validation, accepted field update, explicit evaluated-unchanged groups, a genuinely absent NPC patch, and incomplete dossier evaluation. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting.\n"""
text = replace_once(text, old, new, 'core contract diagnostic distinctions')
old = """Uses the embedded payload from the completed roleplay response. No second model request is required. Selected existing NPCs evaluate Mood, Location, Status/activity, and Goal against current evidence. Unsupported or unchanged values remain. Explicit removal requires sufficient evidence. Relationship replay guards and manual ownership remain authoritative.\n"""
new = """Uses the embedded payload from the completed roleplay response. No second model request is required. Existing NPC patches use supplied stable ids. New NPC patches leave id empty, use the canonical human-facing name (or a unique readable role label while genuinely unnamed) in activity references, and receive a locally assigned stored id. A newly admitted relevant NPC should capture every supported current-exchange dossier fact through the established bootstrap/semantic channels, including live state and grounded profile/canon/collections; conversation alone never justifies invented age, species, personality, relationships, or other unsupported facts, so Unknown is correct when evidence is absent. An existing name-only dossier remains existing and is enrichable through normal semanticUpdates rather than duplicate admission. Selected existing NPCs evaluate Mood, Location, Status/activity, and Goal against current evidence. Unsupported or unchanged values remain. Explicit removal requires sufficient evidence. Relationship replay guards and manual ownership remain authoritative.\n"""
text = replace_once(text, old, new, 'core contract first-pass identity/bootstrap')
write(path, text)


# Focused v0.7.5 behavior: real scanner identity handoff, engine/parser/persistence path,
# prompt contract, diagnostics, conflict safety, compatibility, and no extra generation.
test_path = ROOT / 'tests/v075-identity-handoff.test.mjs'
test_path.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { consumeNpcStateControl } from '../src/foreground.js';
import { foregroundContract } from '../src/foreground-contract.js';
import { buildForegroundInjection } from '../src/injection.js';
import { createNpcStateEngine } from '../src/engine.js';
import { summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const ALL_GROUPS = ['canon', 'profile', 'live', 'memory', 'npcRelationships'];

function noRelationshipChange() {
    return {
        evaluated: true,
        impact: 'none',
        delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
        priority: [], axisEvidence: {}, evidence: '', reason: 'No player-relationship change.',
    };
}

const MIRA_VISIBLE = [
    'Mira is a silver-haired human innkeeper.',
    'Mira smiles warmly behind the Lantern Inn counter.',
    'Mira says in a warm, measured voice that she will prepare Lucien’s room.',
    'Mira remains behind the Lantern Inn counter.',
    'Mira begins preparing Lucien’s room.',
    'Mira intends to have the room ready before dusk.',
].join(' ');

function semantic(field, operation, value, excerpt, durability) {
    return { field, operation, value, durability, sources: [{ messageId: 1, excerpt }], explanation: `Grounded ${field}.` };
}

function miraSemanticUpdates(operation = 'establish') {
    return [
        semantic('role', operation, 'Innkeeper', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('species', operation, 'Human', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('appearance', operation, 'Silver-haired woman with a warm smile.', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('speech', operation, 'Warm and measured.', 'Mira says in a warm, measured voice that she will prepare Lucien’s room.', 'durable'),
        semantic('mood', operation, 'Warmly welcoming.', 'Mira smiles warmly behind the Lantern Inn counter.', 'temporary'),
        semantic('location', operation, 'Behind the Lantern Inn counter.', 'Mira remains behind the Lantern Inn counter.', 'temporary'),
        semantic('status', operation, 'Preparing Lucien’s room.', 'Mira begins preparing Lucien’s room.', 'temporary'),
        semantic('goal', operation, 'Have Lucien’s room ready before dusk.', 'Mira intends to have the room ready before dusk.', 'temporary'),
    ];
}

function identityEvidence(name = 'Mira', excerpt = 'Mira is a silver-haired human innkeeper.') {
    return { anchor: name, excerpts: [excerpt], explanation: 'The current visible response identifies this NPC.' };
}

function activityEvidence(name = 'Mira') {
    return {
        exchangeActive: { excerpts: [`${name} begins preparing Lucien’s room.`], explanation: `${name} acts in this exchange.` },
        inChat: { excerpts: [`${name} remains behind the Lantern Inn counter.`], explanation: `${name} remains in the scene.` },
    };
}

function miraPatch({ id = '', semanticUpdates = miraSemanticUpdates(), direct = {} } = {}) {
    return {
        id,
        name: 'Mira',
        identityKind: 'named',
        identityEvidence: identityEvidence(),
        activityEvidence: activityEvidence(),
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates,
        relationshipChange: noRelationshipChange(),
        ...direct,
    };
}

function payload(patches, active = ['Mira'], present = active) {
    return {
        exchangeActiveNpcIds: active,
        inChatNpcIds: present,
        worldActiveNpcIds: [],
        npcs: patches,
        socialEdges: [], familyFacts: [], lifeStateUpdates: [],
    };
}

function apply(state, result, visible = MIRA_VISIBLE, extra = {}) {
    return applyScanResult(state, result, {
        sourceMessageId: 1,
        turn: 1,
        currentAdmissionText: visible,
        profileContext: visible,
        semanticEvidenceContext: visible,
        relationshipContext: visible,
        applyReturnedNpcPatches: true,
        requireDossierCoverage: true,
        applyRelationship: false,
        preservePresence: true,
        preserveObservation: true,
        ...extra,
    });
}

function consume(visible, scanPayload) {
    const message = `${visible}\n<npc_state_v1>${JSON.stringify(scanPayload)}</npc_state_v1>`;
    const consumed = consumeNpcStateControl(message, { requireLifeStateUpdates: true });
    assert.deepEqual(consumed.errors, []);
    assert.ok(consumed.parsed);
    return consumed;
}

function engineHarness({ state, chat, settings = {}, generate = null, deferFirstWrite = false } = {}) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(chat) };
    let generations = 0;
    let postCount = 0;
    let releaseFirstWrite;
    let firstWriteStartedResolve;
    const firstWriteStarted = new Promise(resolve => { firstWriteStartedResolve = resolve; });
    const normalizedSettings = normalizeSettings({ scanAfterEachResponse: false, branchRescan: false, ...settings });
    const adapters = {
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizedSettings,
        getPointer: () => pointer,
        getStablePointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async (...args) => {
            generations += 1;
            if (!generate) throw new Error('Embedded first pass must not make a model request.');
            return generate(...args);
        },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                postCount += 1;
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                if (deferFirstWrite && postCount === 1) {
                    firstWriteStartedResolve();
                    await new Promise(resolve => { releaseFirstWrite = resolve; });
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
    };
    return {
        engine: createNpcStateEngine(adapters),
        reload: () => createNpcStateEngine(adapters),
        context,
        generations: () => generations,
        postCount: () => postCount,
        persisted: () => decodeV3Payload(saved, key).state,
        firstWriteStarted,
        releaseFirstWrite: () => releaseFirstWrite?.(),
    };
}

function emptySafeState(key = 'chat:v075') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function assertMiraPopulated(npc) {
    assert.ok(npc);
    assert.equal(npc.role, 'Innkeeper');
    assert.equal(npc.species, 'Human');
    assert.equal(npc.appearance, 'Silver-haired woman with a warm smile.');
    assert.equal(npc.speech, 'Warm and measured.');
    assert.equal(npc.mood, 'Warmly welcoming.');
    assert.equal(npc.location, 'Behind the Lantern Inn counter.');
    assert.equal(npc.status, 'Preparing Lucien’s room.');
    assert.equal(npc.goal, 'Have Lucien’s room ready before dusk.');
}

test('new NPC with empty id applies complete semantic bootstrap through one accepted identity binding', () => {
    const result = apply(emptySafeState(), payload([miraPatch({ id: '' })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.match(mira.id, /^npc-mira(?:-|$)/);
    assert.equal(result.patchResolutions[0].status, 'accepted');
    assert.equal(result.patchResolutions[0].npcId, mira.id);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    assert.equal(result.coverageDiagnostics.length, 0);
});

test('unexpected nonempty model id is a transport hint and semantic updates follow the locally allocated id', () => {
    const result = apply(emptySafeState(), payload([miraPatch({ id: 'mira' })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.notEqual(mira.id, 'mira');
    assert.match(mira.id, /^npc-mira(?:-|$)/);
    assert.equal(result.patchResolutions[0].npcId, mira.id);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
});

test('supported direct new-dossier bootstrap fields still work alongside the identity handoff', () => {
    const state = emptySafeState('chat:direct-bootstrap');
    const direct = {
        role: 'Innkeeper', species: 'Human', appearance: 'Silver-haired woman with a warm smile.',
        speech: 'Warm and measured.', personality: 'Hospitable and attentive.',
        mood: 'Warmly welcoming.', location: 'Behind the Lantern Inn counter.',
        status: 'Preparing Lucien’s room.', goal: 'Have Lucien’s room ready before dusk.',
        behaviorProfile: ['Checks guest needs before preparing rooms.'], mannerisms: ['Smiles before answering a guest.'],
        memories: [], keyRelationships: [],
    };
    const result = apply(state, payload([miraPatch({ id: 'transport-mira', semanticUpdates: [], direct })]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.equal(mira.personality, 'Hospitable and attentive.');
    assert.deepEqual(mira.behaviorProfile, ['Checks guest needs before preparing rooms.']);
    assert.deepEqual(mira.mannerisms, ['Smiles before answering a guest.']);
});

test('mixed existing and multiple new NPCs retain independent accepted bindings', () => {
    const state = emptySafeState('chat:mixed');
    state.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' })];
    const visible = MIRA_VISIBLE + ' Rhea greets Sora at the door. Rhea remains by the door. Sora wakes and waves.';
    const rhea = {
        id: 'model-rhea', name: 'Rhea', identityKind: 'named',
        identityEvidence: { anchor: 'Rhea', excerpts: ['Rhea greets Sora at the door.'], explanation: 'Named in current response.' },
        activityEvidence: {
            exchangeActive: { excerpts: ['Rhea greets Sora at the door.'], explanation: 'Acts now.' },
            inChat: { excerpts: ['Rhea remains by the door.'], explanation: 'Still present.' },
        },
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [semantic('role', 'establish', 'Courier', 'Rhea greets Sora at the door.', 'durable')],
        relationshipChange: noRelationshipChange(),
    };
    const sora = {
        id: 'sora', name: 'Sora', evaluatedGroups: ['live'],
        semanticUpdates: [semantic('mood', 'replace', 'Awake.', 'Sora wakes and waves.', 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const result = apply(state, payload([sora, miraPatch({ id: 'model-mira' }), rhea], ['sora', 'Mira', 'Rhea'], ['sora', 'Mira', 'Rhea']), visible);
    assert.equal(result.state.npcs.length, 3);
    assert.equal(result.state.npcs.find(npc => npc.id === 'sora').mood, 'Awake.');
    assertMiraPopulated(result.state.npcs.find(npc => npc.name === 'Mira'));
    const rheaNpc = result.state.npcs.find(npc => npc.name === 'Rhea');
    assert.equal(rheaNpc.role, 'Courier');
    assert.notEqual(rheaNpc.id, 'model-rhea');
    assert.deepEqual(result.patchResolutions.map(row => row.status), ['accepted', 'accepted', 'accepted']);
});

test('id/name conflict is rejected once and cannot mutate either NPC downstream', () => {
    const state = emptySafeState('chat:conflict');
    state.npcs = [
        normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' }),
        normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' }),
    ];
    const visible = 'Mira welcomes Lucien from behind the Lantern Inn counter.';
    const bad = {
        id: 'sora', name: 'Mira', identityKind: 'named',
        evaluatedGroups: ['live'],
        semanticUpdates: [semantic('mood', 'replace', 'Welcoming.', visible, 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const result = apply(state, payload([bad], ['Mira'], ['Mira']), visible);
    assert.equal(result.state.npcs.find(npc => npc.id === 'sora').mood, 'Sleepy.');
    assert.equal(result.state.npcs.find(npc => npc.id === 'mira').mood, 'Calm.');
    assert.equal(result.patchResolutions[0].status, 'rejected');
    assert.match(result.patchResolutions[0].reason, /^identity-conflict:/);
    assert.equal(result.semanticDiagnostics.some(row => row.status === 'identity-rejected' && row.proposedFields.includes('mood')), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), false);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'identity-rejected'), true);
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
});

test('alias collision is rejected while supported stable-id rename remains valid', () => {
    const collisionState = emptySafeState('chat:alias-collision');
    collisionState.npcs = [
        normalizeNpc({ id: 'sora', name: 'Sora', aliases: ['Sunbird'], mood: 'Sleepy.' }),
        normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' }),
    ];
    const bad = {
        id: 'mira', name: 'Sunbird', identityKind: 'named', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Welcoming.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Mira welcomes Lucien.' }], explanation: 'Current mood.' }],
        relationshipChange: noRelationshipChange(),
    };
    const collision = apply(collisionState, payload([bad], ['mira'], ['mira']), 'Mira welcomes Lucien.');
    assert.equal(collision.patchResolutions[0].status, 'rejected');
    assert.equal(collision.state.npcs.find(npc => npc.id === 'mira').mood, 'Calm.');
    assert.equal(collision.state.npcs.find(npc => npc.id === 'sora').mood, 'Sleepy.');

    const renameState = emptySafeState('chat:rename');
    renameState.npcs = [normalizeNpc({ id: 'sora', name: 'Sora', mood: 'Sleepy.' })];
    const visible = 'Sora introduces herself as Sora Storm and smiles.';
    const rename = apply(renameState, payload([{
        id: 'sora', name: 'Sora Storm', identityKind: 'named', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Cheerful.', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current mood.' }],
        relationshipChange: noRelationshipChange(),
    }], ['sora'], ['sora']), visible);
    const sora = rename.state.npcs[0];
    assert.equal(rename.patchResolutions[0].status, 'accepted');
    assert.equal(sora.name, 'Sora Storm');
    assert.equal(sora.aliases.includes('Sora'), true);
    assert.equal(sora.mood, 'Cheerful.');
});

test('diagnostics distinguish absent, unresolved, validation-rejected, applied, unchanged, and incomplete proposals', () => {
    const state = emptySafeState('chat:diagnostics');
    state.npcs = [normalizeNpc({ id: 'mira', name: 'Mira', mood: 'Calm.' })];
    const visible = 'Mira welcomes Lucien.';

    const unresolved = apply(emptySafeState('chat:unresolved'), payload([{
        id: 'transport-ghost', name: 'Ghost', identityKind: 'named', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'establish', value: 'Quiet.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Ghost watches.' }], explanation: 'Mood.' }],
    }], [], []), 'Ghost watches.');
    assert.equal(unresolved.semanticDiagnostics[0].status, 'identity-unresolved');
    assert.equal(unresolved.semanticDiagnostics[0].reason, 'not-referenced');

    const applied = apply(state, payload([{
        id: 'mira', name: 'Mira', evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Welcoming.', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current mood.' }],
    }], ['mira'], ['mira']), visible);
    assert.equal(applied.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), true);

    const invalid = apply(state, payload([{
        id: 'mira', name: 'Mira', evaluatedGroups: ['live'],
        semanticUpdates: [{ field: 'mood', operation: 'replace', value: 'Angry.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'This sentence is not present.' }], explanation: 'Bad source.' }],
    }], ['mira'], ['mira']), visible);
    assert.equal(invalid.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'invalid-source-reference'), true);

    const checked = apply(state, payload([{ id: 'mira', name: 'Mira', evaluatedGroups: ALL_GROUPS, semanticUpdates: [] }], ['mira'], ['mira']), visible);
    assert.equal(checked.semanticDiagnostics.some(row => row.status === 'evaluated-unchanged' && row.evaluatedGroups.length === ALL_GROUPS.length), true);
    assert.equal(checked.coverageDiagnostics.length, 0);

    const noProposal = apply(state, payload([{ id: 'mira', name: 'Mira', semanticUpdates: [] }], ['mira'], ['mira']), visible);
    assert.equal(noProposal.semanticDiagnostics.some(row => row.status === 'no-field-proposal'), true);
    assert.equal(noProposal.coverageDiagnostics[0].status, 'incomplete-evaluation');

    const absent = apply(state, payload([], ['mira'], ['mira']), visible);
    assert.equal(absent.coverageDiagnostics[0].status, 'missing-npc-patch');
});

test('identity failure is counted once in bounded operation summary even when semantic and coverage both report it', () => {
    const row = { patchIndex: 0, status: 'identity-rejected', reason: 'identity-conflict:Mira', proposedFields: ['mood'] };
    const summary = summarizeProposalDiagnostics([row], [{ ...row, npcId: 'mira' }]);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.reasons.filter(reason => reason.includes('identity-conflict:Mira')).length, 1);
});

test('unsupported evidence stays rejected and genuinely unsupported new fields remain Unknown', () => {
    const patch = miraPatch({ id: 'model-mira', semanticUpdates: [
        semantic('role', 'establish', 'Innkeeper', 'Mira is a silver-haired human innkeeper.', 'durable'),
        semantic('age', 'establish', '27', 'No age is stated here.', 'durable'),
    ] });
    const result = apply(emptySafeState('chat:unknown'), payload([patch]));
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assert.equal(mira.role, 'Innkeeper');
    assert.equal(mira.age, '');
    assert.equal(mira.personality, '');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'age' && row.status === 'invalid-source-reference'), true);
});

test('foreground and Scan share mandatory empty-id/bootstrap guidance, including under tight foreground budgets', () => {
    const foreground = foregroundContract({}, { capture: true });
    for (const phrase of ['NEW NPC patches leave id empty', 'NPC State assigns the stored id locally', 'NAME-ONLY ENRICHMENT']) {
        assert.match(foreground, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    const state = emptySafeState('chat:prompt');
    const built = buildForegroundInjection(state, {
        enabled: true, autoScan: true, inject: true, injectBudgetTokens: 1,
        injectLimit: 1, newNpcAdmissionMode: 'balanced', newNpcHistoryEnrichment: false,
    });
    assert.match(built.prompt, /NEW NPC patches leave id empty/);
    assert.ok(built.diagnostics.effectiveBudgetTokens >= built.diagnostics.minimumBudgetTokens);

    const scan = buildScanPrompt({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: MIRA_VISIBLE }],
        assistantMessageId: 1,
    });
    assert.match(scan, /NEW NPC patches leave id empty/);
    assert.match(scan, /NAME-ONLY ENRICHMENT/);
});

test('real foreground parser-engine-persistence path enriches an existing name-only dossier with no extra generate call', async () => {
    const key = 'chat:existing-name-only';
    const state = emptySafeState(key);
    state.npcs = [normalizeNpc({ id: 'npc-mira-existing', name: 'Mira' })];
    const scan = payload([miraPatch({ id: 'npc-mira-existing', semanticUpdates: miraSemanticUpdates('establish') })]);
    const consumed = consume(MIRA_VISIBLE, scan);
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const result = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    assertMiraPopulated(h.engine.getDossierNpc('npc-mira-existing'));
    assertMiraPopulated(h.persisted().npcs.find(npc => npc.id === 'npc-mira-existing'));
    const reloaded = await h.reload().loadChat();
    assertMiraPopulated(reloaded.npcs.find(npc => npc.id === 'npc-mira-existing'));
    assert.equal(h.generations(), 0);
});

test('real foreground parser-engine-persistence path retains a complete new dossier when model emitted a nonempty transport id', async () => {
    const key = 'chat:new-unexpected-id';
    const state = emptySafeState(key);
    const scan = payload([miraPatch({ id: 'mira' })]);
    const consumed = consume(MIRA_VISIBLE, scan);
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const result = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    const mira = result.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    assert.notEqual(mira.id, 'mira');
    assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false);
    assert.equal(result.semanticDiagnostics.filter(row => row.status === 'applied').length, 8);
    assert.equal(h.generations(), 0);
});

test('history change during first-pass persistence cannot advertise the identity-bound dossier as current', async () => {
    const key = 'chat:identity-race';
    const state = emptySafeState(key);
    const consumed = consume(MIRA_VISIBLE, payload([miraPatch({ id: 'mira' })]));
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
        deferFirstWrite: true,
    });
    await h.engine.loadChat();
    const running = h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    await h.firstWriteStarted;
    h.context.chat[1].mes = 'A replacement swipe removes Mira from this response.';
    h.context.chat[1].swipe_id = 1;
    h.engine.invalidate(key);
    h.releaseFirstWrite();
    const result = await running;
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'history-changed-during-persist');
    assert.equal(result.state.branchSafety.kind, 'commit-history-changed');
    assert.equal(h.persisted().branchSafety.kind, 'commit-history-changed');
    assert.ok(h.postCount() >= 2);
});
''')

print('Applied v0.7.5 identity handoff repair.')

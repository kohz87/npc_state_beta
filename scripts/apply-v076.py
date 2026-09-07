from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)

def regex_once(text, pattern, repl, label, flags=re.S):
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex replacement, found {count}')
    return next_text

# Shared extraction contract -------------------------------------------------
p = 'src/scan-helpers.js'
s = read(p)
s = replace_once(
    s,
    "import { RELATIONSHIP_AXES, normalizeRelationship, normalizeRelationshipProgress, normalizeRelationshipEvidenceHistory, normalizeName } from './schema.js';",
    "import { DOSSIER_EVALUATION_GROUPS, DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS } from './model/dossier-fields.js';\nimport { RELATIONSHIP_AXES, normalizeRelationship, normalizeRelationshipProgress, normalizeRelationshipEvidenceHistory, normalizeName } from './schema.js';",
    'scan-helpers import',
)
anchor = "export function dossierIdentityBootstrapPromptRules() {\n    return [...DOSSIER_IDENTITY_BOOTSTRAP_RULES];\n}\n"
insert = """export function dossierIdentityBootstrapPromptRules() {
    return [...DOSSIER_IDENTITY_BOOTSTRAP_RULES];
}

function dossierExtractionGroupSummary() {
    return DOSSIER_EVALUATION_GROUPS.map(group => {
        const fields = DOSSIER_SEMANTIC_FIELDS.filter(field => DOSSIER_FIELD_DEFINITIONS[field]?.group === group);
        return `${group}=[${fields.join(',')}]`;
    }).join(' ');
}

export function dossierExtractionPromptRules({ includeNew = true, includeExisting = true } = {}) {
    const rows = [
        `DOSSIER EXTRACTION MAP: ${dossierExtractionGroupSummary()}.`,
    ];
    if (includeNew) rows.push(
        'NEW DOSSIER EXTRACTION: for every newly admitted individually relevant NPC, inspect the CURRENT exchange across identity, canon/appearance, profile, live state, important memories, non-player ties, and NPC-to-player Current Dynamic. Populate every supported fact now; leave unsupported facts unknown. Do not stop after name, personality, speech, or the four live fields.',
        'FIRST-SCENE PROFILE: a clearly demonstrated working/social tendency may support a restrained behaviorProfile entry. An observed gesture may be recorded as the observed gesture when useful, but one isolated gesture does not prove a lifelong recurring mannerism. Never invent age, species, backstory, motives, relationships, or habits from genre expectations.',
    );
    if (includeExisting) rows.push(
        'EXISTING DOSSIER EXTRACTION: compare supplied stored values with permitted evidence and enrich supported missing fields through semanticUpdates. Preserve unrelated values and collection entries, locks, identity ownership, and source rules. contextCoverage.unavailable lists fields hidden by budget compaction; an ordinary field absent from the compact dossier but NOT listed unavailable is known empty. contextCoverage.partial means only part of that stored field was supplied, so never infer absence/removal from omitted entries.',
    );
    rows.push(
        'FIELD EVALUATION DETAIL: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses canonical field ids only. Proposed fields belong in direct NEW bootstrap or semanticUpdates and should not be repeated there. insufficient means the field was actually considered but permitted evidence did not support a proposal; unavailable means required stored context was not supplied. evaluatedGroups remains backward-compatible group-level metadata and never proves that every field in a group was individually checked.',
        'PRIVATE COMPLETENESS CHECK: after composing the visible narrative and before emitting the NPC State payload, silently review each relevant NPC against the extraction map and add any still-missing supported proposals/evaluations. Do not reveal reasoning, a checklist, or chain-of-thought; emit only the normal visible narrative and structured payload.',
    );
    return rows;
}
"""
s = replace_once(s, anchor, insert, 'scan-helpers extraction rules')
write(p, s)

# Foreground contract --------------------------------------------------------
p = 'src/foreground-contract.js'
s = read(p)
s = s.replace("import { dossierIdentityBootstrapPromptRules } from './scan-helpers.js';", "import { dossierExtractionPromptRules, dossierIdentityBootstrapPromptRules } from './scan-helpers.js';")
s = s.replace('export const FOREGROUND_CONTRACT_VERSION = 4;', 'export const FOREGROUND_CONTRACT_VERSION = 5;')
s = replace_once(s, "        ...dossierIdentityBootstrapPromptRules(),\n", "        ...dossierIdentityBootstrapPromptRules(),\n        ...dossierExtractionPromptRules(),\n", 'foreground shared extraction')
s = replace_once(
    s,
    "        `COVERAGE: for an exchange-active existing NPC, inspect every dossier group visible in its supplied context and include evaluatedGroups from ${groups}. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was checked against the completed response, even when unchanged. Do not claim another group was checked when budget compaction omitted its stored context.`,",
    "        `COVERAGE: for an exchange-active existing NPC, inspect every dossier group visible in its supplied context and include evaluatedGroups from ${groups}. Use fieldEvaluations for field-level unchanged/insufficient/unavailable outcomes; a group declaration alone is not field-level proof. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was considered. Do not claim unavailable compacted context was checked.`,",
    'foreground coverage',
)
s = replace_once(
    s,
    "        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Every exchange-active NPC has relationshipChange.evaluated=true; nonzero trust/affection/desire/tension needs exact current-exchange evidence. relationshipSummary is the current NPC-to-PLAYER dynamic and may update descriptively when grounded even if replay/caps/gates/inertia suppress numeric movement. Never infer desire from friendliness.',",
    "        'LIFECYCLE/PLAYER RELATIONSHIP: death/return uses lifeStateUpdates; dead-to-alive requires livingReturn:true. Every exchange-active NPC has relationshipChange.evaluated=true; nonzero trust/affection/desire/tension needs exact current-exchange evidence. relationshipSummary is a separate descriptive NPC-to-PLAYER Current Dynamic: a new/materially changed current proposal uses relationshipSummaryEvidence={excerpts:[1-3 exact permitted current excerpts],explanation}; zero numeric deltas are valid and preferred when the interaction does not justify score movement. Never infer desire from friendliness.',",
    'foreground relationship summary',
)
s = replace_once(
    s,
    "        'OUTPUT keys: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. Existing NPC patches use id/name + evaluatedGroups + semanticUpdates + activity/relationship/lifecycle data as needed. New NPC patches may include grounded bootstrap fields. Emit the block even when there are no changes; no markdown fences.',",
    "        'OUTPUT keys: exchangeActiveNpcIds,inChatNpcIds,worldActiveNpcIds,npcs,socialEdges,familyFacts,lifeStateUpdates. NPC patches may include evaluatedGroups + compact fieldEvaluations; existing ordinary changes use semanticUpdates, while new NPCs may include grounded direct bootstrap fields. Current Dynamic proposals include relationshipSummaryEvidence. Emit the block even when there are no changes; no markdown fences.',",
    'foreground output',
)
write(p, s)

# Foreground compaction exposes unavailable/partial context ------------------
p = 'src/foreground-context.js'
s = read(p)
needle = """    const profileEvidence = (Array.isArray(npc?.profileEvolutionEvidence) ? npc.profileEvolutionEvidence : [])
        .slice(-sizes.evidence)
"""
replacement = """    const unavailable = [];
    if (sizes.forms <= 0) unavailable.push('appearanceForms');
    if (sizes.relationships <= 0) unavailable.push('keyRelationships');
    if (sizes.memories <= 0) unavailable.push('memories');
    if (sizes.background <= 0) unavailable.push('background');
    const partial = [];
    if ((npc.appearanceForms || []).length > sizes.forms && sizes.forms > 0) partial.push('appearanceForms');
    if ((npc.behaviorProfile || []).length > Math.min(sizes.behavior, dossierLimits.behaviorProfile)) partial.push('behaviorProfile');
    if ((npc.mannerisms || []).length > Math.min(sizes.mannerisms, dossierLimits.mannerisms)) partial.push('mannerisms');
    if ((npc.keyRelationships || []).length > Math.min(sizes.relationships, dossierLimits.keyRelationships) && sizes.relationships > 0) partial.push('keyRelationships');
    if ((npc.memories || []).length > Math.min(sizes.memories, dossierLimits.memories) && sizes.memories > 0) partial.push('memories');
    const profileEvidence = (Array.isArray(npc?.profileEvolutionEvidence) ? npc.profileEvolutionEvidence : [])
        .slice(-sizes.evidence)
"""
s = replace_once(s, needle, replacement, 'foreground context coverage setup')
s = replace_once(
    s,
    """        recentProfileEvidence: profileEvidence,
    };
""",
    """        recentProfileEvidence: profileEvidence,
        contextCoverage: { unavailable, partial },
    };
""",
    'foreground context coverage output',
)
write(p, s)

# Semantic field evaluation metadata + duplicate normalization --------------
p = 'src/model/semantic-updates.js'
s = read(p)
s = s.replace('export const NPC_STATE_MODEL_CONTRACT_VERSION = 3;', 'export const NPC_STATE_MODEL_CONTRACT_VERSION = 4;')
s = replace_once(
    s,
    "        `For every exchange-active EXISTING NPC, inspect all evaluation groups and return evaluatedGroups:[${groups}]. A listed group means you actually checked its stored values against supplied evidence, even when it produced no update. For targeted Refresh, inspect all groups for the target.`,",
    "        `For every exchange-active EXISTING NPC, inspect all evaluation groups and return evaluatedGroups:[${groups}]. A listed group is group-level only. Add fieldEvaluations:{unchanged:[],insufficient:[],unavailable:[]} when you can report field-level outcomes; proposed fields stay in semanticUpdates. For targeted Refresh, inspect all supplied groups for the target.`,",
    'semantic prompt evaluation line',
)
s = replace_once(
    s,
    """        JSON.stringify({
            evaluatedGroups: DOSSIER_EVALUATION_GROUPS,
            semanticUpdates: [{
""",
    """        JSON.stringify({
            evaluatedGroups: DOSSIER_EVALUATION_GROUPS,
            fieldEvaluations: { unchanged: ['canonical field id'], insufficient: ['canonical field id'], unavailable: ['canonical field id'] },
            semanticUpdates: [{
""",
    'semantic prompt shape',
)
old_prepare = r"export function prepareModelLedPayload\(stateInput, resultInput, admissionMode = 'balanced'\) \{.*?\n\}\n\nfunction patchResolutionAt"
new_prepare = """export function prepareModelLedPayload(stateInput, resultInput, admissionMode = 'balanced') {
    if (!resultInput || typeof resultInput !== 'object' || Array.isArray(resultInput)) return resultInput;
    const result = structuredClone(resultInput);
    const state = stateInput || {};
    for (const patch of Array.isArray(result.npcs) ? result.npcs : []) {
        const semanticFields = new Set((Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [])
            .map(update => String(update?.field || '').trim()).filter(field => FIELD_SET.has(field)));
        const byId = String(patch.id || '').trim() ? (state.npcs || []).find(npc => npc.id === String(patch.id).trim()) : null;
        const existing = byId || findNpcByReference(state, patch.name || '');
        if (!existing) {
            // A field proposed through semanticUpdates has one mutation authority. Remove its
            // direct NEW-bootstrap duplicate from the deterministic core copy only; the
            // original result still reaches the semantic validator with evidence/provenance.
            for (const field of semanticFields) delete patch[field];
            if (semanticFields.has('role')) delete patch._modelLedRole;
            if (String(admissionMode) === 'named_preferred' && String(patch.identityKind || '').trim().toLocaleLowerCase() === 'named' && !semanticFields.has('role')) {
                patch._modelLedRole = patch.role;
                patch.role = '';
            }
            continue;
        }

        // One ordinary mutation path for existing dossiers. Compatibility channels are
        // normalized into semanticUpdates at the boundary before this function runs.
        for (const field of DOSSIER_SEMANTIC_FIELDS) delete patch[field];
        delete patch.profileChanges;
        delete patch.canonChanges;
        delete patch.ageChange;
        delete patch.ageProgression;
        delete patch.appearanceFormChanges;
        delete patch.keyRelationshipChanges;
    }
    return result;
}

function patchResolutionAt"""
s = regex_once(s, old_prepare, new_prepare, 'semantic prepareModelLedPayload')
old_proposed = """function proposedFieldsForPatch(patch = {}) {
    const fields = [];
    const add = value => {
        const field = String(value || '').trim();
        if (field && !fields.includes(field) && fields.length < 32) fields.push(field);
    };
    for (const field of DOSSIER_SEMANTIC_FIELDS) if (Object.prototype.hasOwnProperty.call(patch, field)) add(field);
    for (const update of Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : []) add(update?.field);
    return fields;
}
"""
new_proposed = """function directFieldProposed(patch, field) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
    const value = patch?.[field];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return String(value ?? '').trim().length > 0;
}

function proposedFieldsForPatch(patch = {}) {
    const fields = [];
    const add = value => {
        const field = String(value || '').trim();
        if (FIELD_SET.has(field) && !fields.includes(field) && fields.length < 32) fields.push(field);
    };
    for (const field of DOSSIER_SEMANTIC_FIELDS) if (directFieldProposed(patch, field)) add(field);
    for (const update of Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : []) add(update?.field);
    return fields;
}

const FIELD_EVALUATION_STATES = Object.freeze(['unchanged', 'insufficient', 'unavailable']);
function fieldEvaluationsForPatch(patch = {}) {
    const raw = patch?.fieldEvaluations;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { present: false, byField: new Map(), invalid: [] };
    const byField = new Map();
    const invalid = [];
    for (const status of FIELD_EVALUATION_STATES) {
        const rows = raw[status];
        if (rows == null) continue;
        if (!Array.isArray(rows)) {
            invalid.push({ field: '', status, reason: 'evaluation-list-not-array' });
            continue;
        }
        for (const value of rows.slice(0, 64)) {
            const field = String(value || '').trim();
            if (!FIELD_SET.has(field)) {
                invalid.push({ field, status, reason: 'unknown-field' });
                continue;
            }
            const previous = byField.get(field);
            if (previous && previous !== status) {
                invalid.push({ field, status, reason: `conflicts-with-${previous}` });
                continue;
            }
            byField.set(field, status);
        }
    }
    return { present: true, byField, invalid };
}

function fieldEvaluationDiagnostics(patch, npcId, proposedFields = []) {
    const detail = fieldEvaluationsForPatch(patch);
    if (!detail.present) return { present: false, diagnostics: [], accountedFields: [] };
    const proposals = new Set(proposedFields);
    const diagnostics = detail.invalid.map(row => ({
        npcId, field: row.field, group: dossierFieldGroup(row.field), status: 'invalid-field-evaluation', reason: row.reason,
    }));
    const accountedFields = [];
    for (const [field, status] of detail.byField.entries()) {
        if (proposals.has(field)) continue;
        accountedFields.push(field);
        diagnostics.push({
            npcId, field, group: dossierFieldGroup(field),
            status: status === 'unchanged' ? 'evaluated-unchanged' : (status === 'insufficient' ? 'insufficient-evidence' : 'context-unavailable'),
        });
    }
    return { present: true, diagnostics, accountedFields };
}
"""
s = replace_once(s, old_proposed, new_proposed, 'semantic proposal/evaluation helpers')
s = replace_once(
    s,
    """function restoreNewNpcModelLedRole(state, originalResult, options = {}) {
    const patches = Array.isArray(originalResult?.npcs) ? originalResult.npcs : [];
""",
    """function restoreNewNpcModelLedRole(state, originalResult, options = {}, diagnostics = []) {
    const patches = Array.isArray(originalResult?.npcs) ? originalResult.npcs : [];
""",
    'semantic restore role signature',
)
s = replace_once(
    s,
    """        if (!npc || manualProtected(npc, 'role') || npc.role) continue;
        npc.role = role;
        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
""",
    """        if (!npc || manualProtected(npc, 'role') || npc.role) continue;
        if ((Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : []).some(update => String(update?.field || '').trim() === 'role')) continue;
        npc.role = role;
        npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        diagnostics.push({ npcId: npc.id, patchIndex, field: 'role', group: dossierFieldGroup('role'), channel: 'bootstrap-role', status: 'applied' });
""",
    'semantic restore role diagnostic',
)
s = replace_once(s, "    restoreNewNpcModelLedRole(state, resultInput, options);", "    restoreNewNpcModelLedRole(state, resultInput, options, diagnostics);", 'semantic restore role caller')
s = replace_once(
    s,
    """        const ordinaryProposalFields = proposedFieldsForPatch(patch);
        const semanticRows = Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [];
        if (!ordinaryProposalFields.length) {
            const evaluatedGroups = evaluatedGroupsForPatch(patch);
            diagnostics.push(evaluatedGroups.length
                ? { npcId: npc.id, patchIndex, status: 'evaluated-unchanged', evaluatedGroups }
                : { npcId: npc.id, patchIndex, status: 'no-field-proposal' });
        }
""",
    """        const ordinaryProposalFields = proposedFieldsForPatch(patch);
        const semanticRows = Array.isArray(patch.semanticUpdates) ? patch.semanticUpdates : [];
        const fieldEvaluation = fieldEvaluationDiagnostics(patch, npc.id, ordinaryProposalFields);
        diagnostics.push(...fieldEvaluation.diagnostics.map(row => ({ patchIndex, ...row })));
        if (!ordinaryProposalFields.length && !fieldEvaluation.present) {
            const evaluatedGroups = evaluatedGroupsForPatch(patch);
            diagnostics.push(evaluatedGroups.length
                ? { npcId: npc.id, patchIndex, status: 'evaluated-unchanged', evaluatedGroups }
                : { npcId: npc.id, patchIndex, status: 'no-field-proposal' });
        }
""",
    'semantic field evaluation application',
)
old_coverage = """        const groups = new Set(evaluatedGroupsForPatch(patch));
        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));
        if (missingGroups.length) diagnostics.push({ npcId: npc.id, status: 'incomplete-evaluation', missingGroups });
"""
new_coverage = """        const groups = new Set(evaluatedGroupsForPatch(patch));
        const missingGroups = DOSSIER_EVALUATION_GROUPS.filter(group => !groups.has(group));
        const fieldEvaluation = fieldEvaluationsForPatch(patch);
        if (fieldEvaluation.present) {
            const accounted = new Set([...proposedFieldsForPatch(patch), ...fieldEvaluation.byField.keys()]);
            const missingFields = DOSSIER_SEMANTIC_FIELDS.filter(field => !accounted.has(field));
            if (missingFields.length || missingGroups.length) diagnostics.push({
                npcId: npc.id, status: 'incomplete-evaluation', missingGroups,
                missingFields: missingFields.slice(0, 32),
            });
        } else if (missingGroups.length) {
            diagnostics.push({ npcId: npc.id, status: 'incomplete-evaluation', missingGroups });
        }
"""
s = replace_once(s, old_coverage, new_coverage, 'semantic coverage detail')
write(p, s)

# Relationship summary grounding + diagnostics ------------------------------
p = 'src/scan-relationships.js'
s = read(p)
s = s.replace("import { relationshipEvidenceExcerptMatch } from './relationship-evidence.js';", "import { relationshipEvidenceExcerptMatch, relationshipEvidenceGrounding } from './relationship-evidence.js';")
s = s.replace("import { relationshipSummaryRepairContext } from './scan-helpers.js';", "import { containsNormalizedPhrase, relationshipSummaryRepairContext } from './scan-helpers.js';")
old_summary_ground = r"function relationshipSummaryProposalGrounded\(patch, options = \{\}\) \{.*?\n\}\n\nexport function applyRelationshipSummaryProjection\(npc, patch, options = \{\}\) \{.*?\n\}\n\nexport function relationshipDeltaForPatch"
new_summary_ground = """function relationshipSummaryEvidenceGrounded(npc, patch, options = {}) {
    const raw = patch?.relationshipSummaryEvidence;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'missing-summary-evidence' };
    const excerpts = Array.isArray(raw.excerpts) ? raw.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 4) : [];
    const explanation = String(raw.explanation || '').trim().slice(0, 800);
    if (excerpts.length < 1 || excerpts.length > 3 || !explanation) return { ok: false, reason: 'malformed-summary-evidence' };
    const sources = relationshipEvidenceSourcesForOptions(options);
    if (!sources.length) return { ok: false, reason: 'no-summary-evidence-source' };
    if (!excerpts.every(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources))) return { ok: false, reason: 'out-of-scope-summary-evidence' };

    const subjectNames = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])].map(value => String(value || '').trim()).filter(Boolean);
    const playerName = String(options.playerName || '').trim();
    if (!subjectNames.length || !playerName) return { ok: false, reason: 'summary-target-identity-unavailable' };
    const targetBound = excerpts.some(excerpt => subjectNames.some(name => containsNormalizedPhrase(excerpt, name)) && containsNormalizedPhrase(excerpt, playerName));
    if (!targetBound) return { ok: false, reason: 'wrong-summary-target' };

    const grounding = relationshipEvidenceGrounding(explanation, excerpts.join(' '), {
        subjectNames,
        objectNames: [playerName],
        otherSubjectNames: options.otherNpcNames || [],
        delta: {},
    });
    if (grounding) return { ok: false, reason: 'summary-evidence-' + grounding };
    return { ok: true, reason: '' };
}

function relationshipSummaryProposalGrounded(npc, patch, options = {}) {
    const evidence = relationshipSummaryEvidenceGrounded(npc, patch, options);
    if (evidence.ok) return evidence;

    // Compatibility: a validated nonzero numeric proposal already proves a current
    // relationship event. Preserve that established path while allowing descriptive
    // Current Dynamic evidence to stand on its own at zero delta.
    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;
    const change = relationshipDeltaForPatch(patch, caps);
    if (!change.evaluated || !change.impactValid || change.impact === 'none' || !change.hasRawMovement) return evidence;
    if (!RELATIONSHIP_AXES.some(axis => Number(change.delta?.[axis]) !== 0)) return evidence;
    const reasons = [...change.reasons];
    const provenance = relationshipAxisProvenance(change, options, { ...change.delta }, reasons);
    return RELATIONSHIP_AXES.some(axis => Number(provenance.delta?.[axis]) !== 0)
        ? { ok: true, reason: 'validated-numeric-relationship-evidence' }
        : evidence;
}

function relationshipSummaryDiagnostic(options, row) {
    if (Array.isArray(options.relationshipSummaryDiagnostics)) options.relationshipSummaryDiagnostics.push(row);
}

export function applyRelationshipSummaryProjection(npc, patch, options = {}) {
    const current = normalizeRelationshipSummary(npc?.relationshipSummary);
    const summary = normalizeRelationshipSummary(patch?.relationshipSummary);
    if (!summary) return npc;
    if (summary === current) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'no-change-proposed' });
        return npc;
    }
    if (!relationshipSummarySupported(summary, npc.relationship, npc.relationshipMilestones)) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'rejected-proposal', reason: 'unsupported-summary-intensity' });
        return npc;
    }

    const repairAllowed = options.repairRelationshipSummary === true
        && !current
        && Boolean(relationshipSummaryRepairContext(npc));
    const explicitReconcile = options.reconcileRelationshipSummary === true;
    const groundedCurrentProposal = relationshipSummaryProposalGrounded(npc, patch, options);
    if (!repairAllowed && !explicitReconcile && !groundedCurrentProposal.ok) {
        relationshipSummaryDiagnostic(options, { npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'rejected-proposal', reason: groundedCurrentProposal.reason || 'summary-evidence-rejected' });
        return npc;
    }

    const next = structuredClone(npc);
    next.relationshipSummary = summary;
    relationshipSummaryDiagnostic(options, {
        npcId: npc.id, field: 'relationshipSummary', group: 'playerRelationship', channel: 'relationship-summary', status: 'applied',
        reason: repairAllowed ? 'repair-context' : (explicitReconcile ? 'explicit-reconcile' : groundedCurrentProposal.reason),
    });
    return next;
}

export function relationshipDeltaForPatch"""
s = regex_once(s, old_summary_ground, new_summary_ground, 'relationship summary grounding')
write(p, s)

# Direct NEW bootstrap diagnostics and summary diagnostic handoff ------------
p = 'src/scan-application.js'
s = read(p)
s = s.replace("import { evidenceReferenceScope } from './evidence-adapter.js';", "import { evidenceReferenceScope } from './evidence-adapter.js';\nimport { DOSSIER_SEMANTIC_FIELDS, dossierFieldGroup } from './model/dossier-fields.js';")
insert_before = "// Existing dossiers reach this function after prepareModelLedPayload() has stripped every\n"
helpers = """function meaningfulBootstrapProposal(patch, field) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
    const value = patch?.[field];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return String(value ?? '').trim().length > 0;
}

function bootstrapComparable(value) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value ?? null);
    return evidenceTextKey(value, 6000);
}

function recordBootstrapDiagnostics(before, after, patch, diagnostics = []) {
    for (const field of DOSSIER_SEMANTIC_FIELDS) {
        if (!meaningfulBootstrapProposal(patch, field)) continue;
        const changed = bootstrapComparable(before?.[field]) !== bootstrapComparable(after?.[field]);
        diagnostics.push({
            npcId: after?.id || before?.id || '', field, group: dossierFieldGroup(field), channel: 'bootstrap',
            status: changed ? 'applied' : 'rejected-proposal',
            reason: changed ? '' : 'bootstrap-value-rejected-or-normalized-away',
        });
    }
}

"""
s = replace_once(s, insert_before, helpers + insert_before, 'bootstrap diagnostic helpers')
s = replace_once(
    s,
    """function applyIdentityAndBootstrapPatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
""",
    """function applyIdentityAndBootstrapPatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const before = structuredClone(npc);
    const next = structuredClone(npc);
""",
    'bootstrap before snapshot',
)
s = replace_once(
    s,
    """    if (Array.isArray(patch?.keyRelationships)) {
        next.keyRelationships = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
    }
    return next;
}
""",
    """    if (Array.isArray(patch?.keyRelationships)) {
        next.keyRelationships = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
    }
    recordBootstrapDiagnostics(before, next, patch, options.applicationDiagnostics);
    return next;
}
""",
    'bootstrap diagnostics record',
)
s = replace_once(
    s,
    """    const createdNpcIds = new Set();
    const patchByNpcId = new Map();
""",
    """    const createdNpcIds = new Set();
    const patchByNpcId = new Map();
    const applicationDiagnostics = [];
""",
    'application diagnostics array',
)
s = replace_once(
    s,
    """            npc = applyIdentityAndBootstrapPatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || '') });
""",
    """            npc = applyIdentityAndBootstrapPatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || ''), applicationDiagnostics });
""",
    'bootstrap diagnostic handoff',
)
s = replace_once(
    s,
    """                sourceMessageId,
                turn,
            };
""",
    """                sourceMessageId,
                turn,
                relationshipSummaryDiagnostics: applicationDiagnostics,
            };
""",
    'summary diagnostic handoff',
)
s = replace_once(
    s,
    """        patchResolutions: patchResolutions.map(row => row ? structuredClone(row) : null),
    };
}
""",
    """        patchResolutions: patchResolutions.map(row => row ? structuredClone(row) : null),
        applicationDiagnostics: applicationDiagnostics.map(row => structuredClone(row)),
    };
}
""",
    'application diagnostics return',
)
write(p, s)

# Scanner merges deterministic application diagnostics ----------------------
p = 'src/scanner.js'
s = read(p)
s = replace_once(
    s,
    """        semanticDiagnostics: [...compatibilityDiagnostics, ...semantic.diagnostics, ...family.diagnostics],
""",
    """        semanticDiagnostics: [...compatibilityDiagnostics, ...(applied.applicationDiagnostics || []), ...semantic.diagnostics, ...family.diagnostics],
""",
    'scanner diagnostic merge',
)
write(p, s)

# Scan / Refresh prompt contracts -------------------------------------------
p = 'src/scan-prompts.js'
s = read(p)
s = s.replace("import { dossierIdentityBootstrapPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';", "import { dossierExtractionPromptRules, dossierIdentityBootstrapPromptRules, relationshipSummaryRepairContext, compactText, containsNormalizedPhrase, currentExchange, nonSystemMessages, resolvePlayerName } from './scan-helpers.js';")
s = replace_once(
    s,
    """            evaluatedGroups: [], semanticUpdates: [],
            relationshipSummary: '', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,
""",
    """            evaluatedGroups: [], fieldEvaluations: { unchanged: [], insufficient: [], unavailable: [] }, semanticUpdates: [],
            relationshipSummary: '', relationshipSummaryEvidence: { excerpts: [], explanation: '' }, mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,
""",
    'scan contract fields',
)
s = replace_once(s, "        ...dossierIdentityBootstrapPromptRules().map(rule => '- ' + rule),\n", "        ...dossierIdentityBootstrapPromptRules().map(rule => '- ' + rule),\n        ...dossierExtractionPromptRules().map(rule => '- ' + rule),\n", 'scan shared extraction')
# Remove the now-superseded stronger Scan-only collection bootstrap sentence; limits/preservation rules remain below.
s = s.replace("        '- For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return arrays containing all grounded entries established by the CURRENT exchange; use [] only when none are supported. Do not use null for those four fields on a new NPC. A first scene can establish behavior or mannerisms when the text explicitly describes or clearly demonstrates a characteristic pattern, gesture, habit, or social tendency; prior sightings are not required.',\n", '')
s = replace_once(
    s,
    "        '- relationshipSummary is the CURRENT NPC-to-PLAYER dynamic, a descriptive projection separate from numeric score mutation. EXISTING DOSSIERS includes stored relationshipSummary only for NPCs who are already present or explicitly referenced in the CURRENT exchange. For those NPCs, compare against the stored value and return a new value only when the CURRENT exchange materially changes or newly clarifies that dynamic, or when explicit repair mode below applies. If an existing dossier row omits relationshipSummary, do not attempt Current Dynamic reconciliation for that NPC in this scan. Do not rewrite merely for style. A grounded current relationship proposal may update relationshipSummary even if runtime replay protection, inertia, caps, or gates later prevent numeric movement. Never copy schema instructions, field descriptions, placeholders, or labels into it; leave it empty/omit it when unchanged.',",
    "        '- relationshipSummary is the CURRENT NPC-to-PLAYER dynamic, a descriptive projection separate from numeric score mutation. EXISTING DOSSIERS includes stored relationshipSummary only for NPCs already present or explicitly referenced in the CURRENT exchange. Return a new value only when CURRENT evidence materially establishes/changes that dynamic, or explicit repair mode below applies. A normal current proposal includes relationshipSummaryEvidence with 1-3 exact permitted excerpts plus a brief evidence-grounded explanation binding this NPC to the PLAYER; mere name co-occurrence is insufficient. Zero deltas and impact none are correct when descriptive context changes without score-worthy movement. Do not rewrite for style or invent numeric movement just to qualify a summary.',",
    'scan summary prompt',
)
# Targeted refresh: add existing-only shared extraction rules and output metadata.
s = replace_once(
    s,
    "        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',\n",
    "        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',\n        ...dossierExtractionPromptRules({ includeNew: false, includeExisting: true }),\n",
    'refresh shared extraction',
)
s = replace_once(
    s,
    "        'TARGET DOSSIER includes the stored relationshipSummary. Reconcile it as the NPC current relationship dynamic toward the PLAYER: return a new concise natural-language value only when it is missing/invalid or the supplied chat establishes a materially newer dynamic. Do not rewrite merely for style. This targeted refresh may reconcile relationshipSummary without changing any relationship score. Never copy an output-schema instruction or placeholder into the field; leave it empty when unchanged.',",
    "        'TARGET DOSSIER includes the stored relationshipSummary. Reconcile it as the NPC current relationship dynamic toward the PLAYER: return a new concise natural-language value only when it is missing/invalid or the supplied chat establishes a materially newer dynamic. For a materially newer current-evidence proposal include relationshipSummaryEvidence; repair/reconciliation from already accepted stored relationship context remains separate. This targeted refresh may reconcile relationshipSummary without changing any relationship score. Never rewrite merely for style.',",
    'refresh summary prompt',
)
s = replace_once(
    s,
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], evaluatedGroups: [], semanticUpdates: [], relationshipSummary: '', relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] })}`",
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], evaluatedGroups: [], fieldEvaluations: { unchanged: [], insufficient: [], unavailable: [] }, semanticUpdates: [], relationshipSummary: '', relationshipSummaryEvidence: { excerpts: [], explanation: '' }, relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] })}`",
    'refresh output metadata',
)
write(p, s)

# Diagnostics counters + retained payload inspection ------------------------
p = 'src/operation-diagnostics.js'
s = read(p)
s = s.replace("const summary = { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] };", "const summary = { accepted: 0, rejected: 0, unchanged: 0, insufficient: 0, unavailable: 0, omitted: 0, reasons: [] };")
s = replace_once(
    s,
    """        else if (status === 'evaluated-unchanged') summary.unchanged += Math.max(1, Array.isArray(row?.evaluatedGroups) ? row.evaluatedGroups.length : 1);
        else if (status === 'no-field-proposal') reasons.push('no-field-proposal');
""",
    """        else if (status === 'evaluated-unchanged') summary.unchanged += Math.max(1, Array.isArray(row?.evaluatedGroups) ? row.evaluatedGroups.length : 1);
        else if (status === 'insufficient-evidence') summary.insufficient += 1;
        else if (status === 'context-unavailable') summary.unavailable += 1;
        else if (status === 'no-field-proposal') reasons.push('no-field-proposal');
""",
    'diagnostic evaluation counters',
)
s = s.replace("proposals: { accepted: 0, rejected: 0, unchanged: 0, omitted: 0, reasons: [] },", "proposals: { accepted: 0, rejected: 0, unchanged: 0, insufficient: 0, unavailable: 0, omitted: 0, reasons: [] },")
append_anchor = "\nexport function createOperationDiagnostics({ limit = DEFAULT_LIMIT, now = () => Date.now() } = {}) {"
inspect_code = """
function activeSwipeMetadata(message) {
    const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
    const swipe = Array.isArray(message?.swipe_info) ? message.swipe_info[swipeId] : null;
    if (swipe) return { swipeId, meta: swipe.extra?.npc_state_beta_v1 || null, source: 'swipe' };
    return { swipeId, meta: message?.extra?.npc_state_beta_v1 || null, source: 'message' };
}

export function inspectCapturedPayload({ chat = [], chatKey = '', messageId = null, operations = [] } = {}) {
    const source = Array.isArray(chat) ? chat : [];
    let id = Number.isInteger(messageId) ? messageId : -1;
    if (id < 0) {
        for (let index = source.length - 1; index >= 0; index -= 1) {
            if (source[index] && !source[index].is_user && !source[index].is_system) { id = index; break; }
        }
    }
    const message = source[id];
    if (!Number.isInteger(id) || id < 0 || !message || message.is_user || message.is_system) {
        return { available: false, reason: 'not-assistant-message', chatKey: clean(chatKey, 300), messageId: Number.isInteger(id) ? id : null, swipeId: null };
    }
    const selected = activeSwipeMetadata(message);
    const meta = selected.meta;
    if (!meta) {
        return { available: false, reason: selected.source === 'swipe' ? 'capture-metadata-unavailable-for-active-swipe' : 'capture-metadata-unavailable', chatKey: clean(chatKey, 300), messageId: id, swipeId: selected.swipeId };
    }
    const rows = (Array.isArray(operations) ? operations : []).filter(row =>
        String(row?.type || '') === 'first-pass'
        && Number(row?.source?.messageId) === id
        && Number(row?.source?.swipeId ?? 0) === selected.swipeId);
    const operation = rows.at(-1) || null;
    const parsedSuccessfully = meta.accepted === true && typeof meta.payload === 'string' && Boolean(meta.payload.trim());
    return {
        available: true,
        chatKey: clean(chatKey, 300),
        messageId: id,
        swipeId: selected.swipeId,
        metadataSource: selected.source,
        parsedSuccessfully,
        payload: parsedSuccessfully ? String(meta.payload) : '',
        parseErrors: Array.isArray(meta.errors) ? meta.errors.map(value => clean(value, 300)).filter(Boolean).slice(0, 12) : [],
        capturedAt: Number(meta.at) || null,
        application: operation ? {
            available: true,
            operationId: clean(operation.id, 160),
            status: clean(operation.status, 80),
            persistenceStatus: clean(operation.persistence?.status, 120) || 'not-run',
            revision: Number.isInteger(operation.persistence?.revision) ? operation.persistence.revision : null,
            proposals: operation.proposals && typeof operation.proposals === 'object' ? structuredClone(operation.proposals) : null,
            reason: clean(operation.failure?.reason, 300),
        } : { available: false, status: 'unavailable', persistenceStatus: 'unavailable', revision: null, proposals: null, reason: 'matching-first-pass-operation-not-retained' },
    };
}
"""
s = replace_once(s, append_anchor, inspect_code + append_anchor, 'capture inspection helper')
write(p, s)

# Public on-demand capture inspection/copy API ------------------------------
p = 'src/index.js'
s = read(p)
s = s.replace("import { createPortraitPromptUi } from './portrait-ui.js';", "import { createPortraitPromptUi } from './portrait-ui.js';\nimport { inspectCapturedPayload } from './operation-diagnostics.js';")
api_anchor = """function npcStateScanMetrics() {
    const status = npcStateDebugStatus();
"""
api_helpers = """function npcStateCaptureDiagnostics(messageId = null) {
    const chatKey = getChatKey();
    const chat = getContext().chat || [];
    const operations = chatKey && chatKey !== 'no-chat' ? engine.operationDiagnostics(chatKey, { limit: 64 }) : [];
    return inspectCapturedPayload({ chat, chatKey, messageId, operations });
}

async function copyNpcStateCapturedPayload(messageId = null) {
    const result = npcStateCaptureDiagnostics(messageId);
    if (!result.available || !result.parsedSuccessfully || !result.payload) return { ...result, copied: false };
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') return { ...result, copied: false, copyReason: 'clipboard-unavailable' };
    try {
        await clipboard.writeText(result.payload);
        return { ...result, copied: true };
    } catch (error) {
        return { ...result, copied: false, copyReason: String(error?.message || error).slice(0, 240) };
    }
}

function npcStateScanMetrics() {
    const status = npcStateDebugStatus();
"""
s = replace_once(s, api_anchor, api_helpers, 'index capture helpers')
s = replace_once(
    s,
    """    operationDiagnostics: options => engine.operationDiagnostics(getChatKey(), options),
    scanConnectionProfiles: npcScanProfileOptions,
""",
    """    operationDiagnostics: options => engine.operationDiagnostics(getChatKey(), options),
    captureDiagnostics: messageId => npcStateCaptureDiagnostics(messageId),
    copyCapturedPayload: messageId => copyNpcStateCapturedPayload(messageId),
    scanConnectionProfiles: npcScanProfileOptions,
""",
    'public capture APIs',
)
write(p, s)

# Version labels ------------------------------------------------------------
p = 'src/schema.js'
s = read(p).replace("export const NPC_STATE_VERSION = '0.7.5';", "export const NPC_STATE_VERSION = '0.7.6';")
write(p, s)
p = 'manifest.json'
s = read(p).replace('"version": "0.7.5"', '"version": "0.7.6"')
write(p, s)
p = 'DEVELOPMENT.md'
s = read(p).replace('- Extension release: `0.7.5`', '- Extension release: `0.7.6`').replace('- Model semantic update contract: `3`', '- Model semantic update contract: `4`').replace('- Foreground embedded-capture contract: `4`', '- Foreground embedded-capture contract: `5`')
write(p, s)
p = 'tests/structure.test.mjs'
s = read(p).replace("assert.equal(manifest.version, '0.7.5');", "assert.equal(manifest.version, '0.7.6');").replace("/NPC_STATE_VERSION = '0\\.7\\.5'/", "/NPC_STATE_VERSION = '0\\.7\\.6'/").replace('/NPC_STATE_MODEL_CONTRACT_VERSION = 3/', '/NPC_STATE_MODEL_CONTRACT_VERSION = 4/').replace('/FOREGROUND_CONTRACT_VERSION = 4/', '/FOREGROUND_CONTRACT_VERSION = 5/')
write(p, s)

# Core contract -------------------------------------------------------------
p = 'docs/core-contract.md'
s = read(p)
s = replace_once(
    s,
    "Omission is not deletion. Missing output is not proof that a field was evaluated. Coverage diagnostics distinguish explicitly evaluated, missing, and incomplete groups.",
    "Omission is not deletion. Missing output is not proof that a field was evaluated. Modern payloads may add compact field-level evaluation lists for explicitly unchanged, insufficient-evidence, or context-unavailable fields; older evaluatedGroups-only payloads remain valid group-level declarations and never gain fabricated per-field certainty. Foreground compact context identifies fields that were unavailable or only partially supplied so compaction cannot masquerade as an empty stored field. Coverage diagnostics distinguish explicitly evaluated, missing, unavailable, insufficient, and incomplete work.",
    'core context evaluation contract',
)
s = replace_once(
    s,
    "Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned.",
    "Relationship scoring remains deterministic and separate: caps, gates, inertia, fractional progress, milestones, replay protection, evidence history, and descriptive Current Dynamic safeguards are extension-owned. Current Dynamic evidence is also separate from numeric scoring eligibility: a source-owned, correctly targeted descriptive relationshipSummary may establish or materially update at zero scores/zero deltas without creating relationship-change history, while intensity/milestone safeguards still reject unsupported depth. Normal current-evidence proposals carry bounded exact summary evidence; explicit repair/reconciliation keeps its established accepted-history authority.",
    'core zero delta summary',
)
s = replace_once(
    s,
    "`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a patch explicitly records evaluated dossier groups with no field update. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics distinguish: no field proposal emitted, identity unresolved/rejected, field proposal rejected by validation, accepted field update, explicit evaluated-unchanged groups, a genuinely absent NPC patch, and incomplete dossier evaluation. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting.",
    "`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a legacy patch explicitly records evaluated dossier groups with no field update. Modern fieldEvaluations can separately report explicit unchanged, insufficient-evidence, and context-unavailable field ids. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics account for direct new-dossier bootstrap writes, semantic writes, Current Dynamic decisions, identity failures, validation rejection, accepted application, and missing/incomplete evaluation without double-counting the same effective field update. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting. The already-retained embedded payload may be inspected on demand from its active message/swipe metadata together with a matching retained first-pass operation; parsing and durable application are reported separately and no second payload archive is created.",
    'core diagnostics contract',
)
s = replace_once(
    s,
    "Uses the embedded payload from the completed roleplay response. No second model request is required. Existing NPC patches use supplied stable ids. New NPC patches leave id empty, use the canonical human-facing name (or a unique readable role label while genuinely unnamed) in activity references, and receive a locally assigned stored id. A newly admitted relevant NPC should capture every supported current-exchange dossier fact through the established bootstrap/semantic channels, including live state and grounded profile/canon/collections; conversation alone never justifies invented age, species, personality, relationships, or other unsupported facts, so Unknown is correct when evidence is absent. An existing name-only dossier remains existing and is enrichable through normal semanticUpdates rather than duplicate admission. Selected existing NPCs evaluate Mood, Location, Status/activity, and Goal against current evidence. Unsupported or unchanged values remain. Explicit removal requires sufficient evidence. Relationship replay guards and manual ownership remain authoritative.",
    "Uses the embedded payload from the completed roleplay response. No second model request is required. Existing NPC patches use supplied stable ids. New NPC patches leave id empty, use the canonical human-facing name (or a unique readable role label while genuinely unnamed) in activity references, and receive a locally assigned stored id. Foreground and Scan share one compact extraction map derived from the ordinary field registry. Before emitting the payload, the model silently performs a same-generation completeness review without exposing reasoning. A newly admitted relevant NPC should capture every supported current-exchange dossier fact through the established bootstrap/semantic channels, including appearance, live state, grounded profile/canon/collections, important memories, and relationship context; conversation alone never justifies invented age, species, personality, relationships, or other unsupported facts, so Unknown is correct when evidence is absent. An existing name-only dossier remains existing and is enrichable through normal semanticUpdates rather than duplicate admission. Selected existing NPCs compare only context actually supplied; compact unavailable/partial fields are never treated as empty. Unsupported or unchanged values remain. Explicit removal requires sufficient evidence. Relationship replay guards, random birthday fill, and manual ownership remain authoritative.",
    'core first-pass contract',
)
write(p, s)

# README release summary ----------------------------------------------------
p = 'README.md'
s = read(p)
s = regex_once(
    s,
    r"NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model\. Release 0\.7\.5.*?\n\n\n## Release 0\.7\.5\n\n.*?Persisted state schema/settings schema remain 1, semantic contract remains 3, and foreground contract remains 4\. No database rebuild or storage-key migration is required\.\n",
    """NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.6 strengthens same-generation dossier extraction, permits grounded neutral Current Dynamic updates without invented score movement, and makes first-pass diagnostics inspectable without adding another model request or payload store.\n\n\n## Release 0.7.6\n\nThe authoritative maintenance specification is [`docs/core-contract.md`](docs/core-contract.md). Foreground capture and Scan now share a compact extraction map derived from the dossier registry. New relevant NPCs are instructed to consider supported appearance, profile, live state, memories, non-player ties, and player relationship context before the embedded payload is emitted; existing compact dossiers identify unavailable/partial fields so budget omission is not confused with known-empty state. A private same-generation completeness review is instruction-only and never adds a second request.\n\nModern payloads may report compact `fieldEvaluations` lists for unchanged, insufficient-evidence, and unavailable fields while older `evaluatedGroups` payloads remain compatible. Direct new-dossier bootstrap writes, semantic validation/application, Current Dynamic decisions, identity failures, and coverage gaps now feed the same bounded operation diagnostics. `NPCState.captureDiagnostics(messageId?)` inspects the already-retained active message/swipe payload plus the matching first-pass operation when still retained; `NPCState.copyCapturedPayload(messageId?)` copies that same payload without creating a second archive.\n\nA grounded `relationshipSummary` can establish or materially update a neutral NPC-to-player Current Dynamic at zero relationship scores and zero deltas when its bounded exact evidence is source-owned and correctly targeted. Numeric relationship history, replay protection, caps, gates, inertia, fractional progress, and milestone/intensity safeguards are unchanged. Random birthday filling remains unchanged.\n\nPersisted state schema/settings schema remain 1, semantic contract is 4, and foreground contract is 5. No database rebuild or storage-key migration is required.\n""",
    'README release section',
)
s = s.replace('- Extension release: `0.7.5`', '- Extension release: `0.7.6`', 1).replace('- Model semantic update contract: `3`', '- Model semantic update contract: `4`', 1).replace('- Foreground embedded-capture contract: `4`', '- Foreground embedded-capture contract: `5`', 1)
write(p, s)

# CHANGELOG -----------------------------------------------------------------
p = 'CHANGELOG.md'
s = read(p)
entry = """## 0.7.6\n\n- Consolidated first-pass and Scan extraction requirements around the shared dossier registry, including same-generation completeness review and compact foreground unavailable/partial context markers.\n- Added optional compact per-field evaluation metadata so explicit unchanged, insufficient evidence, unavailable context, runtime rejection, accepted application, and genuine omission remain distinguishable without full dossier echoes.\n- Decoupled grounded Current Dynamic evidence from numeric relationship movement, allowing neutral professional/other descriptive relationship summaries at zero scores and zero deltas without fabricating score history.\n- Accounted for direct new-dossier bootstrap and Current Dynamic decisions in the bounded operation ledger, and added on-demand active message/swipe capture inspection/copy APIs over already-retained metadata.\n- Preserved identity handoff, rollback/correction remediation, replay protection, random birthday fill, storage identity, persisted schema 1, settings schema 1, and optional completeness behavior.\n\n"""
if '## 0.7.6' in s:
    raise SystemExit('CHANGELOG already contains 0.7.6')
# Insert before first release heading.
m = re.search(r'^## ', s, re.M)
if not m:
    raise SystemExit('CHANGELOG has no release heading')
s = s[:m.start()] + entry + s[m.start():]
write(p, s)

# Behavioral regression suite ----------------------------------------------
p = 'tests/v076-first-pass-completeness.test.mjs'
write(p, r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { compactForegroundNpc } from '../src/foreground-context.js';
import { foregroundContract } from '../src/foreground-contract.js';
import { buildForegroundInjection } from '../src/injection.js';
import { createNpcStateEngine } from '../src/engine.js';
import { inspectCapturedPayload, summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';

const ALL_GROUPS = ['canon', 'profile', 'live', 'memory', 'npcRelationships'];
const NO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'Routine professional intake does not justify numeric movement.' };
const SANNA_VISIBLE = [
    'Sanna Karr introduces herself as the desk clerk and acting intake officer while the master is in Rhunwald.',
    'Sanna Karr pulls Lucien through the doorway out of the mountain wind.',
    'Sanna Karr wears a dark homespun bodice over an unbleached linen shirt, with sleeves pinned above her wrists; pale brown hair is tied at her nape with a leather thong.',
    'Sanna Karr keeps her attention on the intake ledger rather than Lucien’s appearance.',
    'Sanna Karr gives Lucien short, practical commands, prepares registration paperwork, and taps the paper to direct him.',
    'Sanna Karr processes Lucien Noctis’s signature and issues Lucien a lead token bearing the Guild twin-peak seal.',
    'Sanna Karr presents Lucien three work postings and explains the boar bounty and Guild fee.',
].join(' ');

function safeState(key = 'chat:v076') {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function sannaIdentity() {
    return {
        anchor: 'Sanna Karr',
        excerpts: ['Sanna Karr introduces herself as the desk clerk and acting intake officer while the master is in Rhunwald.'],
        explanation: 'The current visible response explicitly names Sanna Karr.',
    };
}

function sannaActivity() {
    return {
        exchangeActive: { excerpts: ['Sanna Karr gives Lucien short, practical commands, prepares registration paperwork, and taps the paper to direct him.'], explanation: 'Sanna acts directly in the exchange.' },
        inChat: { excerpts: ['Sanna Karr presents Lucien three work postings and explains the boar bounty and Guild fee.'], explanation: 'Sanna remains in the active intake scene.' },
    };
}

function sannaPatch(extra = {}) {
    return {
        id: '', name: 'Sanna Karr', identityKind: 'named', identityEvidence: sannaIdentity(), activityEvidence: sannaActivity(),
        evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: [], insufficient: ['age', 'background', 'keyRelationships'], unavailable: [] },
        relationshipSummary: 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.',
        relationshipSummaryEvidence: {
            excerpts: ['Sanna Karr processes Lucien Noctis’s signature and issues Lucien a lead token bearing the Guild twin-peak seal.'],
            explanation: 'Sanna Karr processes Lucien Noctis’s signature and issues Lucien an official token during registration.',
        },
        relationshipChange: structuredClone(NO_REL),
        ...extra,
    };
}

function payload(patch, active = ['Sanna Karr']) {
    return { exchangeActiveNpcIds: active, inChatNpcIds: active, worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
}

function apply(state, patch, visible = SANNA_VISIBLE, extra = {}) {
    return applyScanResult(state, payload(patch), {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible,
        semanticEvidenceContext: visible, relationshipContext: visible, playerName: 'Lucien',
        applyReturnedNpcPatches: true, requireDossierCoverage: true, applyRelationship: true,
        preservePresence: true, preserveObservation: true, ...extra,
    });
}

function engineHarness({ state, chat, generate = null } = {}) {
    const key = state.chatKey;
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, state, 1);
    const context = { chat: structuredClone(chat) };
    let generations = 0;
    const settings = normalizeSettings({ scanAfterEachResponse: false, branchRescan: false, birthdayFillMode: 'off' });
    const adapters = {
        getContext: () => context, getChatKey: () => key, getSettings: () => settings,
        getPointer: () => pointer, getStablePointer: () => pointer, setPointer: (_key, value) => { pointer = value; }, persistSettings: () => {},
        generate: async args => { generations += 1; if (!generate) throw new Error('unexpected generation'); return generate(args); },
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
    };
    return { engine: createNpcStateEngine(adapters), context, generations: () => generations, persisted: () => decodeV3Payload(saved, key).state };
}

test('Sanna Karr first-pass bootstrap captures supported dossier facts and neutral Current Dynamic at zero scores', () => {
    const direct = {
        role: 'Desk clerk and acting intake officer',
        appearance: 'Wears a dark homespun bodice over an unbleached linen shirt with sleeves pinned above her wrists; pale brown hair is tied at her nape with a leather thong.',
        behaviorProfile: ['Practical and task-focused during intake; keeps attention on the ledger and paperwork.'],
        mannerisms: ['Taps the registration paper to direct Lucien during intake.'],
        memories: ['Processed Lucien Noctis’s registration and issued his lead Guild token.'],
        status: 'Processing Lucien’s intake and explaining available postings.',
    };
    const result = apply(safeState(), sannaPatch(direct));
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.ok(sanna);
    assert.equal(sanna.role, direct.role);
    assert.equal(sanna.appearance, direct.appearance);
    assert.deepEqual(sanna.behaviorProfile, direct.behaviorProfile);
    assert.deepEqual(sanna.mannerisms, direct.mannerisms);
    assert.deepEqual(sanna.memories, direct.memories);
    assert.equal(sanna.relationshipSummary, 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.');
    assert.deepEqual(sanna.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal((sanna.relationshipHistory || []).length, 0);
    assert.equal(sanna.age, '');
    assert.equal(sanna.background, '');
    assert.deepEqual(sanna.keyRelationships, []);
    assert.ok(result.semanticDiagnostics.filter(row => row.channel === 'bootstrap' && row.status === 'applied').length >= 6);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'applied'), true);
});

test('zero-delta Current Dynamic rejects wrong-target evidence instead of mutating the dossier', () => {
    const state = safeState('chat:wrong-summary');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', relationshipSummary: '' }), normalizeNpc({ id: 'mira', name: 'Mira' })];
    const visible = 'Sanna Karr stands by the desk. Mira welcomes Lucien and processes Lucien’s registration paperwork.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: [], insufficient: [], unavailable: [] }, semanticUpdates: [],
        relationshipSummary: 'Regards Lucien as a new applicant in a professional capacity.',
        relationshipSummaryEvidence: { excerpts: ['Mira welcomes Lucien and processes Lucien’s registration paperwork.'], explanation: 'Mira welcomes Lucien and processes Lucien’s registration paperwork.' },
        relationshipChange: structuredClone(NO_REL),
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, relationshipContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true, preserveObservation: true,
    });
    assert.equal(result.state.npcs.find(npc => npc.id === 'sanna').relationshipSummary, '');
    const diag = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diag?.status, 'rejected-proposal');
    assert.equal(diag?.reason, 'wrong-summary-target');
});

test('nonzero validated relationship proposals remain compatible with summary projection without new summary evidence', () => {
    const state = safeState('chat:nonzero-summary');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', relationship: { trust: 10, affection: 0, desire: 0, tension: 0 } })];
    const visible = 'Sanna Karr tells Lucien she trusts him after he kept his promise.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, semanticUpdates: [],
        relationshipSummary: 'Sanna now regards Lucien as somewhat more reliable.',
        relationshipChange: { evaluated: true, impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, priority: ['trust'], axisEvidence: { trust: { excerpts: [visible], explanation: 'Sanna explicitly trusts Lucien after his kept promise.' } }, evidence: visible, reason: 'Trust increased.' },
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, relationshipContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: true, preservePresence: true, preserveObservation: true,
    });
    assert.equal(result.state.npcs[0].relationshipSummary, 'Sanna now regards Lucien as somewhat more reliable.');
});

test('direct bootstrap writes and summary decisions participate in bounded proposal accounting', () => {
    const result = apply(safeState('chat:diag-bootstrap'), sannaPatch({ role: 'Desk clerk', appearance: 'Pale brown hair tied at her nape.', memories: ['Issued Lucien a lead registration token.'] }));
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.ok(summary.accepted >= 4);
    assert.equal(summary.rejected, 0);
    assert.ok(summary.insufficient >= 3);
});

test('field evaluations distinguish unchanged, insufficient, unavailable, rejected, applied and omitted work', () => {
    const state = safeState('chat:eval-detail');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr', role: 'Desk clerk', mood: 'Focused' })];
    const visible = 'Sanna Karr remains focused while Lucien waits.';
    const patch = {
        id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS,
        fieldEvaluations: { unchanged: ['role'], insufficient: ['age'], unavailable: ['memories'] },
        semanticUpdates: [
            { field: 'mood', operation: 'replace', value: 'Attentive', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current focus.' },
            { field: 'species', operation: 'establish', value: 'Human', durability: 'durable', sources: [{ messageId: 1, excerpt: 'not in source' }], explanation: 'Unsupported.' },
        ], relationshipChange: structuredClone(NO_REL),
    };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: visible, profileContext: visible, semanticEvidenceContext: visible,
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
        requireDossierCoverage: true,
    });
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'role' && row.status === 'evaluated-unchanged'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'age' && row.status === 'insufficient-evidence'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'memories' && row.status === 'context-unavailable'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'mood' && row.status === 'applied'), true);
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'species' && row.status === 'invalid-source-reference'), true);
    const coverage = result.coverageDiagnostics.find(row => row.status === 'incomplete-evaluation');
    assert.ok(coverage?.missingFields?.includes('appearance'));
    const summary = summarizeProposalDiagnostics(result.semanticDiagnostics, result.coverageDiagnostics);
    assert.equal(summary.accepted, 1);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.unchanged, 1);
    assert.equal(summary.insufficient, 1);
    assert.equal(summary.unavailable, 1);
    assert.ok(summary.omitted > 0);
});

test('legacy evaluatedGroups-only payload remains group-level compatible without invented field evaluations', () => {
    const state = safeState('chat:legacy-eval');
    state.npcs = [normalizeNpc({ id: 'sanna', name: 'Sanna Karr' })];
    const patch = { id: 'sanna', name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) };
    const result = applyScanResult(state, { exchangeActiveNpcIds: ['sanna'], inChatNpcIds: ['sanna'], worldActiveNpcIds: [], npcs: [patch], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }, {
        sourceMessageId: 1, turn: 1, currentAdmissionText: 'Sanna Karr waits at the desk.', profileContext: 'Sanna Karr waits at the desk.',
        playerName: 'Lucien', applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true, requireDossierCoverage: true,
    });
    assert.equal(result.coverageDiagnostics.length, 0);
    const group = result.semanticDiagnostics.find(row => row.status === 'evaluated-unchanged' && Array.isArray(row.evaluatedGroups));
    assert.deepEqual(group?.evaluatedGroups, ALL_GROUPS);
    assert.equal(result.semanticDiagnostics.some(row => row.field && ['insufficient-evidence', 'context-unavailable'].includes(row.status)), false);
});

test('new direct field and semantic update for the same field use semantic authority once', () => {
    const patch = sannaPatch({
        appearance: 'Direct duplicate that must not bypass semantic evidence.',
        semanticUpdates: [{ field: 'appearance', operation: 'establish', value: 'Pale brown hair tied at her nape with a leather thong.', durability: 'durable', sources: [{ messageId: 1, excerpt: 'pale brown hair is tied at her nape with a leather thong.' }], explanation: 'Grounded appearance.' }],
    });
    const result = apply(safeState('chat:dedupe'), patch);
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.equal(sanna.appearance, 'Pale brown hair tied at her nape with a leather thong.');
    assert.equal(result.semanticDiagnostics.filter(row => row.field === 'appearance' && row.status === 'applied').length, 1);
});

test('foreground and Scan share extraction, field-evaluation and same-generation completeness requirements', () => {
    const foreground = foregroundContract({}, { capture: true, continuity: true });
    const chat = [{ is_user: true, mes: 'Lucien enters.' }, { is_user: false, mes: SANNA_VISIBLE }];
    const scan = buildScanPrompt({ state: safeState('chat:prompt'), chat, assistantMessageId: 1, playerName: 'Lucien' });
    for (const marker of ['DOSSIER EXTRACTION MAP:', 'FIELD EVALUATION DETAIL:', 'PRIVATE COMPLETENESS CHECK:']) {
        assert.match(foreground, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(scan, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(foreground, /relationshipSummaryEvidence/);
    assert.match(scan, /relationshipSummaryEvidence/);
});

test('tight foreground compaction marks omitted stored fields unavailable instead of making them look empty', () => {
    const npc = normalizeNpc({ id: 'sanna', name: 'Sanna Karr', background: 'A long stored background.', memories: ['One memory'], keyRelationships: ['Mira - colleague'], appearanceForms: [{ name: 'Human', appearance: 'Human appearance' }], mood: '' });
    const compact = compactForegroundNpc(npc, 4, {});
    assert.ok(compact.contextCoverage.unavailable.includes('background'));
    assert.ok(compact.contextCoverage.unavailable.includes('memories'));
    assert.ok(compact.contextCoverage.unavailable.includes('keyRelationships'));
    assert.ok(compact.contextCoverage.unavailable.includes('appearanceForms'));
    assert.equal(compact.contextCoverage.unavailable.includes('mood'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(compact.live || {}, 'mood'), false);
    const injection = buildForegroundInjection({ ...safeState('chat:budget'), npcs: [npc] }, { injectBudgetTokens: 1600, injectLimit: 1, autoScan: true, inject: true });
    assert.match(injection.prompt, /contextCoverage/);
    assert.match(injection.prompt, /PRIVATE COMPLETENESS CHECK/);
});

test('random birthday filling remains independent from extraction evaluation metadata', () => {
    const result = apply(safeState('chat:birthday'), sannaPatch({ role: 'Desk clerk' }), SANNA_VISIBLE, {
        birthdayFill: { mode: 'random', calendar: 'Frost:30\nThaw:30', fallbackDays: 30 },
    });
    const sanna = result.state.npcs.find(npc => npc.name === 'Sanna Karr');
    assert.match(sanna.birthday, /^\d+ (Frost|Thaw)$/);
    assert.equal(sanna.birthdayProvenance, 'generated');
    assert.equal(result.semanticDiagnostics.some(row => row.field === 'birthday' && row.channel === 'bootstrap'), false);
});

test('successful embedded Sanna capture commits without an extra generate call and reload preserves the dossier', async () => {
    const key = 'chat:embedded-sanna';
    const state = safeState(key);
    const chat = [{ is_user: true, name: 'Lucien', mes: 'Lucien enters the Guild office.' }, { is_user: false, name: 'Assistant', mes: SANNA_VISIBLE }];
    const harness = engineHarness({ state, chat });
    await harness.engine.loadChat(key);
    const result = await harness.engine.applyEmbeddedScan(1, payload(sannaPatch({ role: 'Desk clerk', appearance: 'Pale brown hair tied at her nape.', memories: ['Issued Lucien a lead registration token.'] })), { expectedMessageText: SANNA_VISIBLE, expectedSwipeId: 0 });
    assert.equal(result.ok, true);
    assert.equal(harness.generations(), 0);
    const persisted = harness.persisted();
    assert.equal(persisted.npcs.length, 1);
    assert.equal(persisted.npcs[0].name, 'Sanna Karr');
    assert.equal(persisted.npcs[0].relationshipSummary, 'Regards Lucien as a newly registered guild applicant; their interaction is strictly professional.');
});

test('follow-up Scan uses the assigned stable id without duplicating Sanna or replaying relationship scoring', async () => {
    const key = 'chat:followup-sanna';
    const state = safeState(key);
    const chat = [{ is_user: true, name: 'Lucien', mes: 'Lucien enters.' }, { is_user: false, name: 'Assistant', mes: SANNA_VISIBLE }];
    let assignedId = '';
    const harness = engineHarness({
        state, chat,
        generate: async () => JSON.stringify({ exchangeActiveNpcIds: [assignedId], inChatNpcIds: [assignedId], worldActiveNpcIds: [], npcs: [{ id: assignedId, name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, fieldEvaluations: { unchanged: ['role', 'appearance', 'behaviorProfile', 'mannerisms', 'memories'], insufficient: ['age', 'background', 'keyRelationships', 'species', 'apparentAge', 'birthday', 'personality', 'speech', 'mood', 'location', 'goal', 'status', 'currentForm', 'appearanceForms'], unavailable: [] }, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }),
    });
    await harness.engine.loadChat(key);
    const first = await harness.engine.applyEmbeddedScan(1, payload(sannaPatch({ role: 'Desk clerk' })), { expectedMessageText: SANNA_VISIBLE, expectedSwipeId: 0 });
    assignedId = first.state.npcs[0].id;
    const second = await harness.engine.scan(1, { manual: true, force: true });
    assert.equal(second.ok, true);
    assert.equal(second.state.npcs.length, 1);
    assert.equal(second.state.npcs[0].id, assignedId);
    assert.deepEqual(second.state.npcs[0].relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal((second.state.npcs[0].relationshipHistory || []).length, 0);
    assert.equal(harness.generations(), 1);
});

test('capture inspection selects active swipe metadata and separates parsed payload from durable application outcome', () => {
    const chat = [{ is_user: true, mes: 'x' }, {
        is_user: false, mes: 'visible', swipe_id: 1,
        extra: { npc_state_beta_v1: { version: 1, accepted: true, payload: '{"old":true}', errors: [], at: 1 } },
        swipe_info: [
            { extra: { npc_state_beta_v1: { version: 1, accepted: true, payload: '{"swipe":0}', errors: [], at: 2 } } },
            { extra: { npc_state_beta_v1: { version: 1, accepted: true, payload: '{"swipe":1}', errors: [], at: 3 } } },
        ],
    }];
    const operations = [{ id: 'op0', type: 'first-pass', status: 'committed', source: { messageId: 1, swipeId: 0 }, persistence: { status: 'committed', revision: 2 }, proposals: { accepted: 1 } }, { id: 'op1', type: 'first-pass', status: 'committed', source: { messageId: 1, swipeId: 1 }, persistence: { status: 'committed', revision: 3 }, proposals: { accepted: 4 } }];
    const result = inspectCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 1, operations });
    assert.equal(result.payload, '{"swipe":1}');
    assert.equal(result.swipeId, 1);
    assert.equal(result.parsedSuccessfully, true);
    assert.equal(result.application.status, 'committed');
    assert.equal(result.application.revision, 3);
    assert.equal(result.application.proposals.accepted, 4);
});

test('capture inspection never falls back to another swipe and reports unavailable/stale outcomes honestly', () => {
    const chat = [{ is_user: false, mes: 'visible', swipe_id: 1, extra: { npc_state_beta_v1: { accepted: true, payload: '{"wrong":true}' } }, swipe_info: [{ extra: { npc_state_beta_v1: { accepted: true, payload: '{"zero":true}' } } }, { extra: {} }] }];
    const missing = inspectCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 0, operations: [] });
    assert.equal(missing.available, false);
    assert.equal(missing.reason, 'capture-metadata-unavailable-for-active-swipe');

    chat[0].swipe_info[1].extra.npc_state_beta_v1 = { accepted: true, payload: '{"one":true}', errors: [], at: 5 };
    const stale = inspectCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 0, operations: [{ id: 'op', type: 'first-pass', status: 'discarded', source: { messageId: 0, swipeId: 1 }, persistence: { status: 'saved-unowned-blocked', revision: 4 }, failure: { reason: 'history-changed-during-persist' } }] });
    assert.equal(stale.parsedSuccessfully, true);
    assert.equal(stale.application.status, 'discarded');
    assert.equal(stale.application.reason, 'history-changed-during-persist');
});
''')

print('Applied v0.7.6 candidate changes.')

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
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated

# 1. Current Dynamic: reuse accepted same-operation identity/activity bindings without
# requiring every summary quote to restate a participant name/pronoun.
p = 'src/scan-relationships.js'
s = read(p)
new_contextual = r'''function relationshipSummaryContextualTargetBound(npc, excerpts, excerptMatches, options = {}) {
    const binding = options.relationshipSummaryTargetBinding;
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
    if (String(binding.npcId || '') !== String(npc?.id || '')) return false;
    if (binding.identityAccepted !== true || binding.exchangeActiveAccepted !== true || binding.activityEvidenceAccepted !== true) return false;

    const subjectNames = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])].map(value => String(value || '').trim()).filter(Boolean);
    const playerName = String(options.playerName || '').trim();
    const otherNpcNames = (Array.isArray(options.otherNpcNames) ? options.otherNpcNames : []).map(value => String(value || '').trim()).filter(Boolean);
    if (!subjectNames.length || !playerName) return false;

    const acceptedActivityExcerpts = Array.isArray(binding.activityEvidenceExcerpts) ? binding.activityEvidenceExcerpts : [];
    const acceptedIdentityExcerpts = binding.identityEvidenceAccepted === true && Array.isArray(binding.identityEvidenceExcerpts)
        ? binding.identityEvidenceExcerpts : [];
    const identityIndexes = [];
    const playerInteractionIndexes = [];
    for (let index = 0; index < excerpts.length; index += 1) {
        const excerpt = excerpts[index];
        const reusesAcceptedIdentityContext = summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedIdentityExcerpts)
            || summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts);
        if (identityMentioned(excerpt, subjectNames, otherNpcNames) && reusesAcceptedIdentityContext) identityIndexes.push(index);
        const visibleNarration = narrationOutsideQuotedDialogue(excerpt);
        if (excerptMatches[index]?.kind === 'visible'
            && !identityMentioned(excerpt, otherNpcNames, subjectNames)
            && playerMentioned(visibleNarration, playerName, [...subjectNames, ...otherNpcNames], {
                allowNarratorSecondPerson: true,
                sourceRole: excerptMatches[index]?.sourceRole || '',
            })
            && summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)) {
            playerInteractionIndexes.push(index);
        }
    }

    // Keep the older explicit connected-pair path. It is useful in crowded scenes where the
    // broader transient bridge below intentionally refuses to guess between multiple actors.
    if (playerInteractionIndexes.some(playerIndex => identityIndexes.some(identityIndex =>
        excerptMatches[playerIndex]?.sourceId
        && excerptMatches[playerIndex]?.sourceId === excerptMatches[identityIndex]?.sourceId))) return true;

    const sources = relationshipEvidenceSourcesForOptions(options);
    const activityBindings = verifiedTransientEvidenceBindings(
        binding.activityEvidenceBindings,
        acceptedActivityExcerpts,
        sources,
    );
    const identityBindings = verifiedTransientEvidenceBindings(
        binding.identityEvidenceBindings,
        acceptedIdentityExcerpts,
        sources,
    );
    if (!activityBindings.length || !identityBindings.length) return false;

    const activitySources = new Set(activityBindings.filter(row => row.kind === 'visible').map(row => row.sourceId));
    const identitySources = new Set(identityBindings.filter(row => row.kind === 'visible').map(row => row.sourceId));
    const competingSources = new Set((Array.isArray(binding.competingActivitySourceIds) ? binding.competingActivitySourceIds : [])
        .map(value => String(value || '').trim()).filter(Boolean));
    const bridgedSources = [...activitySources].filter(sourceId => identitySources.has(sourceId) && !competingSources.has(sourceId));
    if (!bridgedSources.length) return false;

    const summarySourceSafe = sourceId => excerpts.every((excerpt, index) =>
        excerptMatches[index]?.sourceId === sourceId
        && !explicitOtherNpcTarget(excerpt, subjectNames, playerName, otherNpcNames, excerptMatches[index])
        && !contextualDialogueNarrationAmbiguous(
            excerpt,
            subjectNames,
            playerName,
            otherNpcNames,
            acceptedActivityExcerpts,
            acceptedIdentityExcerpts,
            excerptMatches[index]?.sourceRole || '',
        ));
    const summaryReusesOwnedInteraction = sourceId => excerpts.some((excerpt, index) =>
        excerptMatches[index]?.sourceId === sourceId
        && (summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)
            || summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedIdentityExcerpts)));

    // Accepted identity + exchangeActive evidence is a transient semantic participant binding,
    // not blanket authority over the whole message. At least one summary quote must reuse that
    // NPC's accepted interaction/identity evidence; every quote must stay in the same exact
    // permitted source, and a source shared with another accepted active NPC is too ambiguous
    // for this name/pronoun-free bridge. Direct target binding above remains available.
    return bridgedSources.some(sourceId => summarySourceSafe(sourceId)
        && summaryReusesOwnedInteraction(sourceId)
        && excerpts.every(excerpt => !identityMentioned(excerpt, otherNpcNames, subjectNames)));
}
'''
s = regex_once(s, r'function relationshipSummaryContextualTargetBound\(npc, excerpts, excerptMatches, options = \{\}\) \{.*?\n\}\n\n(?=function relationshipSummaryEvidenceGrounded)', new_contextual + '\n', 'replace relationship summary contextual binding')
write(p, s)

# Add competing accepted-activity source ids to the transient binding handoff.
p = 'src/scan-application.js'
s = read(p)
needle = '''    const unambiguousActivityBindingsForNpc = npcId => {
        const permitted = new Set(unambiguousActivityExcerptsForNpc(npcId));
        const own = acceptedExchangeActivityEvidence.find(row => row.npcId === npcId)?.bindings || [];
        return own.filter(row => permitted.has(row.excerpt));
    };
'''
replacement = needle + '''    const competingActivitySourceIdsForNpc = npcId => {
        const ownSources = new Set((acceptedExchangeActivityEvidence.find(row => row.npcId === npcId)?.bindings || []).map(row => row.sourceId));
        const competing = new Set();
        for (const row of acceptedExchangeActivityEvidence) {
            if (row.npcId === npcId) continue;
            for (const binding of row.bindings || []) if (ownSources.has(binding.sourceId)) competing.add(binding.sourceId);
        }
        return [...competing];
    };
'''
s = replace_once(s, needle, replacement, 'add competing activity source ids')
s = replace_once(s, '''                        activityEvidenceBindings: activityEvidenceAccepted
                            ? unambiguousActivityBindingsForNpc(npc.id)
                            : [],
                        identityEvidenceAccepted,
''', '''                        activityEvidenceBindings: activityEvidenceAccepted
                            ? unambiguousActivityBindingsForNpc(npc.id)
                            : [],
                        competingActivitySourceIds: activityEvidenceAccepted
                            ? competingActivitySourceIdsForNpc(npc.id)
                            : [],
                        identityEvidenceAccepted,
''', 'pass competing activity source ids')

# Remove the direct ordinary bootstrap mutation path. Identity/admission remains focused here;
# ordinary NEW/EXISTING fields flow through semanticUpdates after accepted identity resolution.
s = s.replace("import { DOSSIER_SEMANTIC_FIELDS, dossierFieldGroup, dossierFieldValueIssue, normalizeDossierTextCollection } from './model/dossier-fields.js';\n", '')
identity_only = r'''function applyIdentityPatch(npc, patch) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
    const canonicalName = canonicalPatchName(patch);

    if (!locked.has('name') && canonicalName) {
        if (canonicalName !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) {
            next.aliases = appendUnique(next.aliases, [next.name], 10);
        }
        next.name = canonicalName;
    }
    if (!locked.has('aliases')) {
        const aliases = (Array.isArray(patch?.aliases) ? patch.aliases : [])
            .filter(alias => humanIdentityCandidate(alias, patch?.role));
        next.aliases = appendUnique(next.aliases, aliases, 10);
    }
    return next;
}
'''
s = regex_once(s, r'const BIRTHDAY_EVIDENCE_CUES = .*?\nfunction socialEdgeKey\(edge\) \{', identity_only + '\nfunction socialEdgeKey(edge) {', 'remove direct new bootstrap path')
s = replace_once(s, "npc = applyIdentityAndBootstrapPatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || ''), applicationDiagnostics });", "npc = applyIdentityPatch(npc, patch);", 'use identity-only patch')
write(p, s)

# 2/3. Canonical semantic path: recurring profile evidence basis + NEW flat compatibility
# only when an exact field value can be safely lifted from a permitted source.
p = 'src/model/semantic-updates.js'
s = read(p)
s = replace_once(s, 'export const NPC_STATE_MODEL_CONTRACT_VERSION = 6;', 'export const NPC_STATE_MODEL_CONTRACT_VERSION = 7;', 'semantic contract version')
s = replace_once(s, "const PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);", "const PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);\nconst RECURRING_PROFILE_FIELDS = new Set(['behaviorProfile', 'mannerisms']);\nconst PROFILE_EVIDENCE_BASES = new Set(['explicit-recurrence', 'reinforcing-instances', 'development']);", 'profile basis constants')
s = replace_once(s, "        `Mode: ${mode}. EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates; do not also emit legacy/direct ordinary replacements. Semantic fields: ${dossierSemanticFieldList()}. Operations: ${DOSSIER_SEMANTIC_OPERATIONS.join('|')}.`,", "        `Mode: ${mode}. Accepted NEW and EXISTING dossiers have ONE ordinary mutation channel: semanticUpdates; NEW identity/admission stays flat. Do not also emit direct ordinary replacements. Semantic fields: ${dossierSemanticFieldList()}. Operations: ${DOSSIER_SEMANTIC_OPERATIONS.join('|')}.`,", 'semantic prompt authority')
s = replace_once(s, "        'Update:{field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,sources:[{messageId,excerpt}],explanation?}. Shape notation is explanatory. Omission preserves; remove is explicit; clear:true authorizes an empty collection. Age replacement needs ageKind birthday|elapsed|correction.',", "        'Update:{field,operation,value?,changes?,clear?,durability?,scope?,ageKind?,evidenceBasis?,sources:[{messageId,excerpt}],explanation?}. Shape notation is explanatory. Omission preserves; remove is explicit; clear:true authorizes an empty collection. Age replacement needs ageKind birthday|elapsed|correction.',", 'semantic prompt shape')
s = replace_once(s, "        'Durable canon/profile needs durable evidence. Temporary sleep, silence, mood, injury, one-off action/pose, or temporary form does not become durable characterization; later grounded characterization may replace an obsolete temporary placeholder.',", "        'Durable canon/profile needs durable evidence. Temporary sleep, silence, mood, injury, one-off action/pose, or temporary form does not become durable characterization; later grounded characterization may replace an obsolete temporary placeholder.',\n        'behaviorProfile/mannerisms mutations that establish or change a recurring characteristic require evidenceBasis=explicit-recurrence|reinforcing-instances|development. This is the model semantic basis carried with exact owned sources, not deterministic proof of recurrence; tentative one-off evidence belongs in profileObservations.',", 'semantic prompt recurring basis')
s = replace_once(s, "        durability: String(raw.durability || '').trim().toLocaleLowerCase(),\n    };", "        durability: String(raw.durability || '').trim().toLocaleLowerCase(),\n        evidenceBasis: String(raw.evidenceBasis || '').trim().toLocaleLowerCase(),\n    };", 'normalize evidence basis')
s = replace_once(s, "        durability: String(raw.durability || '').trim().toLocaleLowerCase(),\n        sources: sourceRows(raw).map(row => ({ messageId: row.messageId ?? null, excerpt: evidenceKey(row.excerpt, 900) })),", "        durability: String(raw.durability || '').trim().toLocaleLowerCase(),\n        evidenceBasis: String(raw.evidenceBasis || '').trim().toLocaleLowerCase(),\n        sources: sourceRows(raw).map(row => ({ messageId: row.messageId ?? null, excerpt: evidenceKey(row.excerpt, 900) })),", 'dedupe evidence basis')

basis_fn = r'''function recurringProfileEvidenceBasisIssue(npc, update) {
    if (!RECURRING_PROFILE_FIELDS.has(update.field) || update.operation === 'remove') return '';
    const basis = String(update.evidenceBasis || '').trim().toLocaleLowerCase();
    if (!basis) return 'missing-profile-evidence-basis';
    if (!PROFILE_EVIDENCE_BASES.has(basis)) return 'invalid-profile-evidence-basis';
    const current = Array.isArray(npc?.[update.field]) ? npc[update.field] : [];
    if (basis === 'development' && !current.length) return 'development-without-established-characteristic';
    return '';
}

'''
s = replace_once(s, 'function normalizedUpdate(raw) {', basis_fn + 'function normalizedUpdate(raw) {', 'add recurring profile basis validation')
# Remove obsolete new-role persistence fallback and its invocation.
s = regex_once(s, r'function restoreNewNpcModelLedRole\(state, originalResult, options = \{\}, diagnostics = \[\]\) \{.*?\n\}\n\n(?=function identityValue)', '', 'remove model-led role fallback')
s = s.replace('    restoreNewNpcModelLedRole(state, resultInput, options, diagnostics);\n', '')
# Remove special _modelLedRole preparation. Role may remain as an identity/admission hint in
# the core copy but is not an ordinary mutation authority.
s = s.replace("            if (semanticFields.has('role')) delete patch._modelLedRole;\n            if (String(admissionMode) === 'named_preferred' && String(patch.identityKind || '').trim().toLocaleLowerCase() === 'named' && !semanticFields.has('role')) {\n                patch._modelLedRole = patch.role;\n                patch.role = '';\n            }\n", '')
# Ignore direct fields explicitly rejected by the compatibility boundary when auditing coverage.
s = replace_once(s, '''function proposedFieldsForPatch(patch = {}) {
    const fields = [];
    const add = value => {
        const field = String(value || '').trim();
        if (FIELD_SET.has(field) && !fields.includes(field) && fields.length < 32) fields.push(field);
    };
    for (const field of DOSSIER_SEMANTIC_FIELDS) if (directFieldProposed(patch, field)) add(field);
''', '''function proposedFieldsForPatch(patch = {}) {
    const fields = [];
    const rejectedDirect = new Set((Array.isArray(patch?._rejectedDirectOrdinaryFields) ? patch._rejectedDirectOrdinaryFields : [])
        .map(value => String(value || '').trim()).filter(field => FIELD_SET.has(field)));
    const add = value => {
        const field = String(value || '').trim();
        if (FIELD_SET.has(field) && !fields.includes(field) && fields.length < 32) fields.push(field);
    };
    for (const field of DOSSIER_SEMANTIC_FIELDS) if (!rejectedDirect.has(field) && directFieldProposed(patch, field)) add(field);
''', 'coverage ignores rejected direct new fields')
# Enforce evidenceBasis structurally before applying recurring profile mutations.
needle = '''            const provenance = sourceValidation(update, options);
            if (!provenance.ok) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'invalid-source-reference', reason: provenance.reason });
                continue;
            }
'''
replacement = '''            const profileBasisIssue = recurringProfileEvidenceBasisIssue(npc, update);
            if (profileBasisIssue) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'rejected-proposal', reason: profileBasisIssue });
                continue;
            }
            const provenance = sourceValidation(update, options);
            if (!provenance.ok) {
                diagnostics.push({ npcId: npc.id, field: update.field, operation: update.operation, group: dossierFieldGroup(update.field), status: 'invalid-source-reference', reason: provenance.reason });
                continue;
            }
'''
s = replace_once(s, needle, replacement, 'enforce recurring profile basis')
write(p, s)

p = 'src/model/legacy-semantic-adapter.js'
s = read(p)
s = s.replace("import { DOSSIER_LIVE_FIELDS, dossierFieldDefinition, dossierFieldGroup, dossierFieldValueIssue } from './dossier-fields.js';", "import { DOSSIER_LIVE_FIELDS, DOSSIER_SEMANTIC_FIELDS, dossierFieldDefinition, dossierFieldGroup, dossierFieldValueIssue } from './dossier-fields.js';")
old = '''        const existing = existingNpc(state, patch);
        const identityKind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
        if (!existing && admissionMode === 'named_preferred' && ['named', 'proper-name', 'proper'].includes(identityKind)) {
            // Preserve the raw proposal until the canonical registry validator sees it.
            // Compacting here would turn an object into '[object Object]' before validation.
            patch._modelLedRole = structuredClone(patch.role);
            patch.role = '';
        }
        if (!existing) continue;

        const updates = Array.isArray(patch.semanticUpdates) ? structuredClone(patch.semanticUpdates) : [];
'''
new = '''        const existing = existingNpc(state, patch);
        if (!existing) {
            const updates = Array.isArray(patch.semanticUpdates) ? structuredClone(patch.semanticUpdates) : [];
            const rejectedDirect = [];
            const identityContext = { name: patch?.name, aliases: Array.isArray(patch?.aliases) ? patch.aliases : [] };
            for (const field of DOSSIER_SEMANTIC_FIELDS) {
                if (!Object.prototype.hasOwnProperty.call(patch || {}, field) || hasUpdate(updates, field)) continue;
                const issue = dossierFieldValueIssue(field, patch[field]);
                const definition = dossierFieldDefinition(field);
                let converted = false;
                if (!issue && definition?.kind === 'scalar') {
                    const value = patch[field];
                    const fieldSources = directFieldSource(identityContext, field, value, options);
                    if (fieldSources.length) {
                        updates.push({
                            field, operation: 'establish', value: structuredClone(value),
                            durability: definition.durability === 'durable' ? 'durable' : 'temporary',
                            sources: fieldSources,
                            explanation: 'Boundary-normalized exact direct NEW value.',
                        });
                        converted = true;
                    }
                }
                if (!converted) {
                    rejectedDirect.push(field);
                    compatibilityDiagnostic(options, {
                        npcId: '', field, operation: 'establish', group: dossierFieldGroup(field),
                        status: 'unsupported-direct-proposal',
                        reason: issue ? 'invalid-value-type:' + issue : (definition?.kind === 'scalar' ? 'missing-field-specific-evidence' : 'new-flat-field-requires-semantic-update'),
                    });
                }
                // role remains available only as an identity/admission hint in the prepared
                // core copy; applyIdentityPatch never persists it as ordinary state.
                if (field !== 'role') delete patch[field];
            }
            if (rejectedDirect.length) patch._rejectedDirectOrdinaryFields = rejectedDirect;
            if (updates.length) patch.semanticUpdates = updates;
            continue;
        }

        const updates = Array.isArray(patch.semanticUpdates) ? structuredClone(patch.semanticUpdates) : [];
'''
s = replace_once(s, old, new, 'new flat semantic compatibility boundary')
write(p, s)

# Prompt/contract: one ordinary semantic channel for new and existing; concise profile basis.
p = 'src/scan-helpers.js'
s = read(p)
s = replace_once(s, "    if (includeNew) modes.push('NEW: capture supported facts only; unknown is valid');", "    if (includeNew) modes.push('NEW: identity/admission stays flat; ordinary dossier facts use semanticUpdates after admission; unknown is valid');", 'new prompt semantic path')
s = replace_once(s, "        'BEHAVIOR PROFILE EVIDENCE: personality may be established narrowly from multiple reinforcing choices/reactions. behaviorProfile needs explicit recurrence/generalization or multiple reinforcing actions. Multiple related instances may consolidate into one narrow mannerism; one isolated gesture, mood, pose, line, or object action must not be rewritten as a habitual behavior and stays observation evidence.',", "        'BEHAVIOR / MANNERISM EVIDENCE: personality may be established narrowly from multiple reinforcing choices/reactions. Durable behaviorProfile/mannerisms proposals use evidenceBasis=explicit-recurrence|reinforcing-instances|development with exact owned sources. This basis is the model semantic judgment, not deterministic proof. One isolated gesture/action remains profileObservations unless the narrative itself establishes recurrence.',", 'profile prompt rule')
write(p, s)

p = 'src/scan-contract.js'
s = read(p)
s = replace_once(s, "const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground THIS NPC->PLAYER interaction. Player binding is POV-independent: first-person USER, second-person ASSISTANT narration, explicit PLAYER name, or accepted exchangeActive identity/activity evidence. One excerpt may bind directly; a small coherent set may use connected accepted identity/activity evidence from the same permitted source and need not repeat an already accepted narrator quote; quoted you alone is insufficient; another addressee conflicts. zero numeric movement is allowed; explanation interprets the evidence.';", "const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground THIS NPC->PLAYER interaction. Player binding is POV-independent: first-person USER, second-person ASSISTANT narration, explicit PLAYER name, or accepted same-operation exchangeActive identity/activity evidence. A connected exact-source set need not repeat an NPC name/player pronoun already supplied by that accepted binding, but unrelated same-message text does not inherit it; competing actors/addressees remain ambiguous. quoted you alone is insufficient. zero numeric movement is allowed; explanation interprets but never substitutes for source evidence.';", 'current dynamic prompt rule')
s = replace_once(s, "        compact ? 'NEW ordinary fields are flat; []=string arrays; appearanceForms:[{name,appearance}].' : 'NEW: flat strings; map [] means string arrays; appearanceForms:[{name,appearance}].',", "        compact ? 'NEW identity/admission stays flat; ordinary dossier facts use semanticUpdates after admission. Collections use string arrays; appearanceForms use {name,appearance}.' : 'NEW identity/admission stays flat. Ordinary dossier facts use semanticUpdates after accepted admission; collections are string arrays and appearanceForms use {name,appearance}.',", 'scan output new field authority')
# Replace Nia flat ordinary example with a compact semantic example.
old = '''        const nia = {
            id: '', name: 'Nia', identityKind: 'named', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
            identityEvidence: { anchor: 'Nia', ...evidence }, activityEvidence: { exchangeActive: evidence, inChat: evidence },
            role: 'Harbor clerk', background: 'Clerk of the South Quay Registry.', apparentAge: '~20-29', appearance: 'Blue coat.',
            personality: 'Practical and methodical in registry work.', behaviorProfile: ['Guides applicants through forms and checks their entries.'],
            speech: 'Brief practical instructions.', status: 'Processing Ari’s registry form.',
            relationshipChange: zero(), relationshipSummary: 'Professional clerk-applicant interaction.', relationshipSummaryEvidence: evidence,
        };
        const proposed = new Set(Object.keys(nia));
'''
new = '''        const nia = {
            id: '', name: 'Nia', identityKind: 'named', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
            identityEvidence: { anchor: 'Nia', ...evidence }, activityEvidence: { exchangeActive: evidence, inChat: evidence },
            semanticUpdates: [
                { field: 'role', operation: 'establish', value: 'Harbor clerk', durability: 'durable', sources: [{ messageId: null, excerpt }], explanation: 'The current exchange establishes Nia as the registry clerk.' },
                { field: 'behaviorProfile', operation: 'establish', value: ['Guides applicants through forms and checks their entries.'], durability: 'durable', evidenceBasis: 'reinforcing-instances', sources: [{ messageId: null, excerpt }], explanation: 'Several connected intake actions support one narrow work pattern.' },
                { field: 'status', operation: 'establish', value: 'Processing Ari’s registry form.', durability: 'temporary', sources: [{ messageId: null, excerpt }], explanation: 'Current activity.' },
            ],
            relationshipChange: zero(), relationshipSummary: 'Professional clerk-applicant interaction.', relationshipSummaryEvidence: evidence,
        };
        const proposed = new Set(nia.semanticUpdates.map(update => update.field));
'''
s = replace_once(s, old, new, 'scan contract Nia semantic example')
write(p, s)

# v0.5.33 regression fixture used NEW flat fields. Move its intended facts to the canonical
# semantic channel so it continues testing follow-up behavior rather than old bootstrap syntax.
p = 'tests/v0533-optional-first-contact-recheck.test.mjs'
s = read(p)
old = '''      role: 'Guild intake clerk', personality: 'Brisk and efficient during guild intake.', location: 'Adventurer Guild Post', status: 'Handling the station intake backlog.',
      ...(includeGoal ? { goal: 'Close the intake ledger by dusk.' } : {}),
'''
new = '''      semanticUpdates: [
        { field: 'role', operation: 'establish', value: 'Guild intake clerk', durability: 'durable', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current visible intake work establishes the role.' },
        { field: 'personality', operation: 'establish', value: 'Brisk and efficient during guild intake.', durability: 'durable', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Multiple connected intake actions support a narrow first-scene characterization.' },
        { field: 'location', operation: 'establish', value: 'Adventurer Guild Post', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current scene location.' },
        { field: 'status', operation: 'establish', value: 'Handling the station intake backlog.', durability: 'temporary', sources: [{ messageId: 1, excerpt: visible }], explanation: 'Current intake activity.' },
        ...(includeGoal ? [{ field: 'goal', operation: 'establish', value: 'Close the intake ledger by dusk.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }], explanation: 'Private current goal.' }] : []),
      ],
'''
s = replace_once(s, old, new, 'modernize v0533 fixture')
write(p, s)

# Focused v0.5.34 behavioral regressions.
test_file = r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { withHost } from './helpers/host-harness.mjs';
import { analyzeStructuredEvidence, buildExchangeEvidencePolicy } from '../src/evidence-adapter.js';
import { applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const zeroChange = reason => ({ evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason });

const opening = '"Right hand, take the pen. Third line from the bottom. Don\'t let the nib drip on the sheepskin."';
const tokenLine = '"The provisional token grants access to the supply shed, the water butt out back, space in the common straw for eight Gold a week."';
const identityLine = 'Linnea Rost did not look up from her ledger. A woman with dark hair fastened tightly behind her ears by a bone bodkin wore a grey woolen vest and rolled linen sleeves.';
const playerAction = 'She took the quill from your fingers, inspected the wet line, and pressed a heavy soapstone seal into the completed registration.';
const tapLine = 'Linnea tapped a blunt fingernail against the coarse woodblock print of the boar on the parchment.';
const visible = [opening, identityLine, tokenLine, playerAction, tapLine].join('\n\n');
const structured = `<Blocks><World_State>NPCs Present:\nLinnea Rost:\n* Outfit: Coarse grey woolen vest over bleached linen sleeves\n* Position: Behind the reception counter\n* Mood: Impatient\n</World_State><Inventory>G1 Provisional Adventurer Token | 1 | Rimecross Guild branch</Inventory></Blocks>`;
const assistantText = `${visible}\n\n${structured}`;
const userText = 'I enter the Rimecross guild and let the clerk process my registration.';

function linneaPayload({ summaryExcerpts = [opening, tokenLine], extra = {}, semanticUpdates = [] } = {}) {
    return {
        exchangeActiveNpcIds: ['Linnea Rost'], inChatNpcIds: ['Linnea Rost'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Linnea Rost', identityKind: 'named', evaluatedGroups: ['canon','profile','live','memory','npcRelationships'],
            identityEvidence: { anchor: 'Linnea Rost', excerpts: [identityLine], explanation: 'The named clerk is the current receptionist.' },
            activityEvidence: {
                exchangeActive: { excerpts: [opening, tapLine], explanation: 'Linnea processes Lucien at the counter.' },
                inChat: { excerpts: [tapLine], explanation: 'Linnea remains at the counter.' },
            },
            semanticUpdates,
            relationshipChange: zeroChange('Routine transactional intake and contract briefing with no personal emotional shift.'),
            relationshipSummary: 'Strictly transactional frontier clerk processing Lucien\'s intake and offering him an urgent local hunting bounty.',
            relationshipSummaryEvidence: { excerpts: summaryExcerpts, explanation: 'Linnea treats Lucien with routine frontier efficiency without personal investment.' },
            fieldEvaluations: { unchanged: [], insufficient: ['species','age','birthday','appearanceForms','currentForm','keyRelationships'], unavailable: [] },
            ...extra,
        }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}

function semanticOptions(user = userText, assistant = assistantText, extra = {}) {
    const exchange = { user: { mes: user }, assistant: { mes: assistant } };
    const policy = buildExchangeEvidencePolicy(exchange);
    const userView = analyzeStructuredEvidence(user);
    const assistantView = analyzeStructuredEvidence(assistant);
    return {
        sourceMessageId: 1, turn: 1, playerName: 'Lucien Noctis', evidencePolicy: policy,
        currentAdmissionText: policy.visibleText, profileContext: policy.visibleText,
        semanticEvidenceContext: policy.visibleText, semanticWorldContext: policy.worldStateText, semanticPrivateContext: policy.innerChatterText,
        semanticSourceContextsByMessageId: {
            0: { semanticEvidenceContext: userView.visibleText, semanticWorldContext: userView.worldStateText, semanticPrivateContext: userView.innerChatterText },
            1: { semanticEvidenceContext: assistantView.visibleText, semanticWorldContext: assistantView.worldStateText, semanticPrivateContext: assistantView.innerChatterText },
        },
        relationshipContext: policy.relationshipSources.map(row => row.text).join('\n'),
        sourceEventKey: 'evt:linnea:1', sourceEventKeys: { 0: 'evt:user:0', 1: 'evt:linnea:1' },
        applyReturnedNpcPatches: true,
        ...extra,
    };
}

test('Linnea original zero-delta Current Dynamic persists through the real engine path', () => withHost(async h => {
    h.context.name1 = 'Lucien Noctis';
    h.context.chat = [
        { is_user: true, name: 'Lucien Noctis', mes: userText },
        { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistantText },
    ];
    const registrationExcerpt = 'pressed a heavy soapstone seal into the completed registration';
    const payload = linneaPayload({ semanticUpdates: [
        { field: 'role', operation: 'establish', value: 'Frontier guild clerk', durability: 'durable', sources: [{ messageId: 1, excerpt: identityLine }], explanation: 'Visible narration establishes her current work.' },
        { field: 'memories', operation: 'establish', value: ['Processed Lucien Noctis\'s guild registration at Rimecross.'], durability: 'durable', sources: [{ messageId: 1, excerpt: registrationExcerpt }], explanation: 'The completed registration establishes lasting guild access.' },
    ] });
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(payload); };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 1);
    const npc = h.persisted().npcs.find(row => row.name === 'Linnea Rost');
    assert.ok(npc);
    assert.equal(npc.relationshipSummary, 'Strictly transactional frontier clerk processing Lucien\'s intake and offering him an urgent local hunting bounty.');
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.ok(npc.memories.some(row => /registration/i.test(row)));
}, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'off' } }));

test('descriptive Current Dynamic participant binding accepts direct POV and delayed-name cases', async t => {
    const cases = [
        { name: 'first-person user', user: 'I tell Linnea Rost I accept the registration terms.', assistant: `${identityLine}\n${tapLine}`, excerpts: ['I tell Linnea Rost I accept the registration terms.'] },
        { name: 'second-person assistant', user: userText, assistant: `${identityLine}\nLinnea Rost hands you the stamped token.\n${tapLine}`, excerpts: ['Linnea Rost hands you the stamped token.'] },
        { name: 'delayed-name dialogue', user: userText, assistant: `${opening}\nThe clerk takes the form from your hand.\nOnly then does the clerk introduce herself: Linnea Rost.\n${tapLine}`, excerpts: [opening], identity: 'Only then does the clerk introduce herself: Linnea Rost.' },
    ];
    for (const item of cases) await t.test(item.name, () => {
        const idLine = item.identity || identityLine;
        const actLine = item.name === 'delayed-name dialogue' ? opening : (item.excerpts[0]);
        const payload = linneaPayload({ summaryExcerpts: item.excerpts, extra: {
            identityEvidence: { anchor: 'Linnea Rost', excerpts: [idLine], explanation: 'Current visible identity.' },
            activityEvidence: { exchangeActive: { excerpts: [actLine], explanation: 'Current interaction.' }, inChat: { excerpts: [actLine], explanation: 'Current scene.' } },
        } });
        const applied = applyScanResult(createEmptyState('chat:binding'), payload, semanticOptions(item.user, item.assistant));
        const npc = applied.state.npcs.find(row => row.name === 'Linnea Rost');
        assert.ok(npc?.relationshipSummary);
    });
});

test('descriptive Current Dynamic binding rejects wrong, ambiguous, old, and unrelated evidence', async t => {
    const base = createEmptyState('chat:reject');
    base.npcs.push(normalizeNpc({ id: 'npc-bran', name: 'Bran', present: true }));
    const cases = [
        { name: 'another addressee', assistant: `${identityLine}\n${opening}\nLinnea says, "Bran, take the red permit."\n${tapLine}`, excerpt: '"Bran, take the red permit."' },
        { name: 'unrelated same-message text', assistant: `${visible}\nThe stove clicked as it cooled.`, excerpt: 'The stove clicked as it cooled.' },
        { name: 'old-source quote', assistant: visible, excerpt: 'Yesterday Linnea promised a private favor.' },
    ];
    for (const item of cases) await t.test(item.name, () => {
        const payload = linneaPayload({ summaryExcerpts: [item.excerpt] });
        const applied = applyScanResult(structuredClone(base), payload, semanticOptions(userText, item.assistant));
        const npc = applied.state.npcs.find(row => row.name === 'Linnea Rost');
        assert.equal(npc?.relationshipSummary || '', '');
        assert.ok(applied.semanticDiagnostics.some(row => row.field === 'relationshipSummary' && row.status === 'rejected-proposal'));
    });

    await t.test('another active NPC dialogue is not borrowed through the same message', () => {
        const branLine = 'Bran says, "Take the blue permit."';
        const assistant = `${identityLine}\n${opening}\n${tapLine}\n${branLine}`;
        const payload = linneaPayload({ summaryExcerpts: ['"Take the blue permit."'] });
        payload.exchangeActiveNpcIds.push('Bran');
        payload.inChatNpcIds.push('Bran');
        payload.npcs.push({ id: 'npc-bran', name: 'Bran', activityEvidence: { exchangeActive: { excerpts: [branLine], explanation: 'Bran speaks.' }, inChat: { excerpts: [branLine], explanation: 'Bran remains.' } }, relationshipChange: zeroChange('No shift.'), relationshipSummary: '' });
        const applied = applyScanResult(structuredClone(base), payload, semanticOptions(userText, assistant));
        const linnea = applied.state.npcs.find(row => row.name === 'Linnea Rost');
        assert.equal(linnea?.relationshipSummary || '', '');
    });
});

test('numeric relationship safeguards remain independent from descriptive summary binding', () => {
    const state = createEmptyState('chat:numeric');
    const payload = linneaPayload();
    payload.npcs[0].relationshipChange = { evaluated: true, impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, axisEvidence: {}, reason: 'Unsupported movement.' };
    const applied = applyScanResult(state, payload, semanticOptions());
    const npc = applied.state.npcs.find(row => row.name === 'Linnea Rost');
    assert.equal(npc.relationship.trust, 0);
    assert.ok(npc.relationshipSummary);
});

test('isolated mannerism remains observation-only, retries dedupe, and no basis cannot mutate the dossier', () => {
    const state = createEmptyState('chat:obs');
    state.npcs.push(normalizeNpc({ id: 'npc-linnea', name: 'Linnea Rost', present: true }));
    const payload = {
        exchangeActiveNpcIds: ['npc-linnea'], inChatNpcIds: ['npc-linnea'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-linnea', name: 'Linnea Rost', evaluatedGroups: ['profile'], activityEvidence: { exchangeActive: { excerpts: [tapLine], explanation: 'One observed tap.' }, inChat: { excerpts: [tapLine], explanation: 'Current scene.' } },
            semanticUpdates: [{ field: 'mannerisms', operation: 'establish', value: ['Taps a blunt fingernail against contract broadsheets while explaining bounty terms.'], durability: 'durable', sources: [{ messageId: 1, excerpt: tapLine }], explanation: 'Attempted habit promotion.' }],
            profileObservations: [{ field: 'mannerisms', observation: 'Tapped a blunt fingernail against a contract while explaining this bounty.', concept: 'Finger tap on contract', sources: [{ messageId: 1, excerpt: tapLine }] }],
            relationshipChange: zeroChange('No shift.'), relationshipSummary: '' }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: { 'npc-linnea': 'evaluated' },
    };
    const first = applyScanResult(state, payload, semanticOptions(userText, visible));
    const npc = first.state.npcs[0];
    assert.deepEqual(npc.mannerisms, []);
    assert.equal(npc.profileEvolutionEvidence.filter(row => row.kind === 'observation' && row.field === 'mannerisms').length, 1);
    assert.ok(first.semanticDiagnostics.some(row => row.field === 'mannerisms' && row.reason === 'missing-profile-evidence-basis'));
    const retry = applyScanResult(first.state, payload, semanticOptions(userText, visible));
    assert.equal(retry.state.npcs[0].profileEvolutionEvidence.filter(row => row.kind === 'observation' && row.field === 'mannerisms').length, 1);
});

test('explicit recurrence, reinforcing first-scene instances, and later development remain structurally eligible', async t => {
    await t.test('explicit recurrence', () => {
        const line = 'Whenever Linnea explains bounty terms, she taps one blunt fingernail against the contract sheet.';
        const state = createEmptyState('chat:recurrence'); state.npcs.push(normalizeNpc({ id: 'npc-l', name: 'Linnea Rost', present: true }));
        const payload = { exchangeActiveNpcIds:['npc-l'], inChatNpcIds:['npc-l'], worldActiveNpcIds:[], npcs:[{ id:'npc-l', name:'Linnea Rost', activityEvidence:{ exchangeActive:{excerpts:[line],explanation:'Current interaction.'}, inChat:{excerpts:[line],explanation:'Current scene.'}}, semanticUpdates:[{field:'mannerisms',operation:'establish',value:['Taps a fingernail against contract sheets while explaining bounties.'],durability:'durable',evidenceBasis:'explicit-recurrence',sources:[{messageId:1,excerpt:line}]}], relationshipChange:zeroChange('No shift.'),relationshipSummary:''}], socialEdges:[],familyFacts:[],lifeStateUpdates:[],candidateAccounting:{'npc-l':'evaluated'} };
        const applied = applyScanResult(state,payload,semanticOptions(userText,line));
        assert.equal(applied.state.npcs[0].mannerisms.length,1);
    });
    await t.test('reinforcing instances', () => {
        const line = 'Linnea squares the first form before filing it. Later she squares the second form before filing that one too.';
        const state = createEmptyState('chat:reinforce'); state.npcs.push(normalizeNpc({ id:'npc-l',name:'Linnea Rost',present:true }));
        const payload = { exchangeActiveNpcIds:['npc-l'],inChatNpcIds:['npc-l'],worldActiveNpcIds:[],npcs:[{id:'npc-l',name:'Linnea Rost',activityEvidence:{exchangeActive:{excerpts:[line],explanation:'Several form actions.'},inChat:{excerpts:[line],explanation:'Current scene.'}},semanticUpdates:[{field:'behaviorProfile',operation:'establish',value:['Squares completed forms before filing them.'],durability:'durable',evidenceBasis:'reinforcing-instances',sources:[{messageId:1,excerpt:line}]}],relationshipChange:zeroChange('No shift.'),relationshipSummary:''}],socialEdges:[],familyFacts:[],lifeStateUpdates:[],candidateAccounting:{'npc-l':'evaluated'} };
        const applied=applyScanResult(state,payload,semanticOptions(userText,line));
        assert.equal(applied.state.npcs[0].behaviorProfile.length,1);
    });
    await t.test('development', () => {
        const line = 'Months later, Linnea now squares every completed form and aligns it with the ledger before filing.';
        const state=createEmptyState('chat:development'); state.npcs.push(normalizeNpc({id:'npc-l',name:'Linnea Rost',present:true,mannerisms:['Squares completed forms before filing.']}));
        const payload={exchangeActiveNpcIds:['npc-l'],inChatNpcIds:['npc-l'],worldActiveNpcIds:[],npcs:[{id:'npc-l',name:'Linnea Rost',activityEvidence:{exchangeActive:{excerpts:[line],explanation:'Current established behavior.'},inChat:{excerpts:[line],explanation:'Current scene.'}},semanticUpdates:[{field:'mannerisms',operation:'refine',changes:[{action:'replace',expected:'Squares completed forms before filing.',value:'Squares and aligns completed forms with the ledger before filing.'}],durability:'durable',evidenceBasis:'development',sources:[{messageId:1,excerpt:line}]}],relationshipChange:zeroChange('No shift.'),relationshipSummary:''}],socialEdges:[],familyFacts:[],lifeStateUpdates:[],candidateAccounting:{'npc-l':'evaluated'}};
        const applied=applyScanResult(state,payload,semanticOptions(userText,line));
        assert.deepEqual(applied.state.npcs[0].mannerisms,['Squares and aligns completed forms with the ledger before filing.']);
    });
});

test('new and existing dossiers share structured-source authority while supported registration memory survives', () => {
    const worldAppearance = 'Outfit: Coarse grey woolen vest over bleached linen sleeves';
    const inventoryG1 = 'G1 Provisional Adventurer Token | 1 | Rimecross Guild branch';
    const registrationExcerpt = 'pressed a heavy soapstone seal into the completed registration';
    const unsafeAppearance = 'Dark hair fastened behind her ears, wearing a grey woolen vest over bleached linen sleeves.';
    const newPayload = linneaPayload({ extra: { appearance: unsafeAppearance }, semanticUpdates: [
        { field:'appearance',operation:'establish',value:unsafeAppearance,durability:'durable',sources:[{messageId:1,excerpt:worldAppearance}] },
        { field:'memories',operation:'establish',value:['Processed Lucien Noctis\'s guild registration at Rimecross.'],durability:'durable',sources:[{messageId:1,excerpt:registrationExcerpt}] },
        { field:'memories',operation:'refine',changes:[{action:'add',value:'Registered Lucien specifically as G1 at Rimecross.'}],durability:'durable',sources:[{messageId:1,excerpt:inventoryG1}] },
    ] });
    const created = applyScanResult(createEmptyState('chat:parity-new'), newPayload, semanticOptions());
    const newNpc = created.state.npcs.find(row => row.name === 'Linnea Rost');
    assert.equal(newNpc.appearance, '');
    assert.ok(newNpc.memories.some(row => /registration/i.test(row)));
    assert.equal(newNpc.memories.some(row => /specifically as G1/i.test(row)), false);
    assert.ok(created.semanticDiagnostics.some(row => row.field === 'appearance' && ['unsupported-direct-proposal','invalid-source-reference'].includes(row.status)));

    const existingState=createEmptyState('chat:parity-existing'); existingState.npcs.push(normalizeNpc({id:'npc-l',name:'Linnea Rost',present:true}));
    const existingPayload={exchangeActiveNpcIds:['npc-l'],inChatNpcIds:['npc-l'],worldActiveNpcIds:[],npcs:[{id:'npc-l',name:'Linnea Rost',activityEvidence:{exchangeActive:{excerpts:[tapLine],explanation:'Current interaction.'},inChat:{excerpts:[tapLine],explanation:'Current scene.'}},semanticUpdates:[{field:'appearance',operation:'establish',value:unsafeAppearance,durability:'durable',sources:[{messageId:1,excerpt:worldAppearance}]}],relationshipChange:zeroChange('No shift.'),relationshipSummary:''}],socialEdges:[],familyFacts:[],lifeStateUpdates:[],candidateAccounting:{'npc-l':'evaluated'}};
    const existing=applyScanResult(existingState,existingPayload,semanticOptions());
    assert.equal(existing.state.npcs[0].appearance,'');
});
'''
write('tests/v0534-grounding-source-parity.test.mjs', test_file)

# Version/docs.
p = 'manifest.json'; s = read(p); s = replace_once(s, '"version": "0.5.33"', '"version": "0.5.34"', 'manifest version'); write(p, s)
p = 'src/schema.js'; s = read(p); s = replace_once(s, "export const NPC_STATE_VERSION = '0.5.33';", "export const NPC_STATE_VERSION = '0.5.34';", 'schema version'); write(p, s)
p = 'DEVELOPMENT.md'; s = read(p); s = s.replace('Extension release: `0.5.33`', 'Extension release: `0.5.34`', 1).replace('Model semantic update contract: `6`', 'Model semantic update contract: `7`', 1); write(p, s)
p = 'README.md'; s = read(p); s = s.replace('## Release 0.5.33', '## Release 0.5.34', 1).replace('Release label: **0.5.33**', 'Release label: **0.5.34**', 1).replace('Model semantic contract: **6**', 'Model semantic contract: **7**', 1); s = s.replace('0.5.33 makes first-contact follow-up explicit instead of unconditional.', '0.5.34 tightens first-contact grounding without adding provider calls. Current Dynamic may reuse safely connected accepted identity/activity bindings, recurring behavior/mannerism mutations carry an evidence basis while one-off evidence stays observational, and NEW ordinary dossier facts now pass through the same semantic source-authority path as existing NPC updates. v0.5.33 first-contact follow-up remains explicit instead of unconditional.', 1); write(p, s)
p = 'CHANGELOG.md'; s = read(p); insertion = '''## 0.5.34\n\n- Fix descriptive Current Dynamic target binding so exact summary quotations can reuse the same-operation accepted identity/exchange-active participant binding without restating names or player pronouns; competing active actors, other addressees, unrelated passages, and stale/out-of-scope sources still fail closed. Numeric relationship evidence is unchanged.\n- Require an explicit model `evidenceBasis` for durable `behaviorProfile`/`mannerisms` mutations while retaining isolated/uncertain evidence in the existing bounded observation store. The basis records the model's semantic recurrence/development judgment; deterministic code validates structure, source ownership, locks, and replay dedupe rather than guessing habits with keywords or quote counts.\n- Route accepted NEW ordinary dossier facts through the canonical semantic update/source-authority validator. Conservative compatibility lifting only accepts an exact direct scalar from a field-permitted source; unsafe flat collection/form bootstrap and mixed structured-only details are rejected diagnostically. Intentional generated birthday metadata remains separate.\n- Preserve v0.5.33 optional follow-up modes, Off default, shared two-request automatic budget, scoped coverage/diagnostics, manual missing-details recheck, and stale edit/swipe/chat commit guards. Persisted schema remains version 1.\n\n'''; s = replace_once(s, '## 0.5.33\n', insertion + '## 0.5.33\n', 'changelog 0.5.34'); write(p, s)
p = 'docs/core-contract.md'; s = read(p)
s = replace_once(s, 'New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced. Existing, including name-only, dossiers retain supplied stable IDs and update through `semanticUpdates`.', 'New-NPC identity/admission fields remain flat, but ordinary dossier facts for both accepted NEW and EXISTING dossiers use the canonical `semanticUpdates` path and field-specific source authority. A bounded compatibility adapter may lift an exact direct NEW scalar only when that literal value is found in a field-permitted source; unsupported direct collections/forms and mixed or ungrounded flat values remain rejected diagnostics rather than a second bootstrap authority. Existing, including name-only, dossiers retain supplied stable IDs and update through `semanticUpdates`.', 'core new source parity')
s = replace_once(s, 'New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced.', 'New-NPC identity/admission fields remain flat; ordinary dossier facts use `semanticUpdates` after admission.', 'core duplicate new bootstrap sentence') if 'New-dossier bootstrap fields are flat and should include every supported current-exchange fact actually evidenced.' in s else s
needle = 'An observation is source-owned evidence only: it may persist without an ordinary field mutation and cannot directly change dossier fields, relationship state, presence, or lifecycle.'
replacement = needle + ' Durable `behaviorProfile`/`mannerisms` mutations carry `evidenceBasis=explicit-recurrence|reinforcing-instances|development` so the output distinguishes tentative observation, establishment of a recurring characteristic, and later development. This metadata is the model\'s semantic judgment, not deterministic proof that recurrence occurred; the validator checks its shape, field source authority, target ownership, locks, and replay/source-event deduplication without keyword or quotation-count heuristics.'
s = replace_once(s, needle, replacement, 'core profile basis')
write(p, s)

print('v0.5.34 patch applied')

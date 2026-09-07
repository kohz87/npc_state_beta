from pathlib import Path
import json
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(path, old, new):
    text = read(path)
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected one exact replacement, found {text.count(old)}')
    write(path, text.replace(old, new, 1))

def regex_once(path, pattern, replacement):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: expected one regex replacement, found {count}')
    write(path, updated)

# ---------------------------------------------------------------------------
# branches.js: one compatibility inspector/migrator, modern + legacy preservation
# ---------------------------------------------------------------------------
branches = read('src/branches.js')
marker = "\nfunction preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {"
if marker not in branches:
    raise SystemExit('branches.js: legacy preservation marker missing')
helper = r'''

function hasLegacyRelationshipOverride(npc = {}) {
    const overrides = npc?.manualOverrides;
    return Boolean(overrides && typeof overrides === 'object' && !Array.isArray(overrides)
        && Object.prototype.hasOwnProperty.call(overrides, 'relationship'));
}

function manualRelationshipEventAxes(item = {}) {
    return RELATIONSHIP_AXES.filter(axis => Number(item?.delta?.[axis]) !== 0);
}

function legacyRelationshipCandidateAxes(npc = {}, ownedAxes = new Set()) {
    const events = (npc?.relationshipHistory || []).filter(item => String(item?.impact || '').toLocaleLowerCase() === 'manual');
    const axes = new Set();
    for (const event of events) {
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    if (!events.length) for (const axis of RELATIONSHIP_AXES) if (!ownedAxes.has(axis)) axes.add(axis);
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyRelationshipResidualAxes(npc = {}, matchedEvent = null, ownedAxes = new Set()) {
    const matchedKey = matchedEvent ? manualRelationshipEventKey(matchedEvent) : '';
    const axes = new Set();
    for (const event of (npc?.relationshipHistory || []).filter(item => String(item?.impact || '').toLocaleLowerCase() === 'manual')) {
        if (matchedKey && manualRelationshipEventKey(event) === matchedKey) continue;
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyCorrectionLimitation(code, axes = []) {
    return { code, axes: RELATIONSHIP_AXES.filter(axis => (axes || []).includes(axis)) };
}

export function migrateSupportedLegacyManualRelationshipCorrections(npcInput) {
    const npc = normalizeNpc(npcInput || {});
    const modern = relationshipCorrectionState(npc);
    const ownedAxes = new Set(modern.corrections.map(item => item.axis));
    if (!hasLegacyRelationshipOverride(npc)) return { npc, migratedAxes: [], limitations: [] };

    const identity = legacyRelationshipOverrideIdentity(npc);
    if (!identity) {
        return {
            npc,
            migratedAxes: [],
            limitations: [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', legacyRelationshipCandidateAxes(npc, ownedAxes))],
        };
    }
    const matched = matchingLegacyManualEvent(npc, identity);
    const matchedAxes = manualRelationshipEventAxes(matched);
    if (!matched || !matchedAxes.length) {
        return {
            npc,
            migratedAxes: [],
            limitations: [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', legacyRelationshipCandidateAxes(npc, ownedAxes))],
        };
    }

    const migratableAxes = matchedAxes.filter(axis => !ownedAxes.has(axis));
    const next = structuredClone(npc);
    const byAxis = new Map(modern.corrections.map(item => [item.axis, structuredClone(item)]));
    let revision = modern.revision;
    if (migratableAxes.length) {
        revision += 1;
        for (const axis of migratableAxes) {
            byAxis.set(axis, {
                id: axis + ':' + revision,
                axis,
                value: identity.relationship[axis],
                revision,
                sourceMessageId: identity.sourceMessageId,
                at: identity.at || Number(matched?.at) || null,
            });
            ownedAxes.add(axis);
        }
        next.manualRelationshipCorrectionRevision = revision;
        next.manualRelationshipCorrections = [...byAxis.values()];
    }

    const residualAxes = legacyRelationshipResidualAxes(npc, matched, ownedAxes);
    const limitations = residualAxes.length
        ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
        : [];
    if (!limitations.length) {
        const overrides = { ...(next.manualOverrides || {}) };
        const meta = { ...(next.manualOverrideMeta || {}) };
        delete overrides.relationship;
        delete meta.relationship;
        next.manualOverrides = overrides;
        next.manualOverrideMeta = meta;
    }
    return { npc: normalizeNpc(next), migratedAxes: migratableAxes, limitations };
}
'''
branches = branches.replace(marker, helper + marker, 1)
write('src/branches.js', branches)

regex_once(
    'src/branches.js',
    r"function preserveLegacyManualRelationshipEvents\(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc\) \{.*?\n\}\n\nfunction preserveUserOwnedState",
    r'''function preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    if (!hasLegacyRelationshipOverride(liveNpc)) return { npc: restoredNpc, limitations: [] };
    const modernAxes = new Set(relationshipCorrectionState(liveNpc).corrections.map(item => item.axis));
    const identity = legacyRelationshipOverrideIdentity(liveNpc);
    if (!identity) {
        return {
            npc: restoredNpc,
            limitations: [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', legacyRelationshipCandidateAxes(liveNpc, modernAxes))],
        };
    }
    // A snapshot with the same legacy identity already contains that correction and any
    // surviving story movement after it. Modern axes are preserved independently below.
    if (sameLegacyRelationshipOverride(restoredOwnershipNpc, liveNpc)) return { npc: restoredNpc, limitations: [] };

    const known = new Set((restoredNpc.relationshipHistory || [])
        .filter(item => item?.impact === 'manual')
        .map(manualRelationshipEventKey));
    const matched = matchingLegacyManualEvent(liveNpc, identity);
    if (!matched || known.has(manualRelationshipEventKey(matched))) {
        return {
            npc: restoredNpc,
            limitations: [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', legacyRelationshipCandidateAxes(liveNpc, modernAxes))],
        };
    }
    const eventAxes = manualRelationshipEventAxes(matched);
    if (!eventAxes.length) {
        return {
            npc: restoredNpc,
            limitations: [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', legacyRelationshipCandidateAxes(liveNpc, modernAxes))],
        };
    }

    const changedAxes = eventAxes.filter(axis => !modernAxes.has(axis));
    const ownedAxes = new Set([...modernAxes, ...changedAxes]);
    let next = changedAxes.length
        ? applyAbsoluteRelationshipAxes(restoredNpc, changedAxes.map(axis => ({ axis, value: identity.relationship[axis] })))
        : structuredClone(restoredNpc);
    if (changedAxes.length) {
        next.relationshipHistory = [...(next.relationshipHistory || []), structuredClone(matched)].slice(-24);
        next.lastRelationshipChange = structuredClone(matched);
    }
    const residualAxes = legacyRelationshipResidualAxes(liveNpc, matched, ownedAxes);
    return {
        npc: normalizeNpc(next),
        limitations: residualAxes.length
            ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
            : [],
    };
}

function preserveUserOwnedState'''
)

replace_once(
    'src/branches.js',
    """        const durable = preserveDurableManualRelationshipCorrections(next, live);\n        const preserved = durable || preserveLegacyManualRelationshipEvents(next, live, restoredOwnershipNpc);\n        next = preserved.npc;\n        for (const limitation of preserved.limitations || []) {\n            manualRelationshipLimitations.push({ npcId: live.id, npcName: live.name, ...limitation });\n        }\n""",
    """        const durable = preserveDurableManualRelationshipCorrections(next, live);\n        if (durable) {\n            next = durable.npc;\n            for (const limitation of durable.limitations || []) {\n                manualRelationshipLimitations.push({ npcId: live.id, npcName: live.name, ...limitation });\n            }\n        }\n        const legacy = preserveLegacyManualRelationshipEvents(next, live, restoredOwnershipNpc);\n        next = legacy.npc;\n        for (const limitation of legacy.limitations || []) {\n            manualRelationshipLimitations.push({ npcId: live.id, npcName: live.name, ...limitation });\n        }\n"""
)

replace_once(
    'src/branches.js',
    """    if (manualRelationshipLimitations.length) {\n        restored.branchHeadLineage = structuredClone(checkpoint.lineage || []);\n        restored.branchSafety = {\n            status: 'rebase-required',\n            kind: 'manual-relationship-correction-uncertain',\n            reason: 'A legacy manual relationship correction predates exact per-axis correction ownership, and the surviving metadata cannot prove every edited axis. NPC State retained the recoverable state without guessing an exact score. Clear/re-enter the correction or explicitly rebuild the timeline before normal scanning resumes.',\n        };\n""",
    """    if (manualRelationshipLimitations.length) {\n        restored.branchHeadLineage = structuredClone(checkpoint.lineage || []);\n        const affected = manualRelationshipLimitations.slice(0, 6).map(item => {\n            const axes = Array.isArray(item.axes) && item.axes.length ? ' (' + item.axes.join(', ') + ')' : '';\n            return String(item.npcName || item.npcId || 'NPC') + axes;\n        }).join('; ');\n        restored.branchSafety = {\n            status: 'rebase-required',\n            kind: 'manual-relationship-correction-uncertain',\n            reason: 'Legacy manual relationship correction ownership is unresolved' + (affected ? ': ' + affected : '') + '. Open each affected dossier to confirm one relationship axis at a time or clear that NPC relationship correction ownership. Normal story updates stay blocked until the remaining correction uncertainty and any surviving-history reconstruction are resolved.',\n        };\n"""
)

# ---------------------------------------------------------------------------
# engine.js: migrate before relationship edits and allow only narrow remediation
# ---------------------------------------------------------------------------
replace_once(
    'src/engine.js',
    "import { chatLineage, bestCheckpoint, ensurePreUpdateBaseline, fingerprintMessage, latestAssistantMessageId, normalizeRebaseRelationshipMode, previewRelationshipRebase, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint, retargetCheckpointOwnership } from './branches.js';",
    "import { chatLineage, bestCheckpoint, ensurePreUpdateBaseline, fingerprintMessage, latestAssistantMessageId, migrateSupportedLegacyManualRelationshipCorrections, normalizeRebaseRelationshipMode, previewRelationshipRebase, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint, retargetCheckpointOwnership } from './branches.js';"
)

replace_once(
    'src/engine.js',
    "async function mutate(label, mutator, { checkpointReason = 'manual' } = {}) {",
    "async function mutate(label, mutator, { checkpointReason = 'manual', allowUnsafeKind = '', checkpoint = true } = {}) {"
)
replace_once(
    'src/engine.js',
    """            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };\n            if (state.branchSafety?.status !== 'safe') return { ok: false, reason: 'branch-unsafe' };\n            const context = getContext();\n""",
    """            if (recoveryBlocksLiveScan(state)) return { ok: false, reason: 'recovery-active', recovery: structuredClone(state.recovery) };\n            const unsafeKind = state.branchSafety?.status !== 'safe' ? String(state.branchSafety?.kind || '') : '';\n            const unsafeRemediation = Boolean(unsafeKind && allowUnsafeKind && unsafeKind === allowUnsafeKind);\n            if (unsafeKind && !unsafeRemediation) return { ok: false, reason: 'branch-unsafe' };\n            const context = getContext();\n"""
)
replace_once(
    'src/engine.js',
    "const result = await mutator(state, chat);",
    "const result = await mutator(state, chat, { unsafeKind: unsafeRemediation ? unsafeKind : '' });"
)
replace_once(
    'src/engine.js',
    "const commit = await commitState({ operationId, token: ownership, state, chat, messageId, checkpointReason, ownershipPolicy: 'user' });",
    "const commit = await commitState({ operationId, token: ownership, state, chat, messageId, checkpointReason, checkpoint: unsafeRemediation ? false : checkpoint, ownershipPolicy: 'user' });"
)

regex_once(
    'src/engine.js',
    r"    async function updateNpc\(reference, patch = \{\}, options = \{\}\) \{.*?\n    \}\n\n    async function fillMissingBirthdays",
    r'''    async function updateNpc(reference, patch = {}, options = {}) {
        return mutate('update', (state, chat, mutationContext = {}) => {
            const matched = findNpcByReference(state, reference);
            const index = matched ? state.npcs.findIndex(npc => npc.id === matched.id) : -1;
            if (index < 0) return false;
            let current = state.npcs[index];
            if (Number.isFinite(Number(options.expectedUpdatedAt)) && Number(current.updatedAt) !== Number(options.expectedUpdatedAt)) return { rejected: 'stale-editor' };
            const remediation = mutationContext.unsafeKind === 'manual-relationship-correction-uncertain';
            const clearRelationshipOnly = options.clearRelationshipCorrectionsOnly === true;
            if (remediation) {
                const allowed = new Set(['relationship', 'manualOverrides']);
                if (!clearRelationshipOnly && Object.keys(patch || {}).some(key => !allowed.has(key))) return { rejected: 'correction-remediation-only' };
                const hasRelationship = patch?.relationship && typeof patch.relationship === 'object' && !Array.isArray(patch.relationship);
                const explicitClear = Object.prototype.hasOwnProperty.call(patch || {}, 'manualOverrides')
                    && patch.manualOverrides && typeof patch.manualOverrides === 'object' && !Array.isArray(patch.manualOverrides)
                    && !Object.prototype.hasOwnProperty.call(patch.manualOverrides, 'relationship');
                if (!clearRelationshipOnly && !hasRelationship && !explicitClear) return { rejected: 'correction-remediation-required' };
            }
            const explicitOverridePatch = Object.prototype.hasOwnProperty.call(patch || {}, 'manualOverrides');
            if (explicitOverridePatch && (!patch.manualOverrides || typeof patch.manualOverrides !== 'object' || Array.isArray(patch.manualOverrides))) {
                return { rejected: 'invalid-manual-overrides' };
            }
            const clearRelationshipCorrections = clearRelationshipOnly
                || (explicitOverridePatch && !Object.prototype.hasOwnProperty.call(patch.manualOverrides, 'relationship'));
            const hasRelationshipPatch = patch?.relationship && typeof patch.relationship === 'object' && !Array.isArray(patch.relationship);
            let migrationLimitations = [];
            if (hasRelationshipPatch && !clearRelationshipCorrections) {
                const migrated = migrateSupportedLegacyManualRelationshipCorrections(current);
                current = migrated.npc;
                migrationLimitations = migrated.limitations || [];
                state.npcs[index] = current;
            }
            const manualBirthdayChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'birthday')
                && normalizeBirthday(patch.birthday) !== normalizeBirthday(current.birthday);
            const manualAt = Date.now();
            const nextRaw = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Math.max(manualAt, Number(current.updatedAt || 0) + 1), manual: true };
            let correctionRevision = Math.max(0, Math.trunc(Number(current.manualRelationshipCorrectionRevision) || 0));
            const correctionByAxis = new Map((current.manualRelationshipCorrections || []).map(item => [item.axis, structuredClone(item)]));
            if (clearRelationshipCorrections) correctionByAxis.clear();
            // The editor historically submits birthdayProvenance:'manual' with every save.
            // Do not turn an unchanged birthday into hidden manual ownership.
            if (!manualBirthdayChanged && patch?.birthdayProvenance === 'manual') nextRaw.birthdayProvenance = current.birthdayProvenance;
            const manualAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'age')
                && normalizeActualAge(patch.age) !== normalizeActualAge(current.age);
            const manualApparentAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'apparentAge')
                && normalizeApparentAge(patch.apparentAge) !== normalizeApparentAge(current.apparentAge);
            if (manualAgeChanged || manualApparentAgeChanged) {
                nextRaw.ageProgressionBaselineAge = normalizeActualAge(manualAgeChanged ? patch.age : current.age);
            }
            if (hasRelationshipPatch) {
                const before = normalizeRelationship(current.relationship);
                const after = normalizeRelationship({ ...before, ...patch.relationship });
                nextRaw.relationship = after;
                const requestedAxes = RELATIONSHIP_AXES.filter(axis => Object.prototype.hasOwnProperty.call(patch.relationship, axis));
                const changedAxes = requestedAxes.filter(axis => before[axis] !== after[axis]);
                const correctionAxes = remediation ? requestedAxes : changedAxes;
                const inferred = normalizeRelationshipMilestones([], after, { inferFromRelationship: true, includeBoundary: true })
                    .filter(entry => changedAxes.includes(entry.axis));
                nextRaw.relationshipMilestones = normalizeRelationshipMilestones(
                    [...(current.relationshipMilestones || []), ...inferred], after, { inferFromRelationship: false });
                const delta = Object.fromEntries(RELATIONSHIP_AXES.map(axis => [axis, after[axis] - before[axis]]));
                nextRaw.relationshipProgress = { ...(current.relationshipProgress || {}) };
                for (const axis of changedAxes) nextRaw.relationshipProgress[axis] = 0;
                if (correctionAxes.length) {
                    correctionRevision += 1;
                    const sourceMessageId = latestAssistantMessageId(chat);
                    for (const axis of correctionAxes) {
                        correctionByAxis.set(axis, {
                            id: axis + ':' + correctionRevision,
                            axis,
                            value: after[axis],
                            revision: correctionRevision,
                            sourceMessageId: sourceMessageId >= 0 ? sourceMessageId : null,
                            at: manualAt,
                        });
                    }
                    if (changedAxes.length) {
                        const event = {
                            impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.',
                            sourceMessageId, turn: Number.isInteger(state.turn) ? state.turn : null, at: manualAt,
                        };
                        const relationshipHistoryLimit = normalizeRelationshipHistoryLimit(getSettings().relationshipHistoryLimit);
                        nextRaw.lastRelationshipChange = event;
                        nextRaw.relationshipHistory = [...(current.relationshipHistory || []), event].slice(-relationshipHistoryLimit);
                    }
                } else if (clearRelationshipCorrections) {
                    correctionRevision += 1;
                }
            } else if (clearRelationshipCorrections) {
                correctionRevision += 1;
            }
            nextRaw.manualRelationshipCorrectionRevision = correctionRevision;
            nextRaw.manualRelationshipCorrections = [...correctionByAxis.values()];
            const hasManualLifeState = Object.prototype.hasOwnProperty.call(patch || {}, 'lifeState');
            const requestedLifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();
            if (hasManualLifeState && !['alive', 'dead', 'unknown'].includes(requestedLifeState)) return { rejected: 'invalid-life-state' };
            const manualLifeStateChanged = hasManualLifeState && requestedLifeState !== String(current.lifeState || '').trim().toLocaleLowerCase();
            const transitionedRaw = manualLifeStateChanged
                ? applyManualLifeStateTransition(nextRaw, requestedLifeState, {
                    certainty: String(patch.lifeStateCertainty || '').trim(),
                    reason: String(patch.lifeStateReason || '').trim(),
                    at: Date.now(),
                })
                : nextRaw;
            let next = normalizeNpc(transitionedRaw);
            if (next.name !== current.name && current.name) next.aliases = [...new Set([...(next.aliases || []), current.name])].slice(0, 10);
            next = normalizeNpc(next);
            const manualOverrides = explicitOverridePatch
                ? structuredClone(next.manualOverrides || {})
                : { ...(current.manualOverrides || {}) };
            const manualOverrideMeta = explicitOverridePatch
                ? {}
                : structuredClone(current.manualOverrideMeta || {});
            if (clearRelationshipOnly) {
                delete manualOverrides.relationship;
                delete manualOverrideMeta.relationship;
            }
            const manualSourceMessageId = latestAssistantMessageId(chat);
            for (const field of MANUAL_OVERRIDE_FIELDS) {
                // Modern relationship corrections are per-axis records. Whole-object relationship
                // overrides remain read-only legacy compatibility and are never created by new edits.
                if (field === 'relationship') continue;
                if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) continue;
                if (manualOwnedValueEqual(current[field], next[field])) continue;
                manualOverrides[field] = structuredClone(next[field]);
                manualOverrideMeta[field] = {
                    at: manualAt,
                    sourceMessageId: manualSourceMessageId >= 0 ? manualSourceMessageId : null,
                };
            }
            next.manualOverrides = manualOverrides;
            next.manualOverrideMeta = manualOverrideMeta;
            next = normalizeNpc(next);
            const nextIdentityKeys = new Set([next.name, ...(next.aliases || [])].map(value => normalizeName(value)).filter(Boolean));
            const collision = state.npcs.some((npc, i) => i !== index && [npc.name, ...(npc.aliases || [])]
                .map(value => normalizeName(value)).filter(Boolean).some(key => nextIdentityKeys.has(key)));
            if (collision) return { rejected: 'identity-collision' };
            state.npcs[index] = next;
            if (Object.prototype.hasOwnProperty.call(patch || {}, 'keyRelationships')) {
                const reconciledGraph = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(chat), dossierLimits: getSettings().dossierLimits });
                state.npcs = reconciledGraph.npcs;
                state.socialGraph = reconciledGraph.socialGraph;
                state.familySlots = reconciledGraph.familySlots;
            }
            if (remediation) {
                const reconciled = reconcileToCurrentBranch(state, chat);
                if (reconciled.unsafeDivergence) return { rejected: 'correction-remediation-boundary-lost' };
                const limitations = reconciled.manualRelationshipLimitations || [];
                let candidate = normalizeState(reconciled.state, state.chatKey);
                if (reconciled.needsRecovery && !limitations.length) {
                    candidate = prepareBranchRecoveryState(candidate, chat, reconciled.recoveryMessageIds, reconciled.checkpoint?.lineage || [], false);
                }
                for (const key of Object.keys(state)) delete state[key];
                Object.assign(state, candidate);
                return {
                    npcId: current.id,
                    remediation: true,
                    migratedLegacyAxes: migrationLimitations.length ? [] : undefined,
                    resolved: state.branchSafety?.status === 'safe',
                    needsRecovery: state.branchSafety?.kind === 'suffix-recovery-required' || Boolean(state.recovery),
                    manualRelationshipLimitations: structuredClone(limitations),
                    branchSafety: structuredClone(state.branchSafety),
                };
            }
            return { npcId: current.id };
        }, { checkpointReason: 'manual-edit', allowUnsafeKind: 'manual-relationship-correction-uncertain' });
    }

    async function clearManualRelationshipCorrection(reference, options = {}) {
        return updateNpc(reference, {}, { ...options, clearRelationshipCorrectionsOnly: true });
    }

    async function fillMissingBirthdays'''
)

replace_once(
    'src/engine.js',
    """        updateNpc,\n        fillMissingBirthdays,\n""",
    """        updateNpc,\n        clearManualRelationshipCorrection,\n        fillMissingBirthdays,\n"""
)

# ---------------------------------------------------------------------------
# UI/API: remediation through the editor, one axis at a time, plus a clear action
# ---------------------------------------------------------------------------
replace_once(
    'src/ui.js',
    "import { NPC_STATE_VERSION, DOSSIER_LIMIT_MAXIMUMS, normalizeNpcAdmissionMode, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeScannerResponseTokens } from './schema.js';",
    "import { NPC_STATE_VERSION, DOSSIER_LIMIT_MAXIMUMS, RELATIONSHIP_AXES, normalizeNpcAdmissionMode, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeScannerResponseTokens } from './schema.js';"
)
insert_after = """export function editorIdentityMatches(activeId, shellId) {\n    const active = String(activeId || '');\n    const shell = String(shellId || '');\n    return Boolean(active && shell && active === shell);\n}\n"""
replacement = insert_after + r'''

export function manualRelationshipRemediationPatch(axis, value) {
    const key = String(axis || '').trim().toLocaleLowerCase();
    if (!RELATIONSHIP_AXES.includes(key)) return null;
    const number = Number(value);
    const normalized = Number.isFinite(number) ? Math.max(-100, Math.min(100, Math.round(number))) : 0;
    return { relationship: { [key]: normalized } };
}
'''
replace_once('src/ui.js', insert_after, replacement)

replace_once(
    'src/ui.js',
    """    function editorHtml(npc) {\n        const rel = npc.relationship || {};\n""",
    """    function editorHtml(npc) {\n        const rel = npc.relationship || {};\n        const correctionRemediation = engine.branchSafetyStatus?.(getChatKey())?.kind === 'manual-relationship-correction-uncertain';\n        const remediationHtml = correctionRemediation\n            ? `<label class=\"npc-state-v3-editor-wide\"><b>Relationship correction remediation</b><select id=\"npc_state_v3_edit_remediation_axis\" class=\"text_pole\">${RELATIONSHIP_AXES.map(axis => `<option value=\"${axis}\">Confirm ${axis}</option>`).join('')}</select><small>Only the selected relationship axis will be asserted as explicit user intent. Other dossier fields and unresolved NPCs remain blocked. Use Clear relationship correction ownership to discard this NPC's uncertain legacy relationship correction ownership.</small></label>`\n            : '';\n"""
)
replace_once(
    'src/ui.js',
    """          ${field('Trust', 'npc_state_v3_edit_trust', rel.trust)}${field('Affection', 'npc_state_v3_edit_affection', rel.affection)}${field('Desire', 'npc_state_v3_edit_desire', rel.desire)}${field('Tension', 'npc_state_v3_edit_tension', rel.tension)}\n          <label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_lock\" type=\"checkbox\" ${npc.manualProfileFields?.length ? 'checked' : ''}> Protect stable profile fields from scanner rewrites</label><label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_retention\" type=\"checkbox\" ${npc.retentionProtected ? 'checked' : ''}> Retention protected</label><label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_minor\" type=\"checkbox\" ${npc.minor ? 'checked' : ''}> Minor NPC</label>\n        </div><footer><button class=\"menu_button npc-state-v3-editor-cancel\">Cancel</button><button class=\"menu_button npc-state-v3-editor-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Save dossier</button></footer></div>`;\n""",
    """          ${field('Trust', 'npc_state_v3_edit_trust', rel.trust)}${field('Affection', 'npc_state_v3_edit_affection', rel.affection)}${field('Desire', 'npc_state_v3_edit_desire', rel.desire)}${field('Tension', 'npc_state_v3_edit_tension', rel.tension)}\n          ${remediationHtml}\n          <label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_lock\" type=\"checkbox\" ${npc.manualProfileFields?.length ? 'checked' : ''}> Protect stable profile fields from scanner rewrites</label><label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_retention\" type=\"checkbox\" ${npc.retentionProtected ? 'checked' : ''}> Retention protected</label><label class=\"npc-state-v3-editor-wide\"><input id=\"npc_state_v3_edit_minor\" type=\"checkbox\" ${npc.minor ? 'checked' : ''}> Minor NPC</label>\n        </div><footer><button class=\"menu_button npc-state-v3-editor-cancel\">Cancel</button>${correctionRemediation ? '<button class=\"menu_button npc-state-v3-editor-clear-relationship-correction\">Clear relationship correction ownership</button>' : ''}<button class=\"menu_button npc-state-v3-editor-save\"><i class=\"fa-solid fa-floppy-disk\"></i> ${correctionRemediation ? 'Confirm selected axis' : 'Save dossier'}</button></footer></div>`;\n"""
)
replace_once(
    'src/ui.js',
    """        overlay.querySelector('.npc-state-v3-editor-save')?.addEventListener('click', saveEditor);\n        document.body.appendChild(overlay);\n""",
    """        overlay.querySelector('.npc-state-v3-editor-save')?.addEventListener('click', saveEditor);\n        overlay.querySelector('.npc-state-v3-editor-clear-relationship-correction')?.addEventListener('click', clearRelationshipCorrectionFromEditor);\n        document.body.appendChild(overlay);\n"""
)

insert_clear = r'''

    async function clearRelationshipCorrectionFromEditor() {
        const overlay = document.getElementById(EDITOR_ID);
        const shell = overlay?.querySelector('.npc-state-v3-editor-shell');
        const id = String(shell?.dataset.npcId || '');
        if (!overlay || !editorIdentityMatches(activeEditorNpcId, id)) return false;
        const npc = dossierNpc(id);
        if (!npc) return false;
        if (!globalThis.confirm?.(`Clear uncertain relationship correction ownership for ${npc.name}? Story-derived relationship state at the verified rollback boundary is kept. This does not approve unrelated timeline history.`)) return false;
        const result = await safely('clear relationship correction ownership', () => engine.clearManualRelationshipCorrection(id, { expectedUpdatedAt: Number(shell.dataset.updatedAt) || 0 }));
        if (!result.ok) {
            notify('warning', `NPC State: relationship correction remediation did not commit (${result.reason || 'unknown'}).`);
            return false;
        }
        selectedNpcId = id;
        closeEditor();
        const safety = result.state?.branchSafety || engine.branchSafetyStatus?.(getChatKey());
        notify(safety?.status === 'safe' ? 'success' : 'info', safety?.status === 'safe'
            ? 'NPC State: uncertain relationship correction ownership cleared and the verified timeline is safe.'
            : 'NPC State: this NPC correction uncertainty was cleared. Remaining correction or history recovery requirements are still blocked.');
        refresh();
        return true;
    }
'''
replace_once(
    'src/ui.js',
    "    function closeEditor() { document.getElementById(EDITOR_ID)?.remove(); activeEditorNpcId = ''; }\n\n    async function saveEditor() {",
    "    function closeEditor() { document.getElementById(EDITOR_ID)?.remove(); activeEditorNpcId = ''; }" + insert_clear + "\n    async function saveEditor() {"
)

save_marker = """        const value = fieldId => overlay.querySelector(`#${fieldId}`)?.value ?? '';\n        const clamp = fieldId => Math.max(-100, Math.min(100, Math.round(Number(value(fieldId)) || 0)));\n        const limits = normalizeDossierLimits(getSettings().dossierLimits);\n"""
save_replacement = save_marker + r'''        const correctionRemediation = engine.branchSafetyStatus?.(getChatKey())?.kind === 'manual-relationship-correction-uncertain';
        if (correctionRemediation) {
            const axis = String(overlay.querySelector('#npc_state_v3_edit_remediation_axis')?.value || 'trust');
            const fieldByAxis = { trust: 'npc_state_v3_edit_trust', affection: 'npc_state_v3_edit_affection', desire: 'npc_state_v3_edit_desire', tension: 'npc_state_v3_edit_tension' };
            const remediationPatch = manualRelationshipRemediationPatch(axis, clamp(fieldByAxis[axis] || fieldByAxis.trust));
            const remediation = await safely('resolve relationship correction', () => engine.updateNpc(id, remediationPatch || {}, { expectedUpdatedAt: Number(shell.dataset.updatedAt) || 0 }));
            if (!remediation.ok) {
                notify('warning', remediation.reason === 'stale-editor'
                    ? 'NPC State: this dossier changed while the editor was open. Reopen it before resolving correction ownership.'
                    : `NPC State: relationship correction remediation did not commit (${remediation.reason || 'unknown'}).`);
                return false;
            }
            selectedNpcId = id;
            closeEditor();
            const safety = remediation.state?.branchSafety || engine.branchSafetyStatus?.(getChatKey());
            notify(safety?.status === 'safe' ? 'success' : 'info', safety?.status === 'safe'
                ? 'NPC State: selected relationship axis confirmed and the verified timeline is safe.'
                : 'NPC State: selected relationship axis confirmed. Other correction or history recovery requirements remain blocked.');
            refresh();
            return true;
        }
'''
replace_once('src/ui.js', save_marker, save_replacement)

replace_once(
    'src/index.js',
    """    updateNpc: (reference, patch) => engine.updateNpc(reference, patch),\n    archive: reference => engine.archiveNpc(reference, true),\n""",
    """    updateNpc: (reference, patch) => engine.updateNpc(reference, patch),\n    clearRelationshipCorrection: reference => engine.clearManualRelationshipCorrection(reference),\n    archive: reference => engine.archiveNpc(reference, true),\n"""
)

replace_once(
    'src/branch-recovery-ui.js',
    """function messageForKind(kind = '') {\n    if (kind === 'prebaseline-truncation') return 'The chat was shortened beyond NPC State\\'s oldest recoverable checkpoint.';\n    if (kind === 'prebaseline-rewrite') return 'The chat was rewritten before NPC State\\'s oldest recoverable checkpoint.';\n    return 'The current chat is outside NPC State\\'s oldest recoverable checkpoint.';\n}\n""",
    """function messageForKind(kind = '') {\n    if (kind === 'prebaseline-truncation') return 'The chat was shortened beyond NPC State\\'s oldest recoverable checkpoint.';\n    if (kind === 'prebaseline-rewrite') return 'The chat was rewritten before NPC State\\'s oldest recoverable checkpoint.';\n    if (kind === 'manual-relationship-correction-uncertain') return 'A legacy manual relationship correction cannot be mapped to exact axes. Open the affected NPC dossier and use Relationship correction remediation to confirm one axis at a time, or explicitly clear that NPC relationship correction ownership. Other edits and normal scanning remain blocked.';\n    return 'The current chat is outside NPC State\\'s oldest recoverable checkpoint.';\n}\n"""
)

# ---------------------------------------------------------------------------
# release/docs
# ---------------------------------------------------------------------------
manifest = json.loads(read('manifest.json'))
manifest['version'] = '0.7.3'
write('manifest.json', json.dumps(manifest, indent=4) + '\n')
replace_once('src/schema.js', "export const NPC_STATE_VERSION = '0.7.2';", "export const NPC_STATE_VERSION = '0.7.3';")
replace_once('DEVELOPMENT.md', '- Extension release: `0.7.2`', '- Extension release: `0.7.3`')
readme = read('README.md').replace('Release 0.7.2', 'Release 0.7.3').replace('## Release 0.7.2', '## Release 0.7.3').replace('- Extension release: `0.7.2`', '- Extension release: `0.7.3`')
readme = readme.replace(
    'Manual relationship edits now keep a compact four-axis correction record with absolute targets and monotonic revisions, separate from bounded visible relationship history and separate from automatic-update locks. A snapshot that already contains a correction keeps its later surviving story movement; a snapshot before it restores only the axes the user explicitly corrected.',
    'Manual relationship edits keep compact per-axis absolute correction records with monotonic revisions, separate from bounded visible relationship history and automatic-update locks. v0.7.3 migrates provable legacy correction axes into that representation before a new relationship edit can overwrite legacy metadata; new edits no longer create whole-relationship override records. Mixed legacy/new ownership is reconciled per axis, while ambiguous residual legacy axes remain blocked instead of being guessed.'
)
write('README.md', readme)

core = read('docs/core-contract.md')
core = core.replace(
    'Manual correction metadata and automatic-update locking are separate concerns. A relationship correction applies only to axes the user actually changed. When rollback selects a snapshot that already contains the same correction revision for an axis, that snapshot\'s later surviving story movement is preserved. When rollback selects a snapshot before the correction, the absolute target for that axis is restored before any surviving suffix is reconstructed. Clearing correction ownership is explicit, durable, and prevents stale manual history events from reappearing as ownership. Automatic semantic evolution remains allowed after a correction and is blocked only by the existing explicit locks where applicable.',
    'Manual correction metadata and automatic-update locking are separate concerns. A relationship correction applies only to axes the user actually changed. Supported legacy relationship ownership is inspected and migrated at the manual-edit boundary before a new per-axis edit can overwrite the metadata that proves the old intent. New relationship edits use only compact per-axis correction records; whole-relationship overrides are legacy compatibility input, not a second write authority. When rollback selects a snapshot that already contains the applicable correction, its later surviving story movement is preserved. When rollback selects a snapshot before the correction, the absolute target for that axis is restored before any surviving suffix is reconstructed. Clearing correction ownership is explicit, durable, and prevents stale manual history events from reappearing as ownership. Automatic semantic evolution remains allowed after a correction and is blocked only by the existing explicit locks where applicable.'
)
core = core.replace(
    'Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Stable fields are protected from automatic updates only while their explicit lock is enabled; clearing that lock is a real unlock. Rollback preserves a correction made after the selected checkpoint but does not let an older correction overwrite newer story state already contained by that checkpoint. Supported legacy manual relationship events are interpreted only when surviving override metadata establishes the edited axes; missing per-axis provenance is surfaced as a blocked limitation instead of guessed. Structured/manual imports use bounded validation and established persistence. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current.',
    'Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Before a new relationship edit, any supported legacy correction whose axis intent is still provable is migrated into the per-axis representation, so editing a different axis cannot discard it. Ambiguous legacy axes remain explicitly unresolved. While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis or explicitly clear that NPC relationship correction ownership. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked. If other NPC/axis uncertainty remains, the block remains; if uncertainty is resolved but a surviving suffix still needs reconstruction, the state moves to the established recovery requirement rather than becoming safe. Stable fields are protected from automatic updates only while their explicit lock is enabled; clearing that lock is a real unlock. Structured/manual imports use bounded validation and established persistence. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current.'
)
write('docs/core-contract.md', core)

changelog = read('CHANGELOG.md')
entry = """## 0.7.3\n\n- Migrates supported legacy relationship correction axes into the compact per-axis correction representation before a new manual relationship edit can overwrite the legacy evidence that proves them. Modern and still-supported legacy ownership are preserved independently during rollback, so editing Affection cannot silently discard an older Trust correction.\n- New relationship edits no longer create whole-relationship manual overrides. Whole-object relationship overrides remain bounded legacy compatibility input only; ambiguous residual legacy axes are reported as unresolved instead of being treated as fully migrated.\n- Adds a narrowly scoped remediation path for `manual-relationship-correction-uncertain`: the editor/API can confirm one relationship axis at a time or explicitly clear that NPC relationship correction ownership while unrelated mutations and automatic story updates remain blocked. Remediation does not create a narrative checkpoint and immediately revalidates the verified rollback boundary.\n- Resolving one NPC/axis does not approve others. If correction uncertainty is gone but surviving history still needs reconstruction, the state transitions to the existing suffix-recovery requirement. Persistence conflicts/history changes remain blocked and reload-safe.\n- Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.\n\n"""
if '## 0.7.3' not in changelog:
    changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + entry, 1)
write('CHANGELOG.md', changelog)
replace_once('tests/structure.test.mjs', "assert.equal(manifest.version, '0.7.2');", "assert.equal(manifest.version, '0.7.3');")
replace_once('tests/structure.test.mjs', "assert.match(schema, /NPC_STATE_VERSION = '0\\.7\\.2'/);", "assert.match(schema, /NPC_STATE_VERSION = '0\\.7\\.3'/);")

# ---------------------------------------------------------------------------
# focused regressions
# ---------------------------------------------------------------------------
tests = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint, reconcileToCurrentBranch } from '../src/branches.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';
import { manualRelationshipRemediationPatch } from '../src/ui.js';

const rel = (trust = 0, affection = 0, desire = 0, tension = 0) => ({ trust, affection, desire, tension });
const manualEvent = (delta, sourceMessageId = 1, at = 100) => ({ impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId, turn: 1, at });
const storyEvent = (delta, sourceMessageId, at) => ({ impact: 'ordinary', delta, evidence: 'story', reason: 'Story gain.', sourceMessageId, turn: 1, at });

function legacyNpc({ trust = 20, affection = 0, axis = 'trust', sourceMessageId = 1, at = 100, includeEvent = true } = {}) {
    const relationship = rel(trust, affection);
    const delta = rel();
    delta[axis] = relationship[axis];
    const event = manualEvent(delta, sourceMessageId, at);
    return normalizeNpc({
        id: 'sora', name: 'Sora', relationship,
        relationshipHistory: includeEvent ? [event] : [], lastRelationshipChange: includeEvent ? event : null,
        manualOverrides: { relationship }, manualOverrideMeta: { relationship: { sourceMessageId, at: at + 1 } },
    });
}

function baselineState(key, chat, npc = normalizeNpc({ id: 'sora', name: 'Sora', relationship: rel() })) {
    let state = createEmptyState(key);
    state.npcs = [normalizeNpc({ id: npc.id, name: npc.name, relationship: rel() })];
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'story-before-manual');
    state.npcs = [npc];
    return state;
}

function harness(initialState, chat, { settings = {}, deferPredicate = null, failPredicate = null } = {}) {
    const key = initialState.chatKey;
    const context = { chat: structuredClone(chat) };
    let pointer = { name: 'state.json', path: '/files/state.json', revision: 1 };
    let saved = encodeV3Payload(key, initialState, 1);
    let deferred = false;
    let releaseDeferred;
    let startedResolve;
    const deferredStarted = new Promise(resolve => { startedResolve = resolve; });
    let failures = 0;
    const make = session => createNpcStateEngine({
        getContext: () => context,
        getChatKey: () => key,
        getSettings: () => normalizeSettings({ branchRescan: false, scanAfterEachResponse: false, relationshipHistoryLimit: 8, ...settings }),
        getPointer: () => pointer,
        setPointer: (_key, value) => { pointer = value; },
        persistSettings: () => {},
        generate: async () => JSON.stringify({ exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] }),
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'POST') {
                const nextSaved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
                const payload = JSON.parse(nextSaved);
                if (!deferred && deferPredicate?.(payload)) {
                    deferred = true;
                    startedResolve();
                    await new Promise(resolve => { releaseDeferred = resolve; });
                }
                if (failPredicate?.(payload, failures)) {
                    failures += 1;
                    return { ok: false, status: 409, text: async () => 'simulated conflict' };
                }
                saved = nextSaved;
                return { ok: true, json: async () => ({ path: pointer.path }) };
            }
            return { ok: true, text: async () => saved };
        },
        recoverySessionId: session,
    });
    return {
        key, context, engine: make('v073-a'), reload: () => make('v073-b'),
        persisted: () => decodeV3Payload(saved, key).state,
        deferredStarted, releaseDeferred: () => releaseDeferred?.(),
    };
}

function correctionMap(npc) { return Object.fromEntries((npc.manualRelationshipCorrections || []).map(item => [item.axis, item])); }

const chat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }];

test('legacy trust correction is migrated before a modern affection edit', async () => {
    const state = baselineState('v073-mixed', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    const result = await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(npc.relationship.trust, 20);
    assert.equal(npc.relationship.affection, 5);
    const corrections = correctionMap(npc);
    assert.equal(corrections.trust.value, 20);
    assert.equal(corrections.affection.value, 5);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrides, 'relationship'), false);
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel(20, 5));
    assert.equal(rolled.fullyRestored, true);
});

test('inverse axis order and multiple independent corrections remain independent', async () => {
    const state = baselineState('v073-inverse', chat, legacyNpc({ trust: 0, affection: 11, axis: 'affection' }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 7 } });
    await h.engine.updateNpc('sora', { relationship: { desire: 3 } });
    const corrections = correctionMap(h.persisted().npcs[0]);
    assert.equal(corrections.affection.value, 11);
    assert.equal(corrections.trust.value, 7);
    assert.equal(corrections.desire.value, 3);
});

test('modern edit of the same legacy-owned axis supersedes the migrated correction', async () => {
    const state = baselineState('v073-same-axis', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 25 } });
    const corrections = correctionMap(h.persisted().npcs[0]);
    assert.equal(corrections.trust.value, 25);
    assert.equal(Object.prototype.hasOwnProperty.call(h.persisted().npcs[0].manualOverrides, 'relationship'), false);
});

test('legacy migration happens before old relationship override metadata can be overwritten', async () => {
    const state = baselineState('v073-preoverwrite', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const npc = h.persisted().npcs[0];
    assert.equal(correctionMap(npc).trust.sourceMessageId, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrideMeta, 'relationship'), false);
});

test('supported legacy evidence migrates while ambiguous evidence remains explicitly unresolved', async () => {
    const supported = baselineState('v073-supported', chat, legacyNpc({ trust: 20 }));
    const hs = harness(supported, chat);
    await hs.engine.loadChat(hs.key);
    await hs.engine.updateNpc('sora', { relationship: { affection: 2 } });
    assert.equal(Object.prototype.hasOwnProperty.call(hs.persisted().npcs[0].manualOverrides, 'relationship'), false);

    const ambiguous = baselineState('v073-ambiguous', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const ha = harness(ambiguous, chat);
    await ha.engine.loadChat(ha.key);
    await ha.engine.updateNpc('sora', { relationship: { affection: 2 } });
    assert.equal(Object.prototype.hasOwnProperty.call(ha.persisted().npcs[0].manualOverrides, 'relationship'), true);
    const rolled = reconcileToCurrentBranch(ha.persisted(), []);
    assert.equal(rolled.reason, 'manual-relationship-correction-uncertain');
    assert.equal(rolled.fullyRestored, false);
});

test('visible history rotation after migration cannot erase correction ownership', async () => {
    const state = baselineState('v073-rotation', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const live = h.persisted();
    for (let i = 0; i < 10; i += 1) live.npcs[0].relationshipHistory.push(storyEvent(rel(1), i + 3, 200 + i));
    live.npcs[0].relationshipHistory = live.npcs[0].relationshipHistory.slice(-8);
    assert.equal(live.npcs[0].relationshipHistory.some(item => item.impact === 'manual'), false);
    const rolled = reconcileToCurrentBranch(normalizeState(live, h.key), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel(20, 5));
});

test('explicit correction clearing does not resurrect legacy ownership', async () => {
    const state = baselineState('v073-clear', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    await h.engine.updateNpc('sora', { manualOverrides: {} });
    const npc = h.persisted().npcs[0];
    assert.deepEqual(npc.manualRelationshipCorrections, []);
    assert.equal(Object.prototype.hasOwnProperty.call(npc.manualOverrides, 'relationship'), false);
    const rolled = reconcileToCurrentBranch(h.persisted(), []);
    assert.deepEqual(rolled.state.npcs[0].relationship, rel());
    assert.equal(rolled.state.branchSafety.status, 'safe');
});

test('repeated rollback and reload do not double-apply migrated corrections', async () => {
    const state = baselineState('v073-idempotent', chat, legacyNpc({ trust: 20 }));
    const h = harness(state, chat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(0);
    const first = await h.engine.reconcileBranch();
    assert.equal(first.ok, true);
    const second = await h.engine.reconcileBranch();
    assert.equal(second.ok, true);
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(20, 5));
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(loaded.npcs[0].relationship, rel(20, 5));
});

test('surviving snapshot keeps story gain after a migrated correction', async () => {
    const longChat = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2' }, { mes: 'a2' }, { is_user: true, mes: 'u3' }, { mes: 'a3' }];
    let state = baselineState('v073-survivor', longChat.slice(0, 2), legacyNpc({ trust: 20 }));
    const h = harness(state, longChat.slice(0, 2));
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    state = h.persisted();
    state.npcs[0].relationship.trust = 21;
    state.npcs[0].relationshipHistory.push(storyEvent(rel(1), 3, 300));
    state = recordCheckpoint(state, longChat.slice(0, 4), 3, 'story');
    state = recordCheckpoint(state, longChat, 5, 'unrelated');
    const rolled = reconcileToCurrentBranch(state, longChat.slice(0, 4));
    assert.equal(rolled.state.npcs[0].relationship.trust, 21);
    assert.equal(rolled.state.npcs[0].relationship.affection, 5);
});

async function enterUncertainty(h) {
    await h.engine.loadChat(h.key);
    h.context.chat.splice(0);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
}

test('uncertainty block resolves through the supported updateNpc remediation path', async () => {
    const state = baselineState('v073-remediate', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    const patch = manualRelationshipRemediationPatch('trust', 20);
    const fixed = await h.engine.updateNpc('sora', patch);
    assert.equal(fixed.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 20);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 20);
    // Missing legacy axis provenance remains until explicitly cleared; confirming one axis
    // does not silently approve the others.
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    assert.equal(h.persisted().branchSafety.status, 'safe');
});

test('multiple unresolved NPCs remain blocked until each is remediated', async () => {
    let state = baselineState('v073-multi-unresolved', chat, legacyNpc({ trust: 20, includeEvent: false }));
    state.npcs.push(normalizeNpc({ ...legacyNpc({ trust: 0, affection: 9, axis: 'affection', includeEvent: false }), id: 'ryu', name: 'Ryu' }));
    state.branchBase.snapshot.npcs.push(normalizeNpc({ id: 'ryu', name: 'Ryu', relationship: rel() }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    assert.match(h.persisted().branchSafety.reason, /Ryu/);
    await h.engine.clearManualRelationshipCorrection('ryu');
    assert.equal(h.persisted().branchSafety.status, 'safe');
});

test('remediation preserves suffix recovery requirement instead of fabricating a safe checkpoint', async () => {
    const surviving = [{ is_user: true, mes: 'u1' }, { mes: 'a1' }, { is_user: true, mes: 'u2 survives' }, { mes: 'a2 survives' }];
    let state = baselineState('v073-suffix', surviving.slice(0, 2), legacyNpc({ trust: 20, includeEvent: false }));
    state.branchHeadLineage = ['stale'];
    const h = harness(state, surviving);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    assert.equal(h.persisted().branchSafety.kind, 'suffix-recovery-required');
    assert.equal(h.persisted().recovery?.status, 'paused');
});

test('unrelated mutations remain rejected while correction uncertainty is blocked', async () => {
    const state = baselineState('v073-unrelated', chat, legacyNpc({ trust: 20, includeEvent: false }));
    const h = harness(state, chat);
    await enterUncertainty(h);
    const update = await h.engine.updateNpc('sora', { mood: 'Should not write.' });
    assert.equal(update.ok, false);
    assert.equal(update.reason, 'correction-remediation-only');
    const add = await h.engine.addNpc('Nope');
    assert.equal(add.ok, false);
    assert.equal(add.reason, 'branch-unsafe');
    assert.equal(h.persisted().npcs.some(npc => npc.name === 'Nope'), false);
});

test('persistence conflict during remediation leaves persisted state blocked and reload honest', async () => {
    const state = baselineState('v073-conflict', chat, legacyNpc({ trust: 20, includeEvent: false }));
    let fail = false;
    const h = harness(state, chat, { failPredicate: () => fail });
    await enterUncertainty(h);
    fail = true;
    await assert.rejects(() => h.engine.clearManualRelationshipCorrection('sora'));
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.equal(loaded.branchSafety.kind, 'manual-relationship-correction-uncertain');
});
'''
write('tests/v073-correction-remediation.test.mjs', tests)

print('Applied NPC State v0.7.3 correction migration/remediation patch.')

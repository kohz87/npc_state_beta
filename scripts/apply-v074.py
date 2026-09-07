from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    write(path, text.replace(old, new, 1))

def regex_once(path, pattern, replacement):
    text = read(path)
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex replacement failed: {pattern[:80]}')
    write(path, new)

# --- schema: optional cross-format origin identity + bounded unresolved axis state ---
replace_once('src/schema.js', "export const NPC_STATE_VERSION = '0.7.3';", "export const NPC_STATE_VERSION = '0.7.4';")

regex_once(
    'src/schema.js',
    r"export const MANUAL_RELATIONSHIP_CORRECTION_VERSION = 1;\nexport function normalizeManualRelationshipCorrections\(value = \[\], revisionValue = 0\) \{.*?\n\}\nexport const DEFAULT_RELATIONSHIP =",
    """export const MANUAL_RELATIONSHIP_CORRECTION_VERSION = 1;
export function normalizeManualRelationshipCorrections(value = [], revisionValue = 0) {
    const source = Array.isArray(value) ? value : [];
    let revision = Math.max(0, Math.trunc(Number(revisionValue) || 0));
    const byAxis = new Map();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const axis = String(raw.axis || '').trim().toLocaleLowerCase();
        const itemRevision = Math.max(0, Math.trunc(Number(raw.revision) || 0));
        if (!RELATIONSHIP_AXES.includes(axis) || itemRevision <= 0) continue;
        const normalized = normalizeRelationship({ [axis]: raw.value });
        const item = {
            id: axis + ':' + itemRevision,
            axis,
            value: normalized[axis],
            revision: itemRevision,
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            at: Number(raw.at) || null,
        };
        const legacyOriginKey = String(raw.legacyOriginKey || '').trim().slice(0, 160);
        if (legacyOriginKey) item.legacyOriginKey = legacyOriginKey;
        const prior = byAxis.get(axis);
        if (!prior || item.revision >= prior.revision) byAxis.set(axis, item);
        revision = Math.max(revision, itemRevision);
    }
    return {
        version: MANUAL_RELATIONSHIP_CORRECTION_VERSION,
        revision,
        corrections: RELATIONSHIP_AXES.map(axis => byAxis.get(axis)).filter(Boolean),
    };
}
export function normalizeManualRelationshipCorrectionUnresolvedAxes(value = []) {
    const axes = new Set((Array.isArray(value) ? value : [])
        .map(axis => String(axis || '').trim().toLocaleLowerCase())
        .filter(axis => RELATIONSHIP_AXES.includes(axis)));
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}
export const DEFAULT_RELATIONSHIP ="""
)

replace_once(
    'src/schema.js',
    """    const manualRelationshipCorrectionState = normalizeManualRelationshipCorrections(
        input.manualRelationshipCorrections,
        input.manualRelationshipCorrectionRevision,
    );
    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);""",
    """    const manualRelationshipCorrectionState = normalizeManualRelationshipCorrections(
        input.manualRelationshipCorrections,
        input.manualRelationshipCorrectionRevision,
    );
    const manualRelationshipCorrectionUnresolvedAxes = normalizeManualRelationshipCorrectionUnresolvedAxes(
        input.manualRelationshipCorrectionUnresolvedAxes,
    );
    const appearanceForms = normalizeAppearanceForms(input.appearanceForms);"""
)
replace_once(
    'src/schema.js',
    """        manualRelationshipCorrectionRevision: manualRelationshipCorrectionState.revision,
        manualRelationshipCorrections: manualRelationshipCorrectionState.corrections,
        retentionProtected: input.retentionProtected === true,""",
    """        manualRelationshipCorrectionRevision: manualRelationshipCorrectionState.revision,
        manualRelationshipCorrections: manualRelationshipCorrectionState.corrections,
        manualRelationshipCorrectionUnresolvedAxes,
        retentionProtected: input.retentionProtected === true,"""
)

# --- branches: normalize legacy ownership once, bridge legacy checkpoints to modern records ---
replace_once(
    'src/branches.js',
    "normalizeManualRelationshipCorrections, normalizeNpc,",
    "normalizeManualRelationshipCorrections, normalizeManualRelationshipCorrectionUnresolvedAxes, normalizeNpc,"
)
replace_once(
    'src/branches.js',
    """function relationshipCorrectionState(npc = {}) {
    return normalizeManualRelationshipCorrections(
        npc?.manualRelationshipCorrections,
        npc?.manualRelationshipCorrectionRevision,
    );
}

function applyAbsoluteRelationshipAxes""",
    """function relationshipCorrectionState(npc = {}) {
    return normalizeManualRelationshipCorrections(
        npc?.manualRelationshipCorrections,
        npc?.manualRelationshipCorrectionRevision,
    );
}

function relationshipCorrectionUnresolvedAxes(npc = {}) {
    return normalizeManualRelationshipCorrectionUnresolvedAxes(npc?.manualRelationshipCorrectionUnresolvedAxes);
}

function applyAbsoluteRelationshipAxes"""
)

regex_once(
    'src/branches.js',
    r"function preserveDurableManualRelationshipCorrections\(restoredNpc, liveNpc\) \{.*?\n\}\n\nfunction legacyRelationshipOverrideIdentity",
    """function preserveDurableManualRelationshipCorrections(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    const liveState = relationshipCorrectionState(liveNpc);
    if (liveState.revision <= 0 && !liveState.corrections.length) return null;
    const restoredState = relationshipCorrectionState(restoredNpc);
    const restoredByAxis = new Map(restoredState.corrections.map(item => [item.axis, item]));
    const liveCorrections = liveState.corrections.map(item => structuredClone(item));
    const pending = [];
    for (const correction of liveCorrections) {
        if (restoredByAxis.get(correction.axis)?.revision === correction.revision) continue;
        const equivalent = legacyCorrectionEquivalentToRestored(restoredOwnershipNpc, correction);
        if (equivalent.matches) {
            if (!correction.legacyOriginKey && equivalent.originKey) correction.legacyOriginKey = equivalent.originKey;
            continue;
        }
        pending.push(correction);
    }
    let next = applyAbsoluteRelationshipAxes(restoredNpc, pending);
    next.manualRelationshipCorrectionVersion = liveState.version;
    next.manualRelationshipCorrectionRevision = liveState.revision;
    next.manualRelationshipCorrections = liveCorrections;
    return { npc: normalizeNpc(next), limitations: [] };
}

function legacyRelationshipOverrideIdentity"""
)

replace_once(
    'src/branches.js',
    """function sameLegacyRelationshipOverride(leftNpc, rightNpc) {
    const left = legacyRelationshipOverrideIdentity(leftNpc);
    const right = legacyRelationshipOverrideIdentity(rightNpc);
    if (!left || !right) return false;
    return left.sourceMessageId === right.sourceMessageId
        && left.at === right.at
        && RELATIONSHIP_AXES.every(axis => left.relationship[axis] === right.relationship[axis]);
}

function matchingLegacyManualEvent""",
    """function sameLegacyRelationshipOverride(leftNpc, rightNpc) {
    const left = legacyRelationshipOverrideIdentity(leftNpc);
    const right = legacyRelationshipOverrideIdentity(rightNpc);
    if (!left || !right) return false;
    return left.sourceMessageId === right.sourceMessageId
        && left.at === right.at
        && RELATIONSHIP_AXES.every(axis => left.relationship[axis] === right.relationship[axis]);
}

function legacyRelationshipOriginKey(npc, axis) {
    const key = String(axis || '').trim().toLocaleLowerCase();
    const identity = legacyRelationshipOverrideIdentity(npc);
    if (!identity || !RELATIONSHIP_AXES.includes(key)) return '';
    return ['legacy-v1', key, identity.sourceMessageId, identity.at ?? '',
        ...RELATIONSHIP_AXES.map(item => identity.relationship[item])].join('|');
}

function legacyCorrectionEquivalentToRestored(restoredNpc, correction = {}) {
    const axis = String(correction?.axis || '').trim().toLocaleLowerCase();
    if (!RELATIONSHIP_AXES.includes(axis)) return { matches: false, originKey: '' };
    const identity = legacyRelationshipOverrideIdentity(restoredNpc);
    if (!identity) return { matches: false, originKey: '' };
    const originKey = legacyRelationshipOriginKey(restoredNpc, axis);
    if (correction.legacyOriginKey) return { matches: correction.legacyOriginKey === originKey, originKey };

    // v0.7.3 migration records predate legacyOriginKey. Bridge them conservatively from
    // the exact legacy override provenance they were derived from, then persist the key.
    const matched = matchingLegacyManualEvent(restoredNpc, identity);
    const expectedAt = identity.at || Number(matched?.at) || null;
    const correctionAt = Number(correction?.at) || null;
    const correctionSource = Number.isInteger(correction?.sourceMessageId) ? correction.sourceMessageId : null;
    const correctionValue = normalizeRelationship({ [axis]: correction?.value })[axis];
    const eventProvesAxis = Boolean(matched && manualRelationshipEventAxes(matched).includes(axis));
    const matches = correctionSource === identity.sourceMessageId
        && correctionAt === expectedAt
        && correctionValue === identity.relationship[axis]
        && (identity.at !== null || eventProvesAxis);
    return { matches, originKey: matches ? originKey : '' };
}

function retireLegacyRelationshipOverride(npcInput) {
    const next = structuredClone(npcInput || {});
    const overrides = { ...(next.manualOverrides || {}) };
    const meta = { ...(next.manualOverrideMeta || {}) };
    delete overrides.relationship;
    delete meta.relationship;
    next.manualOverrides = overrides;
    next.manualOverrideMeta = meta;
    next.manualRelationshipCorrectionUnresolvedAxes = [];
    return next;
}

function matchingLegacyManualEvent"""
)

replace_once(
    'src/branches.js',
    """function matchingLegacyManualEvent(liveNpc, identity) {
    if (!identity) return null;
    const events = (liveNpc?.relationshipHistory || [])
        .filter(item => String(item?.impact || '').toLocaleLowerCase() === 'manual')
        .filter(item => identity.sourceMessageId === null || item?.sourceMessageId === identity.sourceMessageId)
        .filter(item => !identity.at || !Number(item?.at) || Number(item.at) <= identity.at)
        .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
    return events[0] || null;
}""",
    """function matchingLegacyManualEvent(liveNpc, identity) {
    if (!identity) return null;
    const events = legacyManualRelationshipEvents(liveNpc)
        .filter(item => identity.sourceMessageId === null || item?.sourceMessageId === identity.sourceMessageId)
        .filter(item => !identity.at || !Number(item?.at) || Number(item.at) <= identity.at)
        .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
    return events[0] || null;
}"""
)

regex_once(
    'src/branches.js',
    r"function legacyRelationshipCandidateAxes\(npc = \{\}, ownedAxes = new Set\(\)\) \{.*?\n\}\n\nfunction legacyRelationshipResidualAxes\(npc = \{\}, matchedEvent = null, ownedAxes = new Set\(\)\) \{.*?\n\}",
    """function modernManualRelationshipEvent(event = {}, modernState = { corrections: [] }) {
    const axes = manualRelationshipEventAxes(event);
    const eventAt = Number(event?.at) || 0;
    if (!axes.length || !eventAt) return false;
    const byAxis = new Map((modernState?.corrections || []).map(item => [item.axis, item]));
    const eventSource = Number.isInteger(event?.sourceMessageId) ? event.sourceMessageId : null;
    return axes.every(axis => {
        const correction = byAxis.get(axis);
        const correctionSource = Number.isInteger(correction?.sourceMessageId) ? correction.sourceMessageId : null;
        return correction && Number(correction.at) === eventAt && correctionSource === eventSource;
    });
}

function legacyManualRelationshipEvents(npc = {}) {
    const modern = relationshipCorrectionState(npc);
    return (npc?.relationshipHistory || [])
        .filter(item => String(item?.impact || '').toLocaleLowerCase() === 'manual')
        .filter(item => !modernManualRelationshipEvent(item, modern));
}

function legacyRelationshipCandidateAxes(npc = {}, ownedAxes = new Set()) {
    const stored = relationshipCorrectionUnresolvedAxes(npc);
    if (stored.length) return stored.filter(axis => !ownedAxes.has(axis));
    const events = legacyManualRelationshipEvents(npc);
    const axes = new Set();
    for (const event of events) {
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    // Missing provenance is conservative: a current-format confirmation event cannot prove
    // that an unrepresented legacy axis was never part of the old whole-object override.
    if (!axes.size) for (const axis of RELATIONSHIP_AXES) if (!ownedAxes.has(axis)) axes.add(axis);
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyRelationshipResidualAxes(npc = {}, matchedEvent = null, ownedAxes = new Set()) {
    const stored = relationshipCorrectionUnresolvedAxes(npc);
    if (stored.length) return stored.filter(axis => !ownedAxes.has(axis));
    const matchedKey = matchedEvent ? manualRelationshipEventKey(matchedEvent) : '';
    const axes = new Set();
    for (const event of legacyManualRelationshipEvents(npc)) {
        if (matchedKey && manualRelationshipEventKey(event) === matchedKey) continue;
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}"""
)

regex_once(
    'src/branches.js',
    r"export function migrateSupportedLegacyManualRelationshipCorrections\(npcInput\) \{.*?\n\}\n\nfunction preserveLegacyManualRelationshipEvents",
    """export function migrateSupportedLegacyManualRelationshipCorrections(npcInput) {
    let npc = normalizeNpc(npcInput || {});
    const modern = relationshipCorrectionState(npc);
    const ownedAxes = new Set(modern.corrections.map(item => item.axis));
    if (!hasLegacyRelationshipOverride(npc)) {
        if (relationshipCorrectionUnresolvedAxes(npc).length) {
            const next = structuredClone(npc);
            next.manualRelationshipCorrectionUnresolvedAxes = [];
            npc = normalizeNpc(next);
        }
        return { npc, migratedAxes: [], limitations: [] };
    }

    const unresolvedResult = code => {
        const axes = legacyRelationshipCandidateAxes(npc, ownedAxes);
        let next = structuredClone(npc);
        next.manualRelationshipCorrectionUnresolvedAxes = axes;
        if (!axes.length) next = retireLegacyRelationshipOverride(next);
        return {
            npc: normalizeNpc(next),
            migratedAxes: [],
            limitations: axes.length ? [legacyCorrectionLimitation(code, axes)] : [],
        };
    };

    const identity = legacyRelationshipOverrideIdentity(npc);
    if (!identity) return unresolvedResult('legacy-relationship-correction-missing-axis-provenance');
    const matched = matchingLegacyManualEvent(npc, identity);
    const matchedAxes = manualRelationshipEventAxes(matched);
    if (!matched || !matchedAxes.length) return unresolvedResult('legacy-relationship-correction-missing-axis-provenance');

    const migratableAxes = matchedAxes.filter(axis => !ownedAxes.has(axis));
    let next = structuredClone(npc);
    const byAxis = new Map(modern.corrections.map(item => [item.axis, structuredClone(item)]));
    let revision = modern.revision;
    let enriched = false;
    for (const axis of matchedAxes) {
        const existing = byAxis.get(axis);
        if (!existing || existing.legacyOriginKey) continue;
        const equivalent = legacyCorrectionEquivalentToRestored(npc, existing);
        if (!equivalent.matches || !equivalent.originKey) continue;
        existing.legacyOriginKey = equivalent.originKey;
        byAxis.set(axis, existing);
        enriched = true;
    }
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
                legacyOriginKey: legacyRelationshipOriginKey(npc, axis),
            });
            ownedAxes.add(axis);
        }
    }
    if (migratableAxes.length || enriched) {
        next.manualRelationshipCorrectionRevision = revision;
        next.manualRelationshipCorrections = [...byAxis.values()];
    }

    const residualAxes = legacyRelationshipResidualAxes(npc, matched, ownedAxes);
    next.manualRelationshipCorrectionUnresolvedAxes = residualAxes;
    const limitations = residualAxes.length
        ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
        : [];
    if (!limitations.length) next = retireLegacyRelationshipOverride(next);
    return { npc: normalizeNpc(next), migratedAxes: migratableAxes, limitations };
}

function preserveLegacyUncertainty(restoredNpc, liveNpc, code, modernAxes) {
    const axes = legacyRelationshipCandidateAxes(liveNpc, modernAxes);
    if (!axes.length) return { npc: normalizeNpc(retireLegacyRelationshipOverride(restoredNpc)), limitations: [] };
    const next = structuredClone(restoredNpc);
    next.manualRelationshipCorrectionUnresolvedAxes = axes;
    return { npc: normalizeNpc(next), limitations: [legacyCorrectionLimitation(code, axes)] };
}

function preserveLegacyManualRelationshipEvents"""
)

regex_once(
    'src/branches.js',
    r"function preserveLegacyManualRelationshipEvents\(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc\) \{.*?\n\}\n\nfunction preserveUserOwnedState",
    """function preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    if (!hasLegacyRelationshipOverride(liveNpc)) return { npc: restoredNpc, limitations: [] };
    const modernAxes = new Set(relationshipCorrectionState(liveNpc).corrections.map(item => item.axis));
    const identity = legacyRelationshipOverrideIdentity(liveNpc);
    if (!identity) return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);
    // A snapshot with the same legacy identity already contains that correction and any
    // surviving story movement after it. Modern axes are preserved independently below.
    if (sameLegacyRelationshipOverride(restoredOwnershipNpc, liveNpc)) return { npc: restoredNpc, limitations: [] };

    const known = new Set((restoredNpc.relationshipHistory || [])
        .filter(item => item?.impact === 'manual')
        .map(manualRelationshipEventKey));
    const matched = matchingLegacyManualEvent(liveNpc, identity);
    if (!matched || known.has(manualRelationshipEventKey(matched))) {
        return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);
    }
    const eventAxes = manualRelationshipEventAxes(matched);
    if (!eventAxes.length) return preserveLegacyUncertainty(restoredNpc, liveNpc, 'legacy-relationship-correction-missing-axis-provenance', modernAxes);

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
    next.manualRelationshipCorrectionUnresolvedAxes = residualAxes;
    return {
        npc: normalizeNpc(next),
        limitations: residualAxes.length
            ? [legacyCorrectionLimitation('legacy-relationship-correction-partial-axis-provenance', residualAxes)]
            : [],
    };
}

function preserveUserOwnedState"""
)

replace_once(
    'src/branches.js',
    """        next.importance = Number(live.importance) || 0;
        // Durable per-axis correction identity is authoritative. It is independent of
        // bounded display history and only applies an absolute target when the selected
        // snapshot does not already contain that correction revision.
        const restoredOwnershipNpc = {
            manualOverrides: structuredClone(restoredOverrides),
            manualOverrideMeta: structuredClone(restoredOverrideMeta),
        };
        const durable = preserveDurableManualRelationshipCorrections(next, live);""",
    """        next.importance = Number(live.importance) || 0;
        next.manualRelationshipCorrectionUnresolvedAxes = structuredClone(live.manualRelationshipCorrectionUnresolvedAxes || []);
        // Durable per-axis correction identity is authoritative. It is independent of
        // bounded display history. A legacy-origin key lets a pre-migration checkpoint
        // prove it already contains the same correction without resetting later story gain.
        const restoredOwnershipNpc = {
            manualOverrides: structuredClone(restoredOverrides),
            manualOverrideMeta: structuredClone(restoredOverrideMeta),
            relationshipHistory: structuredClone(npc.relationshipHistory || []),
        };
        const durable = preserveDurableManualRelationshipCorrections(next, live, restoredOwnershipNpc);"""
)

# --- engine: confirmations retire exactly the axes they resolve; clear remains separate ---
replace_once(
    'src/engine.js',
    """    normalizeRelationship,
    normalizeRelationshipMilestones,""",
    """    normalizeRelationship,
    normalizeManualRelationshipCorrectionUnresolvedAxes,
    normalizeRelationshipMilestones,"""
)
replace_once(
    'src/engine.js',
    """            let correctionRevision = Math.max(0, Math.trunc(Number(current.manualRelationshipCorrectionRevision) || 0));
            const correctionByAxis = new Map((current.manualRelationshipCorrections || []).map(item => [item.axis, structuredClone(item)]));
            if (clearRelationshipCorrections) correctionByAxis.clear();""",
    """            let correctionRevision = Math.max(0, Math.trunc(Number(current.manualRelationshipCorrectionRevision) || 0));
            const correctionByAxis = new Map((current.manualRelationshipCorrections || []).map(item => [item.axis, structuredClone(item)]));
            const unresolvedCorrectionAxes = new Set(normalizeManualRelationshipCorrectionUnresolvedAxes(current.manualRelationshipCorrectionUnresolvedAxes));
            const hadLegacyUnresolvedAxes = unresolvedCorrectionAxes.size > 0;
            let resolvedCorrectionAxes = [];
            if (clearRelationshipCorrections) {
                correctionByAxis.clear();
                unresolvedCorrectionAxes.clear();
            }"""
)
replace_once(
    'src/engine.js',
    """                const requestedAxes = RELATIONSHIP_AXES.filter(axis => Object.prototype.hasOwnProperty.call(patch.relationship, axis));
                const changedAxes = requestedAxes.filter(axis => before[axis] !== after[axis]);
                const correctionAxes = remediation ? requestedAxes : changedAxes;
                const inferred =""",
    """                const requestedAxes = RELATIONSHIP_AXES.filter(axis => Object.prototype.hasOwnProperty.call(patch.relationship, axis));
                const changedAxes = requestedAxes.filter(axis => before[axis] !== after[axis]);
                const correctionAxes = remediation ? requestedAxes : changedAxes;
                resolvedCorrectionAxes = correctionAxes;
                const inferred ="""
)
replace_once(
    'src/engine.js',
    """                    for (const axis of correctionAxes) {
                        correctionByAxis.set(axis, {
                            id: axis + ':' + correctionRevision,
                            axis,
                            value: after[axis],
                            revision: correctionRevision,
                            sourceMessageId: sourceMessageId >= 0 ? sourceMessageId : null,
                            at: manualAt,
                        });
                    }
                    if (changedAxes.length) {""",
    """                    for (const axis of correctionAxes) {
                        correctionByAxis.set(axis, {
                            id: axis + ':' + correctionRevision,
                            axis,
                            value: after[axis],
                            revision: correctionRevision,
                            sourceMessageId: sourceMessageId >= 0 ? sourceMessageId : null,
                            at: manualAt,
                        });
                        unresolvedCorrectionAxes.delete(axis);
                    }
                    if (changedAxes.length) {"""
)
replace_once(
    'src/engine.js',
    """            nextRaw.manualRelationshipCorrectionRevision = correctionRevision;
            nextRaw.manualRelationshipCorrections = [...correctionByAxis.values()];
            const hasManualLifeState =""",
    """            nextRaw.manualRelationshipCorrectionRevision = correctionRevision;
            nextRaw.manualRelationshipCorrections = [...correctionByAxis.values()];
            nextRaw.manualRelationshipCorrectionUnresolvedAxes = [...unresolvedCorrectionAxes];
            const retireResolvedLegacyRelationship = hadLegacyUnresolvedAxes
                && resolvedCorrectionAxes.length > 0
                && unresolvedCorrectionAxes.size === 0;
            const hasManualLifeState ="""
)
replace_once(
    'src/engine.js',
    """            if (clearRelationshipOnly) {
                delete manualOverrides.relationship;
                delete manualOverrideMeta.relationship;
            }""",
    """            if (clearRelationshipOnly || retireResolvedLegacyRelationship) {
                delete manualOverrides.relationship;
                delete manualOverrideMeta.relationship;
            }"""
)

# --- release/docs ---
for path in ['manifest.json', 'DEVELOPMENT.md', 'README.md', 'tests/structure.test.mjs']:
    text = read(path)
    if '0.7.3' not in text:
        raise SystemExit(f'{path}: expected 0.7.3 release marker')
    write(path, text.replace('0.7.3', '0.7.4').replace('0\\.7\\.3', '0\\.7\\.4'))

core = read('docs/core-contract.md')
old = "Manual correction metadata and automatic-update locking are separate concerns. A relationship correction applies only to axes the user actually changed. Supported legacy relationship ownership is inspected and migrated at the manual-edit boundary before a new per-axis edit can overwrite the metadata that proves the old intent. New relationship edits use only compact per-axis correction records; whole-relationship overrides are legacy compatibility input, not a second write authority. When rollback selects a snapshot that already contains the applicable correction, its later surviving story movement is preserved. When rollback selects a snapshot before the correction, the absolute target for that axis is restored before any surviving suffix is reconstructed. Clearing correction ownership is explicit, durable, and prevents stale manual history events from reappearing as ownership. Automatic semantic evolution remains allowed after a correction and is blocked only by the existing explicit locks where applicable."
new = "Manual correction metadata and automatic-update locking are separate concerns. A relationship correction applies only to axes the user actually changed. Supported legacy relationship ownership is inspected and migrated at the manual-edit boundary before a new per-axis edit can overwrite the metadata that proves the old intent. New relationship edits use only compact per-axis correction records; whole-relationship overrides are legacy compatibility input, not a second write authority. A migrated legacy axis keeps one compact legacy-origin identity derived from the proven override provenance, so a checkpoint written before the representation transition can prove it already contains that same correction without replaying the absolute target over later surviving story movement. When rollback selects a snapshot before the correction, the absolute target for that axis is restored before any surviving suffix is reconstructed. Ambiguous legacy ownership is normalized into a bounded unresolved-axis set, independent of visible relationship history; explicit axis confirmation removes only that axis, including when the confirmed numeric value is unchanged. Once all unresolved axes are confirmed, obsolete legacy override metadata is retired while the confirmed modern corrections remain. Clearing all correction ownership is a separate explicit action. Automatic semantic evolution remains allowed after a correction and is blocked only by the existing explicit locks where applicable."
if old not in core:
    raise SystemExit('core contract user-owned paragraph anchor missing')
core = core.replace(old, new, 1)
old2 = "Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Before a new relationship edit, any supported legacy correction whose axis intent is still provable is migrated into the per-axis representation, so editing a different axis cannot discard it. Ambiguous legacy axes remain explicitly unresolved. While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis or explicitly clear that NPC relationship correction ownership. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked. The recovery banner routes this state to dossier remediation and does not offer generic timeline acceptance as a shortcut. If other NPC/axis uncertainty remains, the block remains; if uncertainty is resolved but a surviving suffix still needs reconstruction, the state moves to the established recovery requirement rather than becoming safe. Stable fields are protected from automatic updates only while their explicit lock is enabled; clearing that lock is a real unlock. Structured/manual imports use bounded validation and established persistence. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current."
new2 = "Manual editor changes express user intent and record correction provenance without implicitly freezing future semantic evolution. Relationship numeric edits are absolute per-axis corrections: editing Trust does not claim Affection, Desire, or Tension. Before a new relationship edit, any supported legacy correction whose axis intent is still provable is migrated into the per-axis representation, so editing a different axis cannot discard it. Ambiguous legacy axes are persisted as a bounded unresolved-axis set; current-format confirmation events are excluded from legacy-evidence inference and display-history trimming cannot resolve uncertainty. While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis, even at its unchanged current value, or explicitly clear all relationship correction ownership for that NPC. Confirmation retains existing confirmed axes and retires legacy compatibility metadata only after every unresolved axis is accounted for. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked. The recovery banner routes this state to dossier remediation and does not offer generic timeline acceptance as a shortcut. If other NPC/axis uncertainty remains, the block remains; if uncertainty is resolved but a surviving suffix still needs reconstruction, the state moves to the established recovery requirement rather than becoming safe. Stable fields are protected from automatic updates only while their explicit lock is enabled; clearing that lock is a real unlock. Structured/manual imports use bounded validation and established persistence. Manual writes are owned by the target chat and user intent rather than by a narrative source event. If history shifts during their asynchronous save, keep the durable user edit/import but block the old narrative boundary for reconciliation instead of discarding the user action or advertising the old checkpoint as current."
if old2 not in core:
    raise SystemExit('core contract manual edit paragraph anchor missing')
write('docs/core-contract.md', core.replace(old2, new2, 1))

changelog = read('CHANGELOG.md')
entry = """## 0.7.4

- Preserves surviving story movement across the legacy-to-modern relationship correction transition. Migrated legacy axes carry a compact provenance identity, so a valid pre-migration checkpoint that already contains the same correction keeps later story gains; checkpoints before the correction still receive its absolute target, and a genuinely newer same-axis edit still supersedes it.
- Makes legacy correction uncertainty durable per axis instead of re-deriving it from bounded display history. Current-format confirmation events are excluded from legacy evidence, partial confirmation survives reload/history trimming, and confirming an unchanged value still resolves that explicitly selected axis.
- Completing all unresolved axes now retains the confirmed modern corrections, retires obsolete legacy whole-relationship metadata, and immediately revalidates the verified rollback boundary. Other NPC uncertainty and surviving suffix recovery remain blocked until independently resolved; explicit clear-all correction ownership remains a separate action.
- Persistence conflicts and in-flight history changes remain fail-safe through the existing guarded user commit path. Persisted state/settings schema remain 1; semantic contract remains 3; foreground contract remains 4. No NPC database rebuild is required.

"""
if not changelog.startswith('# Changelog\n\n'):
    raise SystemExit('changelog header changed')
write('CHANGELOG.md', '# Changelog\n\n' + entry + changelog[len('# Changelog\n\n'):])

# README current-release summary: keep it concise and accurate.
readme = read('README.md')
old_readme = "NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.4 makes manual relationship correction ownership independent of trimmed display history and keeps recovery completion honest after rejected finalization, without changing the persisted schema."
new_readme = "NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model. Release 0.7.4 preserves relationship correction ownership and surviving story movement across legacy upgrades, with durable per-axis remediation state and no persisted-schema change."
if old_readme not in readme:
    raise SystemExit('README release summary anchor missing')
write('README.md', readme.replace(old_readme, new_readme, 1))

# --- behavioral regressions ---
test_file = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStateEngine } from '../src/engine.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../src/schema.js';
import { ensurePreUpdateBaseline, recordCheckpoint } from '../src/branches.js';
import { decodeV3Payload, encodeV3Payload } from '../src/storage.js';
import { normalizeSettings } from '../src/settings.js';

const rel = (trust = 0, affection = 0, desire = 0, tension = 0) => ({ trust, affection, desire, tension });
const manualEvent = (delta, sourceMessageId = 1, at = 100) => ({ impact: 'manual', delta, evidence: '', reason: 'Manual dossier adjustment by player.', sourceMessageId, turn: 1, at });
const storyEvent = (delta, sourceMessageId, at) => ({ impact: 'ordinary', delta, evidence: 'story', reason: 'Story gain.', sourceMessageId, turn: 2, at });
const longChat = [
    { is_user: true, mes: 'u1' }, { mes: 'a1' },
    { is_user: true, mes: 'u2' }, { mes: 'a2' },
    { is_user: true, mes: 'u3' }, { mes: 'a3' },
];
const shortChat = longChat.slice(0, 2);

function legacyNpc({ values = rel(20), axis = 'trust', sourceMessageId = 1, at = 100, includeEvent = true, id = 'sora', name = 'Sora' } = {}) {
    const delta = rel();
    delta[axis] = values[axis];
    const event = manualEvent(delta, sourceMessageId, at);
    return normalizeNpc({
        id, name, relationship: values,
        relationshipHistory: includeEvent ? [event] : [], lastRelationshipChange: includeEvent ? event : null,
        manualOverrides: { relationship: values }, manualOverrideMeta: { relationship: { sourceMessageId, at: at + 1 } },
    });
}

function baselineState(key, chat = shortChat, npcs = [legacyNpc()]) {
    let state = createEmptyState(key);
    state.npcs = npcs.map(npc => normalizeNpc({ id: npc.id, name: npc.name, relationship: rel() }));
    state = ensurePreUpdateBaseline(state, chat, 1);
    state = recordCheckpoint(state, chat, 1, 'pre-correction');
    state.npcs = npcs.map(npc => normalizeNpc(npc));
    return state;
}

function stateWithLegacyStoryGain(key, { axis = 'trust', corrected = 20, gained = 21 } = {}) {
    const values = rel();
    values[axis] = corrected;
    let state = baselineState(key, shortChat, [legacyNpc({ values, axis })]);
    state = recordCheckpoint(state, shortChat, 1, 'legacy-correction');
    state.npcs[0].relationship[axis] = gained;
    const delta = rel();
    delta[axis] = gained - corrected;
    state.npcs[0].relationshipHistory.push(storyEvent(delta, 3, 200));
    state.npcs[0].lastRelationshipChange = storyEvent(delta, 3, 200);
    state = recordCheckpoint(state, longChat.slice(0, 4), 3, 'story-gain');
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
        key, context, engine: make('v074-a'), reload: () => make('v074-b'),
        persisted: () => decodeV3Payload(saved, key).state,
        deferredStarted, releaseDeferred: () => releaseDeferred?.(),
    };
}

function correctionMap(npc) { return Object.fromEntries((npc.manualRelationshipCorrections || []).map(item => [item.axis, item])); }
function unresolved(npc) { return npc.manualRelationshipCorrectionUnresolvedAxes || []; }

async function enterUncertainty(h) {
    await h.engine.loadChat(h.key);
    h.context.chat.splice(0);
    const result = await h.engine.reconcileBranch();
    assert.equal(result.reason, 'manual-relationship-correction-uncertain');
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
    return result;
}

async function confirmAll(engine, reference = 'sora', values = rel(20, 5, 3, 2)) {
    for (const axis of ['trust', 'affection', 'desire', 'tension']) {
        const result = await engine.updateNpc(reference, { relationship: { [axis]: values[axis] } });
        assert.equal(result.ok, true);
    }
}

test('pre-migration checkpoint containing a legacy correction keeps later surviving story gain', async () => {
    const state = stateWithLegacyStoryGain('v074-legacy-gain');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    const edited = await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    assert.equal(edited.ok, true);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 20);
    assert.match(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, /^legacy-v1\|trust\|/);
    h.context.chat.splice(4);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 21);
    assert.equal(h.persisted().npcs[0].relationship.affection, 5);
});

test('checkpoint before the legacy correction still receives its absolute target', async () => {
    const state = baselineState('v074-before-correction', shortChat, [legacyNpc({ values: rel(20) })]);
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(0);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(20, 5));
});

test('a genuinely newer same-axis manual correction supersedes the migrated legacy correction', async () => {
    const state = stateWithLegacyStoryGain('v074-newer-wins');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    await h.engine.updateNpc('sora', { relationship: { trust: 25 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    assert.equal(h.persisted().npcs[0].relationship.trust, 25);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.value, 25);
    assert.equal(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, undefined);
});

test('independent axes preserve legacy story gain across differing migration and edit order', async () => {
    const state = stateWithLegacyStoryGain('v074-axis-order', { axis: 'affection', corrected: 11, gained: 12 });
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { trust: 7 } });
    await h.engine.updateNpc('sora', { relationship: { desire: 3 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(7, 12, 3, 0));
});

test('legacy-to-modern rollback remains idempotent through repeated reconciliation and reload', async () => {
    const state = stateWithLegacyStoryGain('v074-idempotent');
    const h = harness(state, longChat);
    await h.engine.loadChat(h.key);
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    h.context.chat.splice(4);
    await h.engine.reconcileBranch();
    await h.engine.reconcileBranch();
    assert.deepEqual(h.persisted().npcs[0].relationship, rel(21, 5));
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(loaded.npcs[0].relationship, rel(21, 5));
});

test('v0.7.3 migrated records without origin metadata are bridged conservatively and repaired', async () => {
    let state = stateWithLegacyStoryGain('v074-v073-bridge');
    const legacyCheckpointNpc = structuredClone(state.npcs[0]);
    const identityAt = legacyCheckpointNpc.manualOverrideMeta.relationship.at;
    const liveNpc = normalizeNpc({
        ...legacyCheckpointNpc,
        relationship: rel(21, 5),
        manualOverrides: {}, manualOverrideMeta: {},
        manualRelationshipCorrectionRevision: 2,
        manualRelationshipCorrections: [
            { axis: 'trust', value: 20, revision: 1, sourceMessageId: 1, at: identityAt },
            { axis: 'affection', value: 5, revision: 2, sourceMessageId: 5, at: 500 },
        ],
    });
    state.npcs = [liveNpc];
    state = recordCheckpoint(state, longChat, 5, 'v073-live');
    const h = harness(normalizeState(state, state.chatKey), longChat.slice(0, 4));
    await h.engine.loadChat(h.key);
    const rolled = await h.engine.reconcileBranch();
    assert.equal(rolled.ok, true);
    assert.equal(h.persisted().npcs[0].relationship.trust, 21);
    assert.match(correctionMap(h.persisted().npcs[0]).trust.legacyOriginKey, /^legacy-v1\|trust\|/);
});

test('confirming all four ambiguous axes separately resolves the block and keeps every value', async () => {
    const state = baselineState('v074-all-confirmed', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    assert.deepEqual(unresolved(h.persisted().npcs[0]), ['trust', 'affection', 'desire', 'tension']);
    await confirmAll(h.engine);
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.status, 'safe');
    assert.deepEqual(persisted.npcs[0].relationship, rel(20, 5, 3, 2));
    assert.deepEqual(unresolved(persisted.npcs[0]), []);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.npcs[0].manualOverrides, 'relationship'), false);
    assert.deepEqual(Object.keys(correctionMap(persisted.npcs[0])).sort(), ['affection', 'desire', 'tension', 'trust']);
});

test('confirming an unchanged value still resolves exactly that ambiguous axis', async () => {
    const state = baselineState('v074-unchanged-confirm', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    const result = await h.engine.updateNpc('sora', { relationship: { trust: 0 } });
    assert.equal(result.ok, true);
    const npc = h.persisted().npcs[0];
    assert.equal(correctionMap(npc).trust.value, 0);
    assert.deepEqual(unresolved(npc), ['affection', 'desire', 'tension']);
    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('partial confirmation keeps exact unresolved axes through persistence and reload', async () => {
    const state = baselineState('v074-partial-reload', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(unresolved(loaded.npcs[0]), ['affection', 'desire', 'tension']);
    assert.equal(loaded.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('current-format manual events and display-history trimming cannot erase remaining uncertainty', async () => {
    const state = baselineState('v074-history-independent', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat, { settings: { relationshipHistoryLimit: 1 } });
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    await h.engine.updateNpc('sora', { relationship: { affection: 5 } });
    const npc = h.persisted().npcs[0];
    assert.equal(npc.relationshipHistory.length <= 1, true);
    assert.deepEqual(unresolved(npc), ['desire', 'tension']);
    const reload = h.reload();
    const loaded = await reload.loadChat(h.key);
    assert.deepEqual(unresolved(loaded.npcs[0]), ['desire', 'tension']);
});

test('resolving every axis for one NPC does not approve another unresolved NPC', async () => {
    const sora = legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false });
    const ryu = legacyNpc({ values: rel(9, 8, 7, 6), includeEvent: false, id: 'ryu', name: 'Ryu' });
    const state = baselineState('v074-other-npc', shortChat, [sora, ryu]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await confirmAll(h.engine, 'sora', rel(20, 5, 3, 2));
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'manual-relationship-correction-uncertain');
    assert.match(persisted.branchSafety.reason, /Ryu/);
    assert.deepEqual(unresolved(persisted.npcs.find(npc => npc.id === 'ryu')), ['trust', 'affection', 'desire', 'tension']);
});

test('completed correction remediation preserves surviving suffix recovery requirement', async () => {
    const surviving = longChat.slice(0, 4);
    const npc = legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false });
    let state = baselineState('v074-suffix', shortChat, [npc]);
    state.branchHeadLineage = ['stale'];
    const h = harness(state, surviving);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    await confirmAll(h.engine);
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'suffix-recovery-required');
    assert.equal(persisted.recovery?.status, 'paused');
    assert.deepEqual(persisted.npcs[0].relationship, rel(20, 5, 3, 2));
});

test('persistence conflict during axis confirmation leaves durable state at the prior uncertainty boundary', async () => {
    const state = baselineState('v074-confirm-conflict', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    let fail = false;
    const h = harness(state, shortChat, { failPredicate: () => fail });
    await enterUncertainty(h);
    fail = true;
    const result = await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'correction-remediation-persistence-failed');
    assert.equal(result.persistenceFailed, true);
    const persisted = h.persisted();
    assert.deepEqual(unresolved(persisted.npcs[0]), ['trust', 'affection', 'desire', 'tension']);
    assert.equal(correctionMap(persisted.npcs[0]).trust, undefined);
    assert.equal(persisted.branchSafety.kind, 'manual-relationship-correction-uncertain');
});

test('history change during confirmation keeps the user correction but blocks the superseded timeline honestly', async () => {
    const state = baselineState('v074-confirm-history-shift', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    let defer = false;
    const h = harness(state, shortChat, { deferPredicate: payload => defer && payload?.state?.npcs?.[0]?.manualRelationshipCorrections?.some(item => item.axis === 'trust') });
    await enterUncertainty(h);
    defer = true;
    const pending = h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    await h.deferredStarted;
    h.context.chat.push({ is_user: true, mes: 'new branch' }, { mes: 'new assistant' });
    h.releaseDeferred();
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.needsReconcile, true);
    assert.equal(result.reason, 'history-changed-during-user-owned-save');
    const persisted = h.persisted();
    assert.equal(persisted.branchSafety.kind, 'commit-history-changed');
    assert.equal(correctionMap(persisted.npcs[0]).trust.value, 20);
    assert.deepEqual(unresolved(persisted.npcs[0]), ['affection', 'desire', 'tension']);
});

test('explicit clear-all correction ownership remains distinct and cannot resurrect legacy state later', async () => {
    const state = baselineState('v074-clear-all', shortChat, [legacyNpc({ values: rel(20, 5, 3, 2), includeEvent: false })]);
    const h = harness(state, shortChat);
    await enterUncertainty(h);
    await h.engine.updateNpc('sora', { relationship: { trust: 20 } });
    const cleared = await h.engine.clearManualRelationshipCorrection('sora');
    assert.equal(cleared.ok, true);
    let persisted = h.persisted();
    assert.equal(persisted.branchSafety.status, 'safe');
    assert.deepEqual(persisted.npcs[0].manualRelationshipCorrections, []);
    assert.deepEqual(unresolved(persisted.npcs[0]), []);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.npcs[0].manualOverrides, 'relationship'), false);
    assert.deepEqual(persisted.npcs[0].relationship, rel());
    const reload = h.reload();
    await reload.loadChat(h.key);
    await reload.reconcileBranch();
    persisted = h.persisted();
    assert.deepEqual(persisted.npcs[0].relationship, rel());
    assert.deepEqual(persisted.npcs[0].manualRelationshipCorrections, []);
});
'''
write('tests/v074-correction-lineage-remediation.test.mjs', test_file)

print('Applied v0.7.4 correction lineage/remediation patch.')

from pathlib import Path

ROOT = Path('.')

def read(path): return (ROOT / path).read_text()
def write(path, text): (ROOT / path).write_text(text)
def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    write(path, text.replace(old, new, 1))

# Consolidate candidate/residual legacy-axis inference behind one compatibility helper.
replace_once(
    'src/branches.js',
    """function legacyRelationshipCandidateAxes(npc = {}, ownedAxes = new Set()) {
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
}
""",
    """function legacyRelationshipEvidenceAxes(npc = {}, ownedAxes = new Set(), { matchedEvent = null, fallbackAll = false } = {}) {
    const stored = relationshipCorrectionUnresolvedAxes(npc);
    if (stored.length) return stored.filter(axis => !ownedAxes.has(axis));
    const matchedKey = matchedEvent ? manualRelationshipEventKey(matchedEvent) : '';
    const axes = new Set();
    for (const event of legacyManualRelationshipEvents(npc)) {
        if (matchedKey && manualRelationshipEventKey(event) === matchedKey) continue;
        for (const axis of manualRelationshipEventAxes(event)) if (!ownedAxes.has(axis)) axes.add(axis);
    }
    // Missing provenance is conservative: a current-format confirmation event cannot prove
    // that an unrepresented legacy axis was never part of the old whole-object override.
    if (fallbackAll && !axes.size) for (const axis of RELATIONSHIP_AXES) if (!ownedAxes.has(axis)) axes.add(axis);
    return RELATIONSHIP_AXES.filter(axis => axes.has(axis));
}

function legacyRelationshipCandidateAxes(npc = {}, ownedAxes = new Set()) {
    return legacyRelationshipEvidenceAxes(npc, ownedAxes, { fallbackAll: true });
}

function legacyRelationshipResidualAxes(npc = {}, matchedEvent = null, ownedAxes = new Set()) {
    return legacyRelationshipEvidenceAxes(npc, ownedAxes, { matchedEvent });
}
"""
)

# A persisted unresolved set is itself authoritative remediation state. Do not silently
# discard it merely because legacy whole-object metadata is already absent.
replace_once(
    'src/branches.js',
    """    if (!hasLegacyRelationshipOverride(npc)) {
        if (relationshipCorrectionUnresolvedAxes(npc).length) {
            const next = structuredClone(npc);
            next.manualRelationshipCorrectionUnresolvedAxes = [];
            npc = normalizeNpc(next);
        }
        return { npc, migratedAxes: [], limitations: [] };
    }
""",
    """    if (!hasLegacyRelationshipOverride(npc)) {
        const unresolvedAxes = relationshipCorrectionUnresolvedAxes(npc);
        return {
            npc,
            migratedAxes: [],
            limitations: unresolvedAxes.length
                ? [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', unresolvedAxes)]
                : [],
        };
    }
"""
)

replace_once(
    'src/branches.js',
    """function preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    if (!hasLegacyRelationshipOverride(liveNpc)) return { npc: restoredNpc, limitations: [] };
    const modernAxes = new Set(relationshipCorrectionState(liveNpc).corrections.map(item => item.axis));
""",
    """function preserveLegacyManualRelationshipEvents(restoredNpc, liveNpc, restoredOwnershipNpc = restoredNpc) {
    const storedUnresolved = relationshipCorrectionUnresolvedAxes(liveNpc);
    if (!hasLegacyRelationshipOverride(liveNpc)) {
        return {
            npc: restoredNpc,
            limitations: storedUnresolved.length
                ? [legacyCorrectionLimitation('legacy-relationship-correction-missing-axis-provenance', storedUnresolved)]
                : [],
        };
    }
    const modernAxes = new Set(relationshipCorrectionState(liveNpc).corrections.map(item => item.axis));
"""
)

# Contract: explicit confirmation/clear retires the unresolved state; metadata loss alone does not.
replace_once(
    'docs/core-contract.md',
    "Ambiguous legacy ownership is normalized into a bounded unresolved-axis set, independent of visible relationship history; explicit axis confirmation removes only that axis, including when the confirmed numeric value is unchanged.",
    "Ambiguous legacy ownership is normalized into a bounded unresolved-axis set, independent of visible relationship history; that unresolved set remains authoritative until explicit axis confirmation or clear-all remediation removes it, including when legacy compatibility metadata is otherwise absent. Explicit confirmation removes only the selected axis, including when the confirmed numeric value is unchanged."
)

# Regression for the fail-closed persisted-unresolved invariant.
test_path = 'tests/v074-correction-lineage-remediation.test.mjs'
t = read(test_path)
anchor = "\ntest('explicit clear-all correction ownership remains distinct and cannot resurrect legacy state later', async () => {"
insert = r'''

test('persisted unresolved axes remain blocked if legacy compatibility metadata is absent', async () => {
    const current = normalizeNpc({
        id: 'sora', name: 'Sora', relationship: rel(),
        manualRelationshipCorrectionUnresolvedAxes: ['affection', 'tension'],
    });
    const state = baselineState('v074-unresolved-without-override', shortChat, [current]);
    const h = harness(state, []);
    await h.engine.loadChat(h.key);
    const blocked = await h.engine.reconcileBranch();
    assert.equal(blocked.reason, 'manual-relationship-correction-uncertain');
    assert.deepEqual(h.persisted().npcs[0].manualRelationshipCorrectionUnresolvedAxes, ['affection', 'tension']);
    assert.deepEqual(blocked.manualRelationshipLimitations[0].axes, ['affection', 'tension']);
});
'''
if anchor not in t:
    raise SystemExit('v074 test insertion anchor missing')
write(test_path, t.replace(anchor, insert + anchor, 1))

print('Applied v0.7.4 lean ownership cleanup.')

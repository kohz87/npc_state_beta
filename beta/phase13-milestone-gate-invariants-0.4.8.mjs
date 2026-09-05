import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');

const before = `function relationshipMilestoneEventQualifies(change, axis, threshold, caps = DEFAULT_RELATIONSHIP_CAPS) {
    const requiredImpact = RELATIONSHIP_MILESTONE_REQUIREMENTS[Number(threshold)] || 'extreme';
    if (relationshipImpactRank(change?.impact) < relationshipImpactRank(requiredImpact)) return false;
    const rawWeight = Math.abs(Number(change?.delta?.[axis]) || 0);
    const tierCap = Math.max(0, Number(caps?.[change?.impact] ?? DEFAULT_RELATIONSHIP_CAPS[change?.impact] ?? 0));
    const stockMinimum = Math.max(1, Number(RELATIONSHIP_MILESTONE_MIN_RAW[Number(threshold)]) || 1);
    const requiredRaw = tierCap > 0 ? Math.min(tierCap, stockMinimum) : stockMinimum;
    return rawWeight >= requiredRaw;
}`;

const after = `function relationshipMilestoneEventQualifies(change, axis, threshold) {
    const requiredImpact = RELATIONSHIP_MILESTONE_REQUIREMENTS[Number(threshold)] || 'extreme';
    if (relationshipImpactRank(change?.impact) < relationshipImpactRank(requiredImpact)) return false;
    const rawWeight = Math.abs(Number(change?.delta?.[axis]) || 0);
    // Milestone minima are evidence invariants. Relationship tier caps may constrain how
    // much raw evidence can be proposed, but must never silently make a gate easier.
    // If a configured cap is below a gate minimum, that gate remains unreachable until
    // an event/configuration can supply the required raw weight.
    const requiredRaw = Math.max(1, Number(RELATIONSHIP_MILESTONE_MIN_RAW[Number(threshold)]) || 1);
    return rawWeight >= requiredRaw;
}`;

if (!source.includes(before) && !source.includes(after)) {
    throw new Error('Missing relationship milestone qualifier expected from v0.4.7');
}
source = source.replace(before, after);
fs.writeFileSync(path, source);

console.log('Applied v0.4.8 invariant relationship milestone gates');

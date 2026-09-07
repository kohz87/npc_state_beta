export const DEFAULT_RELATIONSHIP_CAPS = Object.freeze({ ordinary: 1, meaningful: 2, major: 5, extreme: 10 });
export function normalizeRelationshipCaps(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(DEFAULT_RELATIONSHIP_CAPS).map(([impact, fallback]) => {
        const raw = source[impact] ?? fallback;
        const number = Number(raw);
        return [impact, Number.isFinite(number) ? Math.max(0, number) : fallback];
    }));
}
export const RELATIONSHIP_MILESTONE_THRESHOLDS = Object.freeze([25, 50, 75, 90]);
export const RELATIONSHIP_MILESTONE_REQUIREMENTS = Object.freeze({ 25: 'meaningful', 50: 'major', 75: 'extreme', 90: 'extreme' });
export const RELATIONSHIP_MILESTONE_MIN_RAW = Object.freeze({ 25: 1, 50: 3, 75: 5, 90: 8 });
export const RELATIONSHIP_AXIS_LIMITS = Object.freeze({ none: 0, ordinary: 1, meaningful: 2, major: 3, extreme: 4 });

export function relationshipImpactRank(value) {
    return RELATIONSHIP_AXIS_LIMITS[String(value || '').trim()] || 0;
}

export function relationshipMilestoneEventQualifies(change, axis, threshold) {
    const requiredImpact = RELATIONSHIP_MILESTONE_REQUIREMENTS[Number(threshold)] || 'extreme';
    if (relationshipImpactRank(change?.impact) < relationshipImpactRank(requiredImpact)) return false;
    const rawWeight = Math.abs(Number(change?.delta?.[axis]) || 0);
    // Milestone minima are evidence invariants. Relationship tier caps may constrain how
    // much raw evidence can be proposed, but must never silently make a gate easier.
    // If a configured cap is below a gate minimum, that gate remains unreachable until
    // an event/configuration can supply the required raw weight.
    const requiredRaw = Math.max(1, Number(RELATIONSHIP_MILESTONE_MIN_RAW[Number(threshold)]) || 1);
    return rawWeight >= requiredRaw;
}

export function relationshipInertiaFactor(currentValue, proposedDelta, impact = 'ordinary') {
    const current = Number(currentValue) || 0;
    const delta = Number(proposedDelta) || 0;
    if (!delta) return 0;
    const magnitude = Math.abs(current);
    const deepening = current === 0 || Math.sign(current) === Math.sign(delta);
    if (deepening) {
        const [first, second, third, fourth] = RELATIONSHIP_MILESTONE_THRESHOLDS;
        // Deepening difficulty is deliberately aligned to the same narrative bands as
        // the 25/50/75/90 milestone gates. Fractional progress carries between events.
        if (magnitude <= first) return 1;
        if (magnitude <= second) return 0.8;
        if (magnitude <= third) return 0.6;
        if (magnitude <= fourth) return 0.4;
        return 0.25;
    }
    // Moving back toward neutral remains easier than deepening. Impact-sensitive recovery
    // is intentionally preserved so a relationship can thaw or de-escalate naturally.
    if (impact === 'extreme') return 1;
    if (impact === 'major') {
        if (magnitude < 50) return 1;
        if (magnitude < 70) return 0.9;
        if (magnitude < 85) return 0.8;
        if (magnitude < 95) return 0.7;
        return 0.6;
    }
    if (impact === 'meaningful') {
        if (magnitude < 30) return 1;
        if (magnitude < 50) return 0.9;
        if (magnitude < 70) return 0.8;
        if (magnitude < 85) return 0.65;
        if (magnitude < 95) return 0.5;
        return 0.4;
    }
    if (magnitude < 30) return 1;
    if (magnitude < 50) return 0.85;
    if (magnitude < 70) return 0.7;
    if (magnitude < 85) return 0.55;
    if (magnitude < 95) return 0.4;
    return 0.3;
}

export function relationshipAxisLimit(impact) {
    return RELATIONSHIP_AXIS_LIMITS[impact] || 0;
}

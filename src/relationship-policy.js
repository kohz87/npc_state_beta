import { DEFAULT_RELATIONSHIP_CAPS, normalizeRelationshipCaps, RELATIONSHIP_AXIS_LIMITS, RELATIONSHIP_MILESTONE_THRESHOLDS, RELATIONSHIP_MILESTONE_REQUIREMENTS, RELATIONSHIP_MILESTONE_MIN_RAW } from './relationship-rules.js';
import { NUMERIC_SETTINGS, normalizeNumericSetting } from './settings-contract.js';

export const RELATIONSHIP_HISTORY_DEFAULT = NUMERIC_SETTINGS.relationshipHistoryLimit.default;
export const RELATIONSHIP_HISTORY_MIN = NUMERIC_SETTINGS.relationshipHistoryLimit.min;
export const RELATIONSHIP_HISTORY_MAX = NUMERIC_SETTINGS.relationshipHistoryLimit.max;

export function normalizeRelationshipHistoryLimit(value) {
    return normalizeNumericSetting('relationshipHistoryLimit', value);
}

export function trimRelationshipHistory(npc, limit = RELATIONSHIP_HISTORY_DEFAULT) {
    if (!npc || typeof npc !== 'object') return npc;
    const cap = normalizeRelationshipHistoryLimit(limit);
    const current = Array.isArray(npc.relationshipHistory) ? npc.relationshipHistory : [];
    if (current.length <= cap) return npc;
    const next = structuredClone(npc);
    next.relationshipHistory = current.slice(-cap);
    return next;
}

export function trimStateRelationshipHistory(state, limit = RELATIONSHIP_HISTORY_DEFAULT) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.npcs)) return state;
    const cap = normalizeRelationshipHistoryLimit(limit);
    let changed = false;
    const npcs = state.npcs.map(npc => {
        const next = trimRelationshipHistory(npc, cap);
        if (next !== npc) changed = true;
        return next;
    });
    if (!changed) return state;
    const next = structuredClone(state);
    next.npcs = npcs;
    return next;
}

export function relationshipJudgmentRubricPrompt() {
    return [
        'RELATIONSHIP JUDGMENT:',
        '- Judge only a genuinely NEW shift in THIS NPC toward the PLAYER from the CURRENT exchange. Established attitude/history is context, not fresh evidence; attribute actions/reactions to the correct person and target, and never infer mutual feelings.',
        '- Infer meaning semantically from narration and context; explicit emotion words are not required. Material ambiguity should reduce or zero a delta, but hypothetical alternatives do not veto clear evidence. Preserve negation, chronology, outcome, and conflicting reactions.',
        '- Axes are independent: Trust=confidence/reliance; Affection=warmth/liking/attachment; Desire=attraction/intimate interest; Tension=strain/charged friction (negative means greater ease). Do not spread a general impression across axes; one quote may support multiple axes only with distinct explanations.',
        '- Use modest raw deltas proportional to novelty/significance; impact caps are maxima, not targets. Judge increases/decreases symmetrically. Runtime applies caps, priority overflow, duplicate protection, inertia/fractional progress, and milestone gates, so do not pre-discount or inflate proposals.',
        '- Existing meters, summaries, qualitative lenses, prior explanations/history, and diagnostics are never fresh evidence for another change.',
        '- Every nonzero axis needs axisEvidence for that axis with 1-3 short VERBATIM excerpts from permitted CURRENT-exchange relationship evidence plus one concise explanation of the new shift. Quotes prove provenance, not emotional meaning; no long reasoning transcript or confidence score.',
    ].join('\n');
}

export function relationshipMechanicsPrompt(caps = DEFAULT_RELATIONSHIP_CAPS) {
    const effectiveCaps = normalizeRelationshipCaps(caps);
    const ceilings = Object.entries(effectiveCaps).map(([tier, cap]) => `${tier}: at most ${cap} raw points per supported axis, at most ${RELATIONSHIP_AXIS_LIMITS[tier]} supported axes`).join('; ');
    const gates = RELATIONSHIP_MILESTONE_THRESHOLDS.map(threshold => `${threshold} needs ${RELATIONSHIP_MILESTONE_REQUIREMENTS[threshold]}+ with raw ${RELATIONSHIP_MILESTONE_MIN_RAW[threshold]}`).join('; ');
    return [
        'RELATIONSHIP NUMERIC CONTRACT:',
        `- ${ceilings}. Ceilings are not targets; priority lists supported nonzero axes strongest-first for overflow only.`,
        `- Repeated aftermath/restatement is zero without a new relationship-changing development. Runtime outward gates are per axis/direction: ${gates}. Movement toward neutral is not gate-blocked; never inflate to force a gate.`,
        '- Raw deltas are pre-inertia evidence weights. Runtime applies depth resistance and retains fractional progress. Relationship Summary may describe accepted depth/context but is never evidence for a new delta.',
    ].join('\n');
}

export function relationshipCustomCriteriaPrompt(value, maxChars = 6000) {
    const text = String(value ?? '').trim().slice(0, Math.max(0, Number(maxChars) || 6000));
    if (!text) return '';
    return [
        'USER RELATIONSHIP CRITERIA (ADDITIVE CALIBRATION):',
        '- Apply the user-authored criteria as campaign-specific refinements. Preserve them as written, but do not let them replace the shared judgment rubric, current-exchange quotation contract, axis definitions, or deterministic numeric mechanics.',
        text,
    ].join('\n');
}

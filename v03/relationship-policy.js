export const RELATIONSHIP_HISTORY_DEFAULT = 8;
export const RELATIONSHIP_HISTORY_MIN = 1;
export const RELATIONSHIP_HISTORY_MAX = 24;

export function normalizeRelationshipHistoryLimit(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return RELATIONSHIP_HISTORY_DEFAULT;
    return Math.max(RELATIONSHIP_HISTORY_MIN, Math.min(RELATIONSHIP_HISTORY_MAX, number));
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
        'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:',
        '- NEW CHANGE & CONTINUITY: Decide whether THIS exchange supports a genuinely new relationship shift rather than merely displaying an established attitude, continuing an interaction, or repeating an already-scored consequence. Use established relationship context to understand what changed, never as fresh evidence. Continued interaction may still move when a genuinely new relationship-changing development occurs.',
        '- ATTRIBUTION: Evaluate THIS NPC toward the PLAYER only. Identify who acted, who reacted or experienced a response, and toward whom that response is directed. Do not transfer another character’s feelings or unrelated emotional changes onto this relationship, and do not infer mutual feelings from evidence about only one participant.',
        '- EVIDENCE & INFERENCE: Separate what the narration establishes from what you infer. Indirect behavior may justify movement; explicit emotion labels or relationship keywords are not required. Keep each explanation within what its quotations plus relevant context reasonably support. Avoid permanent, absolute, or broader claims when the evidence supports only a limited change.',
        '- AMBIGUITY WITHOUT FREEZING: Consider whether a plausible alternative explanation materially weakens the proposed relationship interpretation. Mere hypothetical alternatives are not vetoes. Clear contextual evidence should still receive movement; weak or materially ambiguous support should favor a smaller delta or zero.',
        '- AXIS INDEPENDENCE: Trust = confidence/reliance in the player; Affection = warmth/liking/attachment; Desire = attraction/intimate interest; Tension = interpersonal strain/charged friction, with negative Tension meaning greater ease/lower strain. Judge every axis and sign separately. Do not spread a general positive or negative impression across axes. One quotation may support multiple axes only when each has a distinct defensible explanation.',
        '- PROPORTIONALITY: Choose modest raw deltas proportionate to the strength, significance, and novelty of the supported shift. An impact-tier cap is a maximum, not a default target. Zero is appropriate when no new shift is supported; meaningful developments must not be suppressed merely because they are expressed indirectly. Runtime applies caps, axis limits, priority selection, duplicate protection, inertia, fractional progress, and milestone gates; do not manually apply those reductions a second time or inflate proposals to overcome them.',
        '- MIXED EVIDENCE & CHRONOLOGY: Consider conflicting reactions and how the exchange develops. A later response may qualify an earlier one without automatically erasing it. Propose the net supported change per axis. Do not cherry-pick only the strongest supporting sentence, ignore contradictory context, or turn mixed evidence into an automatic zero.',
        '- BALANCED DIRECTION: Apply comparable evidence standards to increases and decreases. A pleasant interaction does not automatically establish Affection, and an unpleasant interaction does not automatically establish dislike or distrust. Evaluate the particular axis and its sign correctly, especially Tension.',
        '- NO CIRCULAR JUSTIFICATION: Existing meter values, qualitative relationship lenses, generated relationship summaries, previous scanner explanations, diagnostics, and prior relationship history are context only. Never use them themselves as fresh evidence that another change occurred.',
        '- PER-AXIS RELATIONSHIP EVIDENCE: Every nonzero axis needs axisEvidence for that axis with 1-3 short VERBATIM excerpts copied from permitted CURRENT-exchange relationship evidence plus one concise explanation identifying the supported NEW change and its basis. Do not provide a long reasoning transcript, a checklist response for every rubric item, or a numerical confidence score. Context may guide interpretation but does not turn an earlier event into fresh evidence.',
        '- A quotation proves source provenance, not emotional meaning. Preserve who acted, negation, chronology, and outcome in quoted evidence. Runtime validates provenance/structure without keyword-gating the model’s relationship interpretation.',
    ].join('\n');
}

export function relationshipMechanicsPrompt() {
    return [
        'RELATIONSHIP NUMERIC CONTRACT:',
        '- ordinary: at most 1 raw point on at most 1 supported axis; meaningful: at most 2 per supported axis and at most 2 axes; major: at most 5 per supported axis and at most 3 axes; extreme: at most 10 per supported axis and at most 4 axes. These are ceilings, not targets.',
        '- priority orders only supported nonzero axes from strongest/most central to weakest so impact-tier overflow can be resolved. Do not list unsupported or zero axes.',
        '- RELATIONSHIP REPEATS AND GATES: repeated aftermath/restatement is zero unless a genuinely new relationship-changing development occurs. Runtime checkpoints outward depth at 25/50/75/90 independently by axis and direction: crossing 25 needs meaningful+, 50 major+ with raw 3, 75 extreme with raw 5, and 90 extreme relationship-defining with raw 8. Movement toward neutral is not gate-blocked. Never inflate impact/delta to force a gate.',
        '- Raw deltas are pre-inertia evidence weights. Runtime applies the existing depth resistance and retains accepted fractional progress; do not pre-discount raw deltas for inertia.',
        '- Relationship Summary may describe accepted depth/context, but it must not become evidence for a new delta or become deeper/more absolute than the accepted state supports.',
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

// Compatibility name retained for existing imports/tests; the helper now represents the full shared rubric.
export function relationshipAxisIndependencePrompt() {
    return relationshipJudgmentRubricPrompt();
}
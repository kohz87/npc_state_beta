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

export function relationshipAxisIndependencePrompt() {
    return [
        'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:',
        '- You interpret the narrative meaning. Deterministic runtime checks quotation provenance, structure, numeric limits, duplicate application, inertia, and milestone gates; it does NOT use keywords to decide whether your interpretation is emotionally correct.',
        '- For every exchange-active NPC, decide who acted, who experienced or expressed a reaction, and toward whom that reaction is directed. Distinguish events that actually occurred now from hypotheticals, negated events, remembered history, plans, proposals, or reports about someone else.',
        '- Judge what changed in THIS exchange. Score trust, affection, desire, and tension independently. Zero is explicitly allowed and is usually correct when no relationship movement is warranted.',
        '- Every nonzero axis MUST have axisEvidence for that axis: 1-3 short verbatim excerpt strings copied from permitted CURRENT-exchange relationship evidence, plus a concise explanation of why those narrated facts change THIS NPC on THAT axis toward the PLAYER.',
        '- One event may support multiple axes only when each axis has its own explanation. Reusing an excerpt is allowed when it genuinely supports more than one distinct judgment, but do not spread a general positive/negative impression across axes.',
        '- priority is an ordered list of the supported nonzero axes, strongest or most central first. It resolves impact-tier overflow; do not list unsupported or zero axes.',
        '- Financial/material relief does not automatically establish Trust or Affection. Intimacy does not automatically establish Desire toward the player. General relaxation does not automatically mean reduced interpersonal Tension toward the player. Grief or distress concerning another person must not be attributed to the player.',
        '- Private relationship thoughts may support an internal attitude when supplied as permitted relationship context, but private thought does not by itself prove a visible action, spoken line, gesture, or visible reaction.',
        '- A quotation proves source provenance only. Choose impact and modest deltas from your contextual judgment; do not inflate impact or deltas to force a milestone.',
        '- Repeated aftermath, restatement, or continued consequences of an already-scored event are zero unless a genuinely new relationship-changing event occurs.',
    ].join('\n');
}

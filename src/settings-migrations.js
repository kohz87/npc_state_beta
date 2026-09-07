const PRE_GATE_RELATIONSHIP_CRITERIA = `Relationship deltas measure only changes caused by the current USER+ASSISTANT exchange.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player.
Desire: attraction or intimate interest. Never infer it from friendliness, gratitude, beauty, proximity, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events should usually change 0-1 points. Meaningful events may change up to 2, major events up to 5, extreme life-defining events up to 10. Zero is correct when evidence is weak or merely repeated from earlier context.`;

const LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421 = `Relationship deltas measure only genuinely NEW changes caused by the current USER+ASSISTANT exchange. Routine continuation, repeated aftermath, greetings, neutral transactions, and already-scored beats are normally zero.
Trust: confidence in the player's reliability, honesty, competence, safety, or judgment. Trust is not obedience.
Affection: warmth, fondness, attachment, tenderness, or personal liking toward the player. Affection is not devotion, clinginess, jealousy, or self-erasure.
Desire: attraction or intimate interest. Positive Desire requires explicit attraction/romantic/intimate/physical evidence. Never infer it from friendliness, gratitude, beauty, rescue, proximity, trust, or generic affection.
Tension: interpersonal strain, fear, suspicion, anger, unresolved conflict, pressure, or charged friction.
Ordinary events may change up to 1 point on one supported axis. Meaningful events may change up to 2 per supported axis and at most two axes, major up to 5 and at most three axes, extreme up to 10 and at most four axes. Every moved axis needs its own concrete evidence. Raw deltas are evidence weights: deep established relationships gain further depth progressively more slowly, and accepted fractional evidence is retained behind the integer display. Do not replay the same event or its aftermath; semantically duplicate recent events score zero.
RELATIONSHIP MILESTONES: outward depth is gated independently by axis and direction at 25, 50, 75, and 90. Ordinary evidence may reach 25 but cannot deepen past a locked gate. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement back toward neutral is never checkpoint-blocked. Never inflate a tier or delta just to pass a gate.`;

// Match only known shipped defaults; user-authored criteria must survive upgrades.
export function migrateSettings(settings, defaultRelationshipCriteria) {
    if (settings.portraitPositivePrompt === undefined && settings.portraitGenerationPrompt !== undefined) {
        settings.portraitPositivePrompt = settings.portraitGenerationPrompt;
    }
    const criteria = String(settings.relationshipCriteria || '').trim();
    if ([PRE_GATE_RELATIONSHIP_CRITERIA, LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421].some(value => value.trim() === criteria)) {
        settings.relationshipCriteria = defaultRelationshipCriteria;
    }
}

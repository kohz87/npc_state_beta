// Offline semantic-evaluation fixtures extending the v0.4.22 relationship-judgment pack.
// These are NOT deterministic runtime expectations and are never consulted by production prompts
// or score validation. A live model evaluator should judge direction, axis choice, novelty,
// proportionality, and claim scope without requiring one exact numeric delta.

import {
    RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE as BASE_ACCEPTANCE,
    RELATIONSHIP_JUDGMENT_EVAL_FIXTURES as BASE_FIXTURES,
} from './relationship-judgment-eval-fixtures-0.4.22.mjs';

export const RELATIONSHIP_JUDGMENT_EVAL_FIXTURES = [
    ...BASE_FIXTURES,
    {
        id: 'desire-increase-clear-indirect',
        category: 'desire-increase',
        currentRelationship: { trust: 18, affection: 24, desire: 3, tension: -4 },
        priorContext: 'Both adults have been friendly for weeks, but no prior exchange established intimate interest.',
        currentExchange: 'After the others leave, Alina stays close enough that their knees touch, looks from Ren’s eyes to his mouth, and quietly asks whether he wants her to stay. When he says yes, she closes the remaining distance and kisses him.',
        acceptance: { class: 'clear-move', allowedAxes: ['desire'], preferredDirection: { desire: 'increase' }, note: 'New intimate/physical attraction is established by the exchange. A modest Desire increase is warranted without spreading automatically into Trust or deeper Affection claims.' },
    },
    {
        id: 'desire-decrease-clear',
        category: 'desire-decrease',
        currentRelationship: { trust: 20, affection: 18, desire: 31, tension: 2 },
        priorContext: 'Mira and Cal are adults; Mira had previously welcomed flirtation and physical closeness from Cal.',
        currentExchange: 'When Cal leans in as he has before, Mira puts a hand between them and steps back. “I thought I wanted this,” she says, “but I don’t.” She moves her chair away and does not resume the flirting.',
        acceptance: { class: 'clear-move', allowedAxes: ['desire'], preferredDirection: { desire: 'decrease' }, note: 'The current exchange supports reduced intimate interest. Do not convert this automatically into distrust, hatred, or a permanent end to all affection.' },
    },
    {
        id: 'affection-decrease-clear',
        category: 'affection-decrease',
        currentRelationship: { trust: 27, affection: 36, desire: 0, tension: 1 },
        priorContext: 'Jorin has been personally warm toward Pela and keeps a small token she made for him.',
        currentExchange: 'Pela laughs at Jorin’s private grief in front of the others. Jorin goes still, takes her carved token from his pocket, sets it on the table in front of her, and spends the rest of the meal speaking to everyone except her.',
        acceptance: { class: 'clear-move', allowedAxes: ['affection'], preferredDirection: { affection: 'decrease' }, note: 'The withdrawal of personal warmth and symbolic rejection supports an Affection decrease. The fixture does not require distrust unless separate reliability/safety evidence supports it.' },
    },
    {
        id: 'desire-material-ambiguity-small-or-zero',
        category: 'desire-ambiguity',
        currentRelationship: { trust: 8, affection: 7, desire: 0, tension: 0 },
        priorContext: 'Seren is an adult court tailor whose work requires close visual inspection and frequent appearance compliments.',
        currentExchange: 'Seren circles Davin once, adjusts the fall of his collar, lets her gaze linger for a beat, and says the cut suits him unusually well before returning to her measurements.',
        acceptance: { class: 'ambiguous-small-or-zero', allowedAxes: ['desire'], preferredDirection: { desire: 'increase-or-zero' }, note: 'The lingering attention can plausibly carry personal attraction, but professional context materially weakens that reading. Zero or a very small Desire increase may be defensible; certainty or multi-axis movement is not.' },
    },
    {
        id: 'unchanged-negative-attitude-zero',
        category: 'unchanged-attitude',
        currentRelationship: { trust: -22, affection: -14, desire: 0, tension: 19 },
        priorContext: 'Tessa already distrusts and dislikes Orren after an earlier betrayal that was scored when it happened.',
        currentExchange: 'Orren passes through the room without addressing Tessa. She gives him the same cold look she has given him since the betrayal, then returns to sharpening her knife. Nothing new occurs between them.',
        acceptance: { class: 'justified-zero', allowedAxes: [], note: 'Existing negative attitudes are displayed but no new relationship-changing development occurs. Do not score another decrease merely because the established hostility remains visible.' },
    },
];

export const RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE = Object.freeze({
    ...BASE_ACCEPTANCE,
    semanticCoverage: 'Includes Desire increase/decrease, Affection decrease, materially ambiguous attraction, and unchanged established attitudes in addition to the v0.4.22 calibration set.',
});

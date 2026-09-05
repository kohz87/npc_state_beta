// Local evidence checks are conservative lexical guards, not semantic entailment.
// Keep negation and outcomes intact instead of treating the whole exchange as a bag of words.
function normalized(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase()
        .replace(/[’']/g, "'").replace(/\b(can't|cannot)\b/g, 'can not')
        .replace(/n't\b/g, ' not').replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'is', 'was', 'does', 'did', 'do', 'has', 'had', 'have', 'not', 'no', 'never']);
function tokens(value) {
    return normalized(value).split(' ').filter(word => word && !STOP.has(word)).map(word =>
        ({ trusts: 'trust', trusted: 'trust', keeps: 'keep', kept: 'keep', breaks: 'break', broke: 'break', broken: 'break' })[word] || word);
}
function negated(value) { return /\b(not|no|never|without|neither|refus\w*|deny|denies|denied|denying)\b/.test(normalized(value)); }
const OPPOSITES = [
    [/\bkeep\w*\b|\bkept\b/, /\bbreak\w*\b|\bbroke\w*\b/],
    [/\btrust\w*\b/, /\bdistrust\w*\b/],
    [/\baccept\w*\b/, /\breject\w*\b/],
    [/\bprotect\w*\b/, /\battack\w*\b/],
    [/\breturn\w*\b/, /\bsteal\w*\b|\bstole\w*\b/],
    [/\bhonest\w*\b|\btruth\w*\b/, /\blie[sd]?\b|\blying\b|\bdeceiv\w*\b/],
];

export function relationshipOutcomesConflict(left, right) {
    const a = normalized(left), b = normalized(right);
    if (negated(a) !== negated(b)) return true;
    return OPPOSITES.some(([positive, negative]) =>
        (positive.test(a) && !negative.test(a) && negative.test(b) && !positive.test(b))
        || (negative.test(a) && !positive.test(a) && positive.test(b) && !negative.test(b)));
}

export function relationshipEvidenceGrounding(evidence, context) {
    const proof = normalized(evidence);
    if (!proof || !String(context || '').trim()) return 'ungrounded';
    const proofTokens = tokens(proof);
    if (!proofTokens.length) return 'ungrounded';
    const candidates = String(context).slice(0, 40000).split(/[.!?;\n]+|\b(?:but|however|although)\b/i)
        .map(clause => {
            const words = new Set(tokens(clause));
            const overlap = proofTokens.filter(word => words.has(word)).length / proofTokens.length;
            return { clause, overlap };
        }).sort((a, b) => b.overlap - a.overlap);
    const best = candidates[0]?.overlap || 0;
    if (best < 0.6) return 'ungrounded';
    // Equally strong conflicting clauses are ambiguous. Ask the scanner to quote
    // the actual event precisely instead of selecting a convenient overlapping clause.
    const matches = candidates.filter(item => item.overlap >= Math.max(0.6, best - 0.05));
    if (matches.some(item => relationshipOutcomesConflict(proof, item.clause))) return 'contradictory';
    return '';
}

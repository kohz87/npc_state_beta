// Local evidence checks are conservative lexical guards, not semantic entailment.
// Keep negation scoped to the relationship predicate and verify actor direction when known.
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

const NEGATION = new Set(['not', 'no', 'never', 'neither', 'refuse', 'refuses', 'refused', 'deny', 'denies', 'denied']);
const OPPOSITES = [
    [/\bkeep\w*\b|\bkept\b/, /\bbreak\w*\b|\bbroke\w*\b/],
    [/\btrust\w*\b/, /\bdistrust\w*\b/],
    [/\baccept\w*\b/, /\breject\w*\b/],
    [/\bprotect\w*\b/, /\battack\w*\b/],
    [/\breturn\w*\b/, /\bsteal\w*\b|\bstole\w*\b/],
    [/\bhonest\w*\b|\btruth\w*\b/, /\blie[sd]?\b|\blying\b|\bdeceiv\w*\b/],
];

function localNegated(text, index, length) {
    const wordsBefore = text.slice(0, index).trim().split(/\s+/).filter(Boolean).slice(-4);
    const wordsAfter = text.slice(index + length).trim().split(/\s+/).filter(Boolean).slice(0, 3);
    return wordsBefore.some(word => NEGATION.has(word))
        || wordsAfter.some((word, i) => NEGATION.has(word) && i <= 1);
}

function patternPolarities(value, pattern, basePolarity) {
    const text = normalized(value);
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matcher = new RegExp(pattern.source, flags);
    const out = new Set();
    for (const match of text.matchAll(matcher)) {
        const polarity = localNegated(text, match.index || 0, match[0].length) ? -basePolarity : basePolarity;
        out.add(polarity);
    }
    return out;
}

export function relationshipOutcomesConflict(left, right) {
    for (const [positive, negative] of OPPOSITES) {
        const a = new Set([...patternPolarities(left, positive, 1), ...patternPolarities(left, negative, -1)]);
        const b = new Set([...patternPolarities(right, positive, 1), ...patternPolarities(right, negative, -1)]);
        if ((a.has(1) && b.has(-1)) || (a.has(-1) && b.has(1))) return true;
    }
    return false;
}

const DIRECTIONAL_RELATIONSHIP_CUE = /\b(?:trust\w*|distrust\w*|love\w*|like\w*|hate\w*|desir\w*|want\w*|admire\w*|resent\w*|fear\w*|rely\w*|depend\w*|respect\w*|care\w*)\b/gi;
function normalizedNames(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values]).map(normalized).filter(Boolean))];
}
function phraseBefore(text, phrase, index) {
    const found = text.lastIndexOf(phrase, index);
    return found >= 0 && found < index;
}
function phraseAfter(text, phrase, index) {
    return text.indexOf(phrase, index) >= index;
}
function directionConflict(value, expectations = {}) {
    const text = normalized(value);
    const subjects = normalizedNames(expectations.subjectNames);
    const objects = normalizedNames(expectations.objectNames);
    if (!text || !subjects.length) return false;
    const cues = [...text.matchAll(new RegExp(DIRECTIONAL_RELATIONSHIP_CUE.source, 'gi'))];
    if (!cues.length) return false;
    let sawExpected = false;
    let sawReverse = false;
    for (const cue of cues) {
        const index = cue.index || 0;
        const afterIndex = index + cue[0].length;
        const subjectBefore = subjects.some(name => phraseBefore(text, name, index));
        const subjectAfter = subjects.some(name => phraseAfter(text, name, afterIndex));
        const objectBefore = objects.length && objects.some(name => phraseBefore(text, name, index));
        const objectAfter = objects.length && objects.some(name => phraseAfter(text, name, afterIndex));
        if (subjectBefore && (!objects.length || objectAfter)) sawExpected = true;
        if (subjectAfter && (objectBefore || !objects.length)) sawReverse = true;
    }
    if (sawExpected) return false;
    if (sawReverse) return true;
    // Even without a known player name, an NPC name appearing only after a directional
    // predicate is strong evidence that the statement is about someone else's attitude.
    const firstCue = cues[0]?.index || 0;
    const subjectBeforeAny = subjects.some(name => phraseBefore(text, name, firstCue));
    const subjectAfterAny = subjects.some(name => phraseAfter(text, name, firstCue));
    return !subjectBeforeAny && subjectAfterAny;
}

export function relationshipEvidenceGrounding(evidence, context, expectations = {}) {
    const proof = normalized(evidence);
    if (!proof || !String(context || '').trim()) return 'ungrounded';
    if (directionConflict(proof, expectations)) return 'wrong-direction';
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
    const matches = candidates.filter(item => item.overlap >= Math.max(0.6, best - 0.05));
    const directedMatches = matches.filter(item => !directionConflict(item.clause, expectations));
    if (matches.length && !directedMatches.length) return 'wrong-direction';
    if (directedMatches.some(item => relationshipOutcomesConflict(proof, item.clause))) return 'contradictory';
    return '';
}

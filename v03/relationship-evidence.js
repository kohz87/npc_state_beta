// Conservative lexical evidence guards. Relationship predicates are bound to the nearest
// known actor, and polarity is resolved inside the local predicate phrase.
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

const NEGATION = new Set(['not', 'no', 'never', 'neither', 'less', 'refuse', 'refuses', 'refused', 'deny', 'denies', 'denied']);
const LOCAL_BOUNDARIES = new Set(['and', 'but', 'yet', 'while', 'whereas', 'although', 'however', 'because', 'as', 'then']);
function localWordsBefore(text, index) {
    const words = text.slice(0, index).trim().split(/\s+/).filter(Boolean);
    let start = Math.max(0, words.length - 6);
    for (let i = words.length - 1; i >= start; i -= 1) {
        if (LOCAL_BOUNDARIES.has(words[i])) { start = i + 1; break; }
    }
    return words.slice(start);
}
function localWordsAfter(text, index) {
    const words = text.slice(index).trim().split(/\s+/).filter(Boolean).slice(0, 4);
    const boundary = words.findIndex(word => LOCAL_BOUNDARIES.has(word));
    return boundary >= 0 ? words.slice(0, boundary) : words;
}
function localNegated(text, index, length) {
    const before = localWordsBefore(text, index);
    const after = localWordsAfter(text, index + length);
    if (before.some(word => NEGATION.has(word))) return true;
    if (before.length >= 2 && before.at(-2) === 'no' && before.at(-1) === 'longer') return true;
    return after.slice(0, 2).some(word => NEGATION.has(word));
}
function patternPolarities(value, pattern, basePolarity) {
    const text = normalized(value);
    return patternPolaritiesInText(text, pattern, basePolarity);
}
function patternPolaritiesInText(text, pattern, basePolarity) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matcher = new RegExp(pattern.source, flags);
    const out = new Set();
    for (const match of text.matchAll(matcher)) {
        const polarity = localNegated(text, match.index || 0, match[0].length) ? -basePolarity : basePolarity;
        out.add(polarity);
    }
    return out;
}

const OPPOSITES = [
    [/\bkeep\w*\b|\bkept\b/, /\bbreak\w*\b|\bbroke\w*\b/],
    [/\btrust\w*\b/, /\bdistrust\w*\b|\bmistrust\w*\b/],
    [/\blove\w*\b|\blike\w*\b|\bcare\w*\b|\bfond\w*\b|\baffection\w*\b/, /\bhate\w*\b|\bdislike\w*\b|\bloath\w*\b|\bdetest\w*\b|\baversion\w*\b/],
    [/\baccept\w*\b/, /\breject\w*\b/],
    [/\bprotect\w*\b/, /\battack\w*\b/],
    [/\breturn\w*\b/, /\bsteal\w*\b|\bstole\w*\b/],
    [/\bhonest\w*\b|\btruth\w*\b/, /\blie[sd]?\b|\blying\b|\bdeceiv\w*\b/],
];
export function relationshipOutcomesConflict(left, right) {
    for (const [positive, negative] of OPPOSITES) {
        const a = new Set([...patternPolarities(left, positive, 1), ...patternPolarities(left, negative, -1)]);
        const b = new Set([...patternPolarities(right, positive, 1), ...patternPolarities(right, negative, -1)]);
        if ((a.has(1) && b.has(-1)) || (a.has(-1) && b.has(1))) return true;
    }
    return false;
}

const AXIS_POLARITY_CUES = Object.freeze({
    trust: [[/\btrust\w*\b|\brely\w*\b|\bdepend\w*\b|\bconfidence\w*\b/, 1], [/\bdistrust\w*\b|\bmistrust\w*\b|\bdoubt\w*\b|\bsuspect\w*\b/, -1]],
    affection: [[/\blove\w*\b|\blike\w*\b|\bcare\w*\b|\bfond\w*\b|\baffection\w*\b|\battach\w*\b|\bwarm\w*\b/, 1], [/\bhate\w*\b|\bdislike\w*\b|\bloath\w*\b|\bdetest\w*\b|\bresent\w*\b|\baversion\w*\b/, -1]],
    desire: [[/\bdesir\w*\b|\bwant\w*\b|\battract\w*\b|\blong\w*\b|\byearn\w*\b/, 1], [/\breject\w*\b|\bavoid\w*\b|\brepuls\w*\b|\baversion\w*\b|\bunattract\w*\b/, -1]],
    tension: [[/\btension\w*\b|\bstrain\w*\b|\bfear\w*\b|\bafraid\b|\bresent\w*\b|\bhostil\w*\b|\bangr\w*\b|\buneas\w*\b|\bwary\b|\bwariness\b/, 1], [/\bease\w*\b|\bsafe\w*\b|\bcalm\w*\b|\bcomfort\w*\b|\brelax\w*\b/, -1]],
});
const AXIS_COMPOSITES = Object.freeze({
    tension: [
        [/\b(?:tension|fear|strain|unease|wariness)\b(?:\s+\w+){0,3}\s+\b(?:eas\w*|lessen\w*|drop\w*|fad\w*|diminish\w*|relax\w*)\b/, -1],
        [/\bno\s+longer\s+(?:afraid|fearful|tense|wary|uneasy)\b/, -1],
        [/\b(?:more|increasingly)\s+(?:afraid|fearful|tense|wary|uneasy)\b/, 1],
    ],
});
function axisPolarities(value, axis) {
    const text = normalized(value);
    const observed = new Set();
    const chars = [...text];
    for (const [pattern, polarity] of AXIS_COMPOSITES[axis] || []) {
        const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
        const matcher = new RegExp(pattern.source, flags);
        for (const match of text.matchAll(matcher)) {
            observed.add(polarity);
            const start = match.index || 0;
            for (let i = start; i < start + match[0].length; i += 1) chars[i] = ' ';
        }
    }
    const remainder = chars.join('');
    for (const [pattern, base] of AXIS_POLARITY_CUES[axis] || []) {
        for (const polarity of patternPolaritiesInText(remainder, pattern, base)) observed.add(polarity);
    }
    return observed;
}
export function relationshipEvidencePolarityConflict(evidence, delta = {}) {
    for (const axis of Object.keys(AXIS_POLARITY_CUES)) {
        const direction = Math.sign(Number(delta?.[axis]) || 0);
        if (!direction) continue;
        const observed = axisPolarities(evidence, axis);
        if (!observed.size) continue;
        if (observed.size !== 1 || !observed.has(direction)) return true;
    }
    return false;
}

const DIRECTIONAL_RELATIONSHIP_CUE = /\b(?:trust\w*|distrust\w*|mistrust\w*|love\w*|like\w*|hate\w*|dislike\w*|desir\w*|want\w*|admire\w*|resent\w*|fear\w*|rely\w*|depend\w*|respect\w*|care\w*)\b/gi;
function normalizedNames(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values]).map(normalized).filter(Boolean))];
}
function phrasePositions(text, phrase) {
    const out = [];
    if (!phrase) return out;
    let from = 0;
    while (from <= text.length - phrase.length) {
        const index = text.indexOf(phrase, from);
        if (index < 0) break;
        const beforeOk = index === 0 || text[index - 1] === ' ';
        const end = index + phrase.length;
        const afterOk = end === text.length || text[end] === ' ';
        if (beforeOk && afterOk) out.push(index);
        from = index + Math.max(1, phrase.length);
    }
    return out;
}
function nearestBefore(text, names, index) {
    let best = null;
    for (const entry of names) {
        for (const position of phrasePositions(text, entry.name)) {
            if (position >= index) break;
            if (!best || position > best.position) best = { ...entry, position };
        }
    }
    return best;
}
function nearestAfter(text, names, index) {
    let best = null;
    for (const entry of names) {
        for (const position of phrasePositions(text, entry.name)) {
            if (position < index) continue;
            if (!best || position < best.position) best = { ...entry, position };
            break;
        }
    }
    return best;
}
function directionConflict(value, expectations = {}) {
    const text = normalized(value);
    const subjects = normalizedNames(expectations.subjectNames).map(name => ({ name, kind: 'expected' }));
    const others = normalizedNames(expectations.otherSubjectNames)
        .filter(name => !subjects.some(item => item.name === name)).map(name => ({ name, kind: 'other' }));
    const objects = normalizedNames(expectations.objectNames).map(name => ({ name, kind: 'object' }));
    if (!text || !subjects.length) return false;
    const actors = [...subjects, ...others];
    const cues = [...text.matchAll(new RegExp(DIRECTIONAL_RELATIONSHIP_CUE.source, 'gi'))];
    if (!cues.length) return Boolean(others.length && others.some(item => phrasePositions(text, item.name).length) && !subjects.some(item => phrasePositions(text, item.name).length));
    let sawExpected = false;
    let sawOther = false;
    let sawReverse = false;
    for (const cue of cues) {
        const index = cue.index || 0;
        const afterIndex = index + cue[0].length;
        const actor = nearestBefore(text, actors, index);
        const objectAfter = nearestAfter(text, objects, afterIndex);
        const objectBefore = nearestBefore(text, objects, index);
        const subjectAfter = nearestAfter(text, subjects, afterIndex);
        const objectGrounded = !objects.length || (objectAfter && objectAfter.position - afterIndex <= 160);
        if (actor?.kind === 'expected' && objectGrounded) sawExpected = true;
        if (actor?.kind === 'other' && objectGrounded) sawOther = true;
        if (!actor && objectBefore && subjectAfter && index - objectBefore.position <= 160 && subjectAfter.position - afterIndex <= 160) sawReverse = true;
    }
    if (sawExpected) return false;
    return sawOther || sawReverse;
}

const RELATIONSHIP_SEMANTIC_GROUPS = Object.freeze([
    ['task', /\b(?:bount(?:y|ies)|contract|job|task|assignment|mission|errand|commission|order|request|duty|work)\b/i],
    ['completion', /\b(?:complet\w*|finish\w*|fulfill\w*|accomplish\w*|succeed\w*|successfully|done|carried?\s+out|turn(?:ed|s|ing)?\s+in)\b/i],
    ['delivery', /\b(?:deliver\w*|return\w*|brought\s+back|bring\w*\s+back|hand(?:ed|s|ing)?\s+over|laid\s+(?:down|out)|set\s+down|submit\w*|turn(?:ed|s|ing)?\s+in)\b/i],
    ['timeliness', /\b(?:prompt\w*|on\s+time|before\s+(?:the\s+)?(?:deadline|sundown|sunset|dusk|nightfall)|early|without\s+delay|quickly|swiftly)\b/i],
    ['quality', /\b(?:cleanly|correctly|properly|intact|whole|undamaged|unbroken|successful\w*|competence|competent|capab\w*|skill(?:ed|ful|fully)?|efficient\w*|professional\w*)\b/i],
    ['reliability', /\b(?:reliab\w*|dependab\w*|trustworth\w*|follow(?:ed|s|ing)?\s+through|came\s+through|comes\s+through|kept\s+(?:his|her|their|your|my|the)\s+word)\b/i],
    ['promise', /\b(?:promis\w*|vow\w*|commitment|committed|gave\s+(?:his|her|their|your|my)\s+word)\b/i],
    ['honesty', /\b(?:honest\w*|truthful\w*|told\s+the\s+truth|admit\w*|confess\w*)\b/i],
    ['protection', /\b(?:protect\w*|defend\w*|rescu\w*|sav(?:e|ed|es|ing)|shield\w*)\b/i],
    ['care-positive', /\b(?:kind\w*|care\w*|help\w*|aid\w*|assist\w*|support\w*|comfort\w*|tend\w*|nurs\w*|heal\w*|gift\w*|gave|gives|giving|lend\w*|share\w*)\b/i],
    ['care-negative', /\b(?:cruel\w*|mock\w*|insult\w*|humiliat\w*|belittl\w*|betray\w*|abandon\w*|hurt\w*|harm\w*|deceiv\w*|\blie\b|lied|lying)\b/i],
    ['threat', /\b(?:threat\w*|intimidat\w*|menac\w*|attack\w*|brandish\w*|hostil\w*|snarl\w*|yell\w*|shout\w*|corner\w*|coerc\w*)\b/i],
    ['reassurance', /\b(?:reassur\w*|de[- ]?escalat\w*|calm\w*|sooth\w*|relax\w*|comfort\w*|safe\w*|lower(?:ed|s|ing)?\s+(?:his|her|their|the)\s+(?:weapon|blade|voice))\b/i],
    ['failure', /\b(?:fail\w*|botch\w*|bungl\w*|late|overdue|miss(?:ed|es|ing)?\s+(?:the\s+)?deadline|damag\w*|broken|broke|lost|incomplete|incompetent|unreliable|careless\w*|negligen\w*)\b/i],
]);
const TRUST_PERFORMANCE_FAILURE = /\b(?:fail\w*|botch\w*|bungl\w*|late|overdue|miss(?:ed|es|ing)?\s+(?:the\s+)?deadline|damag\w*|broken|broke|lost|incomplete|incompetent|unreliable|careless\w*|negligen\w*)\b/i;
const RELATIONSHIP_SEMANTIC_EVENT_CUE = /\b(?:complet\w*|finish\w*|fulfill\w*|accomplish\w*|deliver\w*|return\w*|brought\s+back|bring\w*\s+back|hand(?:ed|s|ing)?\s+over|laid\s+(?:down|out)|set\s+down|submit\w*|turn(?:ed|s|ing)?\s+in|protect\w*|defend\w*|rescu\w*|sav(?:e|ed|es|ing)|promis\w*|vow\w*|kept\s+(?:his|her|their|your|my|the)\s+word|told\s+the\s+truth|gave|gives|giving|gift\w*|help\w*|aid\w*|assist\w*|support\w*|comfort\w*|tend\w*|nurs\w*|heal\w*|mock\w*|insult\w*|humiliat\w*|belittl\w*|betray\w*|abandon\w*|hurt\w*|harm\w*|threat\w*|intimidat\w*|menac\w*|attack\w*|brandish\w*|reassur\w*|de[- ]?escalat\w*|lower(?:ed|s|ing)?\s+(?:his|her|their|the)\s+(?:weapon|blade|voice)|fail\w*|botch\w*|bungl\w*)\b/i;

function relationshipSemanticGroups(value) {
    const text = normalized(value);
    const groups = new Set();
    for (const [name, pattern] of RELATIONSHIP_SEMANTIC_GROUPS) if (pattern.test(text)) groups.add(name);
    if ((groups.has('task') || groups.has('completion')) && (groups.has('completion') || groups.has('delivery')) && groups.has('timeliness')) groups.add('reliability');
    if (groups.has('promise') && groups.has('completion')) groups.add('reliability');
    if (groups.has('protection')) groups.add('care-positive');
    return groups;
}
function semanticSharedCount(left, right) {
    let count = 0;
    for (const value of left) if (right.has(value)) count += 1;
    return count;
}
function semanticContextWindows(value) {
    const clauses = String(value || '').slice(0, 40000).split(/[.!?;\n]+|\b(?:but|however|although)\b/i)
        .map(item => item.trim()).filter(Boolean);
    const windows = [...clauses];
    for (let index = 0; index + 1 < clauses.length; index += 1) windows.push(clauses[index] + ' ' + clauses[index + 1]);
    return [...new Set(windows)].slice(0, 160);
}
function semanticEventActorKind(value, expectations = {}) {
    const text = normalized(value);
    const match = RELATIONSHIP_SEMANTIC_EVENT_CUE.exec(text);
    RELATIONSHIP_SEMANTIC_EVENT_CUE.lastIndex = 0;
    if (!match) return '';
    const index = match.index || 0;
    const expected = normalizedNames(expectations.objectNames).map(name => ({ name, kind: 'expected' }));
    const others = normalizedNames([...(expectations.subjectNames || []), ...(expectations.otherSubjectNames || [])])
        .filter(name => !expected.some(item => item.name === name)).map(name => ({ name, kind: 'other' }));
    const actor = nearestBefore(text, [...expected, ...others], index);
    if (actor) return actor.kind;
    const prefix = text.slice(Math.max(0, index - 120), index);
    if (/\b(?:you|your|yourself)\b/.test(prefix)) return 'expected';
    return '';
}
function semanticMentionsTarget(value, expectations = {}) {
    const text = normalized(value);
    return normalizedNames(expectations.subjectNames).some(name => phrasePositions(text, name).length > 0);
}
function semanticMovingAxis(expectations = {}) {
    const delta = expectations.delta && typeof expectations.delta === 'object' ? expectations.delta : {};
    const moving = Object.entries(delta).filter(([axis, value]) => ['trust', 'affection', 'desire', 'tension'].includes(axis) && Number(value));
    if (moving.length !== 1) return null;
    return { axis: moving[0][0], direction: Math.sign(Number(moving[0][1])) };
}
function relationshipSemanticMatch(proof, clause, expectations = {}) {
    const movement = semanticMovingAxis(expectations);
    if (!movement || !movement.direction || movement.axis === 'desire') return false;
    if (!semanticMentionsTarget(clause, expectations)) return false;
    if (semanticEventActorKind(clause, expectations) !== 'expected') return false;

    const proofGroups = relationshipSemanticGroups(proof);
    const clauseGroups = relationshipSemanticGroups(clause);
    const shared = semanticSharedCount(proofGroups, clauseGroups);

    if (movement.axis === 'trust') {
        if (movement.direction > 0) {
            if (TRUST_PERFORMANCE_FAILURE.test(clause) || clauseGroups.has('care-negative') || clauseGroups.has('threat')) return false;
            const proofPerformance = (proofGroups.has('quality') && proofGroups.has('reliability'))
                || proofGroups.has('promise') || proofGroups.has('honesty') || proofGroups.has('protection');
            const concretePerformance = (clauseGroups.has('task') && (clauseGroups.has('completion') || clauseGroups.has('delivery'))
                && (clauseGroups.has('timeliness') || clauseGroups.has('quality') || clauseGroups.has('reliability')))
                || clauseGroups.has('promise') || clauseGroups.has('honesty') || clauseGroups.has('protection');
            return concretePerformance && (proofPerformance || shared >= 2);
        }
        const clauseBad = clauseGroups.has('failure') || clauseGroups.has('care-negative') || clauseGroups.has('threat');
        const proofBad = proofGroups.has('failure') || proofGroups.has('care-negative') || proofGroups.has('threat');
        return clauseBad && (proofBad || shared >= 1);
    }

    if (movement.axis === 'affection') {
        if (movement.direction > 0) {
            const clauseGood = clauseGroups.has('care-positive') || clauseGroups.has('protection');
            const proofGood = proofGroups.has('care-positive') || proofGroups.has('protection');
            return clauseGood && proofGood;
        }
        const clauseBad = clauseGroups.has('care-negative') || clauseGroups.has('threat');
        const proofBad = proofGroups.has('care-negative') || proofGroups.has('threat');
        return clauseBad && proofBad;
    }

    if (movement.axis === 'tension') {
        if (movement.direction > 0) {
            const clauseStrain = clauseGroups.has('threat') || clauseGroups.has('care-negative');
            const proofStrain = proofGroups.has('threat') || proofGroups.has('care-negative');
            return clauseStrain && proofStrain;
        }
        return clauseGroups.has('reassurance') && proofGroups.has('reassurance');
    }
    return false;
}
function relationshipSemanticGrounding(proof, context, expectations = {}) {
    for (const clause of semanticContextWindows(context)) {
        if (!relationshipSemanticMatch(proof, clause, expectations)) continue;
        // The clause is the causal player action, so reverse relationship-direction checks
        // do not apply here. Actor ownership + target mention bind the event instead.
        if (relationshipOutcomesConflict(proof, clause)) continue;
        return clause;
    }
    return '';
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
    if (best >= 0.6) {
        const matches = candidates.filter(item => item.overlap >= Math.max(0.6, best - 0.05));
        const directedMatches = matches.filter(item => !directionConflict(item.clause, expectations));
        if (matches.length && !directedMatches.length) return 'wrong-direction';
        if (directedMatches.some(item => relationshipOutcomesConflict(proof, item.clause))) return 'contradictory';
        return '';
    }
    if (relationshipSemanticGrounding(proof, context, expectations)) return '';
    return 'ungrounded';
}

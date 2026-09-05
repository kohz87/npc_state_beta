import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.16 relationship-grounding marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/relationship-evidence.js';
    let source = fs.readFileSync(path, 'utf8');
    const startMarker = 'export function relationshipEvidenceGrounding(evidence, context, expectations = {}) {';
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error('Missing 0.4.16 relationship-grounding section');

    const replacement = String.raw`const RELATIONSHIP_SEMANTIC_GROUPS = Object.freeze([
    ['task', /\b(?:bount(?:y|ies)|contract|job|task|assignment|mission|errand|commission|order|request|duty|work)\b/i],
    ['completion', /\b(?:complet\w*|finish\w*|fulfill\w*|accomplish\w*|succeed\w*|successfully|done|carried?\s+out|turn(?:ed|s|ing)?\s+in)\b/i],
    ['delivery', /\b(?:deliver\w*|return\w*|brought\s+back|bring\w*\s+back|hand(?:ed|s|ing)?\s+over|laid\s+(?:down|out)|set\s+down|submit\w*|turn(?:ed|s|ing)?\s+in)\b/i],
    ['timeliness', /\b(?:prompt\w*|on\s+time|before\s+(?:the\s+)?(?:deadline|sundown|sunset|dusk|nightfall)|early|without\s+delay|quickly|swiftly)\b/i],
    ['quality', /\b(?:cleanly|correctly|properly|intact|whole|undamaged|unbroken|successful\w*|competence|competent|capab\w*|skill(?:ed|ful|fully)?|efficient\w*|professional\w*)\b/i],
    ['reliability', /\b(?:reliab\w*|dependab\w*|trustworth\w*|follow(?:ed|s|ing)?\s+through|came\s+through|comes\s+through|kept\s+(?:his|her|their|your|my|the)\s+word)\b/i],
    ['promise', /\b(?:promis\w*|vow\w*|commitment|committed|gave\s+(?:his|her|their|your|my)\s+word)\b/i],
    ['honesty', /\b(?:honest\w*|truthful\w*|told\s+the\s+truth|admit\w*|confess\w*)\b/i],
    ['protection', /\b(?:protect\w*|defend\w*|rescu\w*|sav(?:e|ed|es|ing)|shield\w*)\b/i],
]);
const TRUST_PERFORMANCE_FAILURE = /\b(?:fail\w*|botch\w*|bungl\w*|late|overdue|miss(?:ed|es|ing)?\s+(?:the\s+)?deadline|damag\w*|broken|broke|lost|incomplete|incompetent|unreliable|careless\w*|negligen\w*)\b/i;
const RELATIONSHIP_SEMANTIC_EVENT_CUE = /\b(?:complet\w*|finish\w*|fulfill\w*|accomplish\w*|deliver\w*|return\w*|brought\s+back|bring\w*\s+back|hand(?:ed|s|ing)?\s+over|laid\s+(?:down|out)|set\s+down|submit\w*|turn(?:ed|s|ing)?\s+in|protect\w*|defend\w*|rescu\w*|sav(?:e|ed|es|ing)|kept\s+(?:his|her|their|your|my|the)\s+word|told\s+the\s+truth)\b/i;

function relationshipSemanticGroups(value) {
    const text = normalized(value);
    const groups = new Set();
    for (const [name, pattern] of RELATIONSHIP_SEMANTIC_GROUPS) if (pattern.test(text)) groups.add(name);
    if ((groups.has('task') || groups.has('completion')) && (groups.has('completion') || groups.has('delivery')) && groups.has('timeliness')) groups.add('reliability');
    if (groups.has('promise') && groups.has('completion')) groups.add('reliability');
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
function ordinaryTrustSemanticMatch(proof, clause, expectations = {}) {
    if (String(expectations.impact || '').trim().toLocaleLowerCase() !== 'ordinary') return false;
    const delta = expectations.delta && typeof expectations.delta === 'object' ? expectations.delta : {};
    const moving = Object.entries(delta).filter(([, value]) => Number(value));
    if (moving.length !== 1 || moving[0][0] !== 'trust' || Number(moving[0][1]) <= 0) return false;
    if (TRUST_PERFORMANCE_FAILURE.test(clause)) return false;
    if (semanticEventActorKind(clause, expectations) !== 'expected') return false;

    const proofGroups = relationshipSemanticGroups(proof);
    const clauseGroups = relationshipSemanticGroups(clause);
    if (semanticSharedCount(proofGroups, clauseGroups) >= 2) return true;

    const proofEvaluatesPerformance = proofGroups.has('quality') && proofGroups.has('reliability');
    const concretePerformance = clauseGroups.has('task')
        && (clauseGroups.has('completion') || clauseGroups.has('delivery'))
        && (clauseGroups.has('timeliness') || clauseGroups.has('quality'));
    return proofEvaluatesPerformance && concretePerformance;
}
function ordinaryTrustSemanticGrounding(proof, context, expectations = {}) {
    for (const clause of semanticContextWindows(context)) {
        if (!ordinaryTrustSemanticMatch(proof, clause, expectations)) continue;
        if (directionConflict(clause, expectations)) continue;
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
    if (ordinaryTrustSemanticGrounding(proof, context, expectations)) return '';
    return 'ungrounded';
}
`;

    source = source.slice(0, start) + replacement;
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext, {\n            subjectNames: npcEvidenceVariants(npc),\n            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n            otherSubjectNames: options.otherNpcNames || [],\n        });`,
        `        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext, {\n            subjectNames: npcEvidenceVariants(npc),\n            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n            otherSubjectNames: options.otherNpcNames || [],\n            impact: change.impact,\n            delta: change.delta,\n        });`,
        'relationship grounding impact/delta context',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.16 ordinary Trust semantic evidence grounding');

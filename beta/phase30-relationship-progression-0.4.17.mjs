import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.17 relationship-progression marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    const oldInertia = `function relationshipInertiaFactor(currentValue, proposedDelta, impact = 'ordinary') {\n    const current = Number(currentValue) || 0;\n    const delta = Number(proposedDelta) || 0;\n    if (!delta) return 0;\n    const magnitude = Math.abs(current);\n    const deepening = current === 0 || Math.sign(current) === Math.sign(delta);\n    if (deepening) {\n        if (magnitude < 30) return 1;\n        if (magnitude < 50) return 0.75;\n        if (magnitude < 70) return 0.5;\n        if (magnitude < 85) return 0.35;\n        if (magnitude < 95) return 0.2;\n        return 0.1;\n    }\n    if (impact === 'extreme') return 1;\n    if (impact === 'major') {\n        if (magnitude < 50) return 1;\n        if (magnitude < 70) return 0.9;\n        if (magnitude < 85) return 0.8;\n        if (magnitude < 95) return 0.7;\n        return 0.6;\n    }\n    if (impact === 'meaningful') {\n        if (magnitude < 30) return 1;\n        if (magnitude < 50) return 0.9;\n        if (magnitude < 70) return 0.8;\n        if (magnitude < 85) return 0.65;\n        if (magnitude < 95) return 0.5;\n        return 0.4;\n    }\n    if (magnitude < 30) return 1;\n    if (magnitude < 50) return 0.85;\n    if (magnitude < 70) return 0.7;\n    if (magnitude < 85) return 0.55;\n    if (magnitude < 95) return 0.4;\n    return 0.3;\n}`;
    const newInertia = `function relationshipInertiaFactor(currentValue, proposedDelta, impact = 'ordinary') {\n    const current = Number(currentValue) || 0;\n    const delta = Number(proposedDelta) || 0;\n    if (!delta) return 0;\n    const magnitude = Math.abs(current);\n    const deepening = current === 0 || Math.sign(current) === Math.sign(delta);\n    if (deepening) {\n        // Deepening difficulty is deliberately aligned to the same narrative bands as\n        // the 25/50/75/90 milestone gates. Fractional progress carries between events.\n        if (magnitude < 25) return 1;\n        if (magnitude < 50) return 0.8;\n        if (magnitude < 75) return 0.6;\n        if (magnitude < 90) return 0.4;\n        return 0.25;\n    }\n    // Moving back toward neutral remains easier than deepening. Impact-sensitive recovery\n    // is intentionally preserved so a relationship can thaw or de-escalate naturally.\n    if (impact === 'extreme') return 1;\n    if (impact === 'major') {\n        if (magnitude < 50) return 1;\n        if (magnitude < 70) return 0.9;\n        if (magnitude < 85) return 0.8;\n        if (magnitude < 95) return 0.7;\n        return 0.6;\n    }\n    if (impact === 'meaningful') {\n        if (magnitude < 30) return 1;\n        if (magnitude < 50) return 0.9;\n        if (magnitude < 70) return 0.8;\n        if (magnitude < 85) return 0.65;\n        if (magnitude < 95) return 0.5;\n        return 0.4;\n    }\n    if (magnitude < 30) return 1;\n    if (magnitude < 50) return 0.85;\n    if (magnitude < 70) return 0.7;\n    if (magnitude < 85) return 0.55;\n    if (magnitude < 95) return 0.4;\n    return 0.3;\n}`;
    source = replaceRequired(source, oldInertia, newInertia, 'deepening inertia curve');
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/relationship-evidence.js';
    let source = fs.readFileSync(path, 'utf8');
    const startMarker = 'const RELATIONSHIP_SEMANTIC_GROUPS = Object.freeze([';
    const groundingMarker = 'export function relationshipEvidenceGrounding(evidence, context, expectations = {}) {';
    const start = source.indexOf(startMarker);
    const grounding = source.indexOf(groundingMarker, start);
    if (start < 0 || grounding < 0) throw new Error('Missing 0.4.16 semantic grounding section');

    const semanticSection = String.raw`const RELATIONSHIP_SEMANTIC_GROUPS = Object.freeze([
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

`;

    source = source.slice(0, start) + semanticSection + source.slice(grounding);
    source = replaceRequired(
        source,
        `    if (ordinaryTrustSemanticGrounding(proof, context, expectations)) return '';`,
        `    if (relationshipSemanticGrounding(proof, context, expectations)) return '';`,
        'semantic grounding dispatch',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.17 aligned progression and semantic evidence grounding');

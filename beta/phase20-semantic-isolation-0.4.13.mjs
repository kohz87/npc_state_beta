import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.13 semantic-isolation marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.13 semantic-isolation section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// Scanner boundary: identity fields are strongly typed, and life-state evidence is target-bound.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    const parser = String.raw`function isPlainScannerObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function scannerStringArrayValid(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}
function scannerObjectArrayValid(value) {
    return Array.isArray(value) && value.every(isPlainScannerObject);
}
function scannerIdentityString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}
function scannerNpcArrayValid(value) {
    return scannerObjectArrayValid(value) && value.every(item => {
        const has = key => Object.prototype.hasOwnProperty.call(item, key);
        if (has('id') && typeof item.id !== 'string') return false;
        if (has('name') && typeof item.name !== 'string') return false;
        if (has('aliases') && (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === 'string'))) return false;
        const direct = scannerIdentityString(item.id) || scannerIdentityString(item.name);
        const alias = Array.isArray(item.aliases) && item.aliases.some(scannerIdentityString);
        return Boolean(direct || alias);
    });
}
function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false } = {}) {
    if (!isPlainScannerObject(parsed)) throw new Error('NPC State v0.4.13 recovery scanner JSON must be an object.');
    const has = key => Object.prototype.hasOwnProperty.call(parsed, key);
    const presentKey = has('inChatNpcIds') ? 'inChatNpcIds' : (has('finalPresentNpcIds') ? 'finalPresentNpcIds' : '');
    if (requireContract) {
        const invalid = [];
        if (!scannerStringArrayValid(parsed.exchangeActiveNpcIds)) invalid.push('exchangeActiveNpcIds[string]');
        if (!presentKey || !scannerStringArrayValid(parsed[presentKey])) invalid.push('inChatNpcIds[string]');
        if ((!allowOmittedSupplemental || has('worldActiveNpcIds')) && !scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');
        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-string-identity]');
        if ((!allowOmittedSupplemental || has('socialEdges')) && !scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');
        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');
        if (invalid.length) throw new Error('NPC State v0.4.13 recovery scanner JSON has invalid payload structure or members: ' + invalid.join(', ') + '.');
    }
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],
    };
}
`;
    source = replaceSection(source, 'function isPlainScannerObject(value) {', '\nexport function parseScanJson', parser, 'strict scanner identity types');

    const lifeHelpers = String.raw`const AFFIRMATIVE_DEATH_CUE = /\b(?:dies|died|dead|killed|slew|slain|murdered|lifeless|no pulse|stopped breathing|ceased breathing)\b/i;
const AFFIRMATIVE_LIVING_CUE = /\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|not dead|was not dead|did not die|never died|returns? alive|returned alive|emerges? alive|emerged alive)\b/i;
const LIFE_ASSERTION_BLOCKER = new Set(['if', 'unless', 'whether', 'might', 'may', 'could', 'would', 'will', 'shall', 'should', 'perhaps', 'possibly', 'maybe', 'likely', 'expected', 'expect', 'expects', 'predicted', 'predicts', 'almost', 'nearly', 'not', 'never']);
function lifeEvidenceText(value) {
    return String(value || '').normalize('NFKC')
        .replace(/[’]/g, "'")
        .replace(/\b(\w+)n['’]t\b/gi, '$1 not')
        .replace(/\s+/g, ' ')
        .trim();
}
function lifeEvidenceComparable(value) {
    return lifeEvidenceText(value).toLocaleLowerCase();
}
function lifeEvidenceKey(value) {
    return lifeEvidenceComparable(value).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function escapedLifeName(value) {
    return lifeEvidenceKey(value).split(/\s+/).filter(Boolean)
        .map(token => token.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('\\s+');
}
function lifeAssertionBlocked(text, index) {
    const prefix = text.slice(0, Math.max(0, index)).trim().split(/\s+/).filter(Boolean).slice(-6);
    return prefix.some(word => LIFE_ASSERTION_BLOCKER.has(word.replace(/[^\p{L}\p{N}]+/gu, '')));
}
function clauseAssertsNpcLiving(clause, variant) {
    const text = lifeEvidenceComparable(clause);
    const name = escapedLifeName(variant);
    if (!text || !name) return false;
    const patterns = [
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|remains|remained|appears|appeared)\\s+(?:still\\s+)?alive\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:(?:has|had)\\s+)?surviv(?:ed|es)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|has\\s+been|had\\s+been)\\s+(?:revived|resurrected)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:returns?|returned|emerges?|emerged)\\s+alive\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was)\\s+not\\s+dead\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:did|does)\\s+not\\s+die\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+never\\s+died\\b', 'i'),
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match && !lifeAssertionBlocked(text, match.index || 0)) return true;
    }
    return false;
}
function clauseAssertsNpcDeath(clause, variant) {
    const text = lifeEvidenceComparable(clause);
    const name = escapedLifeName(variant);
    if (!text || !name || clauseAssertsNpcLiving(clause, variant)) return false;
    const patterns = [
        new RegExp('\\b' + name + '\\b\\s+(?:(?:has|had)\\s+)?(?:died|dies)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|lay|lies|remained|remains|appeared|appears)\\s+(?:already\\s+)?(?:dead|lifeless)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:has|had)\\s+no\\s+pulse\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:stopped|ceased)\\s+breathing\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:was|is|has\\s+been|had\\s+been)\\s+(?:killed|slain|murdered)\\b', 'i'),
        new RegExp("\\b(?:killed|slew|slain|murdered)\\s+(?:the\\s+)?" + name + "\\b(?!\\s*'s\\b)", 'i'),
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match && !lifeAssertionBlocked(text, match.index || 0)) return true;
    }
    return false;
}
function npcLifeVariants(npc) {
    return [npc?.name, ...(npc?.aliases || [])].map(value => String(value || '').trim()).filter(Boolean);
}
function lifeEvidenceClauses(value) {
    return lifeEvidenceText(value).split(/[.!?;\n]+|\b(?:but|however|although|yet)\b/i).map(item => item.trim()).filter(Boolean);
}
function affirmativeDeathEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    const variants = npcLifeVariants(npc);
    if (!proof || !variants.length || !AFFIRMATIVE_DEATH_CUE.test(proof)) return false;
    if (!variants.some(value => clauseAssertsNpcDeath(proof, value))) return false;
    const clauses = lifeEvidenceClauses(context);
    if (!clauses.length) return true;
    return clauses.some(clause => variants.some(value => clauseAssertsNpcDeath(clause, value)) && profileEvidenceGrounded(proof, clause));
}
function affirmativeLivingReturnEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    const variants = npcLifeVariants(npc);
    if (!proof || !variants.length || !AFFIRMATIVE_LIVING_CUE.test(proof)) return false;
    if (!variants.some(value => clauseAssertsNpcLiving(proof, value))) return false;
    const clauses = lifeEvidenceClauses(context);
    if (!clauses.length) return true;
    return clauses.some(clause => variants.some(value => clauseAssertsNpcLiving(clause, value)) && profileEvidenceGrounded(proof, clause));
}

`;
    source = replaceSection(source, 'const AFFIRMATIVE_DEATH_CUE', '\nfunction applyLifeState', lifeHelpers, 'target-bound life-state assertions');
    const livingLine = `    const livingReturnCue = /\\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|not dead|wasn't dead|was not dead|death reports? (?:were|was) false|emerges? alive|returns? alive)\\b/i.test(lifeContext);`;
    source = replaceRequired(source, livingLine, `    const livingReturnCue = affirmativeLivingReturnEvidence(npc, reason, lifeContext);`, 'target-specific living return');
    fs.writeFileSync(path, source);
}

// Relationship evidence: bind the relationship predicate to its nearest named actor and
// scope polarity modifiers to that predicate rather than broad neighboring words.
{
    const path = 'v03/relationship-evidence.js';
    const source = String.raw`// Conservative lexical evidence guards. Relationship predicates are bound to the nearest
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
`;
    fs.writeFileSync(path, source);
}

// Structured import is a single-dossier operation and must not trigger global family derivation.
{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `                applyRelationship: false,\n                allowHistoricalProfilePatches: true,`,
        `                applyRelationship: false,\n                reconcileFamilyGraph: false,\n                allowHistoricalProfilePatches: true,`,
        'structured import family isolation',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.13 semantic evidence and import isolation');

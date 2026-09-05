import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.12 second-order marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.12 second-order section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// Transactional scanner preflight, target-specific death, relationship ownership/polarity,
// same-observation identity reservations, and scoped family reconciliation.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        `import { relationshipEvidenceGrounding, relationshipOutcomesConflict } from './relationship-evidence.js';`,
        `import { relationshipEvidenceGrounding, relationshipEvidencePolarityConflict, relationshipOutcomesConflict } from './relationship-evidence.js';`,
        'relationship polarity import',
    );

    const parser = String.raw`function isPlainScannerObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function scannerStringArrayValid(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}
function scannerObjectArrayValid(value) {
    return Array.isArray(value) && value.every(isPlainScannerObject);
}
function scannerNpcArrayValid(value) {
    return scannerObjectArrayValid(value) && value.every(item => {
        const direct = String(item?.id || item?.name || '').trim();
        const alias = Array.isArray(item?.aliases) && item.aliases.some(value => typeof value === 'string' && value.trim());
        return Boolean(direct || alias);
    });
}
function normalizeScanPayload(parsed, { requireContract = true } = {}) {
    if (!isPlainScannerObject(parsed)) throw new Error('NPC State v0.4.12 recovery scanner JSON must be an object.');
    const has = key => Object.prototype.hasOwnProperty.call(parsed, key);
    const presentKey = has('inChatNpcIds') ? 'inChatNpcIds' : (has('finalPresentNpcIds') ? 'finalPresentNpcIds' : '');
    if (requireContract) {
        const invalid = [];
        if (!scannerStringArrayValid(parsed.exchangeActiveNpcIds)) invalid.push('exchangeActiveNpcIds[string]');
        if (!presentKey || !scannerStringArrayValid(parsed[presentKey])) invalid.push('inChatNpcIds[string]');
        if (!scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');
        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-identity]');
        if (!scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');
        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');
        if (invalid.length) throw new Error('NPC State v0.4.12 recovery scanner JSON has invalid payload structure or members: ' + invalid.join(', ') + '.');
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
    source = replaceSection(source, 'function normalizeScanPayload(', '\nexport function parseScanJson', parser, 'transactional payload validator');
    source = replaceRequired(
        source,
        `        : normalizeScanPayload(resultInput || {}, { requireContract: false });`,
        `        : normalizeScanPayload(resultInput || {}, { requireContract: true });`,
        'parsed-object strict validation',
    );

    const prospectiveIdentity = String.raw`
function preflightAutomaticIdentityPatches(state, patches = [], referenceCandidates = []) {
    const owners = new Map();
    for (const npc of state?.npcs || []) {
        for (const value of [npc?.name, ...(npc?.aliases || [])]) {
            const key = normalizeName(value);
            if (key) owners.set(key, npc.id);
        }
    }
    for (let index = 0; index < patches.length; index += 1) {
        const patch = patches[index];
        const patchId = String(patch?.id || '').trim();
        const canonicalName = canonicalPatchName(patch, referenceCandidates);
        const existing = patchId ? state.npcs.find(item => item.id === patchId) || null : (canonicalName ? findNpcByReference(state, canonicalName) : null);
        const prospectiveOwner = existing?.id || ('pending:' + index);
        const values = [canonicalName, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])]
            .map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
        for (const value of values) {
            const key = normalizeName(value);
            const owner = owners.get(key);
            if (owner && owner !== prospectiveOwner) {
                throw new Error('NPC State v0.4.12 scanner identity collision inside one observation: ' + value + '.');
            }
        }
        for (const value of values) {
            const key = normalizeName(value);
            if (key) owners.set(key, prospectiveOwner);
        }
    }
}
`;
    source = replaceRequired(source, '\nfunction repairTechnicalStoredName(npc) {', prospectiveIdentity + '\nfunction repairTechnicalStoredName(npc) {', 'prospective identity preflight helper');
    source = replaceRequired(
        source,
        `    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);\n    // A new returned dossier may contain a bad machine-shaped name`,
        `    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);\n    preflightAutomaticIdentityPatches(state, result.npcs, identityRefs);\n    // A new returned dossier may contain a bad machine-shaped name`,
        'same-observation identity reservation',
    );

    const deathHelpers = String.raw`const AFFIRMATIVE_DEATH_CUE = /\b(?:dies|died|dead|killed|slew|slain|murdered|lifeless|no pulse|stopped breathing|ceased breathing)\b/i;
const DEATH_DENIAL_CUE = /\b(?:not|never)\b(?:\s+\w+){0,4}\s+\b(?:dead|dying|died|die|dies|killed|slain|murdered|lifeless)\b|\b(?:is|are|was|were|did|does|do|has|have|had)\s+not\s+(?:die|died|dead|dying|killed|slain|murdered|lifeless)\b/i;
const DEATH_RETRACTION_CUE = /\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|death reports? (?:were|was) false|falsely reported dead|mistakenly reported dead|emerges? alive|returns? alive)\b|\b(?:almost|nearly)\s+(?:died|dead)|\bnear[- ]death\b|\b(?:escaped?|avoided?|survived?)\s+(?:certain\s+)?death\b/i;
const DEATH_NONFINAL_CUE = /\b(?:might|may|could|would|will|shall|should|perhaps|possibly|likely|expected|expects?|predicted|predicts?|if|unless|threatens?|threatened|plans?|planned|intends?|intended|attempts?|attempted|tries?|tried|risks?|risked|about to|going to)\b/i;
function lifeEvidenceText(value) {
    return String(value || '').normalize('NFKC').replace(/\b(\w+)n[’']t\b/gi, '$1 not');
}
function lifeEvidenceKey(value) {
    return lifeEvidenceText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function escapedLifeName(value) {
    return lifeEvidenceKey(value).split(/\s+/).filter(Boolean).map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
}
function clauseAssertsNpcDeath(clause, variant) {
    const text = lifeEvidenceKey(clause);
    const name = escapedLifeName(variant);
    if (!text || !name || DEATH_DENIAL_CUE.test(text) || DEATH_RETRACTION_CUE.test(text)) return false;
    const withoutTarget = text.replace(new RegExp('\\b' + name + '\\b', 'gi'), ' ');
    if (DEATH_NONFINAL_CUE.test(withoutTarget)) return false;
    const patterns = [
        new RegExp('\\b' + name + '\\b\\s+(?:(?:has|had)\\s+)?(?:died|dies)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:is|was|lay|lies|remained|remains|appeared|appears)\\s+(?:already\\s+)?(?:dead|lifeless)\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:has|had)\\s+no\\s+pulse\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:stopped|ceased)\\s+breathing\\b', 'i'),
        new RegExp('\\b' + name + '\\b\\s+(?:was|is|has\\s+been|had\\s+been)\\s+(?:killed|slain|murdered)\\b', 'i'),
        new RegExp('\\b(?:killed|slew|slain|murdered)\\s+(?:the\\s+)?' + name + '\\b', 'i'),
    ];
    return patterns.some(pattern => pattern.test(text));
}
function affirmativeDeathEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    const variants = [npc?.name, ...(npc?.aliases || [])].map(value => String(value || '').trim()).filter(Boolean);
    if (!proof || !variants.length || !AFFIRMATIVE_DEATH_CUE.test(proof)) return false;
    if (!variants.some(value => clauseAssertsNpcDeath(proof, value))) return false;
    const clauses = lifeEvidenceText(context).split(/[.!?;\n]+|\b(?:but|however|although|yet)\b/i).map(value => value.trim()).filter(Boolean);
    return clauses.some(clause =>
        AFFIRMATIVE_DEATH_CUE.test(clause)
        && variants.some(value => clauseAssertsNpcDeath(clause, value))
        && profileEvidenceGrounded(proof, clause));
}

`;
    source = replaceSection(source, 'const AFFIRMATIVE_DEATH_CUE', '\nfunction applyLifeState', deathHelpers, 'target-specific completed death evidence');

    source = replaceRequired(
        source,
        `        if (rejection) return relationshipDiagnostic(npc, npc, change, options, [rejection]);\n    }\n    if (relationshipChangeLooksDuplicate`,
        `        if (rejection) return relationshipDiagnostic(npc, npc, change, options, [rejection]);\n        if (relationshipEvidencePolarityConflict(change.evidence, change.delta)) return relationshipDiagnostic(npc, npc, change, options, ['evidence-polarity']);\n    }\n    if (relationshipChangeLooksDuplicate`,
        'relationship evidence polarity gate',
    );
    source = replaceRequired(
        source,
        `            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n        });`,
        `            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n            otherSubjectNames: options.otherNpcNames || [],\n        });`,
        'relationship other-subject ownership',
    );
    source = replaceRequired(
        source,
        `                playerName,\n                // Automatic relationship movement is always current-exchange evidence.`,
        `                playerName,\n                otherNpcNames: state.npcs.filter(other => other.id !== npc.id).flatMap(other => [other.name, ...(other.aliases || [])]),\n                // Automatic relationship movement is always current-exchange evidence.`,
        'relationship other NPC propagation',
    );

    const familyBlock = `    addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''));\n    const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });\n    state.npcs = familyReconciled.npcs;\n    state.socialGraph = familyReconciled.socialGraph;\n    state.familySlots = familyReconciled.familySlots;`;
    const scopedFamilyBlock = `    if (options.reconcileFamilyGraph !== false) {\n        addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''));\n        const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });\n        state.npcs = familyReconciled.npcs;\n        state.socialGraph = familyReconciled.socialGraph;\n        state.familySlots = familyReconciled.familySlots;\n    }`;
    source = replaceRequired(source, familyBlock, scopedFamilyBlock, 'family reconciliation scope');

    fs.writeFileSync(path, source);
}

// Relationship evidence: known-other ownership and axis/delta polarity must both agree.
{
    const path = 'v03/relationship-evidence.js';
    const source = String.raw`// Local evidence checks are conservative lexical guards, not semantic entailment.
// Keep negation scoped to the relationship predicate and verify actor ownership/direction when known.
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
    [/\btrust\w*\b/, /\bdistrust\w*\b|\bmistrust\w*\b/],
    [/\blove\w*\b|\blike\w*\b|\bcare\w*\b|\bfond\w*\b|\baffection\w*\b/, /\bhate\w*\b|\bdislike\w*\b|\bloath\w*\b|\bdetest\w*\b|\baversion\w*\b/],
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

const AXIS_POLARITY_CUES = Object.freeze({
    trust: [[/\btrust\w*\b|\brely\w*\b|\bdepend\w*\b|\bconfidence\w*\b/, 1], [/\bdistrust\w*\b|\bmistrust\w*\b|\bdoubt\w*\b|\bsuspect\w*\b/, -1]],
    affection: [[/\blove\w*\b|\blike\w*\b|\bcare\w*\b|\bfond\w*\b|\baffection\w*\b|\battach\w*\b|\bwarm\w*\b/, 1], [/\bhate\w*\b|\bdislike\w*\b|\bloath\w*\b|\bdetest\w*\b|\bresent\w*\b|\baversion\w*\b/, -1]],
    desire: [[/\bdesir\w*\b|\bwant\w*\b|\battract\w*\b|\blong\w*\b|\byearn\w*\b/, 1], [/\breject\w*\b|\bavoid\w*\b|\brepuls\w*\b|\baversion\w*\b|\bunattract\w*\b/, -1]],
    tension: [[/\btension\w*\b|\bstrain\w*\b|\bfear\w*\b|\bresent\w*\b|\bhostil\w*\b|\bangr\w*\b|\buneas\w*\b|\bwary\b|\bwariness\b/, 1], [/\bease\w*\b|\bsafe\w*\b|\bcalm\w*\b|\bcomfort\w*\b|\brelax\w*\b/, -1]],
});
export function relationshipEvidencePolarityConflict(evidence, delta = {}) {
    for (const [axis, cues] of Object.entries(AXIS_POLARITY_CUES)) {
        const direction = Math.sign(Number(delta?.[axis]) || 0);
        if (!direction) continue;
        const observed = new Set();
        for (const [pattern, base] of cues) for (const polarity of patternPolarities(evidence, pattern, base)) observed.add(polarity);
        if (!observed.size) continue;
        if (observed.size !== 1 || !observed.has(direction)) return true;
    }
    return false;
}

const DIRECTIONAL_RELATIONSHIP_CUE = /\b(?:trust\w*|distrust\w*|mistrust\w*|love\w*|like\w*|hate\w*|dislike\w*|desir\w*|want\w*|admire\w*|resent\w*|fear\w*|rely\w*|depend\w*|respect\w*|care\w*)\b/gi;
function normalizedNames(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values]).map(normalized).filter(Boolean))];
}
function containsName(text, name) {
    return (' ' + text + ' ').includes(' ' + name + ' ');
}
function phraseBefore(text, phrase, index) {
    const found = text.lastIndexOf(phrase, index);
    return found >= 0 && found < index;
}
function phraseAfter(text, phrase, index) {
    return text.indexOf(phrase, index) >= index;
}
function ownershipConflict(value, expectations = {}) {
    const text = normalized(value);
    const subjects = normalizedNames(expectations.subjectNames);
    const others = normalizedNames(expectations.otherSubjectNames).filter(name => !subjects.includes(name));
    if (!text || !others.length) return false;
    const targetPresent = subjects.some(name => containsName(text, name));
    const otherPresent = others.some(name => containsName(text, name));
    return otherPresent && !targetPresent;
}
function directionConflict(value, expectations = {}) {
    const text = normalized(value);
    const subjects = normalizedNames(expectations.subjectNames);
    const objects = normalizedNames(expectations.objectNames);
    if (ownershipConflict(text, expectations)) return true;
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
    return false;
}

export function relationshipEvidenceGrounding(evidence, context, expectations = {}) {
    const proof = normalized(evidence);
    if (!proof || !String(context || '').trim()) return 'ungrounded';
    if (ownershipConflict(proof, expectations) || directionConflict(proof, expectations)) return 'wrong-direction';
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
    const directedMatches = matches.filter(item => !ownershipConflict(item.clause, expectations) && !directionConflict(item.clause, expectations));
    if (matches.length && !directedMatches.length) return 'wrong-direction';
    if (directedMatches.some(item => relationshipOutcomesConflict(proof, item.clause))) return 'contradictory';
    return '';
}
`;
    fs.writeFileSync(path, source);
}

// Manual age/apparent-age edits redefine the current visual-aging reference point.
// Targeted Refresh must not invoke global family reconciliation from existing slots.
{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    normalizeName,\n    normalizeScannerResponseTokens,`,
        `    normalizeName,\n    normalizeActualAge,\n    normalizeApparentAge,\n    normalizeScannerResponseTokens,`,
        'manual age normalization imports',
    );
    source = replaceRequired(
        source,
        `                applyReturnedNpcPatches: true,\n            });\n            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);\n            const committed = recordCheckpoint(applied.state, liveChat, messageId, 'targeted-refresh');`,
        `                applyReturnedNpcPatches: true,\n                reconcileFamilyGraph: false,\n            });\n            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);\n            const committed = recordCheckpoint(applied.state, liveChat, messageId, 'targeted-refresh');`,
        'targeted refresh family isolation',
    );
    source = replaceRequired(
        source,
        `            const nextRaw = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1), manual: true };\n            if (patch?.relationship && typeof patch.relationship === 'object') {`,
        `            const nextRaw = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1), manual: true };\n            const manualAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'age')\n                && normalizeActualAge(patch.age) !== normalizeActualAge(current.age);\n            const manualApparentAgeChanged = Object.prototype.hasOwnProperty.call(patch || {}, 'apparentAge')\n                && normalizeApparentAge(patch.apparentAge) !== normalizeApparentAge(current.apparentAge);\n            if (manualAgeChanged || manualApparentAgeChanged) {\n                nextRaw.ageProgressionBaselineAge = normalizeActualAge(manualAgeChanged ? patch.age : current.age);\n            }\n            if (patch?.relationship && typeof patch.relationship === 'object') {`,
        'manual maturation baseline reset',
    );
    fs.writeFileSync(path, source);
}

// Manual relationship edits are chronological anchors. Only discarded automatic movement
// after the latest manual anchor on an axis is reversed.
{
    const path = 'v03/branches.js';
    let source = fs.readFileSync(path, 'utf8');
    const helpers = String.raw`
function relationshipEventAfter(event, anchor) {
    if (!anchor) return true;
    const eventMessage = Number.isInteger(event?.sourceMessageId) ? event.sourceMessageId : null;
    const anchorMessage = Number.isInteger(anchor?.sourceMessageId) ? anchor.sourceMessageId : null;
    if (eventMessage !== null && anchorMessage !== null && eventMessage !== anchorMessage) return eventMessage > anchorMessage;
    const eventAt = Number(event?.at) || 0;
    const anchorAt = Number(anchor?.at) || 0;
    if (eventAt && anchorAt) return eventAt > anchorAt;
    return false;
}
function latestManualRelationshipAnchors(history = [], divergenceMessageId = null) {
    const anchors = new Map();
    for (const event of history) {
        if (String(event?.impact || '').toLocaleLowerCase() !== 'manual') continue;
        if (!Number.isInteger(event?.sourceMessageId) || event.sourceMessageId < divergenceMessageId) continue;
        for (const axis of RELATIONSHIP_AXES) {
            if (Number(event?.delta?.[axis]) === 0) continue;
            const prior = anchors.get(axis);
            if (!prior || relationshipEventAfter(event, prior)) anchors.set(axis, event);
        }
    }
    return anchors;
}
`;
    source = replaceRequired(source, '\nexport function rollbackRebasedRelationship', helpers + '\nexport function rollbackRebasedRelationship', 'manual relationship anchor helpers');
    source = replaceRequired(
        source,
        `    const manualProtectedAxes = new Set();\n    const affectedAxes = new Set();\n\n    // Manual score edits remain authoritative even if their save happened after the\n    // divergence point. The manual event records which axes the player intentionally set.\n    for (const event of history) {\n        if (String(event?.impact || '').toLocaleLowerCase() !== 'manual') continue;\n        if (!Number.isInteger(event?.sourceMessageId) || event.sourceMessageId < divergenceMessageId) continue;\n        for (const axis of RELATIONSHIP_AXES) if (Number(event?.delta?.[axis]) !== 0) manualProtectedAxes.add(axis);\n    }`,
        `    const manualAnchorByAxis = latestManualRelationshipAnchors(history, divergenceMessageId);\n    const affectedAxes = new Set();`,
        'manual axes to chronological anchors',
    );
    source = source.replaceAll(
        `            if (manualProtectedAxes.has(axis)) continue;`,
        `            const manualAnchor = manualAnchorByAxis.get(axis);\n            if (manualAnchor && !relationshipEventAfter(event, manualAnchor)) continue;`,
    );
    source = source.replaceAll(
        `            if (manualProtectedAxes.has(axis) || covered.has(key + '|' + axis)) continue;`,
        `            const manualAnchor = manualAnchorByAxis.get(axis);\n            if ((manualAnchor && !relationshipEventAfter(event, manualAnchor)) || covered.has(key + '|' + axis)) continue;`,
    );
    source = replaceRequired(
        source,
        `        if (!RELATIONSHIP_AXES.includes(axis) || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold) || manualProtectedAxes.has(axis)) continue;`,
        `        if (!RELATIONSHIP_AXES.includes(axis) || !polarity || !RELATIONSHIP_MILESTONE_THRESHOLDS.includes(threshold)) continue;`,
        'milestone clamp honors surviving manual milestone instead of axis shield',
    );
    source = replaceRequired(
        source,
        `    if (affectedAxes.size || removedMilestones.length) npc.relationshipSummary = '';`,
        `    const discardedNarrativeRelationship = history.some(event => discardedRelationshipEvent(event, divergenceMessageId))\n        || evidenceHistory.some(event => discardedRelationshipEvent(event, divergenceMessageId))\n        || diagnostics.some(event => discardedRelationshipEvent(event, divergenceMessageId));\n    if (affectedAxes.size || removedMilestones.length || discardedNarrativeRelationship) npc.relationshipSummary = '';`,
        'discarded relationship summary invalidation',
    );
    if (source.includes('manualProtectedAxes')) throw new Error('Stale manualProtectedAxes rollback logic remains');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.12 second-order scanner and rollback hardening');

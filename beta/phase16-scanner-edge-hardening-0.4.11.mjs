import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.11 scanner-hardening marker: ' + label);
    return source.replace(from, to);
}

function replaceAllRequired(source, from, to, label) {
    const count = source.split(from).length - 1;
    if (!count) throw new Error('Missing 0.4.11 scanner-hardening marker: ' + label);
    return source.split(from).join(to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.11 scanner-hardening section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// 1, 2, 3, 4, 5, 6, 8: scanner-side invariants.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    const scanParser = String.raw`function normalizeScanPayload(parsed, { requireContract = true } = {}) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NPC State v0.4.11 recovery scanner JSON must be an object.');
    const has = key => Object.prototype.hasOwnProperty.call(parsed, key);
    const presentKey = has('inChatNpcIds') ? 'inChatNpcIds' : (has('finalPresentNpcIds') ? 'finalPresentNpcIds' : '');
    if (requireContract) {
        const missing = [];
        if (!Array.isArray(parsed.exchangeActiveNpcIds)) missing.push('exchangeActiveNpcIds[]');
        if (!presentKey || !Array.isArray(parsed[presentKey])) missing.push('inChatNpcIds[]');
        if (!Array.isArray(parsed.worldActiveNpcIds)) missing.push('worldActiveNpcIds[]');
        if (!Array.isArray(parsed.npcs)) missing.push('npcs[]');
        if (!Array.isArray(parsed.socialEdges)) missing.push('socialEdges[]');
        if (has('familyFacts') && !Array.isArray(parsed.familyFacts)) missing.push('familyFacts[]');
        if (missing.length) throw new Error('NPC State v0.4.11 recovery scanner JSON is missing required payload structure: ' + missing.join(', ') + '.');
    }
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.filter(item => item && typeof item === 'object').slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.filter(item => item && typeof item === 'object').slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.filter(item => item && typeof item === 'object').slice(0, 100) : [],
    };
}

export function parseScanJson(raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('NPC State v0.4.11 recovery scanner returned an empty response.');
    const unfenced = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('NPC State v0.4.11 recovery scanner returned no JSON object.');
    let parsed;
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch (error) { throw new Error('NPC State v0.4.11 recovery scanner returned malformed JSON: ' + error.message); }
    return normalizeScanPayload(parsed, { requireContract: true });
}
`;
    source = replaceSection(source, 'export function parseScanJson(raw) {', '\nfunction isTechnicalNpcIdentity', scanParser, 'strict scan payload parser');

    source = replaceRequired(
        source,
        `    const result = parseScanJson(typeof resultInput === 'string' ? resultInput : JSON.stringify(resultInput || {}));`,
        `    const result = typeof resultInput === 'string'\n        ? parseScanJson(resultInput)\n        : normalizeScanPayload(resultInput || {}, { requireContract: false });`,
        'internal parsed-object normalization',
    );

    const identityHelpers = String.raw`
function identityOwnerForValue(state, value) {
    const key = normalizeName(value);
    if (!key) return null;
    return (state?.npcs || []).find(candidate =>
        normalizeName(candidate?.name) === key
        || (candidate?.aliases || []).some(alias => normalizeName(alias) === key)) || null;
}

function automaticIdentityPatchConflicts(state, npc, patch, referenceCandidates = []) {
    const values = [
        canonicalPatchName(patch, referenceCandidates),
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
    ].map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
    for (const value of values) {
        const owner = identityOwnerForValue(state, value);
        if (owner && (!npc || owner.id !== npc.id)) return true;
    }
    return false;
}
`;
    source = replaceRequired(source, '\nfunction repairTechnicalStoredName(npc) {', identityHelpers + '\nfunction repairTechnicalStoredName(npc) {', 'automatic identity collision helpers');

    source = replaceRequired(
        source,
        `        if (!npc && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {`,
        `        if (!npc && !automaticIdentityPatchConflicts(state, null, patch, identityRefs) && referenced && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {`,
        'bootstrap identity collision guard',
    );
    source = replaceRequired(
        source,
        `                    if (!npc && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, [...identityRefs, ref])) {`,
        `                    if (!npc && !automaticIdentityPatchConflicts(state, null, patch, [...identityRefs, ref]) && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText) && newNpcAdmissionAllows(patch, admissionMode, [...identityRefs, ref])) {`,
        'reference bootstrap identity collision guard',
    );
    source = replaceAllRequired(
        source,
        `            if (npc) patchByNpcId.set(npc.id, patch);`,
        `            if (npc && automaticIdentityPatchConflicts(state, npc, patch, identityRefs)) continue;\n            if (npc) patchByNpcId.set(npc.id, patch);`,
        'existing identity collision guard',
    );
    // The top-level patch loop uses a different indentation level.
    source = replaceRequired(
        source,
        `        if (npc) patchByNpcId.set(npc.id, patch);`,
        `        if (npc && automaticIdentityPatchConflicts(state, npc, patch, identityRefs)) continue;\n        if (npc) patchByNpcId.set(npc.id, patch);`,
        'top-level existing identity collision guard',
    );

    source = replaceRequired(
        source,
        `    if (normalizeName(incoming) === normalizeName(current)) return false;`,
        `    if (evidenceTextKey(incoming, 5000) === evidenceTextKey(current, 5000)) return false;`,
        'full durable canon comparison',
    );
    source = replaceRequired(
        source,
        `    if (!value || normalizeName(value) !== normalizeName(incoming) || !evidence || !profileEvidenceGrounded(evidence, context)) return false;`,
        `    if (!value || evidenceTextKey(value, 5000) !== evidenceTextKey(incoming, 5000) || !evidence || !profileEvidenceGrounded(evidence, context)) return false;`,
        'full canon change value comparison',
    );
    source = replaceRequired(
        source,
        `            && normalizeName(previousBaseAppearance) !== normalizeName(revisedBaseAppearance)\n            && normalizeName(next.appearance) === normalizeName(previousBaseAppearance)) {`,
        `            && evidenceTextKey(previousBaseAppearance, 5000) !== evidenceTextKey(revisedBaseAppearance, 5000)\n            && evidenceTextKey(next.appearance, 5000) === evidenceTextKey(previousBaseAppearance, 5000)) {`,
        'full Base synchronization comparison',
    );

    const maturationBaseline = String.raw`    if (changedAge) {
        const ageProgressionKind = String(patch?.ageChange?.kind || '').trim().toLocaleLowerCase();
        if (ageProgressionKind === 'correction') {
            // A correction changes the chronological reference point but never matures the body.
            next.ageProgressionBaselineAge = changedAge;
        } else if (['birthday', 'elapsed'].includes(ageProgressionKind)) {
            const priorBaseline = normalizeActualAge(npc?.ageProgressionBaselineAge);
            if (!priorBaseline) next.ageProgressionBaselineAge = normalizeActualAge(npc?.age) || changedAge;
            const apparentProgressed = normalizeApparentAge(next.apparentAge) !== normalizeApparentAge(npc?.apparentAge);
            const sharedProgressionRequested = String(canonChangeForField(patch, 'appearance')?.mode || '').trim().toLocaleLowerCase() === AGE_PROGRESSION_MODE;
            const sharedProgressed = sharedProgressionRequested
                && evidenceTextKey(next.appearance, 5000) !== evidenceTextKey(npc?.appearance, 5000);
            const formProgressionRequested = (Array.isArray(patch?.appearanceFormChanges) ? patch.appearanceFormChanges : [])
                .some(raw => String(raw?.mode || '').trim().toLocaleLowerCase() === AGE_PROGRESSION_MODE);
            const formsProgressed = formProgressionRequested
                && JSON.stringify(normalizeAppearanceForms(next.appearanceForms)) !== JSON.stringify(normalizeAppearanceForms(npc?.appearanceForms));
            if (ageProgression.allowed && (apparentProgressed || sharedProgressed || formsProgressed)) {
                next.ageProgressionBaselineAge = changedAge;
            }
        }
    }
`;
    source = replaceRequired(source, `    if (!locked.has('aliases')) {`, maturationBaseline + `    if (!locked.has('aliases')) {`, 'cumulative maturation baseline persistence');

    const deathHelpers = String.raw`const AFFIRMATIVE_DEATH_CUE = /\b(?:dies?|died|dead|death|killed|slain|lifeless|no pulse|stopped breathing|ceased breathing)\b/i;
const DEATH_DENIAL_CUE = /\b(?:not|never)\b(?:\s+\w+){0,4}\s+\b(?:dead|dying|died|die|dies|killed|slain|lifeless)\b|\b(?:is|are|was|were|did|does|do|has|have|had)\s+not\s+(?:die|died|dead|dying|killed|slain|lifeless)\b/i;
const DEATH_RETRACTION_CUE = /\b(?:alive|surviv(?:e|ed|es|ing)|resurrect(?:ed|s|ing)?|reviv(?:e|ed|es|ing)|death reports? (?:were|was) false|falsely reported dead|mistakenly reported dead|emerges? alive|returns? alive)\b|\b(?:almost|nearly)\s+(?:died|dead)|\bnear[- ]death\b|\b(?:escaped?|avoided?|survived?)\s+(?:certain\s+)?death\b/i;
function lifeEvidenceText(value) {
    return String(value || '').normalize('NFKC').replace(/\b(\w+)n[’']t\b/gi, '$1 not');
}
function affirmativeDeathEvidence(npc, evidence, context) {
    const proof = lifeEvidenceText(evidence);
    if (!proof || !AFFIRMATIVE_DEATH_CUE.test(proof) || DEATH_DENIAL_CUE.test(proof) || DEATH_RETRACTION_CUE.test(proof)) return false;
    const variants = [npc?.name, ...(npc?.aliases || [])].map(value => String(value || '').trim()).filter(Boolean);
    if (!variants.length) return false;
    const clauses = lifeEvidenceText(context).split(/[.!?;\n]+/).map(value => value.trim()).filter(Boolean);
    return clauses.some(clause =>
        AFFIRMATIVE_DEATH_CUE.test(clause)
        && !DEATH_DENIAL_CUE.test(clause)
        && !DEATH_RETRACTION_CUE.test(clause)
        && variants.some(value => containsNormalizedPhrase(clause, value))
        && profileEvidenceGrounded(proof, clause));
}

`;
    source = replaceRequired(source, 'function applyLifeState(npc, patch, options = {}) {', deathHelpers + 'function applyLifeState(npc, patch, options = {}) {', 'affirmative death helper');
    source = replaceRequired(
        source,
        `    const deathCue = /\\b(?:dies?|died|dead|death|killed|slain|lifeless|no pulse|stopped breathing|ceased breathing)\\b/i.test(lifeContext);`,
        `    const deathCue = affirmativeDeathEvidence(npc, reason, lifeContext);`,
        'affirmative death gate',
    );

    source = replaceRequired(
        source,
        `                if (!hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);`,
        `                const keyRelationshipsLocked = (owner.manualProfileFields || []).includes('keyRelationships');\n                if (!keyRelationshipsLocked && !hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);`,
        'family inference manual lock',
    );

    source = replaceRequired(
        source,
        `        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext);`,
        `        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext, {\n            subjectNames: npcEvidenceVariants(npc),\n            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n        });`,
        'actor-aware relationship grounding',
    );
    source = replaceRequired(
        source,
        `                relationshipContext: String(options.relationshipContext || ''),\n                // Automatic relationship movement is always current-exchange evidence.`,
        `                relationshipContext: String(options.relationshipContext || ''),\n                playerName,\n                // Automatic relationship movement is always current-exchange evidence.`,
        'relationship player identity propagation',
    );

    fs.writeFileSync(path, source);
}

// 5: persist a maturation baseline independently of the current chronological age.
{
    const path = 'v03/schema.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `        birthdayProvenance: normalizeBirthdayProvenance(input.birthdayProvenance, input.birthday),\n        appearance: text(input.appearance, 1800),`,
        `        birthdayProvenance: normalizeBirthdayProvenance(input.birthdayProvenance, input.birthday),\n        ageProgressionBaselineAge: normalizeActualAge(input.ageProgressionBaselineAge),\n        appearance: text(input.appearance, 1800),`,
        'schema maturation baseline field',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/age-progression.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    const before = ageYears(npc?.age);\n    const after = ageYears(changedAge);`,
        `    const baselineAge = normalizeActualAge(npc?.ageProgressionBaselineAge) || normalizeActualAge(npc?.age);\n    const before = ageYears(baselineAge);\n    const after = ageYears(changedAge);`,
        'cumulative maturation interval',
    );
    fs.writeFileSync(path, source);
}

// 7: Targeted Refresh is an explicit allowlist. No familyFacts or future parsedRaw fields leak through.
{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `            const parsed = {\n                ...parsedRaw,\n                exchangeActiveNpcIds: [],\n                finalPresentNpcIds: [],\n                worldActiveNpcIds: [],\n                npcs: (parsedRaw.npcs || []).filter(patch => {\n                    const patchId = String(patch?.id || '').trim();\n                    return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);\n                }).slice(0, 1),\n                socialEdges: [],\n            };`,
        `            const parsed = {\n                exchangeActiveNpcIds: [],\n                finalPresentNpcIds: [],\n                worldActiveNpcIds: [],\n                npcs: (parsedRaw.npcs || []).filter(patch => {\n                    const patchId = String(patch?.id || '').trim();\n                    return patchId ? patchId === npc.id : normalizeName(patch?.name) === normalizeName(npc.name);\n                }).slice(0, 1),\n                socialEdges: [],\n                familyFacts: [],\n            };`,
        'targeted refresh allowlist',
    );
    fs.writeFileSync(path, source);
}

// 8: relationship evidence uses predicate-local negation and expected actor direction.
{
    const path = 'v03/relationship-evidence.js';
    const source = String.raw`// Local evidence checks are conservative lexical guards, not semantic entailment.
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
`;
    fs.writeFileSync(path, source);
}

// Repair the old budget verifier: Campaign NPC 399 may legitimately appear in the
// separately budgeted full-dossier section, so inspect only the identity-directory slice.
{
    const path = 'beta/verify-0.4.1.mjs';
    let source = fs.readFileSync(path, 'utf8');
    const old = `    const prompt = buildInjection(state, { enabled: true, autoScan: false, inject: true, injectLimit: 20, injectBudgetTokens: 512 });\n    assert(prompt.includes('Campaign NPC 000'), 'Identity directory unexpectedly empty');\n    assert(!prompt.includes('Campaign NPC 399'), 'Identity directory ignored the configured continuity budget');`;
    const replacement = `    const prompt = buildInjection(state, { enabled: true, autoScan: false, inject: true, injectLimit: 20, injectBudgetTokens: 512 });\n    const directoryStart = prompt.indexOf('KNOWN NPC DIRECTORY');\n    const dossierStart = prompt.indexOf('FULL CONTINUITY FOR LIKELY RELEVANT NPCS:');\n    const directorySection = prompt.slice(directoryStart, dossierStart >= 0 ? dossierStart : prompt.length);\n    assert(directorySection.includes('Campaign NPC 000'), 'Identity directory unexpectedly empty');\n    assert(!directorySection.includes('Campaign NPC 399'), 'Identity directory ignored the configured continuity budget');`;
    source = replaceRequired(source, old, replacement, 'legacy directory-budget verifier');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.11 scanner edge-case hardening');

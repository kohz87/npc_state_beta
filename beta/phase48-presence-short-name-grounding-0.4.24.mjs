import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.24 marker: ' + label);
    return source.replace(from, to);
}

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');

const originalVariants = `function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([npc?.name, ...(npc?.aliases || []), patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : []), patch?.role].map(value => String(value || '').trim()).filter(Boolean))];
}
`;

const hardenedVariants = `function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([npc?.name, ...(npc?.aliases || []), patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : []), patch?.role].map(value => String(value || '').trim()).filter(Boolean))];
}

const ACTIVITY_SHORT_IDENTITY_STOP = new Set([
    'a', 'an', 'the', 'of', 'de', 'da', 'del', 'di', 'la', 'le', 'van', 'von',
    'mr', 'mrs', 'ms', 'miss', 'sir', 'dame', 'lady', 'lord', 'dr', 'doctor',
    'captain', 'commander', 'lieutenant', 'sergeant', 'master', 'mistress',
    'father', 'mother', 'sister', 'brother', 'elder', 'saint', 'st',
    'may', 'will', 'can', 'shall',
]);
function shortActivityIdentityTokens(value) {
    return String(value || '').normalize('NFKC').match(/[\\p{L}\\p{N}]+(?:[’'\\-][\\p{L}\\p{N}]+)*/gu) || [];
}
function shortActivityIdentityCandidates(npc) {
    const out = [];
    const seen = new Set();
    for (const value of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {
        const tokens = shortActivityIdentityTokens(value);
        if (tokens.length < 2) continue;
        for (const token of tokens) {
            const key = normalizeName(token);
            if (!key || key.length < 3 || GENERIC_REFERENCES.has(key) || ACTIVITY_SHORT_IDENTITY_STOP.has(key) || seen.has(key)) continue;
            seen.add(key);
            out.push(token);
        }
    }
    return out;
}
function shortActivityIdentityUnique(state, npc, candidate) {
    const key = normalizeName(candidate);
    if (!key) return false;
    return !(state?.npcs || []).some(other => {
        if (!other || other.id === npc?.id) return false;
        return [other.name, ...(Array.isArray(other.aliases) ? other.aliases : [])].some(value =>
            shortActivityIdentityTokens(value).some(token => normalizeName(token) === key));
    });
}
function identityTokenMention(text, candidate) {
    const clean = String(candidate || '').trim();
    if (!clean) return false;
    const upper = clean.toLocaleUpperCase();
    return shortActivityIdentityTokens(text).some(observed => observed === clean || observed === upper);
}
function visibleShortActivityIdentityMention(state, npc, visibleText = '') {
    for (const candidate of shortActivityIdentityCandidates(npc)) {
        if (!shortActivityIdentityUnique(state, npc, candidate)) continue;
        if (identityTokenMention(visibleText, candidate)) return true;
    }
    return false;
}
function shortActivityIdentityScope(state, npc, policy) {
    for (const candidate of shortActivityIdentityCandidates(npc)) {
        if (!shortActivityIdentityUnique(state, npc, candidate)) continue;
        if (identityTokenMention(policy?.visibleText, candidate)) return 'visible';
        if (identityTokenMention(policy?.worldStateText, candidate)) return 'world';
        if (identityTokenMention(policy?.innerChatterText, candidate)) return 'inner';
        if (identityTokenMention(policy?.excludedText, candidate)) return 'excluded';
    }
    return '';
}
`;

scanner = replaceRequired(scanner, originalVariants, hardenedVariants, 'short-name activity identity helpers');
scanner = replaceRequired(
    scanner,
    `function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}`,
    `function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const exactScope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    const shortScope = npc ? shortActivityIdentityScope(state, npc, policy) : '';
    // A unique short identity in public narrative can recover a full canonical identity even
    // when World_State/private/reference material contains the full name. Conversely, a short
    // identity found only inside structured material must not turn an otherwise unmentioned
    // scanner claim into public activity evidence.
    if (exactScope === 'visible' || shortScope === 'visible') return true;
    const scope = exactScope === 'unmentioned' && shortScope ? shortScope : exactScope;
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}`,
    'activity reference short-name recovery',
);

fs.writeFileSync('v03/scanner.js', scanner);
console.log('Applied NPC State 0.4.24 visible short-name presence grounding');

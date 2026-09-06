import fs from 'node:fs';

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing v0.4.29 distinct-exchange verifier section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
let source = fs.readFileSync(path, 'utf8');

const replacement = `// Identical wording in a later source exchange is not itself proof of a replay.
// Same-event replay protection is covered by source-identity regressions.
{
    let state = stateWithRelationship({ trust: 0, affection: 0, desire: 0, tension: 0 });
    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'The player returns Mira\\'s lost purse untouched.',
        reason: 'Returning the lost purse demonstrates honesty.',
        sourceMessageId: 2,
    });
    state = apply(state, {
        delta: { trust: 1 },
        evidence: 'The player returns Mira\\'s lost purse untouched.',
        reason: 'Returning the lost purse demonstrates honesty.',
        sourceMessageId: 3,
    });
    assert(mira(state).relationship.trust === 2, 'Distinct later exchange was suppressed by identical quotation text');
    assert(mira(state).relationshipEvidenceHistory.length === 2, 'Distinct later event was not retained in the hidden evidence ledger');
}
`;

source = replaceSection(
    source,
    '// Semantic repeat protection stores accepted evidence in a hidden six-event ledger and',
    '\n// Locked checkpoint attempts are remembered for dedupe',
    replacement,
    'distinct later exchange semantics',
);
fs.writeFileSync(path, source);
console.log('Aligned v0.4.2 relationship verifier with v0.4.29 distinct-exchange semantics');

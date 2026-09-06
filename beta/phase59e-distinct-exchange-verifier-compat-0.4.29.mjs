import fs from 'node:fs';

const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label) {
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.29 distinct-exchange verifier marker: ' + label);
    source = source.replace(from, to);
}

replaceRequired(
`// Semantic repeat protection stores accepted evidence in a hidden six-event ledger and
// prevents the same beat/aftermath from scoring again.
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
        sourceMessageId: 2,
    });
    assert(mira(state).relationship.trust === 1, 'Duplicate relationship event scored twice');
    assert(mira(state).relationshipEvidenceHistory.length === 1, 'Duplicate event polluted the hidden evidence ledger');
}`,
`// Identical wording in a later source exchange is not itself proof of a replay.
// Same-event replay protection is covered by the source-identity regressions.
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
}`,
'distinct later exchange semantics');

fs.writeFileSync(path, source);
console.log('Aligned v0.4.2 relationship verifier with v0.4.29 distinct-exchange semantics');

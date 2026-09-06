import fs from 'node:fs';

const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
let source = fs.readFileSync(path, 'utf8');

const completedMarker = "Distinct later exchange was suppressed by identical quotation text";
if (source.includes(completedMarker)) {
    console.log('v0.4.29 distinct-exchange verifier semantics are already applied');
    process.exit(0);
}

const legacyAssertion = "assert(mira(state).relationship.trust === 1, 'Duplicate relationship event scored twice');";
const at = source.indexOf(legacyAssertion);
if (at < 0) throw new Error('Missing v0.4.29 legacy duplicate-event assertion');
const start = source.lastIndexOf('\n{', at);
const endBrace = source.indexOf('\n}', at);
if (start < 0 || endBrace < 0) throw new Error('Could not isolate v0.4.29 legacy duplicate-event verifier block');
const end = endBrace + 2;

const replacement = `
// Identical wording in a later source exchange is not itself proof of a replay.
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
}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);
console.log('Aligned v0.4.2 relationship verifier with v0.4.29 distinct-exchange semantics');

import fs from 'node:fs';

// v0.4.20 commits the descendant-compatible v0.4.16 relationship verifiers as source.
// On a cold rebuild those files must not be rewritten back through the old v0.4.17 migration.
const verify28 = fs.readFileSync('beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs', 'utf8');
const verify29 = fs.readFileSync('beta/verify-phase29-release-source-parity-0.4.16.mjs', 'utf8');
if (!verify28.includes('relationshipAxisProvenance') || !verify29.includes('relationshipEvidenceExcerptMatch')) {
    throw new Error('Committed v0.4.20 descendant-compatible v0.4.16 verifiers are missing');
}

console.log('v0.4.16 relationship verifiers are already descendant-compatible in v0.4.20 source');

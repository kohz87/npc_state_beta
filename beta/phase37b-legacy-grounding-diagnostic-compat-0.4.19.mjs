import fs from 'node:fs';

// v0.4.20 commits the final provenance-oriented historical verifier expectations.
// Do not replay the retired v0.4.19 keyword-diagnostic rewrite during cold source builds.
const verify12 = fs.readFileSync('beta/verify-phase12-relationship-recovery-0.4.7.mjs', 'utf8');
const verify17 = fs.readFileSync('beta/verify-phase17-second-order-hardening-0.4.12.mjs', 'utf8');
const verify20 = fs.readFileSync('beta/verify-phase20-semantic-isolation-0.4.13.mjs', 'utf8');
if (!verify12.includes('trust:unverifiable-excerpt')
    || !verify17.includes('unverifiable-excerpt')
    || !verify20.includes('unverifiable-excerpt')) {
    throw new Error('Committed v0.4.20 provenance diagnostic verifier expectations are missing');
}

console.log('Legacy v0.4.19 grounding diagnostic verifiers are already v0.4.20-compatible');

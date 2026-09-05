import fs from 'node:fs';

// Final historical verifier expectations are committed source after the initial v0.4.20 build.
// Keep this phase as an idempotent source guard for subsequent cold rebuilds.
const checks = [
    ['beta/verify-phase1-relationship-hardening-0.4.2.mjs', 'relationshipDuplicateEvidenceKey'],
    ['beta/verify-phase12-relationship-recovery-0.4.7.mjs', 'requested +1, capped +1, applied 0'],
    ['beta/verify-phase20-semantic-isolation-0.4.13.mjs', 'unverifiable-excerpt'],
    ['beta/verify-relationship-milestone-gates-0.4.1.mjs', 'RELATIONSHIP REPEATS AND GATES'],
];
for (const [path, marker] of checks) {
    const source = fs.readFileSync(path, 'utf8');
    if (!source.includes(marker)) throw new Error('Missing final v0.4.20 verifier marker: ' + path + ' -> ' + marker);
}

console.log('Final NPC State 0.4.20 historical verifier compatibility is already committed');

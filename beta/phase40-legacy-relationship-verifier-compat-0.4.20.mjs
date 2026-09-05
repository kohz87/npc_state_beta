import fs from 'node:fs';

// The first source build migrated historical relationship verifier fixtures to the v0.4.20
// per-axis evidence contract, and CI committed those verifier files. Cold rebuilds therefore
// validate the committed migration rather than trying to rewrite the same source a second time.
const required = [
    ['beta/verify-phase1-relationship-hardening-0.4.2.mjs', 'v0420RelationshipContract'],
    ['beta/verify-phase7b-new-npc-history-enrichment-0.4.2.mjs', 'axisEvidence'],
    ['beta/verify-phase7c-existing-relationship-evidence-grounding-0.4.3.mjs', 'no-permitted-evidence-source'],
    ['beta/verify-phase12-relationship-recovery-0.4.7.mjs', 'trust:duplicate'],
    ['beta/verify-phase13-milestone-gate-invariants-0.4.8.mjs', 'axisEvidence'],
    ['beta/verify-phase17-second-order-hardening-0.4.12.mjs', 'unverifiable-excerpt'],
    ['beta/verify-phase20-semantic-isolation-0.4.13.mjs', 'unverifiable-excerpt'],
    ['beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs', 'relationshipAxisProvenance'],
    ['beta/verify-phase29-release-source-parity-0.4.16.mjs', 'relationshipEvidenceExcerptMatch'],
    ['beta/verify-phase30-relationship-progression-0.4.17.mjs', 'axisEvidence'],
    ['beta/verify-phase33-relationship-evaluation-observability-0.4.18.mjs', 'axisEvidence'],
    ['beta/verify-phase36-per-axis-relationship-grounding-0.4.19.mjs', 'unverifiable-excerpt'],
    ['beta/verify-phase38-release-source-parity-0.4.19.mjs', 'v0.4.20 per-axis provenance'],
    ['beta/verify-relationship-milestone-gates-0.4.1.mjs', 'axisEvidence'],
];
for (const [path, marker] of required) {
    const source = fs.readFileSync(path, 'utf8');
    if (!source.includes(marker)) throw new Error('Missing committed v0.4.20 verifier migration marker: ' + path + ' -> ' + marker);
}

console.log('Historical relationship verifiers are already migrated to the NPC State 0.4.20 evidence contract');

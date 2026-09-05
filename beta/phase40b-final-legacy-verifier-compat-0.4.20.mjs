import fs from 'node:fs';

function update(path, transform) {
    const before = fs.readFileSync(path, 'utf8');
    const after = transform(before);
    if (after === before) throw new Error('No v0.4.20 final compatibility change for ' + path);
    fs.writeFileSync(path, after);
}

update('beta/verify-phase1-relationship-hardening-0.4.2.mjs', source => source
    .replace(
        "assert(scanner.includes('DESIRE_EVIDENCE_CUES') && scanner.includes('relationshipChangeLooksDuplicate'), 'Desire firewall or dedupe missing');",
        "assert(!scanner.includes('DESIRE_EVIDENCE_CUES') && scanner.includes('relationshipAxisLooksDuplicate') && scanner.includes('relationshipDuplicateEvidenceKey'), 'Current provenance/idempotency hardening is missing');",
    )
    .replace(
        "assert(injection.includes('RELATIONSHIP HARDENING'), 'Foreground model contract does not describe relationship hardening');",
        "assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE') && injection.includes('RELATIONSHIP REPEATS AND GATES'), 'Foreground model contract does not describe current relationship hardening');",
    ));

update('beta/verify-phase12-relationship-recovery-0.4.7.mjs', source => source
    .replace(
        "test('missing old timeline references do not become turn zero', () => {\n    const state = stateWith({ relationshipEvidenceHistory: [{ evidence: 'Lucien returns the family heirloom to Mira.', reason: 'Trust', sourceMessageId: null, turn: null }] });\n    const after = apply(state, 'Lucien returns the family heirloom to Mira.');\n    assert.equal(npc(after).relationship.trust, 1);\n});",
        "test('legacy evidence without timeline references still blocks exact replay without becoming turn zero', () => {\n    const state = stateWith({ relationshipEvidenceHistory: [{ evidence: 'Lucien returns the family heirloom to Mira.', reason: 'Trust', sourceMessageId: null, turn: null }] });\n    const after = apply(state, 'Lucien returns the family heirloom to Mira.');\n    assert.equal(npc(after).relationship.trust, 0);\n    assert(last(after).reasons.includes('trust:duplicate'));\n});",
    )
    .replace("assert(html.includes('25 → 25'));", "assert(html.includes('requested +1, capped +1, applied 0'));\n    assert(html.includes('Axis result: gate-tier'));" )
    .replaceAll("assert.deepEqual(last(state).reasons, ['duplicate']);", "assert(last(state).reasons.includes('trust:duplicate'));"));

update('beta/verify-phase20-semantic-isolation-0.4.13.mjs', source => source
    .replace(
        `            impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            evidence, reason: 'Trust deepens.',`,
        `            evaluated: true, impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            priority: ['trust'], axisEvidence: { trust: { excerpts: ['Mira trusts Lucien completely.'], explanation: 'Verifier intentionally supplies an excerpt absent from the current exchange.' } },\n            evidence, reason: 'Trust deepens.',`,
    ));

update('beta/verify-relationship-milestone-gates-0.4.1.mjs', source => source
    .replace("assert(injection.includes('RELATIONSHIP MILESTONE GATES'), 'Foreground gate rule missing');", "assert(injection.includes('RELATIONSHIP REPEATS AND GATES'), 'Foreground gate rule missing');")
    .replace("assert(injection.includes('50 requires major-or-stronger'), 'Foreground 50 gate requirement missing');", "assert(injection.includes('50 major+ with raw 3'), 'Foreground 50 gate requirement missing');"));

console.log('Finished NPC State 0.4.20 legacy verifier compatibility');

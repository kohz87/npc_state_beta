import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.29 event-dedupe verifier marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `        reason: 'Returning the lost purse demonstrates honesty.',\n        sourceMessageId: 3,`,
        `        reason: 'Returning the lost purse demonstrates honesty.',\n        sourceMessageId: 2,`,
        'v0.4.2 same-event replay identity',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `test('repeated event remains deduplicated and cannot rewrite summary', () => {\n    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');\n    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: 1 }, 'meaningful', 3);`,
        `test('repeated event remains deduplicated and cannot rewrite summary', () => {\n    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');\n    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: 1 }, 'meaningful', 2);`,
        'v0.4.7 repeated event uses same source identity',
    );
    source = replaceRequired(
        source,
        `test('legacy evidence without timeline references still blocks exact replay without becoming turn zero', () => {\n    const state = stateWith({ relationshipEvidenceHistory: [{ evidence: 'Lucien returns the family heirloom to Mira.', reason: 'Trust', sourceMessageId: null, turn: null }] });\n    const after = apply(state, 'Lucien returns the family heirloom to Mira.');\n    assert.equal(npc(after).relationship.trust, 0);\n    assert(last(after).reasons.includes('trust:duplicate'));\n});`,
        `test('legacy unanchored evidence does not become a permanent quotation-text veto', () => {\n    const state = stateWith({ relationshipEvidenceHistory: [{ evidence: 'Lucien returns the family heirloom to Mira.', reason: 'Trust', sourceMessageId: null, turn: null }] });\n    const after = apply(state, 'Lucien returns the family heirloom to Mira.');\n    assert.equal(npc(after).relationship.trust, 1);\n    assert.equal(last(after).reasons.includes('trust:duplicate'), false);\n    assert.equal(npc(after).relationshipEvidenceHistory.length, 2);\n});`,
        'v0.4.7 unanchored legacy evidence policy',
    );
    source = replaceRequired(
        source,
        `test('changing only a delta sign cannot replay identical evidence', () => {\n    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');\n    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: -1 }, 'meaningful', 3);`,
        `test('changing only a delta sign cannot replay the same source event', () => {\n    let state = apply(stateWith(), 'Lucien returns the family heirloom to Mira.');\n    state = apply(state, 'Lucien returns the family heirloom to Mira.', { trust: -1 }, 'meaningful', 2);`,
        'v0.4.7 sign-only replay uses same source identity',
    );
    fs.writeFileSync(path, source);
}

console.log('Aligned legacy relationship duplicate verifiers with v0.4.29 source-event identity');

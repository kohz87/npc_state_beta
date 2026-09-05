import fs from 'node:fs';

const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
let source = fs.readFileSync(path, 'utf8');

const before = `    for (const next of [imported.state, rebased]) {
        assert.deepEqual(npc(next).relationshipEvidenceHistory, []);
        assert.deepEqual(npc(next).relationshipDiagnostics, []);
        assert.deepEqual(npc(next).relationship, npc(state).relationship);
        assert.deepEqual(npc(next).relationshipMilestones, npc(state).relationshipMilestones);
        assert.equal(npc(next).relationshipHistory[0].sourceMessageId, null);
    }
`;
const after = `    for (const next of [imported.state, rebased]) {
        assert.deepEqual(npc(next).relationshipEvidenceHistory, []);
        assert.deepEqual(npc(next).relationshipDiagnostics, []);
        assert.deepEqual(npc(next).relationship, npc(state).relationship);
        assert.equal(npc(next).relationshipHistory[0].sourceMessageId, null);
    }
    assert.deepEqual(npc(imported.state).relationshipMilestones, npc(state).relationshipMilestones);
    assert.deepEqual(
        npc(rebased).relationshipMilestones,
        npc(state).relationshipMilestones.map(entry => ({ ...entry, sourceMessageId: null, turn: null })),
    );
`;

if (source.includes(before)) source = source.replace(before, after);
else if (!source.includes("npc(state).relationshipMilestones.map(entry => ({ ...entry, sourceMessageId: null, turn: null }))")) {
    throw new Error('Missing legacy v0.4.7 rebase relationship assertion');
}

fs.writeFileSync(path, source);
console.log('Aligned v0.4.7 rebase verifier with accepted milestone baseline provenance');

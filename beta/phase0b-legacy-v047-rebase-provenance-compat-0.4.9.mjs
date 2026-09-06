import fs from 'node:fs';

const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
let source = fs.readFileSync(path, 'utf8');

// Phase61 intentionally replaces this historical rebase assertion with the new
// preserve-mode audit-quarantine contract. On subsequent cold replays, do not
// force the verifier back through the pre-phase61 wording.
if (source.includes("preserve rebase quarantines it as audit history")) {
    console.log('v0.4.7 rebase verifier already carries the phase61 preserve-mode contract');
    process.exit(0);
}

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

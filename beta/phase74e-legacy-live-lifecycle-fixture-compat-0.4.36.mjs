import fs from 'node:fs';

const filesWithFamilyFacts = [
    'beta/verify-phase57-recovery-rebuild-0.4.28.mjs',
    'beta/verify-phase59-recovery-interruptions-0.4.29.mjs',
    'beta/verify-phase64-rebase-state-boundary-hardening-0.4.31.mjs',
    'beta/verify-phase66-operation-context-and-rollback-boundary-0.4.32.mjs',
];

for (const path of filesWithFamilyFacts) {
    let source = fs.readFileSync(path, 'utf8');
    if (!source.includes('lifeStateUpdates: []')) {
        const before = source;
        source = source.replace(/^(\s*)familyFacts: \[\],$/gm, '$1familyFacts: [],\n$1lifeStateUpdates: [],');
        if (source === before) throw new Error('Missing familyFacts fixture anchors in ' + path);
        fs.writeFileSync(path, source);
    }
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = fs.readFileSync(path, 'utf8');
    const from = "return calls.length === 1 ? 'malformed' : JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [] });";
    const to = "return calls.length === 1 ? 'malformed' : JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], lifeStateUpdates: [] });";
    if (!source.includes(to)) {
        if (!source.includes(from)) throw new Error('Missing phase12 live-model fixture anchor');
        source = source.replace(from, to);
        fs.writeFileSync(path, source);
    }
}

{
    const path = 'beta/verify-phase21-release-source-parity-0.4.13.mjs';
    let source = fs.readFileSync(path, 'utf8');
    const from = `assert(phase12.includes("JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [] })"), 'v0.4.7 retry fixture is not persisted in release source');`;
    const to = `assert(phase12.includes("JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], lifeStateUpdates: [] })"), 'v0.4.7 retry fixture is not persisted in current release source');`;
    if (!source.includes(to)) {
        if (!source.includes(from)) throw new Error('Missing phase21 retry-fixture parity anchor');
        source = source.replace(from, to);
        fs.writeFileSync(path, source);
    }
}

console.log('Migrated historical live-model fixtures to the NPC State v0.4.36 lifecycle contract');

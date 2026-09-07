from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique anchor: {label} ({text.count(old)})')
    return text.replace(old, new, 1)

# Remove the boolean compatibility wrapper made dead by the authoritative conflict result.
path = ROOT / 'src/scan-application.js'
text = path.read_text()
text = replace_once(text, """function automaticIdentityPatchConflicts(state, npc, patch, referenceCandidates = []) {\n    return Boolean(automaticIdentityPatchConflict(state, npc, patch, referenceCandidates));\n}\n\n""", "", 'dead conflict wrapper')
text = replace_once(text,
    '                // handled by automaticIdentityPatchConflicts() as a local patch rejection.\n',
    '                // handled by the authoritative identity conflict check as a local patch rejection.\n',
    'preflight conflict comment')
path.write_text(text)

# patchResolutions is deliberately index-aligned with the original patch array.
path = ROOT / 'src/model/semantic-updates.js'
text = path.read_text()
text = replace_once(text,
"""function patchResolutionAt(options = {}, patchIndex = -1) {\n    if (!Array.isArray(options.patchResolutions)) return null;\n    const row = options.patchResolutions.find(item => Number(item?.patchIndex) === patchIndex);\n    return row || { patchIndex, status: 'unresolved', npcId: '', reason: 'identity-handoff-missing' };\n}\n""",
"""function patchResolutionAt(options = {}, patchIndex = -1) {\n    if (!Array.isArray(options.patchResolutions)) return null;\n    return options.patchResolutions[patchIndex]\n        || { patchIndex, status: 'unresolved', npcId: '', reason: 'identity-handoff-missing' };\n}\n""",
'index aligned handoff lookup')
path.write_text(text)

# Make follow-up stable-id Scan and deletion rollback explicit for this identity path.
path = ROOT / 'tests/v075-identity-handoff.test.mjs'
text = path.read_text()
anchor = """test('history change during first-pass persistence cannot advertise the identity-bound dossier as current', async () => {\n"""
addition = r'''test('a follow-up Scan using the assigned stable id enriches the same NPC instead of duplicating it', () => {
    const first = apply(emptySafeState('chat:follow-up-scan'), payload([miraPatch({ id: 'model-mira' })]));
    const mira = first.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);
    const visible = MIRA_VISIBLE + ' Mira laughs softly as she hands Lucien the room key.';
    const secondPatch = {
        id: mira.id,
        name: 'Mira',
        evaluatedGroups: ALL_GROUPS,
        semanticUpdates: [semantic('mood', 'replace', 'Cheerfully welcoming.', 'Mira laughs softly as she hands Lucien the room key.', 'temporary')],
        relationshipChange: noRelationshipChange(),
    };
    const second = apply(first.state, payload([secondPatch], [mira.id], [mira.id]), visible, { sourceMessageId: 2, turn: 2 });
    assert.equal(second.state.npcs.filter(npc => npc.name === 'Mira').length, 1);
    assert.equal(second.state.npcs.find(npc => npc.name === 'Mira').id, mira.id);
    assert.equal(second.state.npcs.find(npc => npc.name === 'Mira').mood, 'Cheerfully welcoming.');
    assert.equal(second.patchResolutions[0].npcId, mira.id);
});

test('deleting the source response removes the populated newly admitted dossier through normal branch reconciliation', async () => {
    const key = 'chat:identity-delete';
    const state = emptySafeState(key);
    const consumed = consume(MIRA_VISIBLE, payload([miraPatch({ id: 'model-mira' })]));
    const h = engineHarness({
        state,
        chat: [{ is_user: true, mes: 'Lucien asks Mira for a room.' }, { is_user: false, mes: consumed.cleanedText, swipe_id: 0 }],
    });
    await h.engine.loadChat();
    const applied = await h.engine.applyEmbeddedScan(1, consumed.parsed, { expectedMessageText: consumed.cleanedText, expectedSwipeId: 0 });
    assert.equal(applied.ok, true);
    const mira = applied.state.npcs.find(npc => npc.name === 'Mira');
    assertMiraPopulated(mira);

    h.context.chat.splice(1, 1);
    const reconciled = await h.engine.reconcileBranch({ rescan: false });
    assert.equal(reconciled.ok, true);
    assert.equal(reconciled.changed, true);
    assert.equal(reconciled.state.npcs.some(npc => npc.name === 'Mira'), false);
    assert.equal(h.persisted().npcs.some(npc => npc.name === 'Mira'), false);
});

'''
text = replace_once(text, anchor, addition + anchor, 'append stable-id and deletion tests')
path.write_text(text)

print('Applied lean v0.7.5 identity cleanup.')

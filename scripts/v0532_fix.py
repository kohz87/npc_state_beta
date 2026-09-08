from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))

# First-contact admission is one logical automatic operation with up to two provider calls.
replace_once(
    'tests/post-response-rework.test.mjs',
    "test('automatic post-response scan populates supported new dossier fields with one request and duplicate completion is idempotent'",
    "test('automatic post-response scan may complete a newly admitted dossier with a second bounded request and duplicate completion is idempotent'",
)
replace_once('tests/post-response-rework.test.mjs', "    assert.equal(h.metrics.generations, 1);\n    assert.equal(h.metrics.posts, 1);", "    assert.equal(h.metrics.generations, 2);\n    assert.equal(h.metrics.posts, 1);")
replace_once('tests/post-response-rework.test.mjs', "    assert.equal(h.metrics.generations, 1);\n    assert.equal(h.metrics.posts, 1);\n}, { settings: { birthdayFillMode: 'off' } }));", "    assert.equal(h.metrics.generations, 2);\n    assert.equal(h.metrics.posts, 1);\n}, { settings: { birthdayFillMode: 'off' } }));")
replace_once('tests/post-response-rework.test.mjs', "    assert.equal(h.metrics.generations, 1);\n    assert.equal(h.persisted().lastScannedMessageId, 1);", "    assert.equal(h.metrics.generations, 2);\n    assert.equal(h.persisted().lastScannedMessageId, 1);")

replace_once('tests/v0512-gap-fixes.test.mjs', "    assert.equal(h.metrics.generations, 2);\n    assert.equal(h.persisted().npcs[0].mood, 'Focused and mildly concerned.');", "    assert.equal(h.metrics.generations, 3);\n    assert.equal(h.persisted().npcs[0].mood, 'Focused and mildly concerned.');")

replace_once('tests/v075-identity-handoff.test.mjs', "assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false); assert.equal(h.generations(), 1);", "assert.equal(result.coverageDiagnostics.some(row => row.status === 'missing-npc-patch'), false); assert.equal(h.generations(), 2);")

replace_once('tests/v076-first-pass-completeness.test.mjs', "assert.equal(result.ok, true); assert.equal(harness.generations(), 1);", "assert.equal(result.ok, true); assert.equal(harness.generations(), 2);")
replace_once(
    'tests/v076-first-pass-completeness.test.mjs',
    "    const harness = engineHarness({ state, chat, generate: async () => {\n        calls += 1;\n        if (calls === 1) return JSON.stringify(payload(sannaPatch({ role: 'Desk clerk' })));\n        return JSON.stringify({ exchangeActiveNpcIds: [assignedId], inChatNpcIds: [assignedId], worldActiveNpcIds: [], npcs: [{ id: assignedId, name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, fieldEvaluations: { unchanged: ['role'], insufficient: [], unavailable: [] }, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });\n    } });",
    "    const harness = engineHarness({ state, chat, generate: async args => {\n        calls += 1;\n        if (calls === 1) return JSON.stringify(payload(sannaPatch({ role: 'Desk clerk' })));\n        if (/FIRST-CONTACT COMPLETION CHECK/.test(args?.prompt || '')) {\n            return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });\n        }\n        return JSON.stringify({ exchangeActiveNpcIds: [assignedId], inChatNpcIds: [assignedId], worldActiveNpcIds: [], npcs: [{ id: assignedId, name: 'Sanna Karr', evaluatedGroups: ALL_GROUPS, fieldEvaluations: { unchanged: ['role'], insufficient: [], unavailable: [] }, semanticUpdates: [], relationshipChange: structuredClone(NO_REL) }], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });\n    } });",
)
replace_once('tests/v076-first-pass-completeness.test.mjs', "assert.equal((second.state.npcs[0].relationshipHistory || []).length, 0); assert.equal(harness.generations(), 2);", "assert.equal((second.state.npcs[0].relationshipHistory || []).length, 0); assert.equal(harness.generations(), 3);")

replace_once('tests/v077-host-capture.test.mjs', "assert.equal(first.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);", "assert.equal(first.ok, true); assert.equal(h.metrics.generations, 2); assert.equal(h.metrics.posts, 1);")
replace_once('tests/v077-host-capture.test.mjs', "assert.equal(second.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);", "assert.equal(second.ok, true); assert.equal(h.metrics.generations, 2); assert.equal(h.metrics.posts, 1);")
replace_once(
    'tests/v077-host-capture.test.mjs',
    "test('lengthy narrative with Inventory still uses one post-response request and preserves user-visible content'",
    "test('lengthy narrative with Inventory preserves user-visible content while new admission completion stays bounded'",
)
replace_once('tests/v077-host-capture.test.mjs', "assert.equal(result.ok, true); assert.equal(h.metrics.generations, 1); assert.equal(h.metrics.posts, 1);", "assert.equal(result.ok, true); assert.equal(h.metrics.generations, 2); assert.equal(h.metrics.posts, 1);")

# The first pass did not establish lifecycle, so assert only that the forbidden completion death was ignored.
replace_once("tests/v0532-first-contact-completion.test.mjs", "    assert.equal(npc.lifeState, 'alive');", "    assert.equal(npc.lifeState, 'unknown');")

print('v0.5.32 regression refinements staged')

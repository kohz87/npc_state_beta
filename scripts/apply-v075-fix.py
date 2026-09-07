from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'tests/v075-identity-handoff.test.mjs'
text = path.read_text()
old = """    const unresolved = apply(emptySafeState('chat:unresolved'), payload([{\n        id: 'transport-ghost', name: 'Ghost', identityKind: 'named', evaluatedGroups: ['live'],\n        semanticUpdates: [{ field: 'mood', operation: 'establish', value: 'Quiet.', durability: 'temporary', sources: [{ messageId: 1, excerpt: 'Ghost watches.' }], explanation: 'Mood.' }],\n    }], [], []), 'Ghost watches.');\n    assert.equal(unresolved.semanticDiagnostics[0].status, 'identity-unresolved');\n    assert.equal(unresolved.semanticDiagnostics[0].reason, 'not-referenced');\n"""
new = """    const unresolvedVisible = 'A hooded figure watches silently.';\n    const unresolved = apply(emptySafeState('chat:unresolved'), payload([{\n        id: 'transport-ghost', name: 'Ghost', identityKind: 'named', evaluatedGroups: ['live'],\n        activityEvidence: { exchangeActive: { excerpts: [unresolvedVisible], explanation: 'The figure acts now, but its claimed identity is not grounded.' } },\n        semanticUpdates: [{ field: 'mood', operation: 'establish', value: 'Quiet.', durability: 'temporary', sources: [{ messageId: 1, excerpt: unresolvedVisible }], explanation: 'Mood.' }],\n    }], ['Ghost'], []), unresolvedVisible);\n    assert.equal(unresolved.semanticDiagnostics[0].status, 'identity-unresolved');\n    assert.equal(unresolved.semanticDiagnostics[0].reason, 'identity-evidence-unresolved');\n"""
if old not in text:
    raise SystemExit('unresolved identity fixture anchor missing')
path.write_text(text.replace(old, new, 1))
print('Corrected unresolved-identity fixture.')

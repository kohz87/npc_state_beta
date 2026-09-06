import fs from 'node:fs';

const path = 'beta/verify-phase68-life-state-semantics-and-death-invariant-0.4.33.mjs';
let source = fs.readFileSync(path, 'utf8');

function replace(from, to, label) {
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.33 life-state regression marker: ' + label);
    source = source.replace(from, to);
}

replace(
    `        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician confirms she survived after all.', livingReturn: false }],\n        socialEdges: [], familyFacts: [],\n    }, { sourceMessageId: 7, turn: 7, applyReturnedNpcPatches: true, profileContext: 'The physician confirms she survived after all.' }).state;`,
    `        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician examines Mira. He confirms she survived after all.', livingReturn: false }],\n        socialEdges: [], familyFacts: [],\n    }, { sourceMessageId: 7, turn: 7, applyReturnedNpcPatches: true, profileContext: 'The physician examines Mira. He confirms she survived after all.' }).state;`,
    'plain alive pronoun antecedent',
);
replace(
    `        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician confirms she survived after all.', livingReturn: true }],\n        socialEdges: [], familyFacts: [],\n    }, { sourceMessageId: 8, turn: 8, applyReturnedNpcPatches: true, profileContext: 'The physician confirms she survived after all.' }).state;`,
    `        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'strong', lifeStateReason: 'The physician examines Mira. He confirms she survived after all.', livingReturn: true }],\n        socialEdges: [], familyFacts: [],\n    }, { sourceMessageId: 8, turn: 8, applyReturnedNpcPatches: true, profileContext: 'The physician examines Mira. He confirms she survived after all.' }).state;`,
    'living return pronoun antecedent',
);

const provenanceMarker = `// The model owns semantic certainty too. Grounded but uncertain death is not a confirmed death.`;
if (!source.includes('Shared-token fuzzy overlap must not count as life-state evidence provenance.')) {
    if (!source.includes(provenanceMarker)) throw new Error('Missing provenance regression insertion marker');
    const addition = `// Shared-token fuzzy overlap must not count as life-state evidence provenance.\n{\n    const reason = 'Mira dies when the tower collapses.';\n    const state = applyScanResult(aliveState(), deathResult(reason, 'explicit'), {\n        sourceMessageId: 61, turn: 61, applyReturnedNpcPatches: true,\n        profileContext: 'Mira escapes the tower alive.',\n    }).state;\n    assert.equal(npc(state).lifeState, 'alive', 'Fuzzy token overlap accepted an ungrounded death');\n    assert.equal(npc(state).lifeStateDiagnostics.at(-1)?.code, 'unverifiable-evidence', 'Fuzzy-overlap rejection was not diagnosed');\n}\n\n// A perfectly grounded source span for another NPC must not mutate Mira. This is identity\n// binding, not semantic death interpretation.\n{\n    const state = applyScanResult(aliveState(), deathResult('Sora is deceased.', 'explicit'), {\n        sourceMessageId: 62, turn: 62, applyReturnedNpcPatches: true,\n        profileContext: 'Sora is deceased.',\n    }).state;\n    assert.equal(npc(state).lifeState, 'alive', 'Another NPC death evidence killed Mira');\n    assert.equal(npc(state).lifeStateDiagnostics.at(-1)?.code, 'target-mismatch', 'Cross-NPC death rejection was not diagnosed');\n}\n\n`;
    source = source.replace(provenanceMarker, addition + provenanceMarker);
}

const normalizationMarker = `// Normalization is a defensive invariant for legacy or external paths: dead can never remain`;
if (!source.includes('Uncertain living-return judgment was treated as authoritative')) {
    if (!source.includes(normalizationMarker)) throw new Error('Missing living-return certainty insertion marker');
    const addition = `// A target-bound but uncertain living-return judgment remains non-authoritative.\n{\n    let state = applyDeath('Mira is deceased.', 'explicit');\n    const reason = 'A physician examines Mira and says she may still be alive.';\n    state = applyScanResult(state, {\n        exchangeActiveNpcIds: ['Mira'], inChatNpcIds: ['Mira'], worldActiveNpcIds: [],\n        npcs: [{ id: 'npc-mira-life', name: 'Mira', lifeState: 'alive', lifeStateCertainty: 'uncertain', lifeStateReason: reason, livingReturn: true }],\n        socialEdges: [], familyFacts: [],\n    }, { sourceMessageId: 63, turn: 63, applyReturnedNpcPatches: true, profileContext: reason }).state;\n    assert.equal(npc(state).lifeState, 'dead', 'Uncertain living-return judgment was treated as authoritative');\n    assert.equal(npc(state).lifeStateDiagnostics.at(-1)?.code, 'insufficient-certainty', 'Uncertain living-return rejection was not diagnosed');\n}\n\n`;
    source = source.replace(normalizationMarker, addition + normalizationMarker);
}

replace(
    `assert(scannerSource.includes('lifeStateEvidenceGrounded'), 'Grounded life-state evidence validator is missing');\nassert(scannerSource.includes("['explicit', 'strong', 'confirmed']"), 'Scanner certainty contract is not aligned');`,
    `assert(scannerSource.includes('lifeStateEvidenceGrounded'), 'Grounded life-state evidence validator is missing');\nassert(scannerSource.includes('source.includes(proof)'), 'Life-state provenance still uses fuzzy profile grounding');\nassert(scannerSource.includes('lifeStateEvidenceTargetsNpc'), 'Life-state target identity binding is missing');\nassert(scannerSource.includes("reject('target-mismatch'"), 'Life-state target mismatch diagnostic is missing');\nassert(scannerSource.includes("['explicit', 'strong', 'confirmed']"), 'Scanner certainty contract is not aligned');`,
    'source-level provenance and target regression',
);

fs.writeFileSync(path, source);
console.log('Expanded v0.4.33 life-state provenance, target-binding, pronoun-span, and certainty regressions');

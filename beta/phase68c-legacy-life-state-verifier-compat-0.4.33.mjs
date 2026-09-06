import fs from 'node:fs';

function patch(path, replacements) {
    let source = fs.readFileSync(path, 'utf8');
    for (const [from, to, label] of replacements) {
        if (source.includes(to)) continue;
        if (!source.includes(from)) throw new Error('Missing v0.4.33 legacy life-state verifier marker: ' + label);
        source = source.replace(from, to);
    }
    fs.writeFileSync(path, source);
}

patch('beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs', [
    [
        `// Negated death cannot archive; affirmative target-attributed death can.`,
        `// Life-state evidence for another NPC cannot archive Mira; target-bound confirmed death can.`,
        'phase16 comment',
    ],
    [
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira is not dead.',\n    }, 'Mira is not dead. She remains conscious.', 1);`,
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Sora is dead.',\n    }, 'Sora is dead.', 1);`,
        'phase16 target mismatch',
    ],
]);

patch('beta/verify-phase17-second-order-hardening-0.4.12.mjs', [
    [
        `// Death evidence must identify Mira as the completed victim, not merely place her near death language.`,
        `// Death evidence must bind Mira's dossier, while uncertain model judgments remain non-authoritative.`,
        'phase17 comment',
    ],
    [
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira killed Lucien.',\n    }, 'Mira killed Lucien.', 1);`,
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Sora died.',\n    }, 'Sora died.', 1);`,
        'phase17 other target',
    ],
    [
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'Mira might die tonight.',`,
        `        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'uncertain', lifeStateReason: 'Mira might die tonight.',`,
        'phase17 uncertainty contract',
    ],
]);

patch('beta/verify-phase20-semantic-isolation-0.4.13.mjs', [
    [
        `// Living return must be target-specific and must not mistake "not alive" for positive life evidence.`,
        `// Living return must be target-specific and sufficiently certain; wording semantics are model-owned.`,
        'phase20 comment',
    ],
    [
        `    const negatedAlive = apply(archived, {\n        id: 'npc-mira', name: 'Mira', livingReturn: true, lifeState: 'alive',\n        lifeStateCertainty: 'explicit', lifeStateReason: 'Mira is not alive.',\n    }, 'Mira is not alive.', 2);\n    assert.equal(negatedAlive.npcs[0].archived, true, 'Negated alive evidence resurrected Mira');`,
        `    const uncertainAlive = apply(archived, {\n        id: 'npc-mira', name: 'Mira', livingReturn: true, lifeState: 'alive',\n        lifeStateCertainty: 'uncertain', lifeStateReason: 'Mira may still be alive.',\n    }, 'Mira may still be alive.', 2);\n    assert.equal(uncertainAlive.npcs[0].archived, true, 'Uncertain living-return evidence resurrected Mira');`,
        'phase20 living-return certainty',
    ],
]);

console.log('Aligned legacy life-state regressions with v0.4.33 model-semantics/provenance contract');

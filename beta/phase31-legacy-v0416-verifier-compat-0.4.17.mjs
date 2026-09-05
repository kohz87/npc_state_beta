import fs from 'node:fs';

function replaceCompat(source, from, to, targetMarker, label) {
    if (source.includes(targetMarker)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.16 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        `// The semantic fallback is intentionally ordinary-only. Stronger movement still requires the\n// existing stricter grounding path and milestone evidence.\n{\n    const stronger = { ...expectations, impact: 'meaningful', delta: { trust: 2, affection: 0, desire: 0, tension: 0 } };\n    assert.equal(\n        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', groundedPerformance, stronger),\n        'ungrounded',\n        'Meaningful Trust improperly inherited the ordinary semantic fallback',\n    );\n}`,
        `// v0.4.17+ separates grounding validity from progression difficulty. A stronger impact\n// may use the same grounded event; inertia and milestone gates still decide movement.\n{\n    const stronger = { ...expectations, impact: 'meaningful', delta: { trust: 2, affection: 0, desire: 0, tension: 0 } };\n    assert.equal(\n        relationshipEvidenceGrounding('Lucien demonstrated straightforward competence and reliability.', groundedPerformance, stronger),\n        '',\n        'Meaningful Trust paraphrase regressed after grounding/difficulty separation',\n    );\n}`,
        'Meaningful Trust paraphrase regressed after grounding/difficulty separation',
        'higher-impact grounding expectation',
    );
    source = replaceCompat(
        source,
        `assert(evidenceSource.includes('ordinaryTrustSemanticGrounding'), 'Runtime relationship evidence lacks the ordinary Trust semantic fallback');`,
        `assert(evidenceSource.includes('ordinaryTrustSemanticGrounding') || evidenceSource.includes('relationshipSemanticGrounding'), 'Runtime relationship evidence lacks semantic relationship grounding');`,
        "evidenceSource.includes('relationshipSemanticGrounding')",
        'semantic grounding helper assertion',
    );
    source = replaceCompat(
        source,
        `assert.equal(manifest.version, '0.4.16');`,
        `const [major, minor, patch] = String(manifest.version).split('.').map(Number);\nassert(major === 0 && minor === 4 && patch >= 16, 'Manifest regressed below v0.4.16');`,
        'Manifest regressed below v0.4.16',
        'manifest descendant compatibility',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase29-release-source-parity-0.4.16.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceCompat(
        source,
        `assert.equal(manifest.version, '0.4.16', 'Release source is not v0.4.16');\nassert(ui.includes('NPC State <span class="npc-state-version">0.4.16</span>'), 'Committed runtime UI version is not v0.4.16');`,
        `const [releaseMajor, releaseMinor, releasePatch] = String(manifest.version).split('.').map(Number);\nassert(releaseMajor === 0 && releaseMinor === 4 && releasePatch >= 16, 'Release source regressed below v0.4.16');\nassert(ui.includes('NPC State <span class="npc-state-version">' + manifest.version + '</span>'), 'Committed runtime UI version does not match manifest');`,
        'Release source regressed below v0.4.16',
        'release version descendant compatibility',
    );
    source = replaceCompat(
        source,
        `assert(evidence.includes('ordinaryTrustSemanticGrounding'), 'Committed relationship evidence lacks semantic ordinary Trust grounding');`,
        `assert(evidence.includes('ordinaryTrustSemanticGrounding') || evidence.includes('relationshipSemanticGrounding'), 'Committed relationship evidence lacks semantic relationship grounding');`,
        "evidence.includes('relationshipSemanticGrounding')",
        'semantic helper descendant compatibility',
    );
    source = replaceCompat(
        source,
        `assert(evidence.includes("String(expectations.impact || '').trim().toLocaleLowerCase() !== 'ordinary'"), 'Semantic fallback is no longer ordinary-only');\nassert(evidence.includes("moving.length !== 1 || moving[0][0] !== 'trust' || Number(moving[0][1]) <= 0"), 'Semantic fallback is no longer narrow positive single-axis Trust');`,
        `assert(evidence.includes('semanticEventActorKind'), 'Semantic fallback no longer binds the causal event actor');\nassert(evidence.includes('semanticMovingAxis') || evidence.includes("moving.length !== 1 || moving[0][0] !== 'trust' || Number(moving[0][1]) <= 0"), 'Semantic fallback no longer constrains ambiguous movement');`,
        "evidence.includes('semanticMovingAxis')",
        'v0.4.16 narrow-fallback assumptions',
    );
    source = replaceCompat(
        source,
        `assert(verify28.includes('Meaningful Trust improperly inherited the ordinary semantic fallback'), 'Higher-impact isolation regression is not persisted');`,
        `assert(verify28.includes('Meaningful Trust paraphrase regressed after grounding/difficulty separation') || verify28.includes('Meaningful Trust improperly inherited the ordinary semantic fallback'), 'Higher-impact grounding regression is not persisted');`,
        'Higher-impact grounding regression is not persisted',
        'higher-impact verifier source assertion',
    );
    source = replaceCompat(
        source,
        `assert(workflow.includes('Build NPC State 0.4.16 Beta'), 'Workflow is not versioned for v0.4.16');`,
        `assert(workflow.includes('node beta/bump-0.4.16.mjs'), 'Workflow no longer preserves the v0.4.16 build step');`,
        'Workflow no longer preserves the v0.4.16 build step',
        'workflow descendant compatibility',
    );
    source = replaceCompat(
        source,
        `assert(workflow.includes('ordinaryTrustSemanticGrounding'), 'Architecture gate does not guard semantic relationship grounding');`,
        `assert(workflow.includes('ordinaryTrustSemanticGrounding') || workflow.includes('relationshipSemanticGrounding'), 'Architecture gate does not guard semantic relationship grounding');`,
        "workflow.includes('relationshipSemanticGrounding')",
        'architecture semantic helper compatibility',
    );
    fs.writeFileSync(path, source);
}

console.log('Made v0.4.16 relationship verifiers forward-compatible with v0.4.17');

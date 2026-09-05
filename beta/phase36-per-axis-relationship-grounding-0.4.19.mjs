import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.19 per-axis grounding marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    const oldApplyPrefix = `function applyRelationshipChange(npc, patch, options = {}) {\n    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;\n    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return relationshipEvaluationDiagnostic(npc, patch, options);\n    if (options.requireCurrentRelationshipEvidence === true) {\n        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext, {\n            subjectNames: npcEvidenceVariants(npc),\n            objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n            otherSubjectNames: options.otherNpcNames || [],\n            impact: change.impact,\n            delta: change.delta,\n        });\n        if (rejection) return relationshipDiagnostic(npc, npc, change, options, [rejection]);\n        if (relationshipEvidencePolarityConflict(change.evidence, change.delta)) return relationshipDiagnostic(npc, npc, change, options, ['evidence-polarity']);\n    }\n    if (relationshipChangeLooksDuplicate(npc, change, options)) return relationshipDiagnostic(npc, npc, change, options, ['duplicate']);\n    const reasons = [];\n\n    const context = String(options.relationshipContext || '').trim();\n    const filteredDelta = { ...change.delta };\n    if (filteredDelta.desire !== 0) {\n        const evidenceSupportsDesire = DESIRE_EVIDENCE_CUES.test(change.evidence) || DESIRE_EVIDENCE_CUES.test(change.reason);\n        const narrationSupportsDesire = !context || DESIRE_EVIDENCE_CUES.test(context);\n        if (!evidenceSupportsDesire || !narrationSupportsDesire) { filteredDelta.desire = 0; reasons.push('desire:unsupported'); }\n    }\n\n    const axisLimit = relationshipAxisLimit(change.impact);`;

    const newApplyPrefix = `function relationshipAxisGrounding(npc, change, options, delta, reasons) {\n    const filtered = { ...delta };\n    if (options.requireCurrentRelationshipEvidence !== true) return filtered;\n    const baseExpectations = {\n        subjectNames: npcEvidenceVariants(npc),\n        objectNames: [options.playerName, 'player', 'user', 'pc', 'the player', 'the user'].filter(Boolean),\n        otherSubjectNames: options.otherNpcNames || [],\n        impact: change.impact,\n    };\n    for (const axis of RELATIONSHIP_AXES) {\n        const raw = Number(filtered[axis]) || 0;\n        if (!raw) continue;\n        const axisDelta = { trust: 0, affection: 0, desire: 0, tension: 0 };\n        axisDelta[axis] = raw;\n        const rejection = relationshipEvidenceGrounding(change.evidence, options.relationshipContext, {\n            ...baseExpectations,\n            delta: axisDelta,\n        });\n        if (rejection) {\n            filtered[axis] = 0;\n            reasons.push(axis + ':' + rejection);\n            continue;\n        }\n        if (relationshipEvidencePolarityConflict(change.evidence, axisDelta)) {\n            filtered[axis] = 0;\n            reasons.push(axis + ':evidence-polarity');\n        }\n    }\n    return filtered;\n}\n\nfunction applyRelationshipChange(npc, patch, options = {}) {\n    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;\n    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return relationshipEvaluationDiagnostic(npc, patch, options);\n    const reasons = [];\n\n    const context = String(options.relationshipContext || '').trim();\n    let filteredDelta = { ...change.delta };\n    if (filteredDelta.desire !== 0) {\n        const evidenceSupportsDesire = DESIRE_EVIDENCE_CUES.test(change.evidence) || DESIRE_EVIDENCE_CUES.test(change.reason);\n        const narrationSupportsDesire = !context || DESIRE_EVIDENCE_CUES.test(context);\n        if (!evidenceSupportsDesire || !narrationSupportsDesire) { filteredDelta.desire = 0; reasons.push('desire:unsupported'); }\n    }\n\n    filteredDelta = relationshipAxisGrounding(npc, change, options, filteredDelta, reasons);\n    if (!RELATIONSHIP_AXES.some(axis => Number(filteredDelta[axis]) !== 0)) {\n        if (!reasons.length) reasons.push('ungrounded');\n        return relationshipDiagnostic(npc, npc, change, options, reasons);\n    }\n\n    const groundedChange = { ...change, delta: { ...filteredDelta } };\n    if (relationshipChangeLooksDuplicate(npc, groundedChange, options)) return relationshipDiagnostic(npc, npc, change, options, [...reasons, 'duplicate']);\n\n    const axisLimit = relationshipAxisLimit(change.impact);`;

    source = replaceRequired(source, oldApplyPrefix, newApplyPrefix, 'per-axis grounding pipeline');

    source = replaceRequired(
        source,
        "    if (progressChanged && !visibleChanged) reasons.push('fractional-progress');\n    if (!reasons.length) reasons.push(relationshipStateChanged ? 'applied' : 'no-visible-change');",
        "    if (progressChanged && !visibleChanged) reasons.push('fractional-progress');\n    const partialAxisRejection = reasons.some(reason => /^(?:trust|affection|desire|tension):/.test(reason));\n    if (relationshipStateChanged && partialAxisRejection && !reasons.includes('partial-applied')) reasons.push('partial-applied');\n    if (!reasons.length) reasons.push(relationshipStateChanged ? 'applied' : 'no-visible-change');",
        'partial application diagnostic',
    );

    source = replaceRequired(
        source,
        "        '- Use a non-none relationshipChange only when the current exchange contains concrete evidence. If unsure whether movement is warranted, evaluate it explicitly as impact none rather than omitting the channel.',",
        "        '- Use a non-none relationshipChange only when the current exchange contains concrete evidence. If unsure whether movement is warranted, evaluate it explicitly as impact none rather than omitting the channel.',\n        '- MULTI-AXIS RELATIONSHIP EVIDENCE: each nonzero axis must be independently supported by the current exchange. Make evidence/reason concrete enough to justify every proposed axis separately. Runtime may discard an unsupported axis while preserving independently grounded axes; never inflate extra axes merely because one part of the interaction was intense.',",
        'recovery multi-axis evidence instruction',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/injection.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak, but zero must still be reported as an explicit evaluation.',",
        "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak, but zero must still be reported as an explicit evaluation.',\n        'MULTI-AXIS RELATIONSHIP EVIDENCE: justify every nonzero axis independently from the current exchange. Runtime may discard unsupported axes while preserving independently grounded axes, so do not bundle speculative Trust/Affection/Desire/Tension movement onto one strong event.',",
        'foreground multi-axis evidence instruction',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.19 per-axis relationship grounding');

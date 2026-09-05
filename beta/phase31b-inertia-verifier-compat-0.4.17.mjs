import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.17 verifier marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase1-relationship-hardening-0.4.2.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        '// Fractional evidence + inertia: at 30, two ordinary +1 events yield +1 visible total,\n// with 0.5 evidence retained after the second event.',
        '// Fractional evidence + inertia: at 30, two ordinary +1 events yield +1 visible total,\n// with 0.6 evidence retained after the second event under the v0.4.17 aligned curve.',
        'phase1 inertia comment');
    source = replaceRequired(source,
        "assert(near(mira(state).relationshipProgress.trust, 0.75), 'First weighted ordinary event did not retain 0.75 fractional progress');",
        "assert(near(mira(state).relationshipProgress.trust, 0.8), 'First weighted ordinary event did not retain 0.8 fractional progress');",
        'phase1 first fractional expectation');
    source = replaceRequired(source,
        "assert(near(mira(state).relationshipProgress.trust, 0.5), 'Fractional remainder after second event is incorrect');",
        "assert(near(mira(state).relationshipProgress.trust, 0.6), 'Fractional remainder after second event is incorrect');",
        'phase1 second fractional expectation');
    source = replaceRequired(source,
        "assert(mira(state).relationship.trust === 96, 'Trust 95 incorrectly received the full extreme raw weight instead of 10% inertia');",
        "assert(mira(state).relationship.trust === 97 && near(mira(state).relationshipProgress.trust, 0.5), 'Trust 95 did not apply the v0.4.17 25% final-band inertia');",
        'phase1 final-band expectation');
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-relationship-milestone-gates-0.4.1.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(source,
        "assert(mira(state).relationship.trust === 51, 'Qualifying major event did not cross 50 gate');",
        "assert(mira(state).relationship.trust > 50, 'Qualifying major event did not cross 50 gate');",
        '50 gate crossing expectation');
    source = replaceRequired(source,
        "assert(mira(state).relationship.trust === 76, 'Qualifying extreme event did not cross 75 gate');",
        "assert(mira(state).relationship.trust > 75, 'Qualifying extreme event did not cross 75 gate');",
        '75 gate crossing expectation');
    source = replaceRequired(source,
        "assert(mira(state).relationship.trust === 91, 'Qualifying relationship-defining event did not cross 90');",
        "assert(mira(state).relationship.trust > 90, 'Qualifying relationship-defining event did not cross 90');",
        '90 gate crossing expectation');
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase30-relationship-progression-0.4.17.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = source.replace('// Aligned deepening bands: 0–24 ×1.00, 25–49 ×0.80, 50–74 ×0.60,\n// 75–89 ×0.40, 90–100 ×0.25. Fractional progress must survive.',
        '// Aligned deepening bands: 0–25 ×1.00, 26–50 ×0.80, 51–75 ×0.60,\n// 76–90 ×0.40, 91–100 ×0.25. Fractional progress must survive.');
    source = source.replace("assert.equal(early.relationship.trust, 11, '0–24 should apply ordinary Trust at full weight');",
        "assert.equal(early.relationship.trust, 11, '0–25 should apply ordinary Trust at full weight');");
    source = source.replace("const secondBand = applyTrust(trustState(25, 0, [25]), { impact: 'ordinary', delta: 1, label: 'second band ordinary' });\n    assert.equal(secondBand.relationship.trust, 25, '25–49 should retain sub-point progress rather than force a whole point');\n    assert.equal(secondBand.relationshipProgress.trust, 0.8, '25–49 deepening multiplier is not ×0.80');",
        "const secondBand = applyTrust(trustState(26, 0, [25]), { impact: 'ordinary', delta: 1, label: 'second band ordinary' });\n    assert.equal(secondBand.relationship.trust, 26, '26–50 should retain sub-point progress rather than force a whole point');\n    assert.equal(secondBand.relationshipProgress.trust, 0.8, '26–50 deepening multiplier is not ×0.80');");
    source = source.replace("const thirdBand = applyTrust(trustState(50, 0, [25, 50]), { impact: 'meaningful', delta: 2, label: 'third band meaningful' });\n    assert.equal(thirdBand.relationship.trust, 51, '50–74 meaningful +2 should produce one whole point at ×0.60');\n    assert.equal(thirdBand.relationshipProgress.trust, 0.2, '50–74 deepening multiplier is not ×0.60');",
        "const thirdBand = applyTrust(trustState(51, 0, [25, 50]), { impact: 'meaningful', delta: 2, label: 'third band meaningful' });\n    assert.equal(thirdBand.relationship.trust, 52, '51–75 meaningful +2 should produce one whole point at ×0.60');\n    assert.equal(thirdBand.relationshipProgress.trust, 0.2, '51–75 deepening multiplier is not ×0.60');");
    source = source.replace("const fourthBand = applyTrust(trustState(75, 0, [25, 50, 75]), { impact: 'major', delta: 5, label: 'fourth band major' });\n    assert.equal(fourthBand.relationship.trust, 77, '75–89 major +5 should produce +2 at ×0.40');",
        "const fourthBand = applyTrust(trustState(76, 0, [25, 50, 75]), { impact: 'major', delta: 5, label: 'fourth band major' });\n    assert.equal(fourthBand.relationship.trust, 78, '76–90 major +5 should produce +2 at ×0.40');");
    source = source.replace("const finalBand = applyTrust(trustState(90, 0, [25, 50, 75, 90]), { impact: 'extreme', delta: 10, label: 'final band extreme' });\n    assert.equal(finalBand.relationship.trust, 92, '90–100 extreme +10 should produce +2 whole points at ×0.25');\n    assert.equal(finalBand.relationshipProgress.trust, 0.5, '90–100 deepening multiplier is not ×0.25');",
        "const finalBand = applyTrust(trustState(91, 0, [25, 50, 75, 90]), { impact: 'extreme', delta: 10, label: 'final band extreme' });\n    assert.equal(finalBand.relationship.trust, 93, '91–100 extreme +10 should produce +2 whole points at ×0.25');\n    assert.equal(finalBand.relationshipProgress.trust, 0.5, '91–100 deepening multiplier is not ×0.25');");
    source = source.replace("assert.equal(deeper.relationshipProgress.trust, 0.4, '75–89 deepening setup is not ×0.40');",
        "assert.equal(deeper.relationshipProgress.trust, 0.4, '76–90 deepening setup is not ×0.40');");
    source = source.replace("assert(relationshipMilestoneUnlocked(unlock25.relationshipMilestones, 'trust', 1, 25), 'Meaningful raw +1 did not unlock 25');",
        "assert(relationshipMilestoneUnlocked(unlock25.relationshipMilestones, 'trust', 1, 25), 'Meaningful raw +1 did not unlock 25');\n    assert.equal(unlock25.relationship.trust, 26, 'Qualifying 25-gate event should carry the score into the 26–50 band');");
    source = source.replace("assert.equal(unlock50.relationship.trust, 51, '50 gate qualifying event did not move with ×0.60 inertia');",
        "assert(unlock50.relationship.trust > 50, '50 gate qualifying event did not carry the score into the 51–75 band');");
    source = source.replace("assert(scanner.includes('if (magnitude < 25) return 1;'));\nassert(scanner.includes('if (magnitude < 50) return 0.8;'));\nassert(scanner.includes('if (magnitude < 75) return 0.6;'));\nassert(scanner.includes('if (magnitude < 90) return 0.4;'));",
        "assert(scanner.includes('if (magnitude <= 25) return 1;'));\nassert(scanner.includes('if (magnitude <= 50) return 0.8;'));\nassert(scanner.includes('if (magnitude <= 75) return 0.6;'));\nassert(scanner.includes('if (magnitude <= 90) return 0.4;'));");
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase32-release-source-parity-0.4.17.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = source.replace("assert(deepeningBlock.includes('if (magnitude < 25) return 1;'), '0–24 inertia band is not ×1.00');",
        "assert(deepeningBlock.includes('if (magnitude <= 25) return 1;'), '0–25 inertia band is not ×1.00');");
    source = source.replace("assert(deepeningBlock.includes('if (magnitude < 50) return 0.8;'), '25–49 inertia band is not ×0.80');",
        "assert(deepeningBlock.includes('if (magnitude <= 50) return 0.8;'), '26–50 inertia band is not ×0.80');");
    source = source.replace("assert(deepeningBlock.includes('if (magnitude < 75) return 0.6;'), '50–74 inertia band is not ×0.60');",
        "assert(deepeningBlock.includes('if (magnitude <= 75) return 0.6;'), '51–75 inertia band is not ×0.60');");
    source = source.replace("assert(deepeningBlock.includes('if (magnitude < 90) return 0.4;'), '75–89 inertia band is not ×0.40');",
        "assert(deepeningBlock.includes('if (magnitude <= 90) return 0.4;'), '76–90 inertia band is not ×0.40');");
    source = source.replace("assert(verify30.includes('25–49 deepening multiplier is not ×0.80'), 'Second-band progression regression is not persisted');",
        "assert(verify30.includes('26–50 deepening multiplier is not ×0.80'), 'Second-band progression regression is not persisted');");
    source = source.replace("assert(verify30.includes('50–74 deepening multiplier is not ×0.60'), 'Third-band progression regression is not persisted');",
        "assert(verify30.includes('51–75 deepening multiplier is not ×0.60'), 'Third-band progression regression is not persisted');");
    source = source.replace("assert(verify30.includes('90–100 deepening multiplier is not ×0.25'), 'Final-band progression regression is not persisted');",
        "assert(verify30.includes('91–100 deepening multiplier is not ×0.25'), 'Final-band progression regression is not persisted');");
    fs.writeFileSync(path, source);
}

console.log('Aligned historical and v0.4.17 relationship verifiers with inclusive progression bands');

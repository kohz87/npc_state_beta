import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.19 legacy grounding verifier marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "    assert.deepEqual(last(after).reasons, ['contradictory']);",
        "    assert(last(after).reasons.includes('trust:contradictory'));",
        'phase12 contradictory diagnostic',
    );
    fs.writeFileSync(path, source);
}

for (const path of [
    'beta/verify-phase17-second-order-hardening-0.4.12.mjs',
    'beta/verify-phase20-semantic-isolation-0.4.13.mjs',
]) {
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('wrong-direction'));",
        "    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:wrong-direction'));",
        path + ' wrong-direction diagnostic',
    );
    if (path.includes('phase17')) {
        source = replaceRequired(
            source,
            "    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('evidence-polarity'));",
            "    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:evidence-polarity'));",
            'phase17 affection polarity diagnostic',
        );
    }
    fs.writeFileSync(path, source);
}

for (const path of [
    'beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs',
    'beta/verify-phase29-release-source-parity-0.4.16.mjs',
]) {
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "scanner.includes('impact: change.impact') && scanner.includes('delta: change.delta')",
        "scanner.includes('impact: change.impact') && (scanner.includes('delta: change.delta') || scanner.includes('delta: axisDelta'))",
        path + ' movement-semantics source assertion',
    );
    fs.writeFileSync(path, source);
}

console.log('Aligned legacy relationship grounding verifiers with v0.4.19 axis-specific diagnostics');

import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.22 verifier marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase39-relationship-evidence-contract-0.4.20.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert(relationshipPolicy.includes('Financial/material relief'), 'Recovery semantic-judgment cautions are missing');",
        "assert(relationshipPolicy.includes('AMBIGUITY WITHOUT FREEZING'), 'Recovery semantic-judgment ambiguity calibration is missing');",
        'v0.4.20 semantic caution assertion',
    );
    source = replaceRequired(
        source,
        "assert(relationshipPolicy.includes('Repeated aftermath'), 'Recovery prompt does not instruct zero for repeated aftermath');",
        "assert(relationshipPolicy.includes('repeated aftermath/restatement'), 'Recovery prompt does not instruct zero for repeated aftermath');",
        'v0.4.20 repeat assertion',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-relationship-milestone-gates-0.4.1.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert(scanPrompt.includes('RELATIONSHIP MILESTONE GATES'), 'Recovery scanner gate rule missing');",
        "assert(scanPrompt.includes('RELATIONSHIP REPEATS AND GATES'), 'Recovery scanner gate rule missing');",
        'legacy recovery gate heading assertion',
    );
    source = replaceRequired(
        source,
        "assert(scanPrompt.includes('25, 50, 75, and 90'), 'Recovery scanner thresholds missing');",
        "assert(scanPrompt.includes('25/50/75/90'), 'Recovery scanner thresholds missing');",
        'legacy recovery threshold assertion',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase45-release-source-parity-0.4.22.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "assert(verify44.includes('deterministic tests below verify prompt integration'), 'Runtime/prompt testing is not distinguished from live LLM evaluation');",
        "assert(verify44.includes('Deterministic tests below verify prompt integration'), 'Runtime/prompt testing is not distinguished from live LLM evaluation');",
        'v0.4.22 live-evaluation boundary assertion',
    );
    fs.writeFileSync(path, source);
}

console.log('Aligned historical relationship prompt verifiers with the v0.4.22 shared rubric');

import fs from 'node:fs';

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    const start = source.indexOf('function relationshipInertiaFactor(currentValue, proposedDelta, impact = \'ordinary\') {');
    const recovery = source.indexOf("    if (impact === 'extreme') return 1;", start);
    if (start < 0 || recovery < 0) throw new Error('Missing v0.4.17 relationship inertia function');
    const before = source.slice(0, start);
    let deepening = source.slice(start, recovery);
    const after = source.slice(recovery);
    const replacements = [
        ['if (magnitude < 25) return 1;', 'if (magnitude <= 25) return 1;'],
        ['if (magnitude < 50) return 0.8;', 'if (magnitude <= 50) return 0.8;'],
        ['if (magnitude < 75) return 0.6;', 'if (magnitude <= 75) return 0.6;'],
        ['if (magnitude < 90) return 0.4;', 'if (magnitude <= 90) return 0.4;'],
    ];
    for (const [from, to] of replacements) {
        if (!deepening.includes(from)) throw new Error('Missing v0.4.17 inclusive-band marker: ' + from);
        deepening = deepening.replace(from, to);
    }
    source = before + deepening + after;
    fs.writeFileSync(path, source);
}

{
    const path = 'README.md';
    let source = fs.readFileSync(path, 'utf8');
    source = source.replace(
        '**0–24 = ×1.00, 25–49 = ×0.80, 50–74 = ×0.60, 75–89 = ×0.40, 90–100 = ×0.25**',
        '**0–25 = ×1.00, 26–50 = ×0.80, 51–75 = ×0.60, 76–90 = ×0.40, 91–100 = ×0.25**',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'CHANGELOG.md';
    let source = fs.readFileSync(path, 'utf8');
    source = source.replace(
        '0–24 ×1.00, 25–49 ×0.80, 50–74 ×0.60, 75–89 ×0.40, and 90–100 ×0.25',
        '0–25 ×1.00, 26–50 ×0.80, 51–75 ×0.60, 76–90 ×0.40, and 91–100 ×0.25',
    );
    fs.writeFileSync(path, source);
}

console.log('Aligned v0.4.17 relationship inertia to inclusive 0–25/26–50/51–75/76–90/91–100 bands');

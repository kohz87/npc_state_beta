import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.37 legacy diagnostics verifier marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    const html = dossierHtml(npc(state));\n    assert(html.includes('+25 unlocked'));`,
        `    const html = dossierHtml(npc(state), { showDiagnostics: true });\n    assert(html.includes('+25 unlocked'));`,
        'phase12 gate diagnostics rendering',
    );
    source = replaceRequired(
        source,
        `    assert(!dossierHtml(npc(state)).includes('<img src=x onerror'));`,
        `    assert(!dossierHtml(npc(state), { showDiagnostics: true }).includes('<img src=x onerror'));`,
        'phase12 diagnostic escaping rendering',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'beta/verify-phase42-relationship-history-remarks-0.4.21.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    const html = dossierHtml(npc);\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));`,
        `    const html = dossierHtml(npc, { showDiagnostics: true });\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));`,
        'phase42 rejected-axis diagnostics rendering',
    );
    source = replaceRequired(
        source,
        `    const html = dossierHtml(ambiguous);\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));`,
        `    const html = dossierHtml(ambiguous, { showDiagnostics: true });\n    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));`,
        'phase42 ambiguous diagnostics rendering',
    );
    fs.writeFileSync(path, source);
}

console.log('Made historical diagnostics verifiers explicit under NPC State v0.4.37 hidden-by-default dossier diagnostics');
